import React, { useState, useEffect } from 'react';
import { Database, Key, Server, RefreshCw, Check } from 'lucide-react';
import { api, prefs } from '../services/api';

export default function Settings() {
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState(null);
  const [resetMsg, setResetMsg] = useState(null);
  const [liveData, setLiveDataState] = useState(prefs.getLive());
  const setLiveData = (v) => {
    setLiveDataState(v);
    prefs.setLive(v);
  };
  const [isResetting, setIsResetting] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    api.getStatus().then((data) => setStatus(data)).catch((e) => setStatusError(e.message));
  }, []);

  const handleResetGraph = async () => {
    setIsResetting(true);
    try {
      const r = await api.resetGraph();
      setResetMsg(`Graph reset: ${r.graph.nodes} entities, ${r.graph.edges} links, ${r.graph.articles_ingested} articles learned.`);
      api.getStatus().then(setStatus).catch(() => {});
    } catch (e) {
      setResetMsg(`Reset failed: ${e.message}`);
    }
    setIsResetting(false);
  };

  const handleSave = () => {
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
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
                  Calculate rolling 2-year cross-correlation with Yahoo Finance and FRED series.
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

        {/* Maintenance & Reset */}
        <div className="card">
          <div className="card-title">
            <span>Graph Maintenance</span>
          </div>

          <p style={{ fontSize: 13, color: '#52525b', marginBottom: 16 }}>
            Resetting clears dynamically inferred entities and evidence gathered from parsed articles, restoring analyst baseline priors.
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

            <button className="btn btn-black" onClick={handleSave}>
              {savedSuccess ? (
                <>
                  <Check size={14} />
                  <span>Saved!</span>
                </>
              ) : (
                <span>Save Preferences</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
