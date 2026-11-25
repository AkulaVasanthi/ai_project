import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  Edit2,
  Loader2,
  MessageSquareText,
  Plus,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { apiRequest, formatDateTime, type DocumentItem } from '../services/api';

interface ConversationItem {
  id: number;
  title: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  sources: Array<{ documentTitle: string; pageNumber: number; excerpt: string }>;
  groundingMode: string;
  createdAt: string;
}

const SUGGESTED_QUESTIONS = [
  'Explain the main concept from my uploaded notes in simple language.',
  'Compare the two most important techniques covered in my documents.',
  'Give a real-world engineering example of this topic.',
  'Prepare short exam revision notes with key formulas or definitions.',
  'Generate 3 practice questions to test my understanding.',
];

export function AssistantPage() {
  const { notify } = useToast();

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [contextDocId, setContextDocId] = useState<string>('');

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const bottomRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    try {
      const res = await apiRequest<{ conversations: ConversationItem[] }>('/api/conversations');
      setConversations(res.conversations);
      setActiveConvId((prev) => {
        if (prev && res.conversations.some((c) => c.id === prev)) return prev;
        return res.conversations[0]?.id ?? null;
      });
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to load conversations.', 'error');
    } finally {
      setLoadingConvs(false);
    }
  }, [notify]);

  useEffect(() => {
    loadConversations();
    apiRequest<{ documents: DocumentItem[] }>('/api/documents')
      .then((res) => setDocuments(res.documents))
      .catch(() => {});
  }, [loadConversations]);

  useEffect(() => {
    if (!activeConvId) {
      setMessages([]);
      return;
    }
    setLoadingMsgs(true);
    apiRequest<{ messages: ChatMessage[] }>(`/api/conversations/${activeConvId}/messages`)
      .then((res) => setMessages(res.messages))
      .catch((err) => notify(err instanceof Error ? err.message : 'Failed to load messages.', 'error'))
      .finally(() => setLoadingMsgs(false));
  }, [activeConvId, notify]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const handleNewConversation = async (): Promise<number | null> => {
    try {
      const res = await apiRequest<{ conversation: ConversationItem }>('/api/conversations', {
        method: 'POST',
        body: JSON.stringify({ title: 'New Study Chat' }),
      });
      setConversations((prev) => [res.conversation, ...prev]);
      setActiveConvId(res.conversation.id);
      setMessages([]);
      return res.conversation.id;
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not create conversation.', 'error');
      return null;
    }
  };

  const handleRename = async (id: number) => {
    if (!renameValue.trim()) return;
    try {
      await apiRequest(`/api/conversations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: renameValue.trim() }),
      });
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: renameValue.trim() } : c))
      );
      setRenamingId(null);
      notify('Conversation renamed.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Rename failed.', 'error');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await apiRequest(`/api/conversations/${id}`, { method: 'DELETE' });
      const remaining = conversations.filter((c) => c.id !== id);
      setConversations(remaining);
      if (activeConvId === id) {
        setActiveConvId(remaining[0]?.id ?? null);
      }
      notify('Conversation deleted.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Delete failed.', 'error');
    }
  };

  const sendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || sending) return;

    let targetConvId = activeConvId;
    if (!targetConvId) {
      targetConvId = await handleNewConversation();
      if (!targetConvId) return;
    }

    setInput('');
    setSending(true);
    const optimisticUser: ChatMessage = {
      id: Date.now(),
      role: 'user',
      content: trimmed,
      sources: [],
      groundingMode: 'user',
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);

    try {
      const res = await apiRequest<{
        userMessage: ChatMessage;
        assistantMessage: ChatMessage;
      }>(`/api/conversations/${targetConvId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          content: trimmed,
          documentId: contextDocId ? Number(contextDocId) : null,
        }),
      });

      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimisticUser.id),
        res.userMessage,
        res.assistantMessage,
      ]);
      loadConversations();
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id));
      notify(err instanceof Error ? err.message : 'Failed to send message.', 'error');
    } finally {
      setSending(false);
    }
  };

  const groundingLabel = (mode: string) => {
    if (mode === 'documents') return 'Grounded in your uploaded documents';
    if (mode === 'hybrid') return 'Your documents + general AI knowledge';
    return 'General AI academic knowledge';
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">AI Study Assistant</h2>
          <p className="mt-1 text-sm text-slate-600">
            Ask conceptual questions grounded in your uploaded PDFs, Knowledge Graph concepts, and conversation history.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <select
            aria-label="Filter assistant document context"
            value={contextDocId}
            onChange={(e) => setContextDocId(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-blue-600 focus:outline-none"
          >
            <option value="">Context: All Documents + Graph</option>
            {documents.map((doc) => (
              <option key={doc.id} value={doc.id}>
                Focus: {doc.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-[calc(100vh-14.5rem)] min-h-[540px]">
        {/* Left Conversation Sidebar */}
        <aside className="lg:col-span-3 bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden">
          <div className="p-3.5 border-b border-slate-100">
            <button
              type="button"
              onClick={handleNewConversation}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              New Conversation
            </button>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {loadingConvs ? (
              <div className="p-4 space-y-2 animate-pulse">
                <div className="h-10 bg-slate-100 rounded-lg" />
                <div className="h-10 bg-slate-100 rounded-lg" />
              </div>
            ) : conversations.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-500">
                Start a conversation to save your study Q&A history.
              </p>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => setActiveConvId(conv.id)}
                  className={`px-3.5 py-3 cursor-pointer transition-colors ${
                    activeConvId === conv.id ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                  }`}
                >
                  {renamingId === conv.id ? (
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleRename(conv.id)}
                        autoFocus
                        className="flex-1 min-w-0 rounded border border-blue-400 px-2 py-1 text-xs bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => handleRename(conv.id)}
                        className="p-1 text-teal-600 hover:bg-teal-50 rounded"
                        aria-label="Save conversation name"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setRenamingId(null)}
                        className="p-1 text-slate-400 hover:bg-slate-100 rounded"
                        aria-label="Cancel rename"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{conv.title}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
                          {conv.messageCount} msgs · {formatDateTime(conv.updatedAt)}
                        </p>
                      </div>
                      <div
                        className="flex items-center gap-0.5 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingId(conv.id);
                            setRenameValue(conv.title);
                          }}
                          className="p-1 text-slate-400 hover:text-blue-600 rounded"
                          aria-label="Rename conversation"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(conv.id)}
                          className="p-1 text-slate-400 hover:text-red-600 rounded"
                          aria-label="Delete conversation"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Chat Area */}
        <section className="lg:col-span-9 bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {loadingMsgs ? (
              <div className="h-full flex items-center justify-center text-sm text-slate-500 gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                Loading messages...
              </div>
            ) : messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-xl mx-auto">
                <MessageSquareText className="h-10 w-10 text-blue-600/80 mb-3" />
                <h3 className="text-lg font-semibold text-slate-900">
                  Ask anything about your courses
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  I retrieve relevant passages from your uploaded documents and Knowledge Graph concepts, and clearly tell you when an answer draws from general knowledge.
                </p>
                <div className="mt-6 w-full grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-left">
                  {SUGGESTED_QUESTIONS.map((q, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => sendMessage(q)}
                      className="rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-xs text-slate-700 hover:border-blue-300 hover:bg-blue-50/50 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-50 border border-slate-200 text-slate-800'
                    }`}
                  >
                    {msg.role === 'assistant' && (
                      <p
                        className={`text-[11px] font-semibold mb-2 ${
                          msg.groundingMode === 'documents'
                            ? 'text-teal-700'
                            : msg.groundingMode === 'hybrid'
                              ? 'text-purple-700'
                              : 'text-slate-500'
                        }`}
                      >
                        {groundingLabel(msg.groundingMode)}
                      </p>
                    )}
                    <div className="whitespace-pre-wrap">{msg.content}</div>

                    {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-slate-200 space-y-1.5">
                        <p className="text-[11px] font-semibold text-slate-500">
                          Document Context Used
                        </p>
                        {msg.sources.map((s, idx) => (
                          <p key={idx} className="text-xs text-slate-600">
                            <span className="font-medium text-slate-800">{s.documentTitle}</span> ·
                            Page {s.pageNumber}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}

            {sending && (
              <div className="flex justify-start">
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-600 inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  Searching your documents & generating answer...
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
            className="p-4 border-t border-slate-200 bg-white flex items-center gap-3"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={sending}
              placeholder="Ask to explain a concept, compare topics, or prepare exam notes..."
              className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors shrink-0"
            >
              <Send className="h-4 w-4" />
              Send
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
