import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Download,
  Loader2,
  Mic,
  NotebookPen,
  Save,
  Sparkles,
  Square,
  Trash2,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { apiRequest, formatDateTime, type RecordingItem } from '../services/api';

interface SpeechRecognitionAlternative {
  transcript: string;
}
interface SpeechRecognitionResultItem {
  isFinal: boolean;
  0: SpeechRecognitionAlternative;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultItem>;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
}

export function LiveTranscriptionPage() {
  const { notify } = useToast();
  const navigate = useNavigate();

  const [title, setTitle] = useState('Lecture Recording Session');
  const [subject, setSubject] = useState('Computer Science');
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [micError, setMicError] = useState('');
  const [interimText, setInterimText] = useState('');
  const [segments, setSegments] = useState<Array<{ timestamp: string; text: string }>>([]);
  const [manualText, setManualText] = useState('');
  const [transcribingAudio, setTranscribingAudio] = useState(false);
  const [saving, setSaving] = useState(false);

  const [savedRecordings, setSavedRecordings] = useState<RecordingItem[]>([]);
  const [selectedRecording, setSelectedRecording] = useState<RecordingItem | null>(null);
  const [loadingList, setLoadingList] = useState(true);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const speechRef = useRef<SpeechRecognitionLike | null>(null);
  const timerRef = useRef<number | null>(null);
  const elapsedRef = useRef(0);

  const formatTimer = (sec: number) => {
    const mm = String(Math.floor(sec / 60)).padStart(2, '0');
    const ss = String(sec % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  };

  const loadRecordings = useCallback(async () => {
    try {
      const res = await apiRequest<{ recordings: RecordingItem[] }>(
        '/api/recordings?sourceType=live'
      );
      setSavedRecordings(res.recordings);
    } catch {
      // ignore initial error
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    loadRecordings();
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try {
        speechRef.current?.stop();
      } catch {
        // ignore
      }
    };
  }, [loadRecordings]);

  const startRecording = async () => {
    setMicError('');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMicError(
        'Microphone capture is not supported in this browser context. You can still paste or upload an audio clip below.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunksRef.current = [];
      elapsedRef.current = 0;
      setElapsedSec(0);
      setInterimText('');

      const preferredMime = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';
      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const chunks = audioChunksRef.current;
        if (chunks.length > 0) {
          const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
          await sendAudioForGeminiTranscription(blob);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setIsRecording(true);

      timerRef.current = window.setInterval(() => {
        elapsedRef.current += 1;
        setElapsedSec(elapsedRef.current);
      }, 1000);

      // Start optional Web Speech API for real-time interim captions
      const SpeechCtor =
        (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike })
          .webkitSpeechRecognition;

      if (SpeechCtor) {
        try {
          const rec = new SpeechCtor();
          rec.continuous = true;
          rec.interimResults = true;
          rec.lang = 'en-US';
          rec.onresult = (event: SpeechRecognitionEventLike) => {
            let interim = '';
            const finalized: Array<{ timestamp: string; text: string }> = [];
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const res = event.results[i];
              const text = res[0]?.transcript?.trim();
              if (!text) continue;
              if (res.isFinal) {
                finalized.push({ timestamp: formatTimer(elapsedRef.current), text });
              } else {
                interim += `${text} `;
              }
            }
            setInterimText(interim.trim());
            if (finalized.length > 0) {
              setSegments((prev) => [...prev, ...finalized]);
            }
          };
          rec.onerror = () => {
            // Silently rely on server-side Gemini transcription on stop
          };
          rec.start();
          speechRef.current = rec;
        } catch {
          speechRef.current = null;
        }
      }
    } catch (err) {
      const msg =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Microphone permission was denied. Allow microphone access in your browser settings and try again.'
          : 'Unable to access microphone. Check that an audio input device is connected.';
      setMicError(msg);
      notify(msg, 'error');
    }
  };

  const stopRecording = () => {
    setIsRecording(false);
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    try {
      speechRef.current?.stop();
    } catch {
      // ignore
    }
    speechRef.current = null;
    setInterimText('');

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const sendAudioForGeminiTranscription = async (blob: Blob) => {
    setTranscribingAudio(true);
    try {
      const formData = new FormData();
      formData.append('audio', blob, 'live-recording.webm');
      const res = await apiRequest<{
        transcript: string;
        segments: Array<{ timestamp: string; text: string }>;
      }>('/api/recordings/transcribe-audio', {
        method: 'POST',
        body: formData,
      });

      if (res.transcript) {
        setSegments(res.segments.length > 0 ? res.segments : [{ timestamp: '00:00', text: res.transcript }]);
        setManualText(res.transcript);
        notify('Audio transcribed with Gemini speech-to-text.');
      }
    } catch (err) {
      notify(
        err instanceof Error
          ? err.message
          : 'Server transcription failed. Your browser transcript segments remain available.',
        'error'
      );
    } finally {
      setTranscribingAudio(false);
    }
  };

  const compiledTranscript =
    segments.length > 0
      ? segments.map((s) => `[${s.timestamp}] ${s.text}`).join('\n')
      : manualText.trim();

  const handleSaveAndSummarize = async () => {
    if (!compiledTranscript.trim()) {
      notify('Record audio or enter transcript content first.', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await apiRequest<{ recording: RecordingItem }>('/api/recordings', {
        method: 'POST',
        body: JSON.stringify({
          sourceType: 'live',
          title: title.trim() || 'Live Lecture Session',
          subject: subject.trim() || 'General',
          durationSeconds: elapsedSec,
          transcriptText: compiledTranscript,
          segmentsJson: JSON.stringify(segments),
          generateSummary: 'true',
        }),
      });
      setSelectedRecording(res.recording);
      notify('Transcript saved and AI summary generated.');
      await loadRecordings();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to save transcript.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const downloadTranscript = (text: string, fileName: string) => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName.replace(/[^a-z0-9-_]+/gi, '_')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (id: number) => {
    try {
      await apiRequest(`/api/recordings/${id}`, { method: 'DELETE' });
      notify('Deleted recording.');
      if (selectedRecording?.id === id) setSelectedRecording(null);
      loadRecordings();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to delete recording.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Live Transcription</h2>
        <p className="mt-1 text-sm text-slate-600">
          Capture lecture audio directly from your microphone, view timestamped segments, transcribe via Gemini speech-to-text, download transcripts, and generate summaries.
        </p>
      </div>

      {/* Recorder Workspace */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="live-title" className="block text-sm font-medium text-slate-700 mb-1.5">
              Session title
            </label>
            <input
              id="live-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="live-subject" className="block text-sm font-medium text-slate-700 mb-1.5">
              Subject
            </label>
            <input
              id="live-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>
        </div>

        {micError && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <span>{micError}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4 py-4 px-5 rounded-xl bg-slate-50 border border-slate-200">
          <div className="flex items-center gap-4">
            {!isRecording ? (
              <button
                type="button"
                onClick={startRecording}
                disabled={transcribingAudio}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <Mic className="h-4 w-4" />
                Start Recording
              </button>
            ) : (
              <button
                type="button"
                onClick={stopRecording}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
              >
                <Square className="h-4 w-4 fill-current" />
                Stop & Transcribe
              </button>
            )}

            <div className="text-sm">
              <p className="font-semibold text-slate-900 font-[var(--font-mono)] tabular-nums">
                {formatTimer(elapsedSec)}
              </p>
              <p className="text-xs text-slate-500">
                {isRecording
                  ? 'Listening to microphone...'
                  : transcribingAudio
                    ? 'Transcribing captured audio with Gemini...'
                    : 'Ready to record'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={!compiledTranscript.trim()}
              onClick={() => downloadTranscript(compiledTranscript, title || 'transcript')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Download .txt
            </button>
            <button
              type="button"
              disabled={saving || !compiledTranscript.trim()}
              onClick={handleSaveAndSummarize}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-40 transition-colors"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {saving ? 'Summarizing...' : 'Save & Summarize'}
            </button>
          </div>
        </div>

        {/* Live Transcript Feed */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Transcript Segments</h3>
            {segments.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSegments([]);
                  setManualText('');
                }}
                className="text-xs font-medium text-slate-500 hover:text-slate-800"
              >
                Clear transcript
              </button>
            )}
          </div>

          {segments.length > 0 || interimText ? (
            <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/60 divide-y divide-slate-100">
              {segments.map((seg, idx) => (
                <div key={idx} className="px-4 py-2.5 flex items-start gap-3 text-sm">
                  <span className="font-[var(--font-mono)] text-xs text-blue-700 tabular-nums mt-0.5 shrink-0">
                    {seg.timestamp}
                  </span>
                  <p className="text-slate-800 leading-relaxed">{seg.text}</p>
                </div>
              ))}
              {interimText && (
                <div className="px-4 py-2.5 flex items-start gap-3 text-sm bg-blue-50/40">
                  <span className="font-[var(--font-mono)] text-xs text-slate-400 tabular-nums mt-0.5 shrink-0">
                    {formatTimer(elapsedSec)}
                  </span>
                  <p className="text-slate-500 italic">{interimText}</p>
                </div>
              )}
            </div>
          ) : (
            <textarea
              rows={5}
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              placeholder="Click Start Recording above to capture live audio, or paste lecture transcript text here to generate a summary..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
            />
          )}
        </div>
      </div>

      {/* Saved Transcripts & Summary Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-base font-semibold text-slate-900">Saved Transcriptions</h3>
          </div>
          {loadingList ? (
            <div className="p-5 space-y-2 animate-pulse">
              <div className="h-12 bg-slate-100 rounded-lg" />
              <div className="h-12 bg-slate-100 rounded-lg" />
            </div>
          ) : savedRecordings.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No saved live transcriptions yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {savedRecordings.map((rec) => (
                <div
                  key={rec.id}
                  className={`px-5 py-3.5 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                    selectedRecording?.id === rec.id ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                  }`}
                  onClick={() => setSelectedRecording(rec)}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{rec.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {rec.subject} · {formatDateTime(rec.createdAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(rec.id);
                    }}
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg"
                    aria-label="Delete transcription"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
          {!selectedRecording ? (
            <div className="py-12 text-center">
              <Save className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-700">Select a saved transcription</p>
              <p className="text-xs text-slate-500 mt-1">
                View timestamped segments, AI summary, key points, and export directly to Live AI Notes.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{selectedRecording.title}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selectedRecording.subject} · {formatDateTime(selectedRecording.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      downloadTranscript(selectedRecording.transcriptText, selectedRecording.title)
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Export
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      navigate('/notes', {
                        state: {
                          prefillTitle: selectedRecording.title,
                          prefillSubject: selectedRecording.subject,
                          prefillTranscript: selectedRecording.transcriptText,
                        },
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    <NotebookPen className="h-3.5 w-3.5" />
                    Send to Live AI Notes
                  </button>
                </div>
              </div>

              {selectedRecording.summary && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 mb-1.5">AI Summary</h4>
                  <p className="text-sm text-slate-700 leading-relaxed">{selectedRecording.summary}</p>
                </div>
              )}

              {selectedRecording.keyPoints.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 mb-1.5">Key Points</h4>
                  <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">
                    {selectedRecording.keyPoints.map((pt, i) => (
                      <li key={i}>{pt}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="pt-4 border-t border-slate-100">
                <h4 className="text-sm font-semibold text-slate-900 mb-2">Timestamped Transcript</h4>
                <div className="max-h-60 overflow-y-auto space-y-2 text-sm">
                  {selectedRecording.segments.length > 0 ? (
                    selectedRecording.segments.map((seg, i) => (
                      <div key={i} className="flex gap-3">
                        <span className="font-[var(--font-mono)] text-xs text-blue-700 tabular-nums mt-0.5 shrink-0">
                          {seg.timestamp}
                        </span>
                        <p className="text-slate-700">{seg.text}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-slate-700 whitespace-pre-wrap">
                      {selectedRecording.transcriptText}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
