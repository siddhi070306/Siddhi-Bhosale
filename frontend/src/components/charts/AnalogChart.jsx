import React, { useState, useMemo } from 'react';
import {
  Layers,
  TrendingUp,
  Activity,
  Sliders,
  Eye,
  Info,
} from 'lucide-react';

// Institutional color palette for analog series
const ANALOG_COLORS = [
  '#2563eb', // Royal Blue
  '#d97706', // Amber Gold
  '#059669', // Emerald
  '#7c3aed', // Violet
  '#db2777', // Rose Pink
  '#0891b2', // Cyan
];
const CURRENT_COLOR = '#09090b';

/**
 * Catmull-Rom to Cubic Bezier curve converter.
 * Produces silky smooth lines like TradingView / Bloomberg rather than jagged polylines.
 */
function getSmoothPath(points) {
  if (!points || points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  if (points.length === 2) return `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)} L ${points[1].x.toFixed(1)},${points[1].y.toFixed(1)}`;

  let d = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

/**
 * Creates a closed smooth envelope area between upper and lower boundary series.
 */
function getCorridorArea(upperPoints, lowerPoints) {
  if (!upperPoints || !lowerPoints || !upperPoints.length || !lowerPoints.length) return '';
  const forward = getSmoothPath(upperPoints);
  const rev = [...lowerPoints].reverse();

  let d = forward;
  d += ` L ${rev[0].x.toFixed(1)},${rev[0].y.toFixed(1)}`;
  for (let i = 0; i < rev.length - 1; i++) {
    const p0 = rev[Math.max(0, i - 1)];
    const p1 = rev[i];
    const p2 = rev[i + 1];
    const p3 = rev[Math.min(rev.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  d += ' Z';
  return d;
}

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
  // View mode: 'corridor' (Quant Range Envelope) | 'all_paths' (Individual Crisis Lines)
  const [chartMode, setChartMode] = useState('corridor');

  const activeAnalog = selectedAnalog !== null ? selectedAnalog : internalFocused;

  // Layout Dimensions
  const W = isFullPage ? 940 : 540;
  const H = isFullPage ? 360 : 250;
  const PX_LEFT = 54;
  const PX_RIGHT = 34;
  const PY_TOP = 26;
  const PB_BOTTOM = 38;

  const innerW = W - PX_LEFT - PX_RIGHT;
  const innerH = H - PY_TOP - PB_BOTTOM;

  if (loading) {
    return (
      <div className="card" style={{ padding: 22 }}>
        <div style={{ height: H, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
          <div
            style={{
              width: '85%',
              height: 16,
              borderRadius: 8,
              background: 'linear-gradient(90deg, #f4f4f5 25%, #e4e4e7 50%, #f4f4f5 75%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.4s infinite',
            }}
          />
          <div style={{ fontSize: 13, color: '#71717a', fontWeight: 500 }}>
            Scanning multi-year econometric series & aligning crisis episodes…
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ padding: 22, background: '#fef2f2', border: '1px solid #fecaca' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#991b1b', marginBottom: 6 }}>
          Historical Analogs — Error
        </div>
        <p style={{ fontSize: 12.5, color: '#991b1b', margin: 0 }}>{error}</p>
      </div>
    );
  }

  if (!data || (!data.current && (!data.analogs || data.analogs.length === 0))) {
    return (
      <div className="card" style={{ padding: 22 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#09090b', marginBottom: 6 }}>
          Historical Analogs ({name || 'Select Asset'})
        </div>
        <p style={{ fontSize: 12.5, color: '#71717a', margin: 0 }}>
          {data?.note || 'No historical shock data available for this asset. Enable live market data in Settings.'}
        </p>
      </div>
    );
  }

  // Collect series
  const currentVals = data.current?.values || [];
  const analogsList = data.analogs || [];
  const allSeries = [];
  if (currentVals.length) allSeries.push(currentVals);
  analogsList.forEach((a) => {
    if (a.values?.length) allSeries.push(a.values);
  });

  const nDays = Math.max(...allSeries.map((s) => s.length), 90);

  // Compute Scales
  const allVals = allSeries.flat();
  let minV = Math.min(...allVals);
  let maxV = Math.max(...allVals);

  // Buffer bounds to ensure clear baseline margin
  minV = Math.floor(Math.min(minV, 92) / 5) * 5;
  maxV = Math.ceil(Math.max(maxV, 108) / 5) * 5;
  const span = maxV - minV || 1;

  const toX = (i) => PX_LEFT + (i / (nDays - 1)) * innerW;
  const toY = (v) => PY_TOP + innerH - ((v - minV) / span) * innerH;

  // Build Upper, Lower, and Median trajectories across all historical analogs
  const { corridorUpper, corridorLower, medianPoints } = useMemo(() => {
    const upper = [];
    const lower = [];
    const median = [];

    if (!analogsList.length) return { corridorUpper: [], corridorLower: [], medianPoints: [] };

    for (let day = 0; day < nDays; day++) {
      const dayVals = analogsList
        .map((a) => a.values?.[day])
        .filter((v) => v != null)
        .sort((a, b) => a - b);

      if (dayVals.length > 0) {
        const minVal = dayVals[0];
        const maxVal = dayVals[dayVals.length - 1];
        const midVal = dayVals[Math.floor(dayVals.length / 2)];
        const x = toX(day);

        upper.push({ x, y: toY(maxVal) });
        lower.push({ x, y: toY(minVal) });
        median.push({ x, y: toY(midVal) });
      }
    }
    return { corridorUpper: upper, corridorLower: lower, medianPoints: median };
  }, [analogsList, nDays, minV, maxV]);

  // Points for current series
  const currentPoints = useMemo(() => {
    return currentVals.map((v, i) => ({ x: toX(i), y: toY(v) }));
  }, [currentVals, minV, maxV]);

  // Points for individual analogs
  const analogPaths = useMemo(() => {
    return analogsList.map((a) => {
      const pts = (a.values || []).map((v, i) => ({ x: toX(i), y: toY(v) }));
      return {
        label: a.label,
        shock_date: a.shock_date,
        shock_pct: a.shock_pct,
        path: getSmoothPath(pts),
        points: pts,
      };
    });
  }, [analogsList, minV, maxV]);

  // Grid Ticks
  const numYTicks = 5;
  const yTicks = Array.from({ length: numYTicks }, (_, idx) => {
    return minV + (idx / (numYTicks - 1)) * (maxV - minV);
  });

  const xTicks = isFullPage
    ? [0, 15, 30, 45, 60, 75, nDays - 1].filter((d) => d < nDays)
    : [0, 30, 60, nDays - 1].filter((d) => d < nDays);

  // Hover Crosshair Data
  const hoverData = useMemo(() => {
    if (hoveredDay === null) return null;
    const cur = currentVals[hoveredDay];
    const medVal = analogsList.map((a) => a.values?.[hoveredDay]).filter((v) => v != null).sort((a, b) => a - b);
    const median = medVal.length ? medVal[Math.floor(medVal.length / 2)] : null;
    const minVal = medVal.length ? medVal[0] : null;
    const maxVal = medVal.length ? medVal[medVal.length - 1] : null;

    return {
      day: hoveredDay,
      current: cur,
      median,
      min: minVal,
      max: maxVal,
      analogs: analogsList.map((a) => ({
        date: a.shock_date,
        val: a.values?.[hoveredDay],
      })),
    };
  }, [hoveredDay, currentVals, analogsList]);

  const handleFocus = (idx) => {
    setInternalFocused(idx);
    if (onSelectAnalog) onSelectAnalog(idx);
  };

  return (
    <div className="card" style={{ padding: isFullPage ? 24 : 18, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12 }}>
      {/* Header & Controls Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: isFullPage ? 16 : 14.5, fontWeight: 700, color: '#0f172a' }}>
              Historical Shock Alignment — {name || 'Asset'}
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#2563eb',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                padding: '2px 8px',
                borderRadius: 4,
                fontFamily: 'monospace',
              }}
            >
              Rebased D+0 = 100.0
            </span>
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>
            Econometric multi-crisis envelope tracking trajectory divergence following initial shock.
          </div>
        </div>

        {/* View Mode Segmented Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f1f5f9', padding: 3, borderRadius: 8 }}>
          <button
            type="button"
            className={`btn btn-sm ${chartMode === 'corridor' ? 'btn-black' : 'btn-ghost'}`}
            style={{ fontSize: 11.5, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 5 }}
            onClick={() => setChartMode('corridor')}
          >
            <Layers size={13} />
            <span>Quant Corridor</span>
          </button>
          <button
            type="button"
            className={`btn btn-sm ${chartMode === 'all_paths' ? 'btn-black' : 'btn-ghost'}`}
            style={{ fontSize: 11.5, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 5 }}
            onClick={() => setChartMode('all_paths')}
          >
            <Activity size={13} />
            <span>Crisis Lines</span>
          </button>
        </div>
      </div>

      {/* Legend & Analog Episode Pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 14 }}>
        {data.current && (
          <button
            type="button"
            onClick={() => handleFocus(activeAnalog === 'now' ? null : 'now')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11.5,
              padding: '4px 10px',
              borderRadius: 6,
              border: activeAnalog === 'now' ? '1.5px solid #09090b' : '1px solid #e2e8f0',
              background: activeAnalog === 'now' ? '#09090b' : '#f8fafc',
              color: activeAnalog === 'now' ? '#ffffff' : '#0f172a',
              cursor: 'pointer',
              fontWeight: 700,
              transition: 'all 0.15s ease',
            }}
          >
            <span style={{ display: 'inline-block', width: 14, height: 3.5, background: activeAnalog === 'now' ? '#ffffff' : CURRENT_COLOR, borderRadius: 2 }} />
            <span>Current Shock (Now)</span>
          </button>
        )}

        {chartMode === 'corridor' && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11.5,
              padding: '4px 10px',
              borderRadius: 6,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              color: '#334155',
              fontWeight: 600,
            }}
          >
            <span style={{ display: 'inline-block', width: 12, height: 12, background: 'rgba(37, 99, 235, 0.16)', border: '1px solid #93c5fd', borderRadius: 2 }} />
            <span>Historical Corridor Envelope</span>
            <span style={{ display: 'inline-block', width: 14, height: 0, borderTop: '2px dashed #4f46e5', marginLeft: 6 }} />
            <span style={{ color: '#4f46e5' }}>Median Path</span>
          </div>
        )}

        {analogsList.map((a, i) => {
          const isSelected = activeAnalog === i;
          const col = ANALOG_COLORS[i % ANALOG_COLORS.length];
          return (
            <button
              key={a.label || a.shock_date}
              type="button"
              onClick={() => handleFocus(isSelected ? null : i)}
              onMouseEnter={() => handleFocus(i)}
              onMouseLeave={() => handleFocus(null)}
              title={`Isolate ${a.label || a.shock_date}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11.5,
                padding: '4px 9px',
                borderRadius: 6,
                border: isSelected ? `1.5px solid ${col}` : '1px solid #e2e8f0',
                background: isSelected ? `${col}15` : '#ffffff',
                color: isSelected ? col : '#334155',
                cursor: 'pointer',
                fontWeight: isSelected ? 700 : 500,
                transition: 'all 0.15s ease',
              }}
            >
              <span style={{ display: 'inline-block', width: 12, height: 0, borderTop: `2.5px solid ${col}` }} />
              <span>{a.shock_date}</span>
              <span style={{ fontFamily: 'monospace', fontSize: 10.5, fontWeight: 700, color: a.shock_pct >= 0 ? '#166534' : '#991b1b' }}>
                ({a.shock_pct > 0 ? '+' : ''}{a.shock_pct.toFixed(1)}%)
              </span>
            </button>
          );
        })}
      </div>

      {/* Interactive Floating Crosshair HUD */}
      {hoverData && (
        <div
          style={{
            display: 'flex',
            gap: 16,
            alignItems: 'center',
            flexWrap: 'wrap',
            background: '#0f172a',
            color: '#f8fafc',
            borderRadius: 8,
            padding: '8px 14px',
            marginBottom: 12,
            fontSize: 12,
            boxShadow: '0 4px 12px rgba(15, 23, 42, 0.15)',
          }}
        >
          <div style={{ fontWeight: 800, color: '#38bdf8', letterSpacing: '0.04em' }}>
            Day D+{hoverData.day}
          </div>

          {hoverData.current != null && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ffffff' }} />
              <span style={{ color: '#94a3b8' }}>Now:</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#ffffff' }}>
                {hoverData.current.toFixed(1)} ({(hoverData.current - 100) >= 0 ? '+' : ''}{(hoverData.current - 100).toFixed(1)}%)
              </span>
            </div>
          )}

          {hoverData.median != null && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#818cf8' }} />
              <span style={{ color: '#94a3b8' }}>Historical Median:</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#818cf8' }}>
                {hoverData.median.toFixed(1)} ({(hoverData.median - 100) >= 0 ? '+' : ''}{(hoverData.median - 100).toFixed(1)}%)
              </span>
            </div>
          )}

          {hoverData.min != null && hoverData.max != null && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ color: '#94a3b8' }}>Analog Range:</span>
              <span style={{ fontFamily: 'monospace', color: '#cbd5e1' }}>
                {hoverData.min.toFixed(1)} → {hoverData.max.toFixed(1)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Main SVG Vector Canvas */}
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
            const raw = ((svgX - PX_LEFT) / innerW) * (nDays - 1);
            const day = Math.max(0, Math.min(nDays - 1, Math.round(raw)));
            setHoveredDay(day);
          }}
        >
          <defs>
            {/* Soft Corridor Envelope Gradient */}
            <linearGradient id="corridorGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.18" />
              <stop offset="50%" stopColor="#6366f1" stopOpacity="0.10" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.04" />
            </linearGradient>

            {/* Subtle glow filter for current line */}
            <filter id="currentGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#09090b" floodOpacity="0.25" />
            </filter>
          </defs>

          {/* Clean Horizontal Gridlines */}
          {yTicks.map((v) => {
            const y = toY(v);
            const isBaseline = Math.abs(v - 100) < 0.1;
            return (
              <g key={v}>
                <line
                  x1={PX_LEFT}
                  y1={y}
                  x2={W - PX_RIGHT}
                  y2={y}
                  stroke={isBaseline ? '#64748b' : '#f1f5f9'}
                  strokeWidth={isBaseline ? 1.4 : 1}
                  strokeDasharray={isBaseline ? '4,4' : 'none'}
                />
                <text
                  x={PX_LEFT - 10}
                  y={y + 3.5}
                  textAnchor="end"
                  fontSize="11"
                  fill={isBaseline ? '#0f172a' : '#94a3b8'}
                  fontWeight={isBaseline ? 700 : 500}
                  fontFamily="monospace"
                >
                  {v.toFixed(0)}
                </text>
                {isBaseline && (
                  <text
                    x={W - PX_RIGHT + 6}
                    y={y + 3.5}
                    fontSize="10"
                    fill="#64748b"
                    fontWeight="700"
                    fontFamily="monospace"
                  >
                    100 (Base)
                  </text>
                )}
              </g>
            );
          })}

          {/* Vertical Time Gridlines (D+0, D+15, D+30...) */}
          {xTicks.map((d) => {
            const x = toX(d);
            return (
              <g key={d}>
                <line x1={x} y1={PY_TOP} x2={x} y2={PY_TOP + innerH} stroke="#f8fafc" strokeWidth={1} />
                <text
                  x={x}
                  y={H - 12}
                  textAnchor="middle"
                  fontSize="11"
                  fill="#64748b"
                  fontWeight="600"
                  fontFamily="monospace"
                >
                  D+{d}
                </text>
              </g>
            );
          })}

          {/* MODE 1: QUANT CORRIDOR SHADED AREA */}
          {chartMode === 'corridor' && corridorUpper.length > 0 && corridorLower.length > 0 && (
            <path
              d={getCorridorArea(corridorUpper, corridorLower)}
              fill="url(#corridorGradient)"
              stroke="#93c5fd"
              strokeWidth={0.8}
              strokeOpacity={0.6}
            />
          )}

          {/* MODE 1: HISTORICAL MEDIAN TRAJECTORY */}
          {chartMode === 'corridor' && medianPoints.length > 0 && (
            <path
              d={getSmoothPath(medianPoints)}
              fill="none"
              stroke="#4f46e5"
              strokeWidth={2.0}
              strokeDasharray="5,4"
              strokeLinecap="round"
              opacity={0.85}
            />
          )}

          {/* INDIVIDUAL HISTORICAL ANALOG LINES */}
          {analogPaths.map((a, i) => {
            const isSelected = activeAnalog === i;
            const isDimmed = activeAnalog !== null && !isSelected;
            const col = ANALOG_COLORS[i % ANALOG_COLORS.length];

            // In corridor mode, keep unselected analog lines very subtle
            const opacity = chartMode === 'corridor'
              ? isSelected ? 1.0 : isDimmed ? 0.08 : 0.28
              : isSelected ? 1.0 : isDimmed ? 0.15 : 0.85;

            const strokeW = isSelected ? 3.2 : chartMode === 'corridor' ? 1.2 : 1.8;

            return (
              <path
                key={a.label || a.shock_date}
                d={a.path}
                fill="none"
                stroke={col}
                strokeWidth={strokeW}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={opacity}
                style={{ transition: 'opacity 0.2s ease, stroke-width 0.2s ease' }}
              />
            );
          })}

          {/* CURRENT SHOCK TRAJECTORY (NOW) */}
          {currentPoints.length > 0 && (
            <g filter="url(#currentGlow)">
              <path
                d={getSmoothPath(currentPoints)}
                fill="none"
                stroke={CURRENT_COLOR}
                strokeWidth={activeAnalog === 'now' ? 3.8 : 2.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={activeAnalog !== null && activeAnalog !== 'now' ? 0.35 : 1.0}
              />
              {/* Pulse Marker on Latest Day of Current Shock */}
              {currentPoints.length > 0 && (
                <circle
                  cx={currentPoints[currentPoints.length - 1].x}
                  cy={currentPoints[currentPoints.length - 1].y}
                  r={4.5}
                  fill="#09090b"
                  stroke="#ffffff"
                  strokeWidth={2}
                />
              )}
            </g>
          )}

          {/* Interactive Hover Crosshair Line */}
          {hoveredDay !== null && (
            <g>
              <line
                x1={toX(hoveredDay)}
                y1={PY_TOP}
                x2={toX(hoveredDay)}
                y2={PY_TOP + innerH}
                stroke="#0f172a"
                strokeWidth={1.4}
                strokeDasharray="3,3"
              />
              {/* Point on Current Line */}
              {currentVals[hoveredDay] != null && (
                <circle
                  cx={toX(hoveredDay)}
                  cy={toY(currentVals[hoveredDay])}
                  r={5}
                  fill="#09090b"
                  stroke="#ffffff"
                  strokeWidth={2.5}
                />
              )}
              {/* Point on Median Line */}
              {chartMode === 'corridor' && medianPoints[hoveredDay] && (
                <circle
                  cx={medianPoints[hoveredDay].x}
                  cy={medianPoints[hoveredDay].y}
                  r={4.5}
                  fill="#4f46e5"
                  stroke="#ffffff"
                  strokeWidth={2}
                />
              )}
            </g>
          )}
        </svg>
      </div>

      {/* Footer Metadata & Econometric Citation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, flexWrap: 'wrap', gap: 8, fontSize: 11.5, color: '#64748b' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>Data Feed:</span>
          <strong style={{ color: '#0f172a' }}>{data.source}</strong>
          <span>· Window: 90 Trading Days</span>
        </div>
        <div style={{ fontStyle: 'italic', color: '#94a3b8' }}>
          Historical trajectories serve as empirical reference distributions, not predictive guarantees.
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
