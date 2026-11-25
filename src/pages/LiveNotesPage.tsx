import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Download,
  Edit3,
  Loader2,
  NotebookPen,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { apiRequest, formatDateTime, type NoteSession } from '../services/api';

export function LiveNotesPage() {
  const { notify } = useToast();
  const location = useLocation();
  const navState = (location.state || {}) as {
    prefillTitle?: string;
    prefillSubject?: string;
    prefillTranscript?: string;
  };

  const [notes, setNotes] = useState<NoteSession[]>([]);
  const [selectedNote, setSelectedNote] = useState<NoteSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingNew, setCreatingNew] = useState(Boolean(navState.prefillTranscript));

  // New session generator fields
  const [title, setTitle] = useState(navState.prefillTitle || '');
  const [subject, setSubject] = useState(navState.prefillSubject || 'Computer Science');
  const [transcriptText, setTranscriptText] = useState(navState.prefillTranscript || '');
  const [generating, setGenerating] = useState(false);

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editStructured, setEditStructured] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ notes: NoteSession[] }>('/api/notes');
      setNotes(res.notes);
      if (!navState.prefillTranscript && res.notes.length > 0) {
        setSelectedNote((prev) => prev || res.notes[0]);
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to load AI notes.', 'error');
    } finally {
      setLoading(false);
    }
  }, [navState.prefillTranscript, notify]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || transcriptText.trim().length < 20) {
      notify('Enter a session title and at least 20 characters of lecture/transcript content.', 'error');
      return;
    }

    setGenerating(true);
    try {
      const res = await apiRequest<{ note: NoteSession }>('/api/notes/generate', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          subject: subject.trim() || 'General',
          sourceType: 'live_ai_notes',
          transcriptText: transcriptText.trim(),
        }),
      });
      notify('Structured AI notes generated and saved.');
      setSelectedNote(res.note);
      setCreatingNew(false);
      setTitle('');
      setTranscriptText('');
      await loadNotes();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to generate AI notes.', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const beginEdit = (note: NoteSession) => {
    setEditTitle(note.title);
    setEditSummary(note.summary);
    setEditStructured(note.structuredNotes);
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedNote) return;
    setSavingEdit(true);
    try {
      const res = await apiRequest<{ note: NoteSession }>(`/api/notes/${selectedNote.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: editTitle.trim(),
          summary: editSummary.trim(),
          structuredNotes: editStructured,
        }),
      });
      setSelectedNote(res.note);
      setEditing(false);
      notify('Notes updated.');
      await loadNotes();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to save changes.', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await apiRequest(`/api/notes/${id}`, { method: 'DELETE' });
      notify('Note session deleted.');
      if (selectedNote?.id === id) setSelectedNote(null);
      await loadNotes();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to delete notes.', 'error');
    }
  };

  const exportMarkdown = (note: NoteSession) => {
    const md = [
      `# ${note.title}`,
      `Subject: ${note.subject}`,
      '',
      `## Session Summary`,
      note.summary,
      '',
      `## Structured Notes`,
      note.structuredNotes,
      '',
      `## Key Points`,
      ...note.keyPoints.map((p) => `- ${p}`),
      '',
      `## Important Definitions`,
      ...note.definitions.map((d) => `- **${d.term}**: ${d.definition}`),
      '',
      `## Review Questions`,
      ...note.questions.map((q) => `- ${q}`),
      '',
      `## Action Items`,
      ...note.actionItems.map((a) => `- [ ] ${a}`),
    ].join('\n');

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${note.title.replace(/[^a-z0-9-_]+/gi, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Live AI Notes</h2>
          <p className="mt-1 text-sm text-slate-600">
            Convert study or lecture transcripts into structured notes, definitions, open questions, and action items with full editing and Markdown export.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setCreatingNew(true);
            setEditing(false);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          New Note Session
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Saved Sessions Sidebar */}
        <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Saved Sessions</h3>
            <span className="text-xs text-slate-400 tabular-nums">{notes.length}</span>
          </div>
          {loading ? (
            <div className="p-4 space-y-2 animate-pulse">
              <div className="h-12 bg-slate-100 rounded-lg" />
              <div className="h-12 bg-slate-100 rounded-lg" />
            </div>
          ) : notes.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No saved note sessions yet. Create your first session on the right.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
              {notes.map((n) => (
                <div
                  key={n.id}
                  onClick={() => {
                    setSelectedNote(n);
                    setCreatingNew(false);
                    setEditing(false);
                  }}
                  className={`px-5 py-3.5 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                    !creatingNew && selectedNote?.id === n.id ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{n.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      {n.subject} · {formatDateTime(n.updatedAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(n.id);
                    }}
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg shrink-0"
                    aria-label="Delete note session"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* Main Workspace */}
        <section className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6">
          {creatingNew || !selectedNote ? (
            <form onSubmit={handleGenerate} className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Create Structured Study Notes
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Enter or paste raw lecture text or transcript content to generate organized study notes.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="note-title" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Session title
                  </label>
                  <input
                    id="note-title"
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Week 6 — Database Normalization & BCNF"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="note-subject" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Subject
                  </label>
                  <input
                    id="note-subject"
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g., Database Systems"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="note-transcript" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Transcript or lecture content
                </label>
                <textarea
                  id="note-transcript"
                  rows={9}
                  required
                  value={transcriptText}
                  onChange={(e) => setTranscriptText(e.target.value)}
                  placeholder="Paste your lecture transcript, meeting notes, or study material here..."
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-end gap-3">
                {selectedNote && (
                  <button
                    type="button"
                    onClick={() => setCreatingNew(false)}
                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={generating}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {generating ? 'Generating Structured Notes...' : 'Generate & Save Notes'}
                </button>
              </div>
            </form>
          ) : editing ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-base font-semibold text-slate-900">Edit Saved Notes</h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    disabled={savingEdit}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {savingEdit ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Summary</label>
                <textarea
                  rows={3}
                  value={editSummary}
                  onChange={(e) => setEditSummary(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Structured Notes (Markdown)
                </label>
                <textarea
                  rows={12}
                  value={editStructured}
                  onChange={(e) => setEditStructured(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-[var(--font-mono)]"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">{selectedNote.title}</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    {selectedNote.subject} · Updated {formatDateTime(selectedNote.updatedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => beginEdit(selectedNote)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => exportMarkdown(selectedNote)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Export .md
                  </button>
                </div>
              </div>

              {/* Short Summary */}
              <div className="rounded-lg bg-blue-50/50 border border-blue-100 p-4">
                <p className="text-xs font-semibold text-blue-800 mb-1">Session Summary</p>
                <p className="text-sm text-slate-800 leading-relaxed">{selectedNote.summary}</p>
              </div>

              {/* Structured Notes */}
              <div>
                <h4 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-1.5">
                  <NotebookPen className="h-4 w-4 text-blue-600" />
                  Structured Notes
                </h4>
                <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap leading-relaxed bg-slate-50/60 border border-slate-200 rounded-lg p-5">
                  {selectedNote.structuredNotes}
                </div>
              </div>

              {/* Key Points & Definitions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 mb-2">Key Points</h4>
                  <ul className="space-y-1.5 list-disc pl-5 text-sm text-slate-700">
                    {selectedNote.keyPoints.map((pt, i) => (
                      <li key={i}>{pt}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-slate-900 mb-2">Important Definitions</h4>
                  <div className="space-y-2.5">
                    {selectedNote.definitions.map((def, i) => (
                      <div key={i} className="text-sm">
                        <span className="font-semibold text-slate-900">{def.term}: </span>
                        <span className="text-slate-600">{def.definition}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Questions & Action Items */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
                <div>
                  <h4 className="text-sm font-semibold text-purple-800 mb-2">
                    Open & Review Questions
                  </h4>
                  <ul className="space-y-1.5 list-disc pl-5 text-sm text-slate-700">
                    {selectedNote.questions.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-teal-800 mb-2">Action Items</h4>
                  <ul className="space-y-1.5 list-disc pl-5 text-sm text-slate-700">
                    {selectedNote.actionItems.map((act, i) => (
                      <li key={i}>{act}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
