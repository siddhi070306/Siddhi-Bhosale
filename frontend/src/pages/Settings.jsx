import React, { useState, useEffect } from 'react';
import { Database, Key, Server, RefreshCw, ShieldCheck } from 'lucide-react';
import { api, prefs } from '../services/api';
import { useUi } from '../context/UiContext';

export default function Settings() {
  const { refreshStatus } = useUi(); // keeps the header pill in sync after KB changes
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState(null);
  const [resetMsg, setResetMsg] = useState(null);
  const [liveData, setLiveDataState] = useState(prefs.getLive());
  const [fullText, setFullTextState] = useState(prefs.getFullText());
  const setLiveData = (v) => {
    setLiveDataState(v);
    prefs.setLive(v);
  };
  const [isResetting, setIsResetting] = useState(false);

  const [kb, setKb] = useState(null);
  const [kbMsg, setKbMsg] = useState(null);
  const loadKb = () => api.getKb().then(setKb).catch((e) => setKbMsg(e.message));

  useEffect(() => {
    api.getStatus().then((data) => setStatus(data)).catch((e) => setStatusError(e.message));
    loadKb();
  }, []);

  const kbAction = async (fn, okText) => {
    setKbMsg(null);
    try {
      const r = await fn();
      setKb(r);
      setKbMsg(okText);
      api.getStatus().then(setStatus).catch(() => {});
      refreshStatus();
    } catch (e) {
      setKbMsg(e.message);
    }
  };

  const handleResetGraph = async () => {
    setIsResetting(true);
    try {
      const r = await api.resetGraph();
      setResetMsg(`Graph reset: ${r.graph.nodes} entities, ${r.graph.edges} links, ${r.graph.articles_ingested} articles learned.`);
      api.getStatus().then(setStatus).catch(() => {});
      loadKb();
      refreshStatus();
    } catch (e) {
      setResetMsg(`Reset failed: ${e.message}`);
    }
    setIsResetting(false);
  };

  return (
    <div style={{ maxWidth: 840 }}>
      {/* Page Header */}
      <div className="page-header">
        <h1 className="page-title">Engine & Graph Settings</h1>
        <p className="page-subtitle">
          Configure causal extraction models, market data connections, and knowledge graph parameters.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Connection Status Card */}
        <div className="card">
          <div className="card-title">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Server size={16} />
              <span>Backend Connection & Keys</span>
            </div>
            <span className={`badge ${status ? 'badge-positive' : 'badge-negative'}`}>{status ? 'Connected' : statusError ? 'Backend offline' : 'Checking…'}</span>
          </div>

          <div className="event-detail-row">
            <span className="detail-key">LLM Provider</span>
            <span className="detail-val">{status ? (status.llm ? `${status.llm} (active)` : status.llm_required ? 'NOT CONFIGURED: required, set a key in .env' : 'none (rules only)') : statusError || '…'}</span>
          </div>

          <div className="event-detail-row">
            <span className="detail-key" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Key size={13} color="#71717a" />
              <span>FRED API Key</span>
            </span>
            <span className="detail-val">
              {!status ? '…' : status.fred_key ? 'Configured (official FRED API)' : 'Not set: public CSV download'}
            </span>
          </div>

          <div className="event-detail-row">
            <span className="detail-key" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Key size={13} color="#71717a" />
              <span>NewsAPI Key</span>
            </span>
            <span className="detail-val">
              {!status ? '…' : status.news_key ? 'Configured (NewsAPI)' : 'Not set: public RSS feeds'}
            </span>
          </div>

          <div className="event-detail-row">
            <span className="detail-key">Knowledge Graph Entities</span>
            <span className="detail-val">{status ? `${status.graph.nodes} entities, ${status.graph.edges} causal links, ${status.graph.articles_ingested} articles learned` : '…'}</span>
          </div>
        </div>

        {/* Market Data & Offline Options */}
        <div className="card">
          <div className="card-title">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Database size={16} />
              <span>Data Feeds & Extraction Rules</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: '#09090b' }}>
                  Live Market Series Correlation
                </div>
                <div style={{ fontSize: 12, color: '#71717a' }}>
                  Check each link against real FRED/Yahoo series (correlation at the link's lag). Saved automatically in this browser; takes effect on the next analysis.
                </div>
              </div>
              <input
                type="checkbox"
                checked={liveData}
                onChange={(e) => setLiveData(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: '#18181b' }}
              />
            </label>

            <div className="stitched-divider"></div>

            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: '#09090b' }}>Read the full article when a headline is opened</div>
                <div style={{ fontSize: 12, color: '#71717a' }}>
                  Headlines come with only a short description, so the graph stays small. When on, the backend also reads the article body if the site's robots.txt allows it
                  (public pages only, nothing is stored; paywalled pages fall back to the description). Uses more LLM tokens per analysis.
                </div>
              </div>
              <input
                type="checkbox"
                checked={fullText}
                onChange={(e) => {
                  setFullTextState(e.target.checked);
                  prefs.setFullText(e.target.checked);
                }}
                style={{ width: 18, height: 18, accentColor: '#18181b' }}
              />
            </label>

            <div className="stitched-divider"></div>

            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: '#09090b' }}>LLM extraction</div>
              <div style={{ fontSize: 12, color: '#71717a' }}>
                {status && status.llm_required
                  ? 'Required by the backend: the LLM proposes events and links on every analysis, and the system keeps only quote-verified ones.'
                  : 'Optional on this backend.'}
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic knowledge base with safety net */}
        <div className="card">
          <div className="card-title">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={16} />
              <span>Knowledge Base: dynamic, with automatic revert</span>
            </div>
            {kb && <span className={`badge ${kb.mode === 'dynamic' ? 'badge-positive' : 'badge-subtle'}`}>{kb.mode === 'dynamic' ? `Dynamic · v${kb.version}` : 'Static (frozen)'}</span>}
          </div>
          <p style={{ fontSize: 12.5, color: '#52525b', lineHeight: 1.55, marginBottom: 12 }}>
            In dynamic mode the graph learns from every article (reinforced links, quote-verified LLM links, new entities) and from assets you add. Every change is checked
            against the curated baseline; if a check fails the change is rolled back automatically. Links that market data contradicts are dropped. Static mode freezes the graph at the curated baseline.
          </p>
          {!kb && <p style={{ fontSize: 12.5, color: '#71717a' }}>{kbMsg || 'Loading…'}</p>}
          {kb && (
            <>
              <div className="event-detail-row">
                <span className="detail-key">Size</span>
                <span className="detail-val">{kb.graph.nodes} entities, {kb.graph.edges} links, {kb.graph.articles_ingested} articles learned{kb.persisted ? ' · saved to disk' : ''}</span>
              </div>
              <div className="event-detail-row">
                <span className="detail-key">Assets you added</span>
                <span className="detail-val">{kb.runtime_assets.length ? kb.runtime_assets.map((a) => `${a.label} (${a.ticker})`).join(', ') : 'none'}</span>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '14px 0' }}>
                {kb.mode === 'dynamic' ? (
                  <button className="btn btn-outline" onClick={() => kbAction(() => api.setKbMode('static'), 'Switched to static: the graph is back at the curated baseline and frozen.')}>Freeze at static baseline</button>
                ) : (
                  <button className="btn btn-black" onClick={() => kbAction(() => api.setKbMode('dynamic'), 'Learning enabled.')}>Enable dynamic learning</button>
                )}
                <button className="btn btn-outline" disabled={!kb.can_undo} onClick={() => kbAction(() => api.revertKb('previous'), 'Undid the last change.')}>Undo last change</button>
                <button
                  className="btn btn-outline"
                  onClick={() => window.confirm('Remove everything learned and every asset you added, and return to the curated baseline?') && kbAction(() => api.revertKb('static'), 'Reverted to the static baseline.')}
                >
                  Revert to static baseline
                </button>
              </div>
              {kbMsg && <p style={{ fontSize: 12.5, color: '#27272a', marginBottom: 10 }}>{kbMsg}</p>}

              <div style={{ fontSize: 12.5, fontWeight: 600, color: '#09090b', marginBottom: 6 }}>Last health check</div>
              {!kb.last_health && <p style={{ fontSize: 12, color: '#71717a' }}>No change has been checked yet.</p>}
              {kb.last_health && (
                <ul style={{ listStyle: 'none', fontSize: 12, color: '#27272a', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
                  {kb.last_health.checks.map((c) => (
                    <li key={c.name}>
                      <span style={{ color: c.ok ? '#166534' : '#991b1b', fontWeight: 700 }}>{c.ok ? '✓' : '✗'}</span> {c.name} <span style={{ color: '#71717a' }}>({c.detail})</span>
                    </li>
                  ))}
                </ul>
              )}

              <div style={{ fontSize: 12.5, fontWeight: 600, color: '#09090b', marginBottom: 6 }}>Recent changes</div>
              <ul style={{ listStyle: 'none', fontSize: 11.5, color: '#52525b', display: 'flex', flexDirection: 'column', gap: 3 }}>
                {kb.log.slice(0, 8).map((l, i) => (
                  <li key={i}>
                    <span style={{ fontFamily: 'var(--font-mono)', color: '#a1a1aa' }}>{l.t.slice(5)}</span>{' '}
                    <strong style={{ color: l.action === 'rollback' || l.action === 'load-rejected' ? '#991b1b' : '#27272a' }}>{l.action}</strong> {l.detail}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Maintenance & Reset */}
        <div className="card">
          <div className="card-title">
            <span>Graph Maintenance</span>
          </div>

          <p style={{ fontSize: 13, color: '#52525b', marginBottom: 16 }}>
            Resetting clears everything learned from articles and every asset you added (same as "Revert to static baseline" above), restoring the curated priors.
          </p>

          {resetMsg && <p style={{ fontSize: 12.5, color: '#27272a', marginBottom: 12 }}>{resetMsg}</p>}
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              className="btn btn-outline"
              onClick={handleResetGraph}
              disabled={isResetting}
            >
              <RefreshCw size={14} className={isResetting ? 'spinning' : ''} />
              <span>{isResetting ? 'Resetting Graph...' : 'Reset Knowledge Graph'}</span>
            </button>

          </div>
        </div>
      </div>
    </div>
  );
}
