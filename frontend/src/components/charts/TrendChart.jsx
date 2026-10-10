import React from 'react';

export default function TrendChart({ symbol = 'XOM', change = '+4.8%' }) {
  // Data points for Apr 18 to Apr 25
  const data = [
    { date: 'Apr 18', price: 118 },
    { date: 'Apr 19', price: 124 },
    { date: 'Apr 20', price: 121 },
    { date: 'Apr 21', price: 127 },
    { date: 'Apr 22', price: 125 },
    { date: 'Apr 23', price: 132 },
    { date: 'Apr 24', price: 130 },
    { date: 'Apr 25', price: 138 },
  ];

  const width = 420;
  const height = 150;
  const paddingX = 40;
  const paddingY = 20;

  const minPrice = 110;
  const maxPrice = 140;

  const points = data.map((d, i) => {
    const x = paddingX + (i / (data.length - 1)) * (width - paddingX * 2);
    const y = height - paddingY - ((d.price - minPrice) / (maxPrice - minPrice)) * (height - paddingY * 2);
    return { x, y, ...d };
  });

  const polylineStr = points.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div className="asset-trend-box">
      <div className="ticker-header" style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#18181b' }}>
          Asset Price Trend ({symbol})
        </div>
        <span className="badge badge-positive" style={{ fontSize: 12 }}>
          ▲ {change}
        </span>
      </div>

      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Horizontal gridlines */}
        {[110, 120, 130, 140].map((lvl) => {
          const y = height - paddingY - ((lvl - minPrice) / (maxPrice - minPrice)) * (height - paddingY * 2);
          return (
            <g key={lvl}>
              <line x1={paddingX} y1={y} x2={width - paddingX} y2={y} stroke="#e4e4e7" strokeDasharray="3,3" />
              <text x={paddingX - 8} y={y + 3} textAnchor="end" fontSize="10" fill="#71717a">
                {lvl}
              </text>
            </g>
          );
        })}

        {/* Trend Polyline */}
        <polyline
          fill="none"
          stroke="#18181b"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={polylineStr}
        />

        {/* Data points */}
        {points.map((p, idx) => (
          <circle key={idx} cx={p.x} cy={p.y} r="3" fill="#ffffff" stroke="#18181b" strokeWidth="1.8" />
        ))}

        {/* X-axis labels */}
        {points.map((p, idx) => {
          if (idx % 2 === 0 || idx === points.length - 1) {
            return (
              <text key={`label-${idx}`} x={p.x} y={height - 2} textAnchor="middle" fontSize="10" fill="#71717a">
                {p.date}
              </text>
            );
          }
          return null;
        })}
      </svg>
    </div>
  );
}
