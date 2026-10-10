import React, { useState } from 'react';

// Line colors for analog series (current = black, analogs = vibrant distinct palette)
const ANALOG_COLORS = ['#2563eb', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4'];
const CURRENT_COLOR = '#09090b';

/**
 * AnalogChart – High-definition SVG overlay of the current 90-day window vs historical analogs.
 *
 * Props:
 *   data             – response from /api/analogs (or null while loading)
 *   loading          – boolean
 *   error            – string or null
 *   name             – asset name string
 *   isFullPage       – boolean (adjusts viewBox for wide desktop layout vs narrow card)
 *   selectedAnalog   – index of highlighted analog from parent or hover
 *   onSelectAnalog   – callback(index | null)
 */
export default function AnalogChart({
  data,
  loading,
  error,
  name,
  isFullPage = false,
  selectedAnalog = null,
  onSelectAnalog = null,
}) {
  const [hoveredDay, setHoveredDay] = useState(null);
  const [internalFocused, setInternalFocused] = useState(null);

  const activeAnalog = selectedAnalog !== null ? selectedAnalog : internalFocused;

  // Adaptive dimensions based on container width
  const W = isFullPage ? 860 : 440;
  const H = isFullPage ? 330 : 210;
  const PX = isFullPage ? 54 : 44;
  const PY = isFullPage ? 24 : 20;
  const PB = isFullPage ? 34 : 30;

  const innerW = W - PX * 2;
  const innerH = H - PY - PB;

  if (loading) {
    return (
      <div className="asset-trend-box" style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: 8, padding: 18 }}>
        <div className="ticker-header" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#18181b' }}>
            Historical Analogs ({name || 'loading...'})
          </div>
        </div>
        <div style={{ height: H, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <div style={{
            width: '85%', height: 14, borderRadius: 6,
            background: 'linear-gradient(90deg, #f4f4f5 25%, #e4e4e7 50%, #f4f4f5 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.4s infinite',
          }} />
          <div style={{ fontSize: 12, color: '#a1a1aa' }}>Scanning multi-year FRED & Yahoo Finance series…</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="asset-trend-box" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 18 }}>
        <div className="ticker-header" style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#991b1b' }}>Historical Analogs — Error</div>
        </div>
        <p style={{ fontSize: 12.5, color: '#991b1b', lineHeight: 1.5 }}>{error}</p>
      </div>
    );
  }

  if (!data || (!data.current && (!data.analogs || data.analogs.length === 0))) {
    return (
      <div className="asset-trend-box" style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: 8, padding: 18 }}>
        <div className="ticker-header" style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#18181b' }}>
            Historical Analogs ({name || 'Select Asset'})
          </div>
        </div>
        <p style={{ fontSize: 12.5, color: '#71717a', lineHeight: 1.5 }}>
          {data?.note || 'No historical price data available for this asset. Enable live market data in Settings.'}
        </p>
      </div>
    );
  }

  // Collect all series for scale computation
  const allSeries = [];
  if (data.current?.values?.length) allSeries.push(data.current.values);
  data.analogs.forEach((a) => { if (a.values?.length) allSeries.push(a.values); });
  if (!allSeries.length) return null;

  const allVals = allSeries.flat();
  let minV = Math.min(...allVals);
  let maxV = Math.max(...allVals);
  
  // Ensure baseline 100 is always visible with buffer
  minV = Math.min(minV, 95);
  maxV = Math.max(maxV, 105);
  const span = maxV - minV || 1;

  const nDays = Math.max(...allSeries.map((s) => s.length));

  const toX = (i) => PX + (i / (nDays - 1)) * innerW;
  const toY = (v) => PY + innerH - ((v - minV) / span) * innerH;

  const makePath = (values) =>
    values.map((v, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');

  // Y-axis ticks
  const midV = (minV + maxV) / 2;
  const yTicks = [minV, midV, maxV];

  // X-axis ticks: 0, 15, 30, 45, 60, 75, 89
  const xTicks = isFullPage
    ? [0, 15, 30, 45, 60, 75, nDays - 1].filter((d) => d < nDays)
    : [0, 30, 60, nDays - 1].filter((d) => d < nDays);

  // Hovered crosshair values
  const hoverVals = hoveredDay !== null ? {
    current: data.current?.values?.[hoveredDay],
    analogs: data.analogs.map((a) => a.values?.[hoveredDay]),
  } : null;

  const handleFocus = (idx) => {
    setInternalFocused(idx);
    if (onSelectAnalog) onSelectAnalog(idx);
  };

  return (
    <div className="asset-trend-box" style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: 8, padding: isFullPage ? 20 : 16 }}>
      {/* Top Header & Legend */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: isFullPage ? 14.5 : 13, fontWeight: 700, color: '#09090b', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>Historical Shock Alignment — {name || 'Asset'}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#71717a', background: '#f4f4f5', padding: '2px 7px', borderRadius: 4 }}>
              Rebased D+0 = 100.0
            </span>
          </div>
          <div style={{ fontSize: 11.5, color: '#71717a', marginTop: 2 }}>
            Normalized multi-window overlay tracking path divergence after shock trigger.
          </div>
        </div>

        {/* Legend pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {data.current && (
            <button
              type="button"
              onClick={() => handleFocus(activeAnalog === 'now' ? null : 'now')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11,
                padding: '3px 8px',
                borderRadius: 4,
                border: activeAnalog === 'now' ? '1px solid #09090b' : '1px solid #e4e4e7',
                background: activeAnalog === 'now' ? '#09090b' : '#fafafa',
                color: activeAnalog === 'now' ? '#ffffff' : '#09090b',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              <span style={{ display: 'inline-block', width: 14, height: 3, background: activeAnalog === 'now' ? '#ffffff' : CURRENT_COLOR, borderRadius: 1 }} />
              <span>Current Shock (Now)</span>
            </button>
          )}

          {data.analogs.map((a, i) => {
            const isSelected = activeAnalog === i;
            const col = ANALOG_COLORS[i % ANALOG_COLORS.length];
            return (
              <button
                key={a.label}
                type="button"
                onClick={() => handleFocus(isSelected ? null : i)}
                onMouseEnter={() => handleFocus(i)}
                onMouseLeave={() => handleFocus(null)}
                title={`Click to isolate ${a.label}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 11,
                  padding: '3px 8px',
                  borderRadius: 4,
                  border: isSelected ? `1.5px solid ${col}` : '1px solid #e4e4e7',
                  background: isSelected ? `${col}15` : '#ffffff',
                  color: isSelected ? col : '#27272a',
                  cursor: 'pointer',
                  fontWeight: isSelected ? 700 : 500,
                  transition: 'all 0.15s ease',
                }}
              >
                <span style={{
                  display: 'inline-block', width: 14, height: 0,
                  borderTop: `2.5px dashed ${col}`,
                }} />
                <span>{a.shock_date}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, opacity: 0.85 }}>
                  ({a.shock_pct > 0 ? '+' : ''}{a.shock_pct.toFixed(1)}%)
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Hover Info Tooltip Bar */}
      {hoveredDay !== null && hoverVals && (
        <div style={{
          display: 'flex',
          gap: 14,
          alignItems: 'center',
          flexWrap: 'wrap',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 6,
          padding: '6px 12px',
          marginBottom: 10,
          fontSize: 11.5,
        }}>
          <div style={{ fontWeight: 700, color: '#0f172a' }}>
            Day D+{hoveredDay}:
          </div>
          {hoverVals.current != null && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: CURRENT_COLOR }} />
              <span style={{ color: '#475569' }}>Now:</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                {hoverVals.current.toFixed(1)} ({(hoverVals.current - 100) >= 0 ? '+' : ''}{(hoverVals.current - 100).toFixed(1)}%)
              </span>
            </div>
          )}
          {data.analogs.map((a, i) => {
            const v = hoverVals.analogs[i];
            if (v == null) return null;
            const col = ANALOG_COLORS[i % ANALOG_COLORS.length];
            const isDimmed = activeAnalog !== null && activeAnalog !== i;
            return (
              <div key={a.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, opacity: isDimmed ? 0.35 : 1 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: col }} />
                <span style={{ color: '#475569' }}>{a.shock_date}:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: col }}>
                  {v.toFixed(1)} ({(v - 100) >= 0 ? '+' : ''}{(v - 100).toFixed(1)}%)
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Chart SVG */}
      <div style={{ width: '100%', position: 'relative' }}>
        <svg
          width="100%"
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          style={{ overflow: 'visible', display: 'block' }}
          onMouseLeave={() => setHoveredDay(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const svgX = ((e.clientX - rect.left) / rect.width) * W;
            const raw = ((svgX - PX) / innerW) * (nDays - 1);
            const day = Math.max(0, Math.min(nDays - 1, Math.round(raw)));
            setHoveredDay(day);
          }}
        >
          <defs>
            {/* Shaded zone for expansion above 100 */}
            <linearGradient id="analogUpperGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.00" />
            </linearGradient>
            {/* Shaded zone for drawdown below 100 */}
            <linearGradient id="analogLowerGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.00" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.08" />
            </linearGradient>
          </defs>

          {/* Shaded background zones */}
          {minV < 100 && maxV > 100 && (
            <>
              <rect x={PX} y={PY} width={innerW} height={toY(100) - PY} fill="url(#analogUpperGrad)" />
              <rect x={PX} y={toY(100)} width={innerW} height={PY + innerH - toY(100)} fill="url(#analogLowerGrad)" />
            </>
          )}

          {/* Y horizontal grid lines */}
          {yTicks.map((v) => {
            const y = toY(v);
            return (
              <g key={v}>
                <line x1={PX} y1={y} x2={W - PX} y2={y} stroke="#f1f5f9" strokeWidth={1} />
                <text x={PX - 8} y={y + 3.5} textAnchor="end" fontSize="10.5" fill="#94a3b8" fontFamily="var(--font-mono)">
                  {v.toFixed(1)}
                </text>
              </g>
            );
          })}

          {/* Prominent Baseline at 100 */}
          {minV <= 100 && maxV >= 100 && (
            <g>
              <line
                x1={PX}
                y1={toY(100)}
                x2={W - PX}
                y2={toY(100)}
                stroke="#64748b"
                strokeDasharray="4,3"
                strokeWidth={1.2}
              />
              <text x={W - PX + 4} y={toY(100) + 3} fontSize="9.5" fill="#64748b" fontWeight="600">
                100 (Shock Base)
              </text>
            </g>
          )}

          {/* X-axis ticks and vertical guide lines */}
          {xTicks.map((d) => {
            const x = toX(d);
            return (
              <g key={d}>
                <line x1={x} y1={PY} x2={x} y2={PY + innerH} stroke="#f8fafc" strokeWidth={1} />
                <text x={x} y={H - 8} textAnchor="middle" fontSize="10.5" fill="#64748b" fontFamily="var(--font-mono)">
                  D+{d}
                </text>
              </g>
            );
          })}

          {/* Historical Analog lines (behind current) */}
          {data.analogs.map((a, i) => {
            if (!a.values?.length) return null;
            const isSelected = activeAnalog === i;
            const isDimmed = activeAnalog !== null && !isSelected;
            const col = ANALOG_COLORS[i % ANALOG_COLORS.length];
            return (
              <path
                key={a.label}
                d={makePath(a.values)}
                fill="none"
                stroke={col}
                strokeWidth={isSelected ? 3.0 : 1.6}
                strokeDasharray={isSelected ? 'none' : '5,3'}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={isDimmed ? 0.18 : isSelected ? 1.0 : 0.75}
                style={{ transition: 'opacity 0.2s ease, stroke-width 0.2s ease' }}
              />
            );
          })}

          {/* Current Shock line (bold black, highlighted) */}
          {data.current?.values?.length && (
            <path
              d={makePath(data.current.values)}
              fill="none"
              stroke={CURRENT_COLOR}
              strokeWidth={activeAnalog === 'now' ? 3.5 : 2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={activeAnalog !== null && activeAnalog !== 'now' ? 0.3 : 1.0}
            />
          )}

          {/* Hover Crosshair vertical line */}
          {hoveredDay !== null && (
            <line
              x1={toX(hoveredDay)}
              y1={PY}
              x2={toX(hoveredDay)}
              y2={PY + innerH}
              stroke="#0f172a"
              strokeWidth={1.2}
              strokeDasharray="3,3"
            />
          )}

          {/* Hover Dots */}
          {hoveredDay !== null && data.current?.values?.[hoveredDay] != null && (
            <circle
              cx={toX(hoveredDay)}
              cy={toY(data.current.values[hoveredDay])}
              r={4.5}
              fill={CURRENT_COLOR}
              stroke="#ffffff"
              strokeWidth={2}
            />
          )}

          {hoveredDay !== null &&
            data.analogs.map((a, i) => {
              if (a.values?.[hoveredDay] == null) return null;
              const isSelected = activeAnalog === i;
              const isDimmed = activeAnalog !== null && !isSelected;
              const col = ANALOG_COLORS[i % ANALOG_COLORS.length];
              return (
                <circle
                  key={a.label}
                  cx={toX(hoveredDay)}
                  cy={toY(a.values[hoveredDay])}
                  r={isSelected ? 5.5 : 3.8}
                  fill={col}
                  stroke="#ffffff"
                  strokeWidth={1.5}
                  opacity={isDimmed ? 0.25 : 1}
                />
              );
            })}
        </svg>
      </div>

      {/* Footer Citation & Methodology Note */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, flexWrap: 'wrap', gap: 8, fontSize: 11, color: '#94a3b8' }}>
        <div>
          Data Source: <strong style={{ color: '#64748b' }}>{data.source}</strong> · Scanned window: 90 trading days.
        </div>
        <div style={{ fontStyle: 'italic' }}>
          Empirical multi-window alignment. Historical analogs serve as non-predictive econometric reference.
        </div>
      </div>

      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
