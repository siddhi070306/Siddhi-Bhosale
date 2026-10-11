import React from 'react';

const ARROW = (d) => (d > 0 ? '↑' : d < 0 ? '↓' : '·');
const COLOR = (d) => (d > 0 ? '#166534' : d < 0 ? '#991b1b' : '#52525b');

/**
 * Hierarchy tab: the analysis read tier by tier (events & policy, economic variables, sectors, assets), and each affected
 * sector drilled down to its member assets. Everything shown is the backend's own roll-up of the impact rows it already
 * produced (raw.hierarchy); nothing is computed or estimated here.
 */
export default function HierarchyPanel({ hierarchy, onSelectNode }) {
  if (!hierarchy || !hierarchy.layers) {
    return <p style={{ fontSize: 12.5, color: '#71717a' }}>No hierarchy for this analysis.</p>;
  }
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#09090b', marginBottom: 6 }}>Hierarchy</div>
      <p style={{ fontSize: 11.5, color: '#71717a', lineHeight: 1.5, marginBottom: 12 }}>
        The graph reads in four tiers, from the cause of a move down to what an investor can hold. Directions and scores are
        the model&apos;s plausibility output for this event, not forecasts.
      </p>

      {hierarchy.layers.map((l) => (
        <div key={l.id} style={{ marginBottom: 12, padding: '8px 10px', background: '#fafafa', border: '1px solid #f4f4f5', borderRadius: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#18181b' }}>Tier {l.level} · {l.name}</span>
            <span style={{ fontSize: 11, color: '#71717a' }}>
              {l.count} · <span style={{ color: '#166534' }}>↑{l.up}</span> <span style={{ color: '#991b1b' }}>↓{l.down}</span>
              {l.mixed ? ` · mixed ${l.mixed}` : ''}
              {typeof l.observed === 'number' ? ` · ${l.observed} observed` : ''}
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            {(l.top || []).map((t) => (
              <button
                key={t.node}
                type="button"
                onClick={() => onSelectNode && onSelectNode(t.node)}
                title={t.status ? t.status : `confidence ${t.confidence_label || ''}`}
                style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, border: '1px solid #e4e4e7', background: '#fff', cursor: 'pointer', color: '#27272a' }}
              >
                <span style={{ color: COLOR(t.direction), fontWeight: 700 }}>{ARROW(t.direction)}</span> {t.label}
              </button>
            ))}
            {!l.top || l.top.length === 0 ? <span style={{ fontSize: 11, color: '#a1a1aa' }}>nothing reached</span> : null}
          </div>
        </div>
      ))}

      {hierarchy.sector_members && hierarchy.sector_members.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#18181b', margin: '16px 0 6px' }}>Sector → member assets</div>
          {hierarchy.sector_members.map((s) => (
            <div key={s.sector} style={{ marginBottom: 10, padding: '8px 10px', border: '1px solid #f4f4f5', borderRadius: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => onSelectNode && onSelectNode(s.sector)}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: '#09090b', textAlign: 'left' }}
                >
                  <span style={{ color: COLOR(s.direction) }}>{ARROW(s.direction)}</span> {s.label}
                </button>
                <span style={{ fontSize: 11, color: '#71717a' }}>{s.members_reached} of {s.members_total} members reached</span>
              </div>
              <div style={{ marginTop: 5, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {s.members.map((m) => (
                  <div key={m.node} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#3f3f46' }}>
                    <span>
                      <span style={{ color: COLOR(m.direction), fontWeight: 700 }}>{ARROW(m.direction)}</span> {m.label}
                    </span>
                    <span style={{ color: m.agrees_with_sector ? '#166534' : '#b45309' }}>
                      {m.agrees_with_sector ? 'same direction as sector' : 'differs from sector'}
                    </span>
                  </div>
                ))}
                {s.members_not_reached && s.members_not_reached.length > 0 && (
                  <div style={{ fontSize: 11, color: '#a1a1aa' }}>Not reached: {s.members_not_reached.join(', ')}</div>
                )}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
