import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import {
  ArrowRight,
  Loader2,
  Maximize2,
  Network,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import {
  apiRequest,
  type DocumentItem,
  type GraphEdgeItem,
  type GraphNodeItem,
} from '../services/api';

interface ConceptNodeData extends Record<string, unknown> {
  label: string;
  category: string;
  subject: string;
  description: string;
  documentTitle: string;
  dbId: number;
}

const CATEGORY_STYLES: Record<
  string,
  { bg: string; border: string; accent: string; label: string; minimap: string }
> = {
  core: {
    bg: 'bg-blue-50',
    border: 'border-blue-500',
    accent: 'text-blue-700',
    label: 'Core Concept',
    minimap: '#2563EB',
  },
  subtopic: {
    bg: 'bg-purple-50',
    border: 'border-purple-400',
    accent: 'text-purple-700',
    label: 'Subtopic',
    minimap: '#7C3AED',
  },
  method: {
    bg: 'bg-teal-50',
    border: 'border-teal-500',
    accent: 'text-teal-700',
    label: 'Method / Algorithm',
    minimap: '#0D9488',
  },
  application: {
    bg: 'bg-sky-50',
    border: 'border-sky-400',
    accent: 'text-sky-700',
    label: 'Application',
    minimap: '#0284C7',
  },
  theory: {
    bg: 'bg-indigo-50',
    border: 'border-indigo-400',
    accent: 'text-indigo-700',
    label: 'Theory / Principle',
    minimap: '#4F46E5',
  },
};

function ConceptNode({ data, selected }: NodeProps<Node<ConceptNodeData>>) {
  const style = CATEGORY_STYLES[data.category] || CATEGORY_STYLES.subtopic;
  return (
    <div
      className={`min-w-[175px] max-w-[230px] rounded-xl border-2 px-3.5 py-2.5 shadow-xs transition-shadow ${
        style.bg
      } ${style.border} ${selected ? 'ring-2 ring-blue-500/40 shadow-md' : ''}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-400 !w-2 !h-2" />
      <p className={`text-[10px] font-semibold ${style.accent}`}>{style.label}</p>
      <p className="text-sm font-semibold text-slate-900 leading-snug mt-0.5">{data.label}</p>
      <p className="text-[11px] text-slate-500 truncate mt-1">{data.subject}</p>
      <Handle type="source" position={Position.Bottom} className="!bg-blue-600 !w-2 !h-2" />
    </div>
  );
}

const nodeTypes = { conceptNode: ConceptNode };

function KnowledgeGraphWorkspace() {
  const { notify } = useToast();
  const [searchParams] = useSearchParams();
  const { fitView } = useReactFlow();

  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [filterDocId, setFilterDocId] = useState<string>(searchParams.get('doc') || '');
  const [filterSubject, setFilterSubject] = useState('All');

  // Generation controls
  const [genDocId, setGenDocId] = useState<string>(searchParams.get('doc') || '');
  const [customTopic, setCustomTopic] = useState('');
  const [customSubject, setCustomSubject] = useState('Computer Science');
  const [generating, setGenerating] = useState(false);

  const [rawNodes, setRawNodes] = useState<GraphNodeItem[]>([]);
  const [rawEdges, setRawEdges] = useState<GraphEdgeItem[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<ConceptNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadGraph = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterDocId) params.set('documentId', filterDocId);
      if (filterSubject !== 'All') params.set('subject', filterSubject);
      const res = await apiRequest<{
        nodes: GraphNodeItem[];
        edges: GraphEdgeItem[];
        subjects: string[];
      }>(`/api/knowledge-graph?${params.toString()}`);

      setRawNodes(res.nodes);
      setRawEdges(res.edges);
      setSubjects(res.subjects);

      const flowNodes: Node<ConceptNodeData>[] = res.nodes.map((n) => ({
        id: n.id,
        type: 'conceptNode',
        position: n.position,
        data: {
          label: n.label,
          category: n.category,
          subject: n.subject,
          description: n.description,
          documentTitle: n.documentTitle,
          dbId: n.dbId,
        },
      }));

      const flowEdges: Edge[] = res.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        type: 'smoothstep',
        animated: false,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#64748B' },
        style: { stroke: '#94A3B8', strokeWidth: 1.6 },
        labelStyle: { fill: '#334155', fontSize: 11, fontWeight: 500 },
        labelBgStyle: { fill: '#FFFFFF', fillOpacity: 0.92 },
        labelBgPadding: [6, 3],
        labelBgBorderRadius: 4,
      }));

      setNodes(flowNodes);
      setEdges(flowEdges);
      window.setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 80);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to load knowledge graph.', 'error');
    } finally {
      setLoading(false);
    }
  }, [filterDocId, filterSubject, setNodes, setEdges, fitView, notify]);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiRequest<{ documents: DocumentItem[] }>('/api/documents');
        setDocuments(res.documents);
      } catch {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!genDocId && !customTopic.trim()) {
      notify('Select an uploaded document or enter a topic to map.', 'error');
      return;
    }

    setGenerating(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/knowledge-graph/generate', {
        method: 'POST',
        body: JSON.stringify({
          documentId: genDocId ? Number(genDocId) : null,
          customTopic: genDocId ? undefined : customTopic.trim(),
          subject: customSubject.trim() || 'Computer Science',
          replaceDocumentGraph: Boolean(genDocId),
        }),
      });
      notify(res.message);
      setCustomTopic('');
      if (genDocId) setFilterDocId(genDocId);
      await loadGraph();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Knowledge graph generation failed.', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleNodeDragStop = async (_event: unknown, node: Node<ConceptNodeData>) => {
    try {
      await apiRequest(`/api/knowledge-graph/nodes/${node.id}/position`, {
        method: 'PATCH',
        body: JSON.stringify({ x: Math.round(node.position.x), y: Math.round(node.position.y) }),
      });
    } catch {
      // non-blocking persistence
    }
  };

  const handleDeleteNode = async (nodeId: string) => {
    try {
      await apiRequest(`/api/knowledge-graph/nodes/${nodeId}`, { method: 'DELETE' });
      setSelectedNodeId(null);
      notify('Concept node removed.');
      await loadGraph();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to delete concept.', 'error');
    }
  };

  const selectedNode = useMemo(
    () => rawNodes.find((n) => n.id === selectedNodeId) || null,
    [rawNodes, selectedNodeId]
  );

  const relatedConcepts = useMemo(() => {
    if (!selectedNode) return { outgoing: [], incoming: [] };
    const nodeMap = new Map(rawNodes.map((n) => [n.id, n]));
    const outgoing = rawEdges
      .filter((e) => e.source === selectedNode.id)
      .map((e) => ({ relation: e.label, node: nodeMap.get(e.target) }))
      .filter((x): x is { relation: string; node: GraphNodeItem } => Boolean(x.node));
    const incoming = rawEdges
      .filter((e) => e.target === selectedNode.id)
      .map((e) => ({ relation: e.label, node: nodeMap.get(e.source) }))
      .filter((x): x is { relation: string; node: GraphNodeItem } => Boolean(x.node));
    return { outgoing, incoming };
  }, [selectedNode, rawNodes, rawEdges]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Interactive Knowledge Graph
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Explore extracted concepts and directed relationships visually. Drag nodes to organize your memory map, filter by document or subject, and click any node for full details.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-600">
          {Object.entries(CATEGORY_STYLES).map(([key, style]) => (
            <span key={key} className="inline-flex items-center gap-1.5 font-medium">
              <span
                className="h-2.5 w-2.5 rounded-xs border"
                style={{ backgroundColor: style.minimap }}
              />
              {style.label}
            </span>
          ))}
        </div>
      </div>

      {/* Generation & Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
        <form onSubmit={handleGenerate} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-4">
            <label htmlFor="kg-doc" className="block text-xs font-semibold text-slate-600 mb-1">
              Extract from uploaded document
            </label>
            <select
              id="kg-doc"
              value={genDocId}
              onChange={(e) => setGenDocId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            >
              <option value="">— Or enter a custom topic →</option>
              {documents.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.title} ({doc.subject})
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-4">
            <label htmlFor="kg-topic" className="block text-xs font-semibold text-slate-600 mb-1">
              Custom topic (when no document selected)
            </label>
            <input
              id="kg-topic"
              type="text"
              disabled={Boolean(genDocId)}
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              placeholder="e.g., Machine Learning Paradigms"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-400 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="md:col-span-2">
            <label htmlFor="kg-subj" className="block text-xs font-semibold text-slate-600 mb-1">
              Subject
            </label>
            <input
              id="kg-subj"
              type="text"
              disabled={Boolean(genDocId)}
              value={customSubject}
              onChange={(e) => setCustomSubject(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50"
            />
          </div>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={generating}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {generating ? 'Building...' : 'Build Graph'}
            </button>
          </div>
        </form>

        {/* Filter Row */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              aria-label="Filter graph by document"
              value={filterDocId}
              onChange={(e) => setFilterDocId(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 focus:border-blue-600 focus:outline-none"
            >
              <option value="">All Documents</option>
              {documents.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.title}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter graph by subject"
              value={filterSubject}
              onChange={(e) => setFilterSubject(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 focus:border-blue-600 focus:outline-none"
            >
              <option value="All">All Subjects</option>
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <span className="text-xs text-slate-500 tabular-nums">
              {rawNodes.length} concepts · {rawEdges.length} relationships
            </span>
          </div>

          <button
            type="button"
            onClick={() => fitView({ padding: 0.2, duration: 300 })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            Fit to Screen
          </button>
        </div>
      </div>

      {/* Graph Canvas + Node Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <div
          className={`${
            selectedNode ? 'lg:col-span-8' : 'lg:col-span-12'
          } h-[580px] bg-white border border-slate-200 rounded-xl overflow-hidden relative`}
        >
          {loading ? (
            <div className="h-full flex items-center justify-center text-sm text-slate-500 gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              Loading concept graph...
            </div>
          ) : nodes.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8">
              <Network className="h-11 w-11 text-slate-300 mb-3" />
              <h3 className="text-base font-semibold text-slate-900">
                Your Knowledge Graph is empty
              </h3>
              <p className="mt-1 text-sm text-slate-500 max-w-md">
                Select an uploaded PDF document or enter a topic like "Machine Learning" above and click Build Graph to extract an interactive concept map.
              </p>
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={(_evt, node) => setSelectedNodeId(node.id)}
              onNodeDragStop={handleNodeDragStop}
              onPaneClick={() => setSelectedNodeId(null)}
              fitView
              minZoom={0.25}
              maxZoom={1.8}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#E2E8F0" gap={20} />
              <Controls showInteractive={false} />
              <MiniMap
                nodeColor={(n) => {
                  const cat = String((n.data as ConceptNodeData | undefined)?.category || 'subtopic');
                  return (CATEGORY_STYLES[cat] || CATEGORY_STYLES.subtopic).minimap;
                }}
                maskColor="rgba(248, 250, 252, 0.72)"
              />
            </ReactFlow>
          )}
        </div>

        {/* Node Detail Side Panel */}
        {selectedNode && (
          <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between h-[580px] overflow-y-auto">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-100">
                <div>
                  <p className="text-xs font-semibold text-blue-700">
                    {(CATEGORY_STYLES[selectedNode.category] || CATEGORY_STYLES.subtopic).label} ·{' '}
                    {selectedNode.subject}
                  </p>
                  <h3 className="text-lg font-bold text-slate-900 mt-1">{selectedNode.label}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedNodeId(null)}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded"
                  aria-label="Close detail panel"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">Concept Description</p>
                <p className="text-sm text-slate-700 leading-relaxed">{selectedNode.description}</p>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">Source Material</p>
                <p className="text-sm font-medium text-slate-900">{selectedNode.documentTitle}</p>
              </div>

              {relatedConcepts.outgoing.length > 0 && (
                <div className="pt-3 border-t border-slate-100">
                  <p className="text-xs font-semibold text-slate-500 mb-2">Connected Sub-Concepts</p>
                  <div className="space-y-1.5">
                    {relatedConcepts.outgoing.map((rel, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setSelectedNodeId(rel.node.id)}
                        className="w-full text-left px-3 py-2 rounded-lg bg-slate-50 hover:bg-blue-50 text-xs flex items-center justify-between gap-2 transition-colors"
                      >
                        <span className="text-slate-500">{rel.relation}</span>
                        <span className="font-semibold text-slate-900 inline-flex items-center gap-1">
                          <ArrowRight className="h-3 w-3 text-blue-600" />
                          {rel.node.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {relatedConcepts.incoming.length > 0 && (
                <div className="pt-3 border-t border-slate-100">
                  <p className="text-xs font-semibold text-slate-500 mb-2">Parent / Prerequisite Concepts</p>
                  <div className="space-y-1.5">
                    {relatedConcepts.incoming.map((rel, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setSelectedNodeId(rel.node.id)}
                        className="w-full text-left px-3 py-2 rounded-lg bg-slate-50 hover:bg-purple-50 text-xs flex items-center justify-between gap-2 transition-colors"
                      >
                        <span className="font-semibold text-slate-900">{rel.node.label}</span>
                        <span className="text-slate-500">{rel.relation}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 mt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => handleDeleteNode(selectedNode.id)}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove Concept Node
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

export function KnowledgeGraphPage() {
  return (
    <ReactFlowProvider>
      <KnowledgeGraphWorkspace />
    </ReactFlowProvider>
  );
}
