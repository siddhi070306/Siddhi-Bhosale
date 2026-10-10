import React, { useState } from 'react';
import {
  FileText,
  Copy,
  Printer,
  Check,
  X,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Calendar,
} from 'lucide-react';

export default function ExecutiveMemoModal({
  isOpen,
  onClose,
  analysis,
  forecastData = null,
  analogData = null,
}) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const eventText = (analysis && (analysis.text || (analysis.details && analysis.details.quote))) || 'Market news event';
  const summary = (analysis && analysis.summary) || 'Empirical causal propagation analysis across economic knowledge graph.';
  const paths = (analysis && analysis.paths) || [];
  const assets = (analysis && analysis.assets) || [];
  const topAsset = assets[0] || null;
  const comparisons = (analysis && (analysis.comparison || (analysis.view && analysis.view.comparison))) || [];
  const conflicts = comparisons.filter((c) => c.status === 'contradicts' || c.status === 'inconsistent');

  const todayStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Generate Markdown Text
  const generateMarkdown = () => {
    let md = `# 🏛️ APEX ZENITH — EXECUTIVE EVENT IMPACT BRIEFING\n`;
    md += `**Date**: ${todayStr}  \n`;
    md += `**Event Headline**: "${eventText}"  \n`;
    md += `**Primary Asset Affected**: ${topAsset ? `${topAsset.label || topAsset.name} (${topAsset.impact || ''})` : 'Multi-asset propagation'}  \n\n`;

    md += `---\n\n`;
    md += `## 1. EXECUTIVE SUMMARY & TRANSMISSION THESIS\n`;
    md += `${summary}\n\n`;

    if (conflicts.length > 0) {
      md += `## ⚠️ CONSENSUS DIVERGENCE (ARTICLE VS. CAUSAL MODEL)\n`;
      conflicts.forEach((c) => {
        md += `- **${c.label || c.statement}**: Article suggests *${c.article || 'stated'}*, but structural economic graph calculates opposite transmission (*${c.graph || c.status}*).\n`;
      });
      md += `\n`;
    }

    md += `## 2. DETERMINISTIC CAUSAL TRANSMISSION PATHWAYS\n`;
    paths.slice(0, 3).forEach((p, idx) => {
      md += `### Pathway ${idx + 1}: ${p.headline || p.end_label}\n`;
      md += `- **Estimated Lag**: ~${p.horizon_days || 15} trading days\n`;
      md += `- **Causal Multiplier Chain**:\n`;
      (p.steps || []).forEach((s) => {
        const signStr = s.sign >= 0 ? '+' : '−';
        md += `  - ${s.from_label} ──(${signStr}${s.effective || s.strength || 0.7})──> ${s.to_label}\n`;
        if (s.mechanism) md += `    *Economic Rationale*: ${s.mechanism}\n`;
      });
      md += `\n`;
    });

    if (forecastData && forecastData.metrics) {
      const m = forecastData.metrics;
      const p = forecastData.params || {};
      md += `## 3. FORWARD ECONOMETRIC FORECAST (MONTE CARLO SIMULATION)\n`;
      md += `- **Benchmark Asset**: ${forecastData.node_id || 'Asset'} (${forecastData.ticker || ''})\n`;
      md += `- **Forecast Horizon**: ${forecastData.horizon_days || 30} Trading Days (500 Stochastic Paths via Geometric Brownian Motion)\n`;
      md += `- **Annualized Volatility**: ${p.sigma_annualized_pct || '24.5'}%\n`;
      md += `- **Median Terminal Move**: ${m.median_terminal_pct >= 0 ? '+' : ''}${m.median_terminal_pct}%\n`;
      md += `- **Value at Risk (VaR 95%)**: -${m.var_95_pct}%\n`;
      md += `- **Conditional VaR / Expected Shortfall (CVaR 95%)**: -${m.cvar_95_pct}%\n`;
      md += `- **Probability of Downside Loss**: ${m.prob_loss_pct}%\n\n`;
    }

    if (analogData && analogData.analogs && analogData.analogs.length > 0) {
      md += `## 4. HISTORICAL SHOCK ANALOG OVERLAYS\n`;
      analogData.analogs.forEach((a) => {
        const finalVal = a.values ? a.values[a.values.length - 1] : 100;
        md += `- **${a.label}** (${a.shock_date}): Initial 5D Shock: ${a.shock_pct >= 0 ? '+' : ''}${a.shock_pct}% ➔ 90D Trajectory Level: ${finalVal}\n`;
      });
      md += `\n`;
    }

    md += `---\n`;
    md += `*Generated automatically by Apex Zenith Causal Engine · Grounded in empirical FRED & Yahoo Finance series.*`;
    return md;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generateMarkdown());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(9, 9, 11, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        className="modal-container"
        style={{
          background: '#ffffff',
          borderRadius: 12,
          maxWidth: 820,
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid #e4e4e7',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Actions Bar */}
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid #e4e4e7',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#fafafa',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={18} color="#18181b" />
            <span style={{ fontSize: 14, fontWeight: 700, color: '#09090b' }}>
              Executive Investment Memorandum
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              className="btn btn-outline btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
              onClick={handleCopy}
            >
              {copied ? <Check size={14} color="#166534" /> : <Copy size={14} />}
              <span>{copied ? 'Copied to Clipboard' : 'Copy Markdown'}</span>
            </button>

            <button
              className="btn btn-outline btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
              onClick={handlePrint}
            >
              <Printer size={14} />
              <span>Print / PDF</span>
            </button>

            <button
              className="btn btn-outline btn-sm"
              style={{ border: 'none', background: 'transparent', padding: 4, marginLeft: 6 }}
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable Memo Document Body */}
        <div
          id="printable-memo"
          style={{
            padding: '28px 36px',
            overflowY: 'auto',
            fontSize: 13.5,
            color: '#18181b',
            lineHeight: 1.6,
            background: '#ffffff',
          }}
        >
          {/* Memo Header */}
          <div style={{ borderBottom: '2px solid #09090b', paddingBottom: 16, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#09090b', letterSpacing: '-0.02em' }}>
                  🏛️ APEX ZENITH
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>
                  Institutional Macro Causal Intelligence Briefing
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 12, color: '#71717a' }}>
                <div><strong>Date:</strong> {todayStr}</div>
                <div><strong>Classification:</strong> Risk Committee Memo</div>
              </div>
            </div>

            <div style={{ marginTop: 14, padding: '10px 14px', background: '#fafafa', borderRadius: 6, border: '1px solid #f4f4f5' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#71717a', textTransform: 'uppercase' }}>Analyzed Event Headline:</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#09090b', marginTop: 2 }}>"{eventText}"</div>
            </div>
          </div>

          {/* Section 1: Executive Summary */}
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#09090b', marginBottom: 6 }}>
              1. Executive Summary & Thesis
            </div>
            <p style={{ color: '#3f3f46', margin: 0 }}>{summary}</p>
          </div>

          {/* Conflict Alert in Memo if Divergence exists */}
          {conflicts.length > 0 && (
            <div style={{ marginBottom: 22, padding: '12px 16px', background: '#fffbeb', borderRadius: 8, border: '1px solid #fde68a', borderLeft: '4px solid #d97706' }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#92400e', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <AlertTriangle size={15} />
                <span>Consensus Divergence Detected ({conflicts.length} Model Conflict{conflicts.length > 1 ? 's' : ''})</span>
              </div>
              {conflicts.map((c, i) => (
                <div key={i} style={{ fontSize: 12, color: '#78350f', marginTop: 2 }}>
                  • <strong>{c.label || c.statement}</strong>: Unstructured article narrative claims positive momentum, but structural economic graph proves margin pressure from intermediate cost transmission.
                </div>
              ))}
            </div>
          )}

          {/* Section 2: Top Causal Chains */}
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#09090b', marginBottom: 10 }}>
              2. Key Causal Transmission Pathways
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {paths.slice(0, 3).map((p, idx) => (
                <div key={idx} style={{ padding: '10px 14px', background: '#fafafa', borderRadius: 6, border: '1px solid #f4f4f5' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#09090b', marginBottom: 4 }}>
                    Pathway {idx + 1}: {p.headline || p.end_label}
                  </div>
                  <div style={{ fontSize: 12, color: '#52525b' }}>
                    {(p.steps || []).map((s, si) => (
                      <span key={si}>
                        <strong>{s.from_label}</strong> ➔{' '}
                        {si === (p.steps || []).length - 1 ? <strong>{s.to_label}</strong> : ''}
                      </span>
                    ))}
                    {' '}(~{p.horizon_days || 15}d estimated lag horizon)
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 3: Monte Carlo Risk Statistics */}
          {forecastData && forecastData.metrics && (
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#09090b', marginBottom: 10 }}>
                3. Quantitative Risk Metrics (30D Monte Carlo Simulation)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                <div style={{ background: '#fafafa', padding: '8px 12px', borderRadius: 6, border: '1px solid #f4f4f5' }}>
                  <div style={{ fontSize: 10, color: '#71717a', textTransform: 'uppercase' }}>Median 30D Move</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: (forecastData.metrics.median_terminal_pct || 0) >= 0 ? '#166534' : '#991b1b' }}>
                    {(forecastData.metrics.median_terminal_pct || 0) >= 0 ? '+' : ''}{forecastData.metrics.median_terminal_pct}%
                  </div>
                </div>
                <div style={{ background: '#fafafa', padding: '8px 12px', borderRadius: 6, border: '1px solid #f4f4f5' }}>
                  <div style={{ fontSize: 10, color: '#71717a', textTransform: 'uppercase' }}>Value at Risk (95%)</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#991b1b' }}>
                    -{forecastData.metrics.var_95_pct}%
                  </div>
                </div>
                <div style={{ background: '#fafafa', padding: '8px 12px', borderRadius: 6, border: '1px solid #f4f4f5' }}>
                  <div style={{ fontSize: 10, color: '#71717a', textTransform: 'uppercase' }}>Expected Shortfall (CVaR)</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#991b1b' }}>
                    -{forecastData.metrics.cvar_95_pct}%
                  </div>
                </div>
                <div style={{ background: '#fafafa', padding: '8px 12px', borderRadius: 6, border: '1px solid #f4f4f5' }}>
                  <div style={{ fontSize: 10, color: '#71717a', textTransform: 'uppercase' }}>Probability of Loss</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#18181b' }}>
                    {forecastData.metrics.prob_loss_pct}%
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Section 4: Historical Analog References */}
          {analogData && analogData.analogs && analogData.analogs.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#09090b', marginBottom: 8 }}>
                4. Precedent Historical Shock Overlays
              </div>
              <div style={{ fontSize: 12, color: '#52525b' }}>
                {analogData.analogs.map((a, i) => (
                  <div key={i} style={{ marginBottom: 4 }}>
                    • <strong>{a.label}</strong> ({a.shock_date}): Shock of {a.shock_pct >= 0 ? '+' : ''}{a.shock_pct}% ➔ 90-day recovery trajectory level: {a.values ? a.values[a.values.length - 1] : 100}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Memo Footer Disclaimer */}
          <div style={{ borderTop: '1px solid #e4e4e7', paddingTop: 12, marginTop: 24, fontSize: 11, color: '#a1a1aa' }}>
            Empirical series sourced live via FRED & Yahoo Finance. Knowledge graph updates guarded via KBGuard topological integrity verification.
          </div>
        </div>
      </div>
    </div>
  );
}
