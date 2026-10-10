import React from 'react';

// Sector exposure from the backend's per-sector path evidence:
//   Positive / Negative = share of path score pushing the sector up / down;
//   Neutral = how little the analysis is able to say (1 - confidence).
export default function ExposureHeatmap({ sectors = [] }) {
  const rows = sectors.slice(0, 8).map((s) => {
    const tot = (s.posMass || 0) + (s.negMass || 0) || 1;
    const conf = parseFloat(s.confidence) || 0;
    const pos = ((s.posMass || 0) / tot) * conf;
    const neg = ((s.negMass || 0) / tot) * conf;
    return { name: s.name, pos, neg, neu: Math.max(0, 1 - conf) };
  });

  const getCellBg = (val) => {
    if (val < 0.1) return '#f4f4f5';
    if (val < 0.3) return '#e4e4e7';
    if (val < 0.6) return '#a1a1aa';
    if (val < 0.8) return '#52525b';
    return '#18181b';
  };
  const getTextColor = (val) => (val >= 0.6 ? '#ffffff' : '#18181b');
  const cell = (sec, key, word) => (
    <div
      className="heatmap-cell"
      style={{ backgroundColor: getCellBg(sec[key]), color: getTextColor(sec[key]), fontSize: '11px', fontWeight: 600 }}
      title={`${sec.name} ${word}: ${(sec[key] * 100).toFixed(0)}%`}
    >
      {(sec[key] * 100).toFixed(0)}%
    </div>
  );

  return (
    <div className="card" style={{ padding: '18px 20px' }}>
      <div className="card-title" style={{ marginBottom: 12 }}>
        Sector Exposure Heatmap
      </div>
      {rows.length === 0 ? (
        <p style={{ fontSize: 12.5, color: '#71717a' }}>No sectors were reached by this event.</p>
      ) : (
        <>
          <div className="heatmap-col-headers">
            <div></div>
            <div>Positive</div>
            <div>Unclear</div>
            <div>Negative</div>
          </div>
          <div className="heatmap-matrix">
            {rows.map((sec) => (
              <div key={sec.name} className="heatmap-row">
                <div style={{ fontWeight: 500, color: '#09090b', fontSize: '12.5px' }}>{sec.name}</div>
                {cell(sec, 'pos', 'positive exposure')}
                {cell(sec, 'neu', 'unclear')}
                {cell(sec, 'neg', 'negative exposure')}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
