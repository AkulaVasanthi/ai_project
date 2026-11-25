import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckSquare,
  Download,
  FileAudio,
  Info,
  Loader2,
  NotebookPen,
  Trash2,
  Upload,
  Video,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { apiRequest, formatDateTime, type RecordingItem } from '../services/api';

interface MeetingRecordingsPageProps {
  provider: 'zoom' | 'google_meet';
}

export function MeetingRecordingsPage({ provider }: MeetingRecordingsPageProps) {
  const { providerStatus } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();

  const isZoom = provider === 'zoom';
  const label = isZoom ? 'Zoom' : 'Google Meet';
  const oauthConnected = isZoom
    ? providerStatus?.zoomOAuthConfigured
    : providerStatus?.googleWorkspaceConfigured;

  const [recordings, setRecordings] = useState<RecordingItem[]>([]);
  const [selected, setSelected] = useState<RecordingItem | null>(null);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('Lecture & Study Group');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [transcriptFile, setTranscriptFile] = useState<File | null>(null);
  const [pastedTranscript, setPastedTranscript] = useState('');
  const [processing, setProcessing] = useState(false);

  const loadRecordings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ recordings: RecordingItem[] }>(
        `/api/recordings?sourceType=${provider}`
      );
      setRecordings(res.recordings);
      setSelected((prev) => {
        if (prev && res.recordings.some((r) => r.id === prev.id)) return prev;
        return res.recordings[0] || null;
      });
    } catch (err) {
      notify(err instanceof Error ? err.message : `Failed to load ${label} recordings.`, 'error');
    } finally {
      setLoading(false);
    }
  }, [provider, label, notify]);

  useEffect(() => {
    setSelected(null);
    loadRecordings();
  }, [loadRecordings]);

  const handleProcessRecording = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mediaFile && !transcriptFile && !pastedTranscript.trim()) {
      notify('Upload a recording file, upload a transcript file, or paste transcript text.', 'error');
      return;
    }

    setProcessing(true);
    try {
      const formData = new FormData();
      formData.append('sourceType', provider);
      formData.append(
        'title',
        title.trim() ||
          mediaFile?.name.replace(/\.[^.]+$/, '') ||
          transcriptFile?.name.replace(/\.[^.]+$/, '') ||
          `${label} Study Session`
      );
      formData.append('subject', subject.trim() || 'General');
      if (mediaFile) formData.append('mediaFile', mediaFile);
      if (transcriptFile) formData.append('transcriptFile', transcriptFile);
      if (pastedTranscript.trim()) formData.append('transcriptText', pastedTranscript.trim());
      formData.append('generateSummary', 'true');

      const res = await apiRequest<{ recording: RecordingItem }>('/api/recordings', {
        method: 'POST',
        body: formData,
      });

      notify(`${label} recording processed with transcript, summary, and action items.`);
      setTitle('');
      setMediaFile(null);
      setTranscriptFile(null);
      setPastedTranscript('');
      setSelected(res.recording);
      await loadRecordings();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Recording processing failed.', 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await apiRequest(`/api/recordings/${id}`, { method: 'DELETE' });
      notify(`Deleted ${label} recording.`);
      if (selected?.id === id) setSelected(null);
      loadRecordings();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Delete failed.', 'error');
    }
  };

  const downloadTranscript = (rec: RecordingItem) => {
    const blob = new Blob([rec.transcriptText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${rec.title.replace(/[^a-z0-9-_]+/gi, '_')}_transcript.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            {label} Recording Integration
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Upload {label} audio/video recordings or transcript files (.vtt, .srt, .txt) to extract transcripts, meeting summaries, key points, and action items.
          </p>
        </div>
      </div>

      {/* Honest Integration Architecture Banner */}
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 flex items-start gap-3">
        <Info className="h-4.5 w-4.5 text-blue-600 mt-0.5 shrink-0" />
        <div className="text-xs text-slate-600 leading-relaxed">
          <span className="font-semibold text-slate-900">
            {isZoom ? 'Zoom Cloud OAuth' : 'Google Workspace OAuth'}:{' '}
            {oauthConnected ? 'Credentials detected on server' : 'Local upload workflow active (Cloud OAuth not connected)'}
          </span>
          {' — '}
          {isZoom
            ? 'Automatic Zoom meeting joining or cloud sync requires configuring ZOOM_CLIENT_ID and ZOOM_CLIENT_SECRET with a registered Zoom Marketplace app. Upload local Zoom MP4/M4A recordings or .vtt transcripts below for full AI processing.'
            : 'Automatic Google Drive / Meet cloud sync requires configuring GOOGLE_WORKSPACE_CLIENT_ID and GOOGLE_WORKSPACE_CLIENT_SECRET. Upload exported Google Meet recordings or transcripts below for full AI processing.'}
        </div>
      </div>

      {/* Upload & Processing Form */}
      <form
        onSubmit={handleProcessRecording}
        className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="mtg-title" className="block text-sm font-medium text-slate-700 mb-1.5">
              Meeting title
            </label>
            <input
              id="mtg-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`e.g., ${label} — Distributed Systems Seminar`}
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="mtg-subject" className="block text-sm font-medium text-slate-700 mb-1.5">
              Subject / course
            </label>
            <input
              id="mtg-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/50 p-4">
            <label htmlFor="mtg-media" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Audio / Video Recording (MP3, M4A, WAV, WEBM, MP4 — max 25 MB)
            </label>
            <input
              id="mtg-media"
              type="file"
              accept="audio/*,video/mp4,video/webm,.m4a,.mp3,.wav,.mp4,.webm"
              onChange={(e) => setMediaFile(e.target.files?.[0] || null)}
              className="block w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-slate-200 file:bg-white file:text-slate-700 file:font-semibold"
            />
          </div>

          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/50 p-4">
            <label htmlFor="mtg-transcript-file" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Transcript File (Optional — .vtt, .srt, .txt)
            </label>
            <input
              id="mtg-transcript-file"
              type="file"
              accept=".vtt,.srt,.txt,text/plain,text/vtt"
              onChange={(e) => setTranscriptFile(e.target.files?.[0] || null)}
              className="block w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-slate-200 file:bg-white file:text-slate-700 file:font-semibold"
            />
          </div>
        </div>

        <div>
          <label htmlFor="mtg-paste" className="block text-xs font-semibold text-slate-700 mb-1.5">
            Or paste meeting transcript directly
          </label>
          <textarea
            id="mtg-paste"
            rows={3}
            value={pastedTranscript}
            onChange={(e) => setPastedTranscript(e.target.value)}
            placeholder={`Paste a ${label} transcript or WebVTT excerpt if you already have the text...`}
            className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={processing}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {processing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {processing ? 'Transcribing & Summarizing...' : `Process ${label} Recording`}
          </button>
        </div>
      </form>

      {/* Saved Recordings List & Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">Saved {label} Sessions</h3>
            <span className="text-xs text-slate-400 tabular-nums">{recordings.length} total</span>
          </div>
          {loading ? (
            <div className="p-5 space-y-2 animate-pulse">
              <div className="h-12 bg-slate-100 rounded-lg" />
              <div className="h-12 bg-slate-100 rounded-lg" />
            </div>
          ) : recordings.length === 0 ? (
            <div className="p-10 text-center">
              <Video className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-700">No {label} recordings processed</p>
              <p className="text-xs text-slate-500 mt-1">
                Upload a recording or transcript above to extract summaries and action items.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recordings.map((rec) => (
                <div
                  key={rec.id}
                  onClick={() => setSelected(rec)}
                  className={`px-5 py-3.5 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                    selected?.id === rec.id ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                  }`}
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
                    aria-label="Delete recording"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
          {!selected ? (
            <div className="py-12 text-center">
              <FileAudio className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-700">Select a meeting session</p>
              <p className="text-xs text-slate-500 mt-1">
                Inspect the extracted transcript, AI summary, key topics, and action items.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{selected.title}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selected.subject} · {selected.fileName} · {formatDateTime(selected.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => downloadTranscript(selected)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Transcript
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      navigate('/notes', {
                        state: {
                          prefillTitle: selected.title,
                          prefillSubject: selected.subject,
                          prefillTranscript: selected.transcriptText,
                        },
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    <NotebookPen className="h-3.5 w-3.5" />
                    Create AI Notes
                  </button>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-slate-900 mb-1.5">Meeting Summary</h4>
                <p className="text-sm text-slate-700 leading-relaxed">{selected.summary}</p>
              </div>

              {selected.keyPoints.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 mb-1.5">Key Topics Discussed</h4>
                  <ul className="list-disc pl-5 space-y-1.5 text-sm text-slate-700">
                    {selected.keyPoints.map((pt, i) => (
                      <li key={i}>{pt}</li>
                    ))}
                  </ul>
                </div>
              )}

              {selected.actionItems.length > 0 && (
                <div className="rounded-lg bg-teal-50/60 border border-teal-200/80 p-4">
                  <h4 className="text-sm font-semibold text-teal-900 mb-2 flex items-center gap-1.5">
                    <CheckSquare className="h-4 w-4 text-teal-600" />
                    Action Items
                  </h4>
                  <ul className="space-y-1.5 text-sm text-teal-950">
                    {selected.actionItems.map((act, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-teal-600 font-semibold">•</span>
                        <span>{act}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="pt-4 border-t border-slate-100">
                <h4 className="text-sm font-semibold text-slate-900 mb-2">Full Transcript</h4>
                <div className="max-h-64 overflow-y-auto rounded-lg bg-slate-50 border border-slate-200 p-4 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {selected.transcriptText}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
