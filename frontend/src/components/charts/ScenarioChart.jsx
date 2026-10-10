import React from 'react';

export default function ScenarioChart({ activeScenario = 'current', onScenarioChange }) {
  const dates = ['Apr 25', 'Apr 26', 'Apr 27', 'Apr 28', 'Apr 29', 'Apr 30'];

  const scenariosData = {
    current: [5099, 5120, 5145, 5130, 5160, 5185],
    plus5: [5099, 5080, 5050, 5035, 5020, 5010],
    minus5: [5099, 5140, 5175, 5190, 5210, 5235],
  };

  const width = 540;
  const height = 240;
  const paddingX = 45;
  const paddingY = 30;

  const minVal = 5000;
  const maxVal = 5250;

  const getY = (val) =>
    height - paddingY - ((val - minVal) / (maxVal - minVal)) * (height - paddingY * 2);

  const getPoints = (arr) =>
    arr
      .map((val, idx) => {
        const x = paddingX + (idx / (dates.length - 1)) * (width - paddingX * 2);
        const y = getY(val);
        return `${x},${y}`;
      })
      .join(' ');

  return (
    <div className="scenario-chart-wrapper">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#09090b' }}>
            Compare Scenarios
          </div>
          <div style={{ fontSize: 12, color: '#71717a' }}>
            S&P 500 (Index) impact projection
          </div>
        </div>

        <div className="scenario-buttons-row">
          <button
            className={`btn btn-sm ${activeScenario === 'current' ? 'btn-black' : 'btn-outline'}`}
            onClick={() => onScenarioChange('current')}
          >
            Current (+12%)
          </button>
          <button
            className={`btn btn-sm ${activeScenario === 'plus5' ? 'btn-black' : 'btn-outline'}`}
            onClick={() => onScenarioChange('plus5')}
          >
            +5%
          </button>
          <button
            className={`btn btn-sm ${activeScenario === 'minus5' ? 'btn-black' : 'btn-outline'}`}
            onClick={() => onScenarioChange('minus5')}
          >
            -5%
          </button>
        </div>
      </div>

      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Horizontal grid lines */}
        {[5000, 5050, 5100, 5150, 5200, 5250].map((level) => {
          const y = getY(level);
          return (
            <g key={level}>
              <line x1={paddingX} y1={y} x2={width - paddingX} y2={y} stroke="#f1f1f4" strokeDasharray="3,3" />
              <text x={paddingX - 8} y={y + 3} textAnchor="end" fontSize="10" fill="#a1a1aa">
                {level}
              </text>
            </g>
          );
        })}

        {/* Current Projection Line */}
        <polyline
          fill="none"
          stroke="#18181b"
          strokeWidth="2.5"
          strokeLinecap="round"
          points={getPoints(scenariosData.current)}
        />

        {/* +5% Line */}
        <polyline
          fill="none"
          stroke="#71717a"
          strokeWidth="1.8"
          strokeDasharray="4,4"
          points={getPoints(scenariosData.plus5)}
        />

        {/* -5% Line */}
        <polyline
          fill="none"
          stroke="#a1a1aa"
          strokeWidth="1.8"
          strokeDasharray="2,2"
          points={getPoints(scenariosData.minus5)}
        />

        {/* End dots */}
        {['current', 'plus5', 'minus5'].map((key) => {
          const arr = scenariosData[key];
          const x = width - paddingX;
          const y = getY(arr[arr.length - 1]);
          return (
            <circle
              key={key}
              cx={x}
              cy={y}
              r={key === activeScenario ? 4.5 : 3}
              fill={key === 'current' ? '#18181b' : '#71717a'}
              stroke="#ffffff"
              strokeWidth="1.5"
            />
          );
        })}

        {/* X Axis dates */}
        {dates.map((date, idx) => {
          const x = paddingX + (idx / (dates.length - 1)) * (width - paddingX * 2);
          return (
            <text key={date} x={x} y={height - 6} textAnchor="middle" fontSize="10.5" fill="#71717a">
              {date}
            </text>
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 12, fontSize: 11.5, color: '#71717a' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: 2, background: '#18181b' }}></span>
          <span>Current</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: 2, borderTop: '2px dashed #71717a' }}></span>
          <span>+5%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: 2, borderTop: '2px dotted #a1a1aa' }}></span>
          <span>-5%</span>
        </div>
      </div>
    </div>
  );
}
