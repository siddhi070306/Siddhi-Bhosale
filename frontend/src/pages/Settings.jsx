import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Database, Key, Server, RefreshCw, Check } from 'lucide-react';
import { api } from '../services/api';

export default function Settings() {
  const [status, setStatus] = useState(null);
  const [liveData, setLiveData] = useState(true);
  const [offlineRulesOnly, setOfflineRulesOnly] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    api.getStatus().then((data) => setStatus(data));
  }, []);

  const handleResetGraph = async () => {
    setIsResetting(true);
    await api.resetGraph();
    setTimeout(() => setIsResetting(false), 600);
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
            <span className="badge badge-positive">Connected</span>
          </div>

          <div className="event-detail-row">
            <span className="detail-key">LLM Provider</span>
            <span className="detail-val">{status?.llm || 'Groq LLaMA 3.3 (Active)'}</span>
          </div>

          <div className="event-detail-row">
            <span className="detail-key">FRED API Key</span>
            <span className="detail-val">
              {status?.fred_key ? 'Configured (Live FRED Series)' : 'Public CSV Fallback'}
            </span>
          </div>

          <div className="event-detail-row">
            <span className="detail-key">NewsAPI Key</span>
            <span className="detail-val">
              {status?.news_key ? 'Configured (Live Wire)' : 'RSS Public Feeds'}
            </span>
          </div>

          <div className="event-detail-row">
            <span className="detail-key">Knowledge Graph Entities</span>
            <span className="detail-val">56 entities, 90 causal links</span>
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

            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: '#09090b' }}>
                  Deterministic Rules-Only Mode
                </div>
                <div style={{ fontSize: 12, color: '#71717a' }}>
                  Disable LLM and use strict rule-based entity extraction and priors.
                </div>
              </div>
              <input
                type="checkbox"
                checked={offlineRulesOnly}
                onChange={(e) => setOfflineRulesOnly(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: '#18181b' }}
              />
            </label>
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
