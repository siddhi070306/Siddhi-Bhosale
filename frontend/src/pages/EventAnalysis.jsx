import React, { useState } from 'react';
import {
  ExternalLink,
  ArrowRight,
  MessageSquare,
  Building,
  Box,
  PieChart,
  Activity,
  DollarSign,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  AlertTriangle,
  FileText,
} from 'lucide-react';
import { useUi } from '../context/UiContext';
import CausalChainWalkthrough from '../components/common/CausalChainWalkthrough';
import ExecutiveMemoModal from '../components/common/ExecutiveMemoModal';


function EmptyState({ onNavigateToChat, what }) {
  return (
    <div className="card" style={{ padding: 28, textAlign: 'center' }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#09090b', marginBottom: 6 }}>No analysis yet</div>
      <p style={{ fontSize: 13, color: '#71717a', marginBottom: 14 }}>{what} is built from a real analysis. Paste a news event in the AI Chat first.</p>
      {onNavigateToChat && <button className="btn btn-black" onClick={onNavigateToChat}>Open AI Chat</button>}
    </div>
  );
}

export default function EventAnalysis({
  analysisData = null,
  eventText,
  analysis = null,
  onNavigateToChat,
  onNavigateToGraph,
  onNavigateToTab,
}) {
  const { search } = useUi();
  const [showMemoModal, setShowMemoModal] = useState(false);

  if (!analysisData) return <EmptyState onNavigateToChat={onNavigateToChat} what="Event analysis" />;
  const text = eventText || analysisData.eventText;
  const entities = analysisData.extractedEntities;
  const details = analysisData.details;
  const evidence = analysisData.evidence;

  // Model vs article: the backend compares each stated move with what the graph predicts
  const comparisonChecks = analysisData.comparison || [];
  const consistentCount = comparisonChecks.filter((c) => c.status === 'consistent').length;
  const conflicts = comparisonChecks.filter((c) => c.status === 'contradicts' || c.status === 'inconsistent' || (c.graph && c.graph.toLowerCase().includes('disagree')));
  const q = (search || '').trim().toLowerCase();
  const shown = (list) => (list || []).filter((c) => !q || c.toLowerCase().includes(q));

  return (
    <div>
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 className="page-title">Event Analysis & Diagnostics</h1>
          <p className="page-subtitle">
            Diagnostic inspection of the event analyzed in the AI Chat Assistant.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className="btn btn-black"
            onClick={() => setShowMemoModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <FileText size={14} />
            <span>Export Investment Memo</span>
          </button>

          <button
            className="btn btn-outline"
            onClick={() => onNavigateToChat && onNavigateToChat()}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <MessageSquare size={14} />
            <span>AI Chat</span>
          </button>
        </div>
      </div>

      {/* Active Event Banner (No separate input / No separate analyze button) */}
      <div
        className="card"
        style={{
          marginBottom: 24,
          backgroundColor: '#fafafa',
          borderLeft: '4px solid #18181b',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={15} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#09090b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Active Analyzed Event
            </span>
          </div>
          <span className="badge badge-black">Analysis Complete</span>
        </div>
        <p style={{ fontSize: 14.5, color: '#18181b', lineHeight: 1.6, fontStyle: 'italic' }}>
          "{text}"
        </p>
      </div>

      {/* Feature 2: High-Visibility Consensus Divergence Alert */}
      {conflicts.length > 0 && (
        <div
          className="card"
          style={{
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderLeft: '5px solid #d97706',
            padding: '16px 20px',
            marginBottom: 20,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#92400e', fontWeight: 700, fontSize: 14 }}>
            <AlertTriangle size={18} />
            <span>Consensus Divergence Detected ({conflicts.length} Conflict{conflicts.length > 1 ? 's' : ''})</span>
          </div>
          <p style={{ fontSize: 13, color: '#78350f', marginTop: 6, marginBottom: 8, lineHeight: 1.5 }}>
            The source article narrative claims sentiment for <strong>{conflicts[0].statement}</strong>, but the structural economic knowledge graph calculates opposing margin transmission (<strong>{conflicts[0].graph}</strong>).
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
            {conflicts.map((c, i) => (
              <span key={i} style={{ background: '#fef3c7', padding: '3px 8px', borderRadius: 4, color: '#b45309', border: '1px solid #fcd34d' }}>
                Article: <em>{c.article}</em> vs Graph: <strong>{c.graph}</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Three-Column Analysis Cards */}
      <div className="event-analysis-grid">
        {/* Card 1: Extracted Entities */}
        <div className="card">
          <div className="card-title">
            <span>Extracted Entities</span>
          </div>

          <div className="entity-group">
            <div className="entity-group-title">
              <Building size={13} />
              <span>Companies</span>
            </div>
            <div className="entity-tags">
              {shown(entities.companies).map((c) => (
                <span key={c} className="entity-tag">{c}</span>
              ))}
            </div>
          </div>

          <div className="entity-group">
            <div className="entity-group-title">
              <Box size={13} />
              <span>Commodities</span>
            </div>
            <div className="entity-tags">
              {shown(entities.commodities).map((c) => (
                <span key={c} className="entity-tag">{c}</span>
              ))}
            </div>
          </div>

          <div className="entity-group">
            <div className="entity-group-title">
              <PieChart size={13} />
              <span>Sectors</span>
            </div>
            <div className="entity-tags">
              {shown(entities.sectors).map((c) => (
                <span key={c} className="entity-tag">{c}</span>
              ))}
            </div>
          </div>

          <div className="entity-group">
            <div className="entity-group-title">
              <Activity size={13} />
              <span>Indicators</span>
            </div>
            <div className="entity-tags">
              {shown(entities.indicators).map((c) => (
                <span key={c} className="entity-tag">{c}</span>
              ))}
            </div>
          </div>

          <div className="entity-group">
            <div className="entity-group-title">
              <DollarSign size={13} />
              <span>Instruments</span>
            </div>
            <div className="entity-tags">
              {shown(entities.instruments).map((c) => (
                <span key={c} className="entity-tag">{c}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Card 2: Event Details */}
        <div className="card">
          <div className="card-title">
            <span>Event Details</span>
          </div>

          <div className="event-detail-row">
            <span className="detail-key">Event Type</span>
            <span className="detail-val">{details.eventType}</span>
          </div>

          <div className="event-detail-row">
            <span className="detail-key">Direction</span>
            <span className="detail-val">{details.direction}</span>
          </div>

          <div className="event-detail-row">
            <span className="detail-key">Magnitude</span>
            <span className="detail-val">{details.magnitude}</span>
          </div>

          <div className="event-detail-row">
            <span className="detail-key">Timeframe</span>
            <span className="detail-val">{details.timeframe}</span>
          </div>

          <div className="event-detail-row">
            <span className="detail-key">Source</span>
            <span className="detail-val">{details.source}</span>
          </div>

          <div style={{ marginTop: 20 }}>
            <span className="detail-key" style={{ display: 'block', marginBottom: 8 }}>
              Key Sentiment
            </span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(details.sentiment || []).map((s, idx) => (
                <span
                  key={idx}
                  className={`badge ${s.type === 'bullish' ? 'badge-positive' : s.type === 'bearish' ? 'badge-negative' : 'badge-subtle'}`}
                >
                  {s.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Card 3: Source Evidence & Related News */}
        <div className="card">
          <div className="card-title">
            <span>Source Evidence</span>
          </div>

          <div className="source-quote-box">
            "{evidence.quote || text}"
            <span className="source-attribution">— {evidence.source}</span>
          </div>

          {details.link ? (
            <a className="btn btn-outline" style={{ width: '100%', marginBottom: 18, textDecoration: 'none', justifyContent: 'center' }} href={details.link} target="_blank" rel="noopener noreferrer">
              <span>View Full Article ({details.source})</span>
              <ExternalLink size={13} />
            </a>
          ) : (
            <div style={{ fontSize: 11.5, color: '#71717a', marginBottom: 18 }}>Pasted text: no article link. Pick a headline in Market Intelligence to link the original.</div>
          )}

          <div className="stitched-divider"></div>

          <div style={{ fontSize: 13, fontWeight: 600, color: '#18181b', marginTop: 12 }}>
            Other events found in this text
          </div>
          {(evidence.related || []).length === 0 && <p style={{ fontSize: 12, color: '#71717a', marginTop: 8 }}>No other events were extracted.</p>}

          <div className="related-news-list">
            {(evidence.related || []).map((news, idx) => (
              <div key={idx} className="related-news-item">
                <span style={{ fontWeight: 500, color: '#09090b' }}>{news.title}</span>
                <span style={{ color: '#71717a', fontSize: 11.5 }}>{news.date}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Card 4: Model vs Article Checks (matching checks() in public/index.html) */}
      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-title">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={16} color="#18181b" />
            <span>Model vs Article Checks & Provenance</span>
          </div>
          {comparisonChecks.length > 0 && (
            <span className={`badge ${consistentCount === comparisonChecks.length ? 'badge-positive' : 'badge-subtle'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <CheckCircle2 size={12} />
              <span>{consistentCount} of {comparisonChecks.length} agree with the graph</span>
            </span>
          )}
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Entity / Statement</th>
              <th>Article Status</th>
              <th>Graph Model Verdict</th>
            </tr>
          </thead>
          <tbody>
            {comparisonChecks.length === 0 && (
              <tr><td colSpan={3} style={{ color: '#71717a' }}>No stated moves in this text to compare with the graph.</td></tr>
            )}
            {comparisonChecks.map((chk, idx) => (
              <tr key={idx}>
                <td style={{ fontWeight: 600 }}>{chk.statement}</td>
                <td>
                  <span className="badge badge-black">{chk.article}</span>
                </td>
                <td>
                  <span className={`badge ${chk.status === 'consistent' ? 'badge-positive' : 'badge-negative'}`}>{chk.graph}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Feature 1: Deterministic Step-by-Step Causal Transmission Walkthrough */}
      {analysis && analysis.paths && analysis.paths.length > 0 && (
        <CausalChainWalkthrough
          paths={analysis.paths}
          eventMagnitude={details ? details.magnitude : '10%'}
          title="Step-by-Step Causal Transmission Walkthrough"
        />
      )}

      {/* Feature 3: Executive Memo Modal */}
      <ExecutiveMemoModal
        isOpen={showMemoModal}
        onClose={() => setShowMemoModal(false)}
        analysis={analysis || { text, summary: details?.direction, view: analysisData }}
      />

      {/* Bottom Cross-Dashboard Navigation */}
      <div style={{ marginTop: 28, paddingTop: 18, borderTop: '1px solid #e4e4e7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <button
          className="btn btn-outline"
          onClick={() => onNavigateToChat && onNavigateToChat()}
        >
          <MessageSquare size={14} />
          <span>Back to AI Chat</span>
        </button>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            className="btn btn-outline"
            onClick={() => onNavigateToTab ? onNavigateToTab('asset-impact') : null}
          >
            <span>Asset Impact & Forecasts</span>
            <ArrowRight size={14} />
          </button>

          <button
            className="btn btn-outline"
            onClick={() => onNavigateToTab ? onNavigateToTab('scenario-simulator') : null}
          >
            <span>Scenario Simulator</span>
            <ArrowRight size={14} />
          </button>

          <button
            className="btn btn-black"
            onClick={() => onNavigateToGraph ? onNavigateToGraph() : onNavigateToTab && onNavigateToTab('impact-graph')}
          >
            <span>Financial Impact Graph</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
