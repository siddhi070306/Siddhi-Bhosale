import React from 'react';

// Compares the signed sensitivity of one asset across what-if scenarios (from /api/whatif).
// Bars show direction x sensitivity; this is a heuristic plausibility measure, NOT a price forecast.
export default function ScenarioChart({ scenarios = [], data = {}, activeScenario, onScenarioChange, assetLabel, loading, error }) {
  const width = 540;
  const rowH = 54;
  const top = 16;
  const height = top + rowH * Math.max(1, scenarios.length) + 24;
  const mid = width / 2 + 40;
  const scale = (width / 2 - 70) / 1.0;

  return (
    <div className="scenario-chart-wrapper">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#09090b' }}>Compare Scenarios</div>
          <div style={{ fontSize: 12, color: '#71717a' }}>
            {assetLabel || 'Asset'}: signed sensitivity (heuristic, not a price forecast)
          </div>
        </div>
        <div className="scenario-buttons-row">
          {scenarios.map((s) => (
            <button key={s.key} className={`btn btn-sm ${activeScenario === s.key ? 'btn-black' : 'btn-outline'}`} onClick={() => onScenarioChange(s.key)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p style={{ fontSize: 12.5, color: '#991b1b' }}>{error}</p>
      ) : (
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ opacity: loading ? 0.5 : 1 }}>
          <line x1={mid} y1={top - 6} x2={mid} y2={height - 24} stroke="#d4d4d8" />
          <text x={mid - 6} y={height - 8} textAnchor="end" fontSize="10.5" fill="#71717a">← falls</text>
          <text x={mid + 6} y={height - 8} textAnchor="start" fontSize="10.5" fill="#71717a">rises →</text>
          {scenarios.map((s, i) => {
            const d = data[s.key];
            const y = top + i * rowH;
            const val = d ? d.direction * Math.min(1, d.sensitivity) : 0;
            const w = Math.abs(val) * scale;
            const active = s.key === activeScenario;
            return (
              <g key={s.key}>
                <text x={8} y={y + 12} fontSize="11.5" fill="#09090b" fontWeight={active ? 700 : 500}>{s.label}</text>
                {d ? (
                  <>
                    <rect x={val >= 0 ? mid : mid - w} y={y + 18} width={Math.max(2, w)} height={22} rx={3} fill={active ? '#18181b' : '#71717a'} />
                    <text x={val >= 0 ? mid + w + 6 : mid - w - 6} y={y + 33} textAnchor={val >= 0 ? 'start' : 'end'} fontSize="10.5" fill="#52525b">
                      {d.sensitivity_label} · conf {d.confidence.toFixed(2)}
                    </text>
                  </>
                ) : (
                  <text x={mid + 8} y={y + 33} fontSize="10.5" fill="#a1a1aa">{loading ? 'computing…' : 'not reached by this shock'}</text>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
