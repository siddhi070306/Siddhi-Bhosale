import React from 'react';

export default function Sparkline({ data = [], isPositive = true, width = 120, height = 36 }) {
  if (!data || data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 4;

  const points = data.map((val, idx) => {
    const x = (idx / (data.length - 1)) * (width - padding * 2) + padding;
    const y = height - padding - ((val - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const polylineStr = points.join(' ');
  const strokeColor = isPositive === true ? '#15803d' : isPositive === false ? '#b91c1c' : '#18181b';

  return (
    <svg width={width} height={height} className="ticker-sparkline sparkline" viewBox={`0 0 ${width} ${height}`}>
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={polylineStr}
      />
      {/* End point dot */}
      {points.length > 0 && (
        <circle
          cx={points[points.length - 1].split(',')[0]}
          cy={points[points.length - 1].split(',')[1]}
          r="2.5"
          fill={strokeColor}
        />
      )}
    </svg>
  );
}
