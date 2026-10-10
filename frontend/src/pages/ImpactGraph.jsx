import React, { useState } from 'react';
import { Search, Info, ExternalLink, ArrowRight, ShieldCheck } from 'lucide-react';
import InteractiveGraph from '../components/graph/InteractiveGraph';
import { MOCK_DATA } from '../services/api';

export default function ImpactGraph() {
  const { graphData } = MOCK_DATA;
  const [activeTab, setActiveTab] = useState('pathways');
  const [selectedNode, setSelectedNode] = useState(graphData.centerNode);
  const [searchQuery, setSearchQuery] = useState('');
  const [showEvidenceModal, setShowEvidenceModal] = useState(false);

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
                    onClick={() => {
                      // auto highlight
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
                      {selectedNode.label?.replace('\n+12%', '') || 'Selected Entity'}
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
                      color: (selectedNode.change || '+12%').startsWith('+') ? '#166534' : '#991b1b',
                    }}
                  >
                    {selectedNode.change || '+12%'}
                  </span>
                </div>

                <div className="event-detail-row">
                  <span className="detail-key">Confidence</span>
                  <span className="detail-val">{selectedNode.confidence || '0.88'}</span>
                </div>

                <div className="event-detail-row">
                  <span className="detail-key">Provenance</span>
                  <span className="badge badge-black">Observed & Validated</span>
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
                      "{graphData.centerNode.evidence}"
                    </p>
                    <p style={{ marginTop: 6, color: '#71717a' }}>
                      Correlated over 2 years of daily market series at 5-day lag.
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
