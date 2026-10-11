import React from 'react';

const TIERS = [
  ['event', 'Events'],
  ['variable', 'Variables'],
  ['sector', 'Sectors'],
  ['asset', 'Assets'],
];

/**
 * Show or hide whole tiers of the Impact Graph, or fold each sector's member assets into the sector. Purely a view:
 * the graph, the paths and every number stay the same.
 */
export default function TierFilterBar({ hidden, onToggle, fold, onFold, counts }) {
  const chip = (active, danger) => ({
    fontSize: 11,
    padding: '3px 9px',
    borderRadius: 12,
    cursor: 'pointer',
    border: `1px solid ${active ? '#18181b' : '#e4e4e7'}`,
    background: active ? '#18181b' : '#ffffff',
    color: active ? '#ffffff' : danger ? '#a1a1aa' : '#3f3f46',
    fontWeight: 600,
    textDecoration: !active && danger ? 'line-through' : 'none',
  });
  return (
    <div
      data-testid="tier-filter"
      style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', margin: '0 0 10px' }}
    >
      <span style={{ fontSize: 10.5, color: '#71717a', fontWeight: 600, marginRight: 2 }}>Tiers</span>
      {TIERS.map(([id, name]) => (
        <button key={id} type="button" aria-pressed={!hidden[id]} onClick={() => onToggle(id)} style={chip(!hidden[id], true)}
          title={hidden[id] ? `Show the ${name.toLowerCase()} tier` : `Hide the ${name.toLowerCase()} tier`}>
          {name} {counts[id] || 0}
        </button>
      ))}
      <button type="button" aria-pressed={fold} onClick={onFold} style={chip(fold, false)}
        title="Fold each sector's member assets into the sector">
        Fold sector members
      </button>
    </div>
  );
}
