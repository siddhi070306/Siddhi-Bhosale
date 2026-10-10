import React from 'react';

export default function ExposureHeatmap() {
  const sectors = [
    { name: 'Energy', pos: 0.9, neu: 0.1, neg: 0.0 },
    { name: 'Materials', pos: 0.7, neu: 0.25, neg: 0.05 },
    { name: 'Technology', pos: 0.35, neu: 0.5, neg: 0.15 },
    { name: 'Financials', pos: 0.15, neu: 0.55, neg: 0.3 },
    { name: 'Real Estate', pos: 0.05, neu: 0.25, neg: 0.7 },
  ];

  // Helper for monochrome shading intensity
  const getCellBg = (val, type) => {
    if (val < 0.1) return '#f4f4f5';
    if (val < 0.3) return '#e4e4e7';
    if (val < 0.6) return '#a1a1aa';
    if (val < 0.8) return '#52525b';
    return '#18181b';
  };

  const getTextColor = (val) => {
    return val >= 0.6 ? '#ffffff' : '#18181b';
  };

  return (
    <div className="card" style={{ padding: '18px 20px' }}>
      <div className="card-title" style={{ marginBottom: 12 }}>
        Sector Exposure Heatmap
      </div>

      <div className="heatmap-col-headers">
        <div></div>
        <div>Positive</div>
        <div>Neutral</div>
        <div>Negative</div>
      </div>

      <div className="heatmap-matrix">
        {sectors.map((sec) => (
          <div key={sec.name} className="heatmap-row">
            <div style={{ fontWeight: 500, color: '#09090b', fontSize: '12.5px' }}>
              {sec.name}
            </div>
            <div
              className="heatmap-cell"
              style={{
                backgroundColor: getCellBg(sec.pos, 'pos'),
                color: getTextColor(sec.pos),
                fontSize: '11px',
                fontWeight: 600,
              }}
              title={`${sec.name} Positive Exposure: ${(sec.pos * 100).toFixed(0)}%`}
            >
              {(sec.pos * 100).toFixed(0)}%
            </div>
            <div
              className="heatmap-cell"
              style={{
                backgroundColor: getCellBg(sec.neu, 'neu'),
                color: getTextColor(sec.neu),
                fontSize: '11px',
                fontWeight: 600,
              }}
              title={`${sec.name} Neutral Exposure: ${(sec.neu * 100).toFixed(0)}%`}
            >
              {(sec.neu * 100).toFixed(0)}%
            </div>
            <div
              className="heatmap-cell"
              style={{
                backgroundColor: getCellBg(sec.neg, 'neg'),
                color: getTextColor(sec.neg),
                fontSize: '11px',
                fontWeight: 600,
              }}
              title={`${sec.name} Negative Exposure: ${(sec.neg * 100).toFixed(0)}%`}
            >
              {(sec.neg * 100).toFixed(0)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
