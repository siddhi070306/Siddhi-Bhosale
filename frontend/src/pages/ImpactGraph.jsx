import React, { useState, useEffect } from 'react';
import { Search, ShieldCheck, Sparkles, ArrowRight, Sliders, RefreshCw, Check, RotateCcw } from 'lucide-react';
import InteractiveGraph from '../components/graph/InteractiveGraph';
import CausalChainWalkthrough from '../components/common/CausalChainWalkthrough';
import HierarchyPanel from '../components/graph/HierarchyPanel';
import NodeFacts from '../components/graph/NodeFacts';
import TierFilterBar from '../components/graph/TierFilterBar';
import { useUi } from '../context/UiContext';
import { api } from '../services/api';

const CURATED_MACRO_SAMPLES = [
  {
    id: 'oil',
    icon: '🛢️',
    title: 'Brent Crude Oil Surge (+12%)',
    summary: 'Supply disruption lifts inflation expectations; pressure on airlines, boost for energy producers.',
    text: "Brent crude jumped 12% on Monday after an attack on tankers near the Strait of Hormuz raised fears of a supply disruption. OPEC+ signalled it would keep its output cuts in place. Analysts warned that higher energy costs could lift inflation expectations and push central banks to keep interest rates higher for longer. Airline stocks fell sharply, with Delta Air Lines among the biggest decliners, while ExxonMobil and ONGC gained. The rupee weakened as India's import bill is expected to widen.",
  },
  {
    id: 'fed',
    icon: '🏛️',
    title: 'Fed Hikes Rates 50 bps',
    summary: 'Hawkish rate decision boosts 10Y US Treasury yields & US Dollar; real estate contracts.',
    text: "The Federal Reserve raised interest rates by 50 basis points on Wednesday, more than markets had expected. The dollar index jumped 1.2% and 10-year yields rose as investors priced in a longer period of tight policy. Real estate stocks fell, while analysts said banks could benefit from wider lending margins.",
  },
  {
    id: 'gas',
    icon: '⚡',
    title: 'Natural Gas Spike (+18%)',
    summary: 'Severe cold weather drives feedstock cost surge for utilities and industrial chemical makers.',
    text: "Natural gas surged 18% after cold weather and supply outages. Chemical makers warned that higher feedstock costs could squeeze margins, and utilities were expected to pass on part of the increase to customers.",
  },
  {
    id: 'gold',
    icon: '🥇',
    title: 'Gold Safe-Haven Flight (+3.4%)',
    summary: 'Geopolitical flight to safety lifts bullion; equity indices slip and Treasury yields decline.',
    text: "Gold rallied 3.4% as military conflict in the Middle East escalated and investors fled to safe havens. US stocks slipped while Treasury yields fell. Analysts warned that a prolonged conflict could push oil higher and revive inflation fears.",
  },
];

