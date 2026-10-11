import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Zap,
  ArrowRight,
  GitBranch,
  Sliders,
  DollarSign,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { api } from '../services/api';

const DEFAULT_PRESETS = [
  { id: 'aviation_transport', name: '✈️ Aviation & Transport', desc: 'Heavy exposure to airlines, jet fuel & logistics' },
  { id: 'tech_growth', name: '💻 Tech & Semis Growth', desc: 'Growth tech equities sensitive to discount rates & supply chains' },
  { id: 'balanced_6040', name: '🌐 Balanced 60/40 Core', desc: 'Diversified broad equity and fixed income allocation' },
  { id: 'energy_industrial', name: '⚡ Energy & Industrials', desc: 'Commodity producers and cyclical manufacturing' },
];

export default function PortfolioHedge({ analysis, onNavigateToTab, onSelectEvent }) {
  const [selectedPreset, setSelectedPreset] = useState('aviation_transport');
  const [portfolioValue, setPortfolioValue] = useState(50000000);
  const [hedgeData, setHedgeData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [customHoldings, setCustomHoldings] = useState(null);

  // Fetch or calculate portfolio hedge data
  const loadHedgeAnalysis = async (presetId, pVal, holdings = null) => {
    setLoading(true);
    try {
      const res = await api.getPortfolioHedge({
        preset: presetId,
        total_value_usd: pVal,
        analysis: analysis ? (analysis.raw || analysis) : null,
        text: analysis?.text || null,
        holdings: holdings || undefined,
      });
      setHedgeData(res);
    } catch (e) {
      console.error('Failed to load portfolio hedge analysis:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHedgeAnalysis(selectedPreset, portfolioValue, customHoldings);
  }, [selectedPreset, portfolioValue, analysis]);

  const handlePresetChange = (pid) => {
    setSelectedPreset(pid);
    setCustomHoldings(null);
  };

  const handleHoldingWeightChange = (index, newWeight) => {
    if (!hedgeData || !hedgeData.holdings) return;
    const updated = [...hedgeData.holdings];
    updated[index] = { ...updated[index], weight: parseFloat(newWeight) };
    setCustomHoldings(updated);
    loadHedgeAnalysis(selectedPreset, portfolioValue, updated);
  };

  const activeEventTitle = analysis?.title || analysis?.text || "Crude oil jumped 12% following Persian Gulf supply disruption";
  const isDownside = hedgeData?.is_downside ?? true;
  const netPnl = hedgeData?.net_pnl_usd ?? 0;
  const netPct = hedgeData?.net_impact_pct ?? 0;
  const topHedge = hedgeData?.recommended_hedges?.[0];

  return (
    <div style={{ maxWidth: 1160, margin: '0 auto', padding: '24px 20px 48px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ display: 'inline-flex', padding: 6, borderRadius: 8, background: '#18181b', color: '#ffffff' }}>
              <ShieldCheck size={18} />
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#09090b', margin: 0, letterSpacing: '-0.02em' }}>
              Portfolio Contagion & Reverse Hedge Finder
            </h1>
            <span className="nav-item-badge">Institutional</span>
          </div>
          <p style={{ fontSize: 13.5, color: '#71717a', margin: 0, maxWidth: 680 }}>
            Quantify 2nd- and 3rd-order portfolio drawdowns from breaking macro shocks and discover mathematically optimal DAG counter-hedges.
          </p>
        </div>

        {/* Portfolio Size Selector (Glassmorphic) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255, 255, 255, 0.72)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(228, 228, 231, 0.8)', borderRadius: 10, padding: 4, boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)' }}>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: '#71717a', paddingLeft: 8 }}>Portfolio AUM:</span>
          {[10000000, 25000000, 50000000, 100000000].map((val) => (
            <button
              key={val}
              type="button"
              className="btn btn-sm"
              onClick={() => setPortfolioValue(val)}
              style={{
                fontSize: 11.5,
                padding: '4px 8px',
                borderRadius: 6,
                background: portfolioValue === val ? '#18181b' : 'transparent',
                color: portfolioValue === val ? '#ffffff' : '#52525b',
                border: 'none',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ${val / 1000000}M
            </button>
          ))}
        </div>
      </div>

      {/* Active Macro Shock Context Banner */}
      <div
        className="card"
        style={{
          padding: '12px 18px',
          marginBottom: 20,
          background: 'rgba(255, 255, 255, 0.75)',
          backdropFilter: 'blur(16px) saturate(180%)',
          WebkitBackdropFilter: 'blur(16px) saturate(180%)',
          border: '1px solid rgba(228, 228, 231, 0.75)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#2563eb', background: '#eff6ff', padding: '3px 8px', borderRadius: 4 }}>
            Active Event Shock
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
            {activeEventTitle}
          </span>
        </div>
        {onNavigateToTab && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-outline btn-sm"
              style={{ fontSize: 11.5, padding: '4px 10px' }}
              onClick={() => onNavigateToTab('impact-graph')}
            >
              <GitBranch size={13} style={{ marginRight: 4 }} />
              Inspect Causal DAG
            </button>
            <button
              className="btn btn-outline btn-sm"
              style={{ fontSize: 11.5, padding: '4px 10px' }}
              onClick={() => onNavigateToTab('chat')}
            >
              Test New Event
            </button>
          </div>
        )}
      </div>

      {/* Preset Selector Bar */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        {DEFAULT_PRESETS.map((p) => {
          const active = selectedPreset === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => handlePresetChange(p.id)}
              style={{
                padding: '9px 14px',
                borderRadius: 8,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.15s ease',
                background: active ? '#18181b' : '#ffffff',
                color: active ? '#ffffff' : '#3f3f46',
                border: active ? '1px solid #18181b' : '1px solid #e4e4e7',
                boxShadow: active ? '0 2px 8px rgba(0,0,0,0.1)' : '0 1px 2px rgba(0,0,0,0.03)',
              }}
            >
              <span>{p.name}</span>
            </button>
          );
        })}
      </div>

      {/* Top Metric Cards: Net Shock & VaR */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginBottom: 20 }}>
        {/* Card 1: Net Expected P&L */}
        <div className="card" style={{ padding: '16px 20px', borderLeft: `4px solid ${isDownside ? '#ef4444' : '#10b981'}` }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: '#71717a', marginBottom: 4 }}>
            Net Event Contagion P&L
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 26, fontWeight: 800, color: isDownside ? '#dc2626' : '#16a34a', fontFamily: 'var(--font-mono)' }}>
              {isDownside ? '-' : '+'}${Math.abs(netPnl).toLocaleString()}
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: isDownside ? '#dc2626' : '#16a34a' }}>
              ({netPct >= 0 ? '+' : ''}{netPct.toFixed(2)}%)
            </span>
          </div>
          <p style={{ fontSize: 11.5, color: '#71717a', margin: '4px 0 0' }}>
            Estimated 1-month portfolio contagion drawdown under current transmission path.
          </p>
        </div>

        {/* Card 2: 95% Stressed VaR */}
        <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: '#71717a', marginBottom: 4 }}>
            30-Day Stressed Value-at-Risk (95% VaR)
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#d97706', fontFamily: 'var(--font-mono)' }}>
            ${(hedgeData?.var_95_30d_usd || 0).toLocaleString()}
          </div>
          <p style={{ fontSize: 11.5, color: '#71717a', margin: '4px 0 0' }}>
            Maximum expected drawdown at 95% confidence under current volatility regime.
          </p>
        </div>

        {/* Card 3: Primary Risk Concentration */}
        <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #6366f1' }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: '#71717a', marginBottom: 4 }}>
            Primary Factor Drag
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1e1b4b', marginBottom: 2 }}>
            {hedgeData?.top_drag_holding?.label || 'Direct Commodity Input'}
          </div>
          <p style={{ fontSize: 11.5, color: '#71717a', margin: 0 }}>
            {hedgeData?.top_drag_holding ? (
              <span>-${Math.abs(hedgeData.top_drag_holding.pnl_usd).toLocaleString()} drag on {hedgeData.top_drag_holding.ticker}</span>
            ) : 'Balanced cross-asset drag'}
          </p>
        </div>
      </div>

      {/* 🏆 HERO CARD: Recommended Counter-Hedge */}
      {topHedge && (
        <div
          className="card"
          style={{
            padding: '24px 26px',
            marginBottom: 24,
            background: 'linear-gradient(135deg, #f0fdf4 0%, #ffffff 60%, #f8fafc 100%)',
            border: '1.5px solid #86efac',
            borderRadius: 14,
            boxShadow: '0 8px 24px rgba(16, 185, 129, 0.08)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ background: '#16a34a', color: '#ffffff', padding: '4px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 800, letterSpacing: '0.04em' }}>
                OPTIMAL COUNTER-HEDGE
              </span>
              <span style={{ fontSize: 18, fontWeight: 800, color: '#064e3b' }}>
                {topHedge.action}: {topHedge.label} ({topHedge.ticker})
              </span>
            </div>

            <span style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#047857', padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
              {topHedge.coverage_offset_pct}% Net Downside Neutralized
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 16, background: 'rgba(255,255,255,0.7)', padding: 14, borderRadius: 10, border: '1px solid #d1fae5' }}>
            <div>
              <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>RECOMMENDED SIZING</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#065f46', fontFamily: 'var(--font-mono)' }}>
                ${(topHedge.recommended_allocation_usd).toLocaleString()}
              </div>
              <div style={{ fontSize: 10.5, color: '#059669' }}>({topHedge.allocation_pct}% of total AUM)</div>
            </div>

            <div>
              <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>POST-HEDGE NET P&L</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: topHedge.post_hedge_net_pnl_usd >= 0 ? '#16a34a' : '#065f46', fontFamily: 'var(--font-mono)' }}>
                {topHedge.post_hedge_net_pnl_usd < 0 ? '-' : '+'}${Math.abs(topHedge.post_hedge_net_pnl_usd).toLocaleString()}
              </div>
              <div style={{ fontSize: 10.5, color: '#6b7280' }}>({topHedge.post_hedge_net_pct}% net residual risk)</div>
            </div>

            <div>
              <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>EMPIRICAL CORRELATION</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', fontFamily: 'var(--font-mono)' }}>
                {topHedge.correlation}
              </div>
              <div style={{ fontSize: 10.5, color: '#059669' }}>Basis Risk: {topHedge.basis_risk}</div>
            </div>

            <div>
              <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>EXECUTION LIQUIDITY</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                {topHedge.liquidity}
              </div>
              <div style={{ fontSize: 10.5, color: '#6b7280' }}>Asset Class: {topHedge.asset_class}</div>
            </div>
          </div>

          {/* Causal DAG Explanation */}
          <div style={{ fontSize: 12.5, color: '#064e3b', lineHeight: 1.5, background: '#f0fdf4', padding: '10px 14px', borderRadius: 8, borderLeft: '3px solid #10b981', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap size={15} color="#10b981" style={{ flexShrink: 0 }} />
            <span>
              <strong>Causal DAG Thesis:</strong> {topHedge.causal_mechanism}
            </span>
          </div>
        </div>
      )}

      {/* Alternative Counter-Hedges Matrix */}
      <div className="card" style={{ padding: '20px 22px', marginBottom: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#09090b', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>Ranked Counter-Hedging Instruments</span>
          <span style={{ fontSize: 11, color: '#71717a', fontWeight: 500 }}>(Ranked by offset coverage & execution basis risk)</span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e4e4e7', color: '#71717a' }}>
                <th style={{ padding: '8px 10px', fontWeight: 600 }}>Hedge Asset</th>
                <th style={{ padding: '8px 10px', fontWeight: 600 }}>Action</th>
                <th style={{ padding: '8px 10px', fontWeight: 600 }}>Predicted Move</th>
                <th style={{ padding: '8px 10px', fontWeight: 600 }}>Offset Coverage</th>
                <th style={{ padding: '8px 10px', fontWeight: 600 }}>Recommended Sizing</th>
                <th style={{ padding: '8px 10px', fontWeight: 600 }}>Basis Risk</th>
                <th style={{ padding: '8px 10px', fontWeight: 600 }}>Asset Class</th>
              </tr>
            </thead>
            <tbody>
              {(hedgeData?.recommended_hedges || []).map((h, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #f4f4f5' }}>
                  <td style={{ padding: '10px 10px', fontWeight: 700, color: '#09090b' }}>
                    {h.label} <span style={{ fontFamily: 'var(--font-mono)', color: '#64748b' }}>({h.ticker})</span>
                  </td>
                  <td style={{ padding: '10px 10px' }}>
                    <span style={{
                      padding: '2px 7px',
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 700,
                      background: h.action.includes('LONG') ? '#ecfdf5' : '#fef2f2',
                      color: h.action.includes('LONG') ? '#166534' : '#991b1b',
                    }}>
                      {h.action}
                    </span>
                  </td>
                  <td style={{ padding: '10px 10px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: h.predicted_asset_move_pct >= 0 ? '#16a34a' : '#dc2626' }}>
                    {h.predicted_asset_move_pct >= 0 ? '+' : ''}{h.predicted_asset_move_pct}%
                  </td>
                  <td style={{ padding: '10px 10px', fontWeight: 700, color: '#059669' }}>
                    {h.coverage_offset_pct}%
                  </td>
                  <td style={{ padding: '10px 10px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#0f172a' }}>
                    ${(h.recommended_allocation_usd).toLocaleString()}
                  </td>
                  <td style={{ padding: '10px 10px', color: h.basis_risk === 'Low' ? '#16a34a' : '#d97706', fontWeight: 600 }}>
                    {h.basis_risk}
                  </td>
                  <td style={{ padding: '10px 10px', color: '#71717a' }}>
                    {h.asset_class}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Holding-by-Holding Contagion Breakdown */}
      <div className="card" style={{ padding: '20px 22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#09090b' }}>
            Portfolio Holdings Contagion Breakdown
          </div>
          <span style={{ fontSize: 11.5, color: '#71717a' }}>
            Adjust sliders to stress-test custom allocations
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e4e4e7', color: '#71717a' }}>
                <th style={{ padding: '8px 10px', fontWeight: 600 }}>Holding</th>
                <th style={{ padding: '8px 10px', fontWeight: 600 }}>Weight</th>
                <th style={{ padding: '8px 10px', fontWeight: 600 }}>Capital (USD)</th>
                <th style={{ padding: '8px 10px', fontWeight: 600 }}>Predicted Shock</th>
                <th style={{ padding: '8px 10px', fontWeight: 600 }}>Est. P&L</th>
                <th style={{ padding: '8px 10px', fontWeight: 600 }}>Causal Mechanism</th>
              </tr>
            </thead>
            <tbody>
              {(hedgeData?.holdings || []).map((h, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #f4f4f5' }}>
                  <td style={{ padding: '10px 10px', fontWeight: 700, color: '#09090b' }}>
                    {h.label} <span style={{ fontFamily: 'var(--font-mono)', color: '#64748b' }}>({h.ticker})</span>
                  </td>
                  <td style={{ padding: '10px 10px', minWidth: 120 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={h.weight}
                        onChange={(e) => handleHoldingWeightChange(idx, e.target.value)}
                        style={{ width: 80, accentColor: '#18181b', cursor: 'pointer' }}
                      />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600 }}>
                        {Math.round(h.weight * 100)}%
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 10px', fontFamily: 'var(--font-mono)', color: '#52525b' }}>
                    ${(h.allocation_usd).toLocaleString()}
                  </td>
                  <td style={{ padding: '10px 10px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: h.predicted_move_pct >= 0 ? '#16a34a' : '#dc2626' }}>
                    {h.predicted_move_pct >= 0 ? '+' : ''}{h.predicted_move_pct}%
                  </td>
                  <td style={{ padding: '10px 10px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: h.pnl_usd >= 0 ? '#16a34a' : '#dc2626' }}>
                    {h.pnl_usd < 0 ? '-' : '+'}${Math.abs(h.pnl_usd).toLocaleString()}
                  </td>
                  <td style={{ padding: '10px 10px', color: '#64748b', fontSize: 11.5, maxWidth: 320 }}>
                    {h.mechanism}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
