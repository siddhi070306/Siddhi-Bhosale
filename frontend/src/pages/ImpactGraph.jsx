import React, { useState } from 'react';
import { Search, ShieldCheck, Fuel, Landmark, Building2, Sparkles, ArrowRight } from 'lucide-react';
import InteractiveGraph from '../components/graph/InteractiveGraph';
import { useUi } from '../context/UiContext';
import { useSamples } from '../context/useSamples';

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

export default function ImpactGraph({ analysis, onNavigateToChat, onSelectEvent, onNavigateToTab }) {
  const graphData = (analysis && analysis.graphView) || null;
  const [activeTab, setActiveTab] = useState('pathways');
  const [selectedNode, setSelectedNode] = useState(graphData ? graphData.centerNode : null);
  const { search: searchQuery, setSearch: setSearchQuery } = useUi(); // shared with the header search box
  const [showEvidenceModal, setShowEvidenceModal] = useState(false);

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
              Details
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
    </div>
  );
}
