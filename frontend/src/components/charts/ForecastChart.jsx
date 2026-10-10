import React, { useState } from 'react';

/**
 * ForecastChart – pure SVG Monte Carlo fan chart showing stochastic forecast quantile bands.
 *
 * Props:
 *   data        – response from /api/forecast
 *   loading     – boolean
 *   error       – string or null
 *   name        – asset name
 *   horizon     – current horizon (15, 30, 60)
 *   onHorizonChange – callback(newHorizon)
 */
export default function ForecastChart({ data, loading, error, name, horizon = 30, onHorizonChange, isFullPage = false }) {
  const [hoverIdx, setHoverIdx] = useState(null);

  const W = isFullPage ? 860 : 460;
  const H = isFullPage ? 330 : 210;
  const PX = isFullPage ? 54 : 44;
  const PY = isFullPage ? 24 : 20;
  const PB = isFullPage ? 34 : 30;

  const innerW = W - PX * 2;
  const innerH = H - PY - PB;

  if (loading) {
    return (
      <div className="asset-trend-box">
        <div className="ticker-header" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#18181b' }}>
            Monte Carlo Forecast ({name || 'select an asset'})
          </div>
        </div>
        <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            style={{
              width: '100%',
              height: 12,
              borderRadius: 6,
              background: 'linear-gradient(90deg, #f4f4f5 25%, #e4e4e7 50%, #f4f4f5 75%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.4s infinite',
            }}
          />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="asset-trend-box">
        <div className="ticker-header" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#18181b' }}>Monte Carlo Forecast</div>
        </div>
        <p style={{ fontSize: 12.5, color: '#991b1b', lineHeight: 1.5 }}>{error}</p>
      </div>
    );
  }

  if (!data || !data.bands || !data.bands.p50) {
    return (
      <div className="asset-trend-box">
        <div className="ticker-header" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#18181b' }}>Monte Carlo Forecast</div>
        </div>
        <p style={{ fontSize: 12.5, color: '#71717a' }}>No forecast simulation available for this asset.</p>
      </div>
    );
  }

  const { bands, days, metrics, params } = data;
  const nDays = days.length;

  // Determine global min and max for scaling
  const allVals = [
    ...bands.p10,
    ...bands.p90,
    100.0, // include base reference 100
  ];
  let minVal = Math.min(...allVals);
  let maxVal = Math.max(...allVals);

  // Add 5% padding to y-axis
  const pad = (maxVal - minVal) * 0.08 || 5.0;
  minVal = Math.floor((minVal - pad) * 10) / 10;
  maxVal = Math.ceil((maxVal + pad) * 10) / 10;

  const toX = (i) => PX + (i / (nDays - 1)) * innerW;
  const toY = (v) => PY + (1 - (v - minVal) / (maxVal - minVal)) * innerH;

  // Construct closed polygon points for confidence ribbons
  // Upper series forward, lower series backwards
  const buildRibbonPath = (upper, lower) => {
    const forward = upper.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`);
    const backward = lower.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).reverse();
    return [...forward, ...backward].join(' ');
  };

  const ribbon80 = buildRibbonPath(bands.p90, bands.p10);
  const ribbon50 = buildRibbonPath(bands.p75, bands.p25);

  const p50Points = bands.p50.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');

  // Y-axis ticks
  const yTicks = [minVal, (minVal + maxVal) / 2, maxVal];

  // Active hover data point
  const curIdx = hoverIdx !== null && hoverIdx >= 0 && hoverIdx < nDays ? hoverIdx : null;

  return (
    <div className="asset-trend-box" style={{ marginBottom: 16 }}>
      {/* Header with Title and Horizon Selector */}
      <div className="ticker-header" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#18181b', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Econometric Monte Carlo</span>
            <span style={{ fontSize: 11, fontWeight: 500, color: '#71717a' }}>({name || data.ticker || 'Asset'})</span>
          </div>
          <div style={{ fontSize: 11, color: '#71717a', marginTop: 1 }}>
            500 paths · Geometric Brownian Motion · {params?.sigma_annualized_pct}% ann vol
          </div>
        </div>

        {/* Horizon toggle pills */}
        {onHorizonChange && (
          <div style={{ display: 'inline-flex', background: '#f4f4f5', borderRadius: 6, padding: 2, gap: 2 }}>
            {[15, 30, 60].map((h) => (
              <button
                key={h}
                onClick={() => onHorizonChange(h)}
                style={{
                  border: 'none',
                  background: horizon === h ? '#ffffff' : 'transparent',
                  color: horizon === h ? '#09090b' : '#71717a',
                  fontWeight: horizon === h ? 600 : 500,
                  fontSize: 10.5,
                  padding: '3px 8px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  boxShadow: horizon === h ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                {h}D
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Key Risk Statistics Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 12 }}>
        <div style={{ background: '#fafafa', border: '1px solid #f4f4f5', borderRadius: 6, padding: '6px 8px' }}>
          <div style={{ fontSize: 10, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Median {horizon}D</div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: (metrics?.median_terminal_pct || 0) >= 0 ? '#166534' : '#991b1b' }}>
            {(metrics?.median_terminal_pct || 0) >= 0 ? '+' : ''}{metrics?.median_terminal_pct}%
          </div>
        </div>
        <div style={{ background: '#fafafa', border: '1px solid #f4f4f5', borderRadius: 6, padding: '6px 8px' }}>
          <div style={{ fontSize: 10, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>VaR (95%)</div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#991b1b' }}>
            -{metrics?.var_95_pct}%
          </div>
        </div>
        <div style={{ background: '#fafafa', border: '1px solid #f4f4f5', borderRadius: 6, padding: '6px 8px' }}>
          <div style={{ fontSize: 10, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>CVaR (95%)</div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#991b1b' }}>
            -{metrics?.cvar_95_pct}%
          </div>
        </div>
        <div style={{ background: '#fafafa', border: '1px solid #f4f4f5', borderRadius: 6, padding: '6px 8px' }}>
          <div style={{ fontSize: 10, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Prob Loss</div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: (metrics?.prob_loss_pct || 0) > 50 ? '#991b1b' : '#18181b' }}>
            {metrics?.prob_loss_pct}%
          </div>
        </div>
      </div>

      {/* SVG Fan Chart */}
      <div style={{ position: 'relative' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible', userSelect: 'none' }}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const mouseX = ((e.clientX - rect.left) / rect.width) * W;
            const clampedX = Math.max(PX, Math.min(W - PX, mouseX));
            const frac = (clampedX - PX) / innerW;
            const idx = Math.round(frac * (nDays - 1));
            setHoverIdx(Math.max(0, Math.min(nDays - 1, idx)));
          }}
          onMouseLeave={() => setHoverIdx(null)}
        >
          {/* Y-axis grid lines and labels */}
          {yTicks.map((val, idx) => (
            <g key={idx}>
              <line
                x1={PX}
                y1={toY(val)}
                x2={W - PX}
                y2={toY(val)}
                stroke="#f4f4f5"
                strokeWidth="1"
              />
              <text
                x={PX - 6}
                y={toY(val) + 3.5}
                textAnchor="end"
                fontSize="10"
                fill="#a1a1aa"
                fontFamily="var(--font-mono)"
              >
                {val.toFixed(0)}
              </text>
            </g>
          ))}

          {/* Base 100 reference dashed line */}
          <line
            x1={PX}
            y1={toY(100.0)}
            x2={W - PX}
            y2={toY(100.0)}
            stroke="#d4d4d8"
            strokeDasharray="3 3"
            strokeWidth="1"
          />

          {/* 80% Confidence Interval Ribbon (p10 to p90) */}
          <polygon
            points={ribbon80}
            fill="rgba(59, 130, 246, 0.12)"
          />

          {/* 50% Interquartile Ribbon (p25 to p75) */}
          <polygon
            points={ribbon50}
            fill="rgba(59, 130, 246, 0.24)"
          />

          {/* Median path (p50) */}
          <polyline
            points={p50Points}
            fill="none"
            stroke="#2563eb"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* X-axis tick labels */}
          <text x={PX} y={H - 8} fontSize="10" fill="#a1a1aa" fontFamily="var(--font-mono)" textAnchor="start">
            D+0 (Shock)
          </text>
          <text x={PX + innerW / 2} y={H - 8} fontSize="10" fill="#a1a1aa" fontFamily="var(--font-mono)" textAnchor="middle">
            D+{Math.floor((nDays - 1) / 2)}
          </text>
          <text x={W - PX} y={H - 8} fontSize="10" fill="#a1a1aa" fontFamily="var(--font-mono)" textAnchor="end">
            D+{nDays - 1}
          </text>

          {/* Interactive hover crosshair */}
          {curIdx !== null && (
            <g>
              <line
                x1={toX(curIdx)}
                y1={PY}
                x2={toX(curIdx)}
                y2={H - PB}
                stroke="#09090b"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              <circle
                cx={toX(curIdx)}
                cy={toY(bands.p50[curIdx])}
                r="4"
                fill="#2563eb"
                stroke="#ffffff"
                strokeWidth="2"
              />
            </g>
          )}
        </svg>

        {/* Hover Tooltip Float */}
        {curIdx !== null && (
          <div
            style={{
              position: 'absolute',
              top: 10,
              left: Math.min(W - 140, Math.max(10, (toX(curIdx) / W) * 100 > 60 ? (toX(curIdx) / W) * 100 - 32 : (toX(curIdx) / W) * 100 + 4)) + '%',
              background: '#09090b',
              color: '#ffffff',
              borderRadius: 6,
              padding: '6px 10px',
              fontSize: 11,
              pointerEvents: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
              zIndex: 10,
              minWidth: 120,
            }}
          >
            <div style={{ fontWeight: 700, borderBottom: '1px solid #27272a', paddingBottom: 3, marginBottom: 4 }}>
              {days[curIdx]} (Day {curIdx})
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#93c5fd' }}>
              <span>Median (p50):</span>
              <span style={{ fontWeight: 600 }}>{bands.p50[curIdx]}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#a1a1aa', fontSize: 10 }}>
              <span>50% Band:</span>
              <span>{bands.p25[curIdx]} – {bands.p75[curIdx]}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#71717a', fontSize: 10 }}>
              <span>80% Band:</span>
              <span>{bands.p10[curIdx]} – {bands.p90[curIdx]}</span>
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 11, color: '#71717a', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ display: 'inline-block', width: 14, height: 3, background: '#2563eb', borderRadius: 2 }} />
          <span>Median (p50)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ display: 'inline-block', width: 12, height: 10, background: 'rgba(59, 130, 246, 0.24)', borderRadius: 2 }} />
          <span>50% Band (p25-p75)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ display: 'inline-block', width: 12, height: 10, background: 'rgba(59, 130, 246, 0.12)', borderRadius: 2 }} />
          <span>80% Band (p10-p90)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ display: 'inline-block', width: 14, height: 1, borderTop: '1px dashed #a1a1aa' }} />
          <span>Base 100</span>
        </div>
      </div>
    </div>
  );
}