function EmptyState({ onNavigateToChat, onSelectEvent }) {
  const [inputText, setInputText] = useState('');

  return (
    <div className="card" style={{ padding: '36px 28px', maxWidth: 860, margin: '24px auto', textAlign: 'center' }}>
      <div style={{ display: 'inline-flex', padding: 10, borderRadius: 12, background: 'rgba(99, 102, 241, 0.1)', color: '#4f46e5', marginBottom: 14 }}>
        <Sparkles size={24} />
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#09090b', marginBottom: 8, letterSpacing: '-0.02em' }}>
        Interactive Financial Impact Graph
      </div>
      <p style={{ fontSize: 14, color: '#71717a', maxWidth: 580, margin: '0 auto 24px', lineHeight: 1.55 }}>
        Enter any financial headline below to instantly generate the 5-column causal dependency graph:
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
  const [resettingGraph, setResettingGraph] = useState(false);
  const [resetSuccessMsg, setResetSuccessMsg] = useState(null);
  const { search: searchQuery, setSearch: setSearchQuery } = useUi(); // shared with the header search box
  const [showEvidenceModal, setShowEvidenceModal] = useState(false);
  const [nodeProps, setNodeProps] = useState(null);
  const [nodePropsError, setNodePropsError] = useState(null);
  const [hiddenTiers, setHiddenTiers] = useState({});
  const [foldMembers, setFoldMembers] = useState(false);

  // what the graph knows about the selected node, from the backend (tier-specific properties)
  const selectedNodeId = selectedNode ? selectedNode.id : null;
  useEffect(() => {
    setNodeProps(null);
    setNodePropsError(null);
    if (!selectedNodeId) return undefined;
    let off = false;
    api.getNode(selectedNodeId).then((p) => !off && setNodeProps(p)).catch((e) => !off && setNodePropsError(e.message));
    return () => {
      off = true;
    };
  }, [selectedNodeId]);

  const handleSelectEdge = (edge) => {
    setSelectedEdge(edge);
    const base = typeof edge.baseStrength === 'number' ? edge.baseStrength : edge.strength;
    const w = (edge.sign || 1) * base;
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

  const handleResetGraphToDefaults = async () => {
    setResettingGraph(true);
    setEdgeSuccessMsg(null);
    setEdgeErrorMsg(null);
    setResetSuccessMsg(null);
    try {
      await api.revertKb('static');
      setSelectedEdge(null);
      setEdgeWeight(null);
      setResetSuccessMsg('Graph successfully reset to curated baseline defaults.');
      if (onReanalyze) {
        await onReanalyze('Restored graph to curated baseline defaults.');
      }
      setTimeout(() => setResetSuccessMsg(null), 4500);
    } catch (e) {
      setEdgeErrorMsg(`Reset failed: ${e.message}`);
    } finally {
      setResettingGraph(false);
    }
  };

  const [fallbackCustomInput, setFallbackCustomInput] = useState('');

  if (!graphData && analysis) {
    // an analysis ran but found no economic entities: show actionable macro presets and custom input
    return (
      <div className="card" style={{ padding: '32px 28px', maxWidth: 840, margin: '24px auto', borderRadius: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: '#fef3c7', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
            ⚡
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#09090b', marginBottom: 4 }}>
              No Direct Financial Entities Detected in Headline
            </div>
            <p style={{ fontSize: 13.5, color: '#52525b', lineHeight: 1.5, margin: 0 }}>
              The analysed text appears to be a general personal opinion or lifestyle article. The Knowledge Graph tracks specific economic drivers (commodities, central banks, interest rates, industry sectors, or corporate tickers).
            </p>
          </div>
        </div>

        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px', marginBottom: 22 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
            Headline Analysed:
          </div>
          <div style={{ fontSize: 13.5, color: '#1e293b', fontStyle: 'italic', marginBottom: 4 }}>
            "{analysis.text?.length > 160 ? analysis.text.slice(0, 160) + '…' : analysis.text}"
          </div>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            {analysis.emptyReason || 'No market driver or financial instrument found in the text.'}
            {analysis.input?.note ? ` (${analysis.input.note})` : ''}
          </div>
        </div>

        {/* 1-Click Curated Macro Scenarios */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#18181b', marginBottom: 12 }}>
            Select a High-Impact Macro Shock to View the Full Causal Graph:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 10 }}>
            {CURATED_MACRO_SAMPLES.map((sample) => (
              <button
                key={sample.id}
                onClick={() => onSelectEvent && onSelectEvent(sample.text, 'sample', null, sample.title)}
                style={{
                  textAlign: 'left',
                  padding: '14px 16px',
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#6366f1';
                  e.currentTarget.style.background = '#f5f3ff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e2e8f0';
                  e.currentTarget.style.background = '#ffffff';
                }}
              >
                <span style={{ fontSize: 24, lineHeight: 1 }}>{sample.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#09090b', marginBottom: 3 }}>{sample.title}</div>
                  <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.45 }}>{sample.summary}</div>
                </div>
                <ArrowRight size={16} style={{ color: '#6366f1', marginTop: 4, flexShrink: 0 }} />
              </button>
            ))}
          </div>
        </div>

        {/* Direct Custom Input & Navigation */}
        <div style={{ paddingTop: 18, borderTop: '1px solid #f1f5f9', display: 'flex', gap: 10 }}>
          <input
            type="text"
            className="header-search-input"
            style={{ flex: 1, padding: '10px 14px', fontSize: 13, borderRadius: 8, border: '1px solid #cbd5e1' }}
            placeholder="Or type a financial event (e.g. Brent crude jumped 12%, Fed raises rates 50 bps...)"
            value={fallbackCustomInput}
            onChange={(e) => setFallbackCustomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && fallbackCustomInput.trim() && onSelectEvent) {
                onSelectEvent(fallbackCustomInput.trim());
              }
            }}
          />
          <button
            className="btn btn-black"
            style={{ fontSize: 13, padding: '10px 18px', whiteSpace: 'nowrap' }}
            disabled={!fallbackCustomInput.trim()}
            onClick={() => onSelectEvent && onSelectEvent(fallbackCustomInput.trim())}
          >
            Analyse Event
          </button>
          {onNavigateToChat && (
            <button className="btn btn-outline" style={{ fontSize: 13, padding: '10px 16px', whiteSpace: 'nowrap' }} onClick={onNavigateToChat}>
              Back to AI Chat
            </button>
          )}
        </div>
      </div>
    );
  }
  if (!graphData) return <EmptyState onNavigateToChat={onNavigateToChat} onSelectEvent={onSelectEvent} />;

  const filteredNodes = searchQuery
    ? graphData.nodes.filter((n) =>
      n.label.toLowerCase().includes(searchQuery.toLowerCase())
    )
    : graphData.nodes;

  // tier view: hide whole tiers, or fold each sector's members into it. A view only: nothing in the graph changes.
  const tierCounts = {};
  graphData.nodes.forEach((n) => {
    tierCounts[n.layer] = (tierCounts[n.layer] || 0) + 1;
  });
  let shownNodes = filteredNodes.filter((n) => !hiddenTiers[n.layer]);
  if (foldMembers) {
    const present = new Set(shownNodes.map((n) => n.id));
    const folded = {};
    shownNodes = shownNodes.filter((n) => {
      if (n.layer === 'asset' && n.parent && present.has(n.parent.id)) {
        folded[n.parent.id] = (folded[n.parent.id] || 0) + 1;
        return false;
      }
      return true;
    });
    shownNodes = shownNodes.map((n) => (folded[n.id] ? { ...n, label: `${n.label} (+${folded[n.id]})` } : n));
  }
  const shownIds = new Set(shownNodes.map((n) => n.id));
  const currentGraphData = {
    ...graphData,
    nodes: shownNodes,
    edges: (graphData.edges || []).filter((e) => shownIds.has(e.from) && shownIds.has(e.to)),
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

        {/* Header Actions: Reset to Defaults + Node Search Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-outline"
            style={{
              fontSize: 12.5,
              padding: '7px 13px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: '#ffffff',
              borderColor: '#e4e4e7',
              color: '#3f3f46',
              fontWeight: 500,
              borderRadius: 8,
              cursor: resettingGraph ? 'not-allowed' : 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            }}
            onClick={handleResetGraphToDefaults}
            disabled={resettingGraph}
            title="Revert all edge weight adjustments, demo edits, and dynamic nodes back to curated baseline"
          >
            <RotateCcw size={13} className={resettingGraph ? 'spin' : ''} />
            <span>{resettingGraph ? 'Resetting…' : 'Reset Graph to Defaults'}</span>
          </button>

          {/* Node search filter */}
          <div style={{ position: 'relative', width: 280 }}>
            <Search
              size={14}
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#71717a' }}
            />
            <input
              type="text"
              className="header-search-input"
              placeholder="Search nodes (companies, sectors...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Reset success feedback */}
      {resetSuccessMsg && (
        <div
          className="card"
          style={{
            padding: '10px 16px',
            marginBottom: 12,
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            color: '#166534',
            fontSize: 12.5,
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <Check size={14} />
          <span>{resetSuccessMsg}</span>
        </div>
      )}

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

      <TierFilterBar
        hidden={hiddenTiers}
        onToggle={(t) => setHiddenTiers((h) => ({ ...h, [t]: !h[t] }))}
        fold={foldMembers}
        onFold={() => setFoldMembers((f) => !f)}
        counts={tierCounts}
      />

      {/* Main Graph Explorer Split Layout */}
      <div className="graph-explorer-container">
        {/* Left: Interactive Canvas with On-Canvas Floating Sensitivity Drawer */}
        <div style={{ position: 'relative', width: '100%', height: '100%', minWidth: 0 }}>
          <InteractiveGraph
            data={currentGraphData}
            selectedNode={selectedNode}
            onSelectNode={(node) => {
              setSelectedNode(node);
              setActiveTab('details');
            }}
            selectedEdge={selectedEdge}
            onSelectEdge={handleSelectEdge}
            onResetDefaults={handleResetGraphToDefaults}
            isResetting={resettingGraph}
          />

          {/* Floating On-Canvas Live Edge Sensitivity Drawer */}
          {selectedEdge && (
            <div
              className="on-canvas-edge-drawer"
              style={{
                position: 'absolute',
                bottom: 20,
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(255, 255, 255, 0.94)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: '1px solid #bfdbfe',
                borderRadius: 12,
                boxShadow: '0 10px 30px rgba(0, 0, 0, 0.12)',
                padding: '10px 16px',
                zIndex: 35,
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                maxWidth: '92%',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 140 }}>
                <Sliders size={15} color="#2563eb" />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
                  {selectedEdge.from?.replace(/_/g, ' ').toUpperCase()} → {selectedEdge.to?.replace(/_/g, ' ').toUpperCase()}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 200, flex: 1 }}>
                <input
                  type="range"
                  min="-1"
                  max="1"
                  step="0.05"
                  value={edgeWeight != null ? edgeWeight : 0}
                  onChange={(e) => {
                    setEdgeWeight(parseFloat(e.target.value));
                    setEdgeSuccessMsg(null);
                  }}
                  style={{ flex: 1, accentColor: '#2563eb', cursor: 'pointer' }}
                />
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 12,
                    fontWeight: 700,
                    padding: '2px 7px',
                    borderRadius: 4,
                    background: edgeWeight >= 0 ? '#f0fdf4' : '#fef2f2',
                    color: edgeWeight >= 0 ? '#166534' : '#991b1b',
                    border: `1px solid ${edgeWeight >= 0 ? '#bbf7d0' : '#fecaca'}`,
                    minWidth: 44,
                    textAlign: 'center',
                  }}
                >
                  {edgeWeight >= 0 ? `+${Number(edgeWeight).toFixed(2)}` : Number(edgeWeight).toFixed(2)}
                </span>
              </div>

              <button
                type="button"
                className="btn btn-black btn-sm"
                onClick={handleSaveEdge}
                disabled={edgeUpdating || resettingGraph}
                style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', whiteSpace: 'nowrap' }}
              >
                <RefreshCw size={12} className={edgeUpdating ? 'spin' : ''} />
                <span>{edgeUpdating ? 'Rebalancing…' : 'Rebalance Graph'}</span>
              </button>

              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={handleResetGraphToDefaults}
                disabled={edgeUpdating || resettingGraph}
                title="Revert all transmission weights, demo edits, and dynamic nodes back to curated baseline"
                style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', whiteSpace: 'nowrap', background: '#fff' }}
              >
                <RotateCcw size={12} className={resettingGraph ? 'spin' : ''} />
                <span>Reset All</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedEdge(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '2px 6px', fontSize: 14 }}
                title="Close"
              >
                ✕
              </button>
            </div>
          )}
        </div>

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
            <button
              className={`panel-tab ${activeTab === 'hierarchy' ? 'active' : ''}`}
              onClick={() => setActiveTab('hierarchy')}
            >
              Hierarchy
            </button>
          </div>

          {/* Panel Body */}
          <div className="panel-body">
            {activeTab === 'pathways' ? (
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#09090b', marginBottom: 12 }}>
                  Top Propagation Paths
                </div>

                {graphData.pathways.map((p) => {
                  const chainSteps = p.path ? p.path.split(/\s*->\s*|\s*→\s*/) : [];
                  return (
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
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <span className="pathway-num">{p.id}</span>
                        <div className="pathway-chain" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                          {chainSteps.map((step, sIdx) => (
                            <React.Fragment key={sIdx}>
                              <span className="pathway-step-pill">{step}</span>
                              {sIdx < chainSteps.length - 1 && (
                                <span className="pathway-step-arrow">
                                  <ArrowRight size={11} />
                                </span>
                              )}
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                        <span className="pathway-score">
                          Impact Score: <strong style={{ color: '#09090b' }}>{p.score}</strong>
                        </span>
                        <span className="badge badge-subtle">{p.impact}</span>
                      </div>
                    </div>
                  );
                })}

                <div className="stitched-divider"></div>

                <div style={{ fontSize: 12, color: '#71717a', lineHeight: 1.5 }}>
                  <strong>Propagation Engine:</strong> Multi-path graph scoring with depth attenuation and per-hop causal decay.
                </div>
              </div>
            ) : activeTab === 'hierarchy' ? (
              <HierarchyPanel
                hierarchy={analysis && analysis.raw ? analysis.raw.hierarchy : null}
                onSelectNode={(id) => {
                  const n = (graphData.nodes || []).find((x) => x.id === id);
                  if (n) {
                    setSelectedNode(n);
                    setActiveTab('details');
                  }
                }}
              />
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
                      {/* Dynamic Rolling Transmission Lag & Volatility Regime */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTop: '1px solid #e2e8f0', fontSize: 11 }}>
                        <div>
                          <span style={{ color: '#64748b' }}>Dynamic Lag: </span>
                          <strong style={{ color: '#0f172a' }}>~{selectedEdge.lag || 0} day{selectedEdge.lag === 1 ? '' : 's'}</strong>
                          {selectedEdge.baseLag != null && selectedEdge.baseLag !== selectedEdge.lag && (
                            <span style={{ color: '#94a3b8', marginLeft: 4 }}>(prior: {selectedEdge.baseLag}d)</span>
                          )}
                        </div>
                        {selectedEdge.volRegime && (
                          <div style={{
                            padding: '2px 7px',
                            borderRadius: 4,
                            background: selectedEdge.volRegime === 'high_volatility' ? '#fef2f2' : selectedEdge.volRegime === 'elevated' ? '#fffbeb' : '#f0fdf4',
                            color: selectedEdge.volRegime === 'high_volatility' ? '#991b1b' : selectedEdge.volRegime === 'elevated' ? '#92400e' : '#166534',
                            border: `1px solid ${selectedEdge.volRegime === 'high_volatility' ? '#fecaca' : selectedEdge.volRegime === 'elevated' ? '#fde68a' : '#bbf7d0'}`,
                            fontSize: 10.5,
                            fontWeight: 600,
                            textTransform: 'capitalize',
                          }}>
                            {selectedEdge.volRegime.replace(/_/g, ' ')}
                          </div>
                        )}
                      </div>
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
                        min="-1"
                        max="1"
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
                        {(() => {
                          const base = (selectedEdge.sign || 1) * (typeof selectedEdge.baseStrength === 'number' ? selectedEdge.baseStrength : selectedEdge.strength);
                          const cap = (v) => Math.max(-0.99, Math.min(0.99, v));
                          return [
                            { label: 'Stored', val: base },
                            { label: 'Weaker (×0.5)', val: base * 0.5 },
                            { label: 'Stronger (×1.5)', val: cap(base * 1.5) },
                            { label: 'Reverse sign', val: -base },
                          ];
                        })().map((preset, idx) => (
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

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        className="btn btn-black"
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12.5 }}
                        onClick={handleSaveEdge}
                        disabled={edgeUpdating || resettingGraph}
                      >
                        <RefreshCw size={13} className={edgeUpdating ? 'spin' : ''} />
                        <span>{edgeUpdating ? 'Updating…' : 'Apply & Rebalance Graph'}</span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, padding: '0 12px', whiteSpace: 'nowrap' }}
                        onClick={handleResetGraphToDefaults}
                        disabled={edgeUpdating || resettingGraph}
                        title="Revert all transmission weights, demo edits, and dynamic nodes back to curated baseline"
                      >
                        <RotateCcw size={13} className={resettingGraph ? 'spin' : ''} />
                        <span>Reset All</span>
                      </button>
                    </div>
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
                  <span className="detail-key">Tier</span>
                  <span className="detail-val">{selectedNode.layerName ? `${selectedNode.layerLevel} · ${selectedNode.layerName}` : '–'}</span>
                </div>
                {selectedNode.parent && (
                  <div className="event-detail-row">
                    <span className="detail-key">Member of</span>
                    <span className="detail-val">{selectedNode.parent.label}</span>
                  </div>
                )}

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

                <NodeFacts props={nodeProps} error={nodePropsError} />

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
      {analysis && analysis.raw && analysis.raw.paths && analysis.raw.paths.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <CausalChainWalkthrough
            paths={analysis.raw.paths}
            title="Step-by-Step Causal Transmission Walkthrough"
          />
        </div>
      )}
    </div>
  );
}
