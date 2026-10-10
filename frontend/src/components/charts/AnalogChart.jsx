import React, { useState } from 'react';

// Line colors for analog series (current = black, analogs = muted grays/blues)
const ANALOG_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6'];
const CURRENT_COLOR = '#09090b';

/**
 * AnalogChart – pure SVG overlay of the current 90-day window vs historical analogs.
 *
 * Props:
 *   data     – response from /api/analogs (or null while loading)
 *   loading  – boolean
 *   error    – string or null
 *   name     – asset name string (for the header)
 */
export default function AnalogChart({ data, loading, error, name }) {
  const [hoveredDay, setHoveredDay] = useState(null);

  const W = 420;
  const H = 200;
  const PX = 44;
  const PY = 20;
  const PB = 30; // bottom padding for x-axis labels

  const innerW = W - PX * 2;
  const innerH = H - PY - PB;

  if (loading) {
    return (
      <div className="asset-trend-box">
        <div className="ticker-header" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#18181b' }}>
            Historical Analogs ({name || 'select an asset'})
          </div>
        </div>
        <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            width: '100%', height: 12, borderRadius: 6,
            background: 'linear-gradient(90deg, #f4f4f5 25%, #e4e4e7 50%, #f4f4f5 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.4s infinite',
          }} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="asset-trend-box">
        <div className="ticker-header" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#18181b' }}>Historical Analogs</div>
        </div>
        <p style={{ fontSize: 12.5, color: '#991b1b', lineHeight: 1.5 }}>{error}</p>
      </div>
    );
  }

  if (!data || (!data.current && data.analogs.length === 0)) {
    return (
      <div className="asset-trend-box">
        <div className="ticker-header" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#18181b' }}>
            Historical Analogs ({name || 'select an asset'})
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
  const minV = Math.min(...allVals);
  const maxV = Math.max(...allVals);
  const span = maxV - minV || 1;

  const nDays = Math.max(...allSeries.map((s) => s.length));

  const toX = (i) => PX + (i / (nDays - 1)) * innerW;
  const toY = (v) => PY + innerH - ((v - minV) / span) * innerH;

  const makePath = (values) =>
    values.map((v, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');

  // Y-axis ticks
  const yTicks = [minV, (minV + maxV) / 2, maxV];

  // X-axis ticks: 0, 30, 60, 89
  const xTicks = [0, 30, 60, nDays - 1].filter((d) => d < nDays);

  // Hovered crosshair values
  const hoverVals = hoveredDay !== null ? {
    current: data.current?.values?.[hoveredDay],
    analogs: data.analogs.map((a) => a.values?.[hoveredDay]),
  } : null;

  return (
    <div className="asset-trend-box">
      {/* Header */}
      <div className="ticker-header" style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#18181b' }}>
          Historical Analogs — {name || 'Asset'}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginBottom: 10 }}>
        {data.current && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#18181b' }}>
            <span style={{ display: 'inline-block', width: 22, height: 2.5, background: CURRENT_COLOR, borderRadius: 2 }} />
            Now
            {hoverVals?.current != null && (
              <span style={{ fontWeight: 700 }}> {hoverVals.current.toFixed(1)}</span>
            )}
          </span>
        )}
        {data.analogs.map((a, i) => (
          <span key={a.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: ANALOG_COLORS[i % ANALOG_COLORS.length] }}>
            <span style={{
              display: 'inline-block', width: 22, height: 0,
              borderTop: `2px dashed ${ANALOG_COLORS[i % ANALOG_COLORS.length]}`,
            }} />
            {a.label} ({a.shock_pct > 0 ? '+' : ''}{a.shock_pct.toFixed(1)}%)
            {hoverVals?.analogs?.[i] != null && (
              <span style={{ fontWeight: 700 }}> {hoverVals.analogs[i].toFixed(1)}</span>
            )}
          </span>
        ))}
      </div>

      {/* Chart SVG */}
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{ overflow: 'visible' }}
        onMouseLeave={() => setHoveredDay(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const svgX = (e.clientX - rect.left) / rect.width * W;
          const raw = (svgX - PX) / innerW * (nDays - 1);
          const day = Math.max(0, Math.min(nDays - 1, Math.round(raw)));
          setHoveredDay(day);
        }}
      >
        {/* Y grid lines */}
        {yTicks.map((v) => {
          const y = toY(v);
          return (
            <g key={v}>
              <line x1={PX} y1={y} x2={W - PX} y2={y} stroke="#e4e4e7" strokeDasharray="3,3" />
              <text x={PX - 6} y={y + 3} textAnchor="end" fontSize="9.5" fill="#71717a">
                {v.toFixed(1)}
              </text>
            </g>
          );
        })}

        {/* Baseline at 100 */}
        {minV < 100 && maxV > 100 && (
          <line x1={PX} y1={toY(100)} x2={W - PX} y2={toY(100)}
            stroke="#a1a1aa" strokeDasharray="4,2" strokeWidth={1} />
        )}

        {/* X-axis labels */}
        {xTicks.map((d) => (
          <text key={d} x={toX(d)} y={H - 5} textAnchor="middle" fontSize="9.5" fill="#71717a">
            D+{d}
          </text>
        ))}

        {/* Analog lines (behind current) */}
        {data.analogs.map((a, i) =>
          a.values?.length ? (
            <path
              key={a.label}
              d={makePath(a.values)}
              fill="none"
              stroke={ANALOG_COLORS[i % ANALOG_COLORS.length]}
              strokeWidth={1.5}
              strokeDasharray="6,4"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.75}
            />
          ) : null
        )}

        {/* Current line (on top) */}
        {data.current?.values?.length && (
          <path
            d={makePath(data.current.values)}
            fill="none"
            stroke={CURRENT_COLOR}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Hover crosshair */}
        {hoveredDay !== null && (
          <line
            x1={toX(hoveredDay)} y1={PY}
            x2={toX(hoveredDay)} y2={PY + innerH}
            stroke="#a1a1aa" strokeWidth={1} strokeDasharray="3,2"
          />
        )}

        {/* Hover dots */}
        {hoveredDay !== null && data.current?.values?.[hoveredDay] != null && (
          <circle cx={toX(hoveredDay)} cy={toY(data.current.values[hoveredDay])}
            r={4} fill={CURRENT_COLOR} />
        )}
        {hoveredDay !== null && data.analogs.map((a, i) =>
          a.values?.[hoveredDay] != null ? (
            <circle key={a.label}
              cx={toX(hoveredDay)} cy={toY(a.values[hoveredDay])}
              r={3.5} fill={ANALOG_COLORS[i % ANALOG_COLORS.length]} />
          ) : null
        )}
      </svg>

      {/* Disclaimer */}
      <div style={{ fontSize: 10.5, color: '#a1a1aa', marginTop: 7, lineHeight: 1.4 }}>
        {data.source} · All series rebased to 100 at shock date.{' '}
        <strong>Past patterns do not predict future prices.</strong>
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
