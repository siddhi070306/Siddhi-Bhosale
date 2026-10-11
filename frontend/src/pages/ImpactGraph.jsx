import React, { useState } from 'react';
import { Search, ShieldCheck, Fuel, Landmark, Building2, Sparkles, ArrowRight, Sliders, RefreshCw, Check } from 'lucide-react';
import InteractiveGraph from '../components/graph/InteractiveGraph';
import CausalChainWalkthrough from '../components/common/CausalChainWalkthrough';
import { useUi } from '../context/UiContext';
import { useSamples } from '../context/useSamples';
import { api } from '../services/api';

function EmptyState({ onNavigateToChat, onSelectEvent }) {
  const [inputText, setInputText] = useState('');
  const { samples, error: samplesError } = useSamples();
  const STYLE = [
    { icon: Fuel, colorClass: 'starter-icon-amber' },
    { icon: Landmark, colorClass: 'starter-icon-indigo' },
    { icon: Building2, colorClass: 'starter-icon-emerald' },
  ];
  const starters = samples.slice(0, 3).map((smp, i) => ({ ...STYLE[i % STYLE.length], title: smp.title, text: smp.text }));

  return (
    <div className="card" style={{ padding: '36px 28px', maxWidth: 860, margin: '24px auto', textAlign: 'center' }}>
      <div style={{ display: 'inline-flex', padding: 10, borderRadius: 12, background: 'rgba(99, 102, 241, 0.1)', color: '#4f46e5', marginBottom: 14 }}>
        <Sparkles size={24} />
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#09090b', marginBottom: 8, letterSpacing: '-0.02em' }}>
        Interactive Financial Impact Graph
      </div>
      <p style={{ fontSize: 14, color: '#71717a', maxWidth: 580, margin: '0 auto 24px', lineHeight: 1.55 }}>
        Enter any financial headline or choose a market scenario below to instantly generate the 5-column causal dependency graph:
      </p>

      {/* Direct Prompt Input */}
      <div style={{ display: 'flex', gap: 10, maxWidth: 640, margin: '0 auto 26px' }}>
        <input
          type="text"
          className="header-search-input"
          style={{ flex: 1, padding: '12px 16px', fontSize: 13.5, borderRadius: 8, border: '1px solid #d4d4d8' }}
          placeholder="Enter a prompt or news event (e.g. Brent crude jumped 12%...)"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && inputText.trim() && onSelectEvent) {
              onSelectEvent(inputText);
            }
          }}
        />
        <button
          className="btn btn-black"
          style={{ padding: '12px 22px', fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 8 }}
          disabled={!inputText.trim()}
          onClick={() => onSelectEvent && onSelectEvent(inputText)}
        >
          <span>Generate Graph</span>
          <ArrowRight size={14} />
        </button>
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
        Or start with a sample market prompt:
      </div>
      {samplesError && <p style={{ fontSize: 12.5, color: '#991b1b', marginBottom: 10 }}>Could not load sample prompts: {samplesError}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 14, textAlign: 'left', marginBottom: 24 }}>
        {starters.map((s, idx) => {
          const Icon = s.icon;
          return (
            <div
              key={idx}
              className="chat-starter-card"
              style={{ cursor: 'pointer' }}
              onClick={() => onSelectEvent && onSelectEvent(s.text)}
            >
              <div className="chat-starter-title">
                <div className={`chat-starter-icon-badge ${s.colorClass}`}>
                  <Icon size={16} />
                </div>
                <span>{s.title}</span>
              </div>
              <p className="chat-starter-snippet" style={{ margin: 0 }}>
                {s.text.slice(0, 95)}…
              </p>
            </div>
          );
        })}
      </div>

      {onNavigateToChat && (
        <button className="btn btn-outline" onClick={onNavigateToChat} style={{ fontSize: 13 }}>
          Open AI Chat Assistant
        </button>
      )}
    </div>
  );
}

