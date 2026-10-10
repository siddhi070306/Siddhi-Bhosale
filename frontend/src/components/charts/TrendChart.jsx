import React from 'react';

// Real return-index series (base 100) for the selected asset, from the backend's market-data layer.
// Shows an explicit message instead of a chart when no real series is available.
export default function TrendChart({ name = '', spark = null }) {
  const width = 420;
  const height = 150;
  const paddingX = 40;
  const paddingY = 20;

  const header = (badge) => (
    <div className="ticker-header" style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#18181b' }}>Price trend ({name || 'select an asset'})</div>
      {badge}
    </div>
  );

  const info = spark && spark.info;
  if (!spark || !spark.values || spark.values.length < 3 || (info && info.simulated)) {
    return (
      <div className="asset-trend-box">
        {header(null)}
        <p style={{ fontSize: 12.5, color: '#71717a', lineHeight: 1.5 }}>
          {info && info.simulated
            ? 'Only simulated data is available for this asset, so no chart is shown.'
            : 'No real price series for this asset yet. Turn on live market data in Settings and re-run the analysis.'}
        </p>
      </div>
    );
  }

  const vals = spark.values;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const pts = vals.map((v, i) => ({
    x: paddingX + (i / (vals.length - 1)) * (width - paddingX * 2),
    y: height - paddingY - ((v - min) / span) * (height - paddingY * 2),
    date: spark.dates[i],
  }));
  const total = vals[vals.length - 1] - vals[0];
  const label = info && info.kind === 'diff' ? total.toFixed(2) + ' pts' : total.toFixed(1) + '%';
  const ticks = [min, (min + max) / 2, max];

  return (
    <div className="asset-trend-box">
      {header(
        <span className={`badge ${total >= 0 ? 'badge-positive' : 'badge-negative'}`} style={{ fontSize: 12 }}>
          {total >= 0 ? '▲' : '▼'} {label} over window
        </span>
      )}
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {ticks.map((lvl) => {
          const y = height - paddingY - ((lvl - min) / span) * (height - paddingY * 2);
          return (
            <g key={lvl}>
              <line x1={paddingX} y1={y} x2={width - paddingX} y2={y} stroke="#e4e4e7" strokeDasharray="3,3" />
              <text x={paddingX - 8} y={y + 3} textAnchor="end" fontSize="10" fill="#71717a">
                {lvl.toFixed(1)}
              </text>
            </g>
          );
        })}
        <polyline fill="none" stroke="#18181b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={pts.map((p) => `${p.x},${p.y}`).join(' ')} />
        {[0, Math.floor(pts.length / 2), pts.length - 1].map((i) => (
          <text key={i} x={pts[i].x} y={height - 2} textAnchor="middle" fontSize="10" fill="#71717a">
            {pts[i].date.slice(5)}
          </text>
        ))}
      </svg>
      <div style={{ fontSize: 11, color: '#71717a', marginTop: 6 }}>
        {info ? `${info.source} · ${info.mode}` : ''} · return index, base 100
      </div>
    </div>
  );
}
