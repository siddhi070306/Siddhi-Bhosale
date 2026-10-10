import React from 'react';

// Small tag telling the reader where a number comes from:
//   LIVE  = market data fetched from Yahoo Finance (yfinance)
//   FRED  = official daily series
//   MODEL = estimated by the knowledge graph from the article, not market data
const STYLES = {
  live: { background: '#dcfce7', color: '#166534', label: 'LIVE' },
  fred: { background: '#e0e7ff', color: '#3730a3', label: 'FRED' },
  model: { background: '#f4f4f5', color: '#52525b', label: 'MODEL' },
};

export default function SourceTag({ kind, title }) {
  const s = STYLES[kind] || STYLES.model;
  return (
    <span
      title={title}
      style={{ background: s.background, color: s.color, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.05em', padding: '1px 6px', borderRadius: 4, marginLeft: 6, verticalAlign: 'middle' }}
    >
      {s.label}
    </span>
  );
}

export function StreamChip({ state, transport }) {
  const map = {
    streaming: { dot: '#16a34a', text: transport === 'websocket+poll' ? 'Streaming · Yahoo WebSocket' : 'Streaming · Yahoo (polled every 20s)' },
    polling: { dot: '#d97706', text: 'Polling every 20s' },
    connecting: { dot: '#a1a1aa', text: 'Connecting…' },
    offline: { dot: '#dc2626', text: 'Live data offline' },
  };
  const m = map[state] || map.connecting;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#52525b' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.dot }} />
      {m.text}
    </span>
  );
}