export default function ImpactGraph({ analysis, onNavigateToChat, onSelectEvent, onReanalyze, onNavigateToTab }) {
  const graphData = (analysis && analysis.graphView) || null;
  const [activeTab, setActiveTab] = useState('pathways');
  const [selectedNode, setSelectedNode] = useState(graphData ? graphData.centerNode : null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [edgeWeight, setEdgeWeight] = useState(null);
  const [edgeUpdating, setEdgeUpdating] = useState(false);
  const [edgeSuccessMsg, setEdgeSuccessMsg] = useState(null);
  const [edgeErrorMsg, setEdgeErrorMsg] = useState(null);
  const { search: searchQuery, setSearch: setSearchQuery } = useUi(); // shared with the header search box
  const [showEvidenceModal, setShowEvidenceModal] = useState(false);

  const handleSelectEdge = (edge) => {
    setSelectedEdge(edge);
    const w = edge.weight != null ? edge.weight : (edge.sign || 1) * (edge.strength || 0.5);
    setEdgeWeight(Math.round(w * 100) / 100);
    setEdgeSuccessMsg(null);
    setEdgeErrorMsg(null);
    setActiveTab('edge');
  };

  const handleSaveEdge = async () => {
    if (!selectedEdge) return;
    setEdgeUpdating(true);
    setEdgeSuccessMsg(null);
    setEdgeErrorMsg(null);
    try {
      await api.updateEdge(selectedEdge.from, selectedEdge.to, edgeWeight);
      setEdgeSuccessMsg(`Transmission weight updated to ${edgeWeight >= 0 ? '+' : ''}${edgeWeight}. Re-evaluating propagation…`);
      if (onReanalyze) {
        onReanalyze(`Adjusted edge transmission weight ${selectedEdge.from} -> ${selectedEdge.to} to ${edgeWeight}`);
      }
    } catch (e) {
      setEdgeErrorMsg(e.message);
    } finally {
      setEdgeUpdating(false);
    }
  };

  if (!graphData && analysis) {
    // an analysis ran but found nothing to draw: say why, instead of pretending nothing was analysed
    const hyp = analysis.hypothesis;
    return (
      <div className="card" style={{ padding: 28, maxWidth: 760, margin: '24px auto' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#09090b', marginBottom: 8 }}>Nothing to draw for this text</div>
        <p style={{ fontSize: 13.5, color: '#27272a', lineHeight: 1.6, marginBottom: 8 }}>{analysis.emptyReason || 'No event the graph knows about was found.'}</p>
        {analysis.emptyHint && <p style={{ fontSize: 13, color: '#52525b', lineHeight: 1.6, marginBottom: 10 }}>{analysis.emptyHint}</p>}
        {analysis.input && (
          <p style={{ fontSize: 12, color: '#71717a', marginBottom: 10 }}>
            Analysed {analysis.input.chars.toLocaleString()} characters ({{ article: 'full article', description: 'headline + description', headline_only: 'headline only', pasted: 'pasted text' }[analysis.input.quality] || 'text'}).
            {analysis.input.note ? ` ${analysis.input.note}` : ''}
          </p>
        )}
        {hyp && hyp.background && (
          <p style={{ fontSize: 12, color: '#71717a', borderLeft: '3px solid #e4e4e7', paddingLeft: 8, marginBottom: 12 }}>
            <strong>Background (model knowledge, not from the article):</strong> {hyp.background}
          </p>
        )}
        {onNavigateToChat && <button className="btn btn-black" onClick={onNavigateToChat}>Back to AI Chat</button>}
      </div>
    );
  }
  if (!graphData) return <EmptyState onNavigateToChat={onNavigateToChat} onSelectEvent={onSelectEvent} />;

  const filteredNodes = searchQuery
    ? graphData.nodes.filter((n) =>
        n.label.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : graphData.nodes;

  const currentGraphData = {
    ...graphData,
    nodes: filteredNodes,
  };

  return (
    <div>
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 className="page-title">Financial Impact Graph</h1>
          <p className="page-subtitle">
            Explore how events propagate across sectors, companies and assets.
          </p>
          {onNavigateToTab && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                className="btn btn-outline"
                style={{ fontSize: 12, padding: '4px 10px' }}
                onClick={() => onNavigateToTab('asset-impact')}
              >
                Go to Asset Impact & Forecasts →
              </button>
              <button
                className="btn btn-outline"
                style={{ fontSize: 12, padding: '4px 10px' }}
                onClick={() => onNavigateToTab('scenario-simulator')}
              >
                Go to Scenario Simulator →
              </button>
            </div>
          )}
        </div>

        {/* Node search filter */}
        <div style={{ position: 'relative', width: 320 }}>
          <Search
            size={14}
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#71717a' }}
          />
          <input
            type="text"
            className="header-search-input"
            placeholder="Search nodes (companies, sectors, assets...)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Hypothesis / thin-graph notices */}
      {analysis.hypothesis && analysis.hypothesis.themes.length > 0 && (
        <div className="card" style={{ marginBottom: 12, padding: '10px 16px', fontSize: 12.5, color: '#92400e', background: '#fffbeb' }}>
          <strong>Hypothesis, not from the article:</strong> no stated event matched the graph, so the model suggested{' '}
          {analysis.hypothesis.themes.map((t) => `${t.node.replace(/_/g, ' ')} ${t.direction > 0 ? '↑' : '↓'}`).join(', ')} as themes this story could touch.
          Everything below is built from those guesses (dashed) and the graph did not learn from them.
        </div>
      )}
      {analysis.context && (
        <div className="card" style={{ marginBottom: 12, padding: '10px 16px', fontSize: 12.5, color: '#27272a' }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>The text stated little downstream, so context was added (dashed)</div>
          <div style={{ color: '#52525b', marginBottom: 4 }}>{analysis.context.reason}</div>
          {analysis.context.drivers.length > 0 && (
            <ul style={{ margin: '4px 0 0 16px', color: '#27272a' }}>
              {analysis.context.drivers.slice(0, 5).map((d) => (
                <li key={d.node}>
                  {d.label} {d.required_direction > 0 ? '↑' : '↓'} could explain the move in {d.target_label} ({d.hops} hop{d.hops === 1 ? '' : 's'}, score {d.score.toFixed(2)})
                </li>
              ))}
            </ul>
          )}
          {analysis.context.peers.length > 0 && (
            <div style={{ marginTop: 4, color: '#52525b' }}>
              Sector context: {analysis.context.peers.map((p) => (p.kind === 'composition' ? `${p.sector_label} (part of the index)` : `${p.sector_label}: peers ${p.members.join(', ') || 'none'}`)).join(' · ')}
            </div>
          )}
        </div>
      )}

      {/* Main Graph Explorer Split Layout */}
      <div className="graph-explorer-container">
        {/* Left: Interactive Canvas */}
        <InteractiveGraph
          data={currentGraphData}
          selectedNode={selectedNode}
          onSelectNode={(node) => {
            setSelectedNode(node);
            setActiveTab('details');
          }}
          selectedEdge={selectedEdge}
          onSelectEdge={handleSelectEdge}
        />

        {/* Right Panel: Pathways & Details */}
        <aside className="graph-side-panel">
          {/* Tabs */}
          <div className="panel-tabs">
            <button
              className={`panel-tab ${activeTab === 'pathways' ? 'active' : ''}`}
              onClick={() => setActiveTab('pathways')}
            >
              Pathways
            </button>
            <button
              className={`panel-tab ${activeTab === 'details' ? 'active' : ''}`}
              onClick={() => setActiveTab('details')}
            >
              Node Details
            </button>
            <button
              className={`panel-tab ${activeTab === 'edge' ? 'active' : ''}`}
              onClick={() => setActiveTab('edge')}
              style={{ position: 'relative' }}
            >
              <span>Edge Sensitivity</span>
              {selectedEdge && (
                <span style={{
                  display: 'inline-block',
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#2563eb',
                  marginLeft: 5,
                }} />
              )}
            </button>
          </div>

          {/* Panel Body */}
          <div className="panel-body">
            {activeTab === 'pathways' ? (
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#09090b', marginBottom: 12 }}>
                  Top Propagation Paths
                </div>

                {graphData.pathways.map((p) => (
                  <div
                    key={p.id}
                    className="pathway-card"
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      const target = graphData.nodes.find((n) => n.id === p.endId);
                      if (target) {
                        setSelectedNode(target);
                        setActiveTab('details');
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                      <span className="pathway-num">{p.id}</span>
                      <div className="pathway-chain">{p.path}</div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                      <span className="pathway-score">
                        Impact Score: <strong style={{ color: '#09090b' }}>{p.score}</strong>
                      </span>
                      <span className="badge badge-subtle">{p.impact}</span>
                    </div>
                  </div>
                ))}

                <div className="stitched-divider"></div>

                <div style={{ fontSize: 12, color: '#71717a', lineHeight: 1.5 }}>
                  <strong>Propagation Engine:</strong> Multi-path graph scoring with depth attenuation and per-hop causal decay.
                </div>
              </div>
            ) : activeTab === 'edge' ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#09090b', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Sliders size={15} color="#2563eb" />
                    <span>Edge Weight Sensitivity</span>
                  </div>
                  {selectedEdge && (
                    <span style={{ fontSize: 11, background: '#f4f4f5', padding: '2px 6px', borderRadius: 4, fontFamily: 'var(--font-mono)' }}>
                      Interactive
                    </span>
                  )}
                </div>

                {!selectedEdge ? (
                  <div style={{ textAlign: 'center', padding: '28px 12px', background: '#fafafa', borderRadius: 8, border: '1px dashed #d4d4d8' }}>
                    <Sliders size={26} style={{ margin: '0 auto 8px auto', color: '#a1a1aa' }} />
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#18181b', marginBottom: 4 }}>
                      No Edge Selected
                    </div>
                    <p style={{ fontSize: 12, color: '#71717a', lineHeight: 1.5, margin: 0 }}>
                      Click on any transmission line connecting two nodes in the graph canvas to inspect and adjust its causal weight slider.
                    </p>
                  </div>
                ) : (
                  <div>
                    {/* Source -> Target Card */}
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                        Causal Link
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 700, color: '#0f172a' }}>
                        <span>{selectedEdge.from?.replace(/_/g, ' ').toUpperCase()}</span>
                        <ArrowRight size={14} color="#64748b" />
                        <span>{selectedEdge.to?.replace(/_/g, ' ').toUpperCase()}</span>
                      </div>
                      {selectedEdge.mechanism && (
                        <div style={{ fontSize: 11.5, color: '#475569', marginTop: 6, lineHeight: 1.4, borderTop: '1px solid #e2e8f0', paddingTop: 6 }}>
                          {selectedEdge.mechanism}
                        </div>
                      )}
                    </div>

                    {/* Weight Adjustment Slider */}
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#18181b' }}>Transmission Weight (w):</span>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 13,
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 4,
                            background: edgeWeight >= 0 ? '#f0fdf4' : '#fef2f2',
                            color: edgeWeight >= 0 ? '#166534' : '#991b1b',
                            border: `1px solid ${edgeWeight >= 0 ? '#bbf7d0' : '#fecaca'}`,
                          }}
                        >
                          {edgeWeight >= 0 ? `+${Number(edgeWeight).toFixed(2)}` : Number(edgeWeight).toFixed(2)}
                        </span>
                      </div>

                      <input
                        type="range"
                        min="-0.99"
                        max="0.99"
                        step="0.05"
                        value={edgeWeight != null ? edgeWeight : 0}
                        onChange={(e) => {
                          setEdgeWeight(parseFloat(e.target.value));
                          setEdgeSuccessMsg(null);
                        }}
                        style={{ width: '100%', cursor: 'pointer', accentColor: '#18181b' }}
                      />

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#a1a1aa', marginTop: 2 }}>
                        <span>-0.99 (Inverse)</span>
                        <span>0.00 (Neutral)</span>
                        <span>+0.99 (Direct)</span>
                      </div>
                    </div>

                    {/* Quick Presets */}
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#71717a', marginBottom: 6 }}>
                        Quick Presets:
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {[
                          { label: 'Strong Contraction', val: -0.85 },
                          { label: 'Baseline', val: (selectedEdge.sign || -1) * (selectedEdge.strength || 0.65) },
                          { label: 'Moderate', val: -0.35 },
                          { label: 'Positive', val: 0.65 },
                        ].map((preset, idx) => (
                          <button
                            key={idx}
                            type="button"
                            className="btn btn-outline btn-sm"
                            style={{ fontSize: 11, padding: '2px 7px' }}
                            onClick={() => {
                              setEdgeWeight(Math.round(preset.val * 100) / 100);
                              setEdgeSuccessMsg(null);
                            }}
                          >
                            {preset.label} ({preset.val >= 0 ? '+' : ''}{preset.val.toFixed(2)})
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Status feedback */}
                    {edgeSuccessMsg && (
                      <div style={{ padding: '8px 10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, color: '#166534', fontSize: 11.5, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Check size={13} />
                        <span>{edgeSuccessMsg}</span>
                      </div>
                    )}
                    {edgeErrorMsg && (
                      <div style={{ padding: '8px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', fontSize: 11.5, marginBottom: 12 }}>
                        {edgeErrorMsg}
                      </div>
                    )}

                    {/* Apply Button */}
                    <button
                      type="button"
                      className="btn btn-black"
                      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12.5 }}
                      onClick={handleSaveEdge}
                      disabled={edgeUpdating}
                    >
                      <RefreshCw size={13} className={edgeUpdating ? 'spin' : ''} />
                      <span>{edgeUpdating ? 'Updating & Re-propagating…' : 'Apply & Rebalance Graph'}</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#09090b', marginBottom: 14 }}>
                  Node Details
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      background: '#18181b',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: 14,
                    }}
                  >
                    {selectedNode.label?.slice(0, 2).toUpperCase() || 'NO'}
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#09090b' }}>
                      {selectedNode.fullName || (selectedNode.label || '').split('\n')[0] || 'Selected Entity'}
                    </div>
                    <div style={{ fontSize: 12, color: '#71717a' }}>
                      {selectedNode.category || selectedNode.type || 'Macro Entity'}
                    </div>
                  </div>
                </div>

                <div className="event-detail-row">
                  <span className="detail-key">Current Change</span>
                  <span
                    className="detail-val"
                    style={{
                      color: (selectedNode.change || '').startsWith('↑') ? '#166534' : (selectedNode.change || '').startsWith('↓') ? '#991b1b' : '#52525b',
                    }}
                  >
                    {selectedNode.change || '–'}
                  </span>
                </div>

                <div className="event-detail-row">
                  <span className="detail-key">Confidence</span>
                  <span className="detail-val">{selectedNode.confidence != null ? (typeof selectedNode.confidence === 'number' ? selectedNode.confidence.toFixed(2) : selectedNode.confidence) : '–'}</span>
                </div>

                <div className="event-detail-row">
                  <span className="detail-key">Provenance</span>
                  <span className={`badge ${selectedNode.provenance && ['validated', 'observed'].includes(selectedNode.provenance.tone) ? 'badge-black' : 'badge-subtle'}`}>
                    {selectedNode.provenance ? selectedNode.provenance.label : 'Analyst prior (not data-checked)'}
                  </span>
                </div>

                <div style={{ marginTop: 20 }}>
                  <button
                    className="btn btn-outline"
                    style={{ width: '100%' }}
                    onClick={() => setShowEvidenceModal(!showEvidenceModal)}
                  >
                    <ShieldCheck size={14} />
                    <span>{showEvidenceModal ? 'Hide Evidence' : 'View Evidence'}</span>
                  </button>
                </div>

                {showEvidenceModal && (
                  <div
                    style={{
                      marginTop: 14,
                      padding: 12,
                      background: '#f8f9fa',
                      borderRadius: 8,
                      border: '1px solid #e4e4e7',
                      fontSize: 12,
                      color: '#27272a',
                      lineHeight: 1.5,
                    }}
                  >
                    <strong>Causal Evidence:</strong>
                    <p style={{ marginTop: 4 }}>
                      {selectedNode.evidence || graphData.centerNode.evidence || 'No supporting text for this node.'}
                    </p>
                    <p style={{ marginTop: 6, color: '#71717a' }}>
                      {selectedNode.observed ? 'Observed: stated in the article.' : 'Inferred by the graph; data checks need live market data (Settings).'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Feature 1: Causal Transmission Walkthrough */}
      {analysis && analysis.paths && analysis.paths.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <CausalChainWalkthrough
            paths={analysis.paths}
            eventMagnitude={analysis.details ? analysis.details.magnitude : '10%'}
            title="Step-by-Step Causal Transmission Walkthrough"
          />
        </div>
      )}
    </div>
  );
}
