import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import RelationshipStory from './RelationshipStory';

// "Identify and score relationships between entities": every relationship drawn for this event, how it was identified,
// what market data says, and how its score is calculated. All facts come from the backend (impactgraph/explain.py).

const ID_LABEL = {
  analyst: ['Analyst', 'An analyst wrote this link into the knowledge graph'],
  article: ['Article', 'An analysed article sentence mentions both ends'],
  llm: ['LLM', 'The language model read or proposed it, with a verified quote'],
  user: ['User', 'A user added it or changed its weight'],
  inferred: ['Inferred', 'Inferred by the system; not verified'],
};
const DATA_LABEL = {
  agrees: ['Agrees', '#166534', '#f0fdf4', '#bbf7d0'],
  disagrees: ['Disagrees', '#991b1b', '#fef2f2', '#fecaca'],
  too_weak: ['Too weak to tell', '#52525b', '#f4f4f5', '#e4e4e7'],
  same_series: ['Same series', '#52525b', '#f4f4f5', '#e4e4e7'],
  no_data: ['No market data', '#52525b', '#f4f4f5', '#e4e4e7'],
  unchecked: ['Not checked', '#52525b', '#f4f4f5', '#e4e4e7'],
  simulated: ['Simulated only', '#52525b', '#f4f4f5', '#e4e4e7'],
};
const BAND = {
  strong: ['#166534', '#f0fdf4', '#bbf7d0'],
  moderate: ['#92400e', '#fffbeb', '#fde68a'],
  weak: ['#52525b', '#f4f4f5', '#e4e4e7'],
};

const chip = (fg, bg, border) => ({
  fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 10, color: fg, background: bg, border: `1px solid ${border}`,
  whiteSpace: 'nowrap', display: 'inline-block',
});
const days = (n) => (n == null ? '–' : Math.round(n) === 0 ? 'same day' : `~${Math.round(n)} day${Math.round(n) === 1 ? '' : 's'}`);
const count = (arr, key) => arr.reduce((m, x) => ({ ...m, [key(x)]: (m[key(x)] || 0) + 1 }), {});

function ScoreMath({ p }) {
  // 0.80 → 0.81 (articles) × 1.16 (market data) = 0.94
  const parts = [p.start.toFixed(2)];
  if (Math.abs(p.after_articles - p.start) >= 0.005) parts.push(`→ ${p.after_articles.toFixed(2)} articles`);
  if (Math.abs(p.data_multiplier - 1) >= 0.005) parts.push(`× ${p.data_multiplier.toFixed(2)} data`);
  const capped = p.after_articles * p.data_multiplier > 0.995; // scores are capped at 0.99
  return (
    <span style={{ fontSize: 11, color: '#71717a', fontFamily: 'var(--font-mono, monospace)' }} title="How the score is calculated">
      {parts.join(' ')} = {capped ? `${(p.after_articles * p.data_multiplier).toFixed(2)}, capped at ` : ''}{p.score.toFixed(2)}
    </span>
  );
}

export default function RelationshipsBoard({ edges = [], selectedEdge, onSelect }) {
  const [band, setBand] = useState('all');
  const [open, setOpen] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const all = edges.filter((e) => e.story).sort((a, b) => b.story.score_value - a.story.score_value);

  if (!all.length) {
    return (
      <div className="card" style={{ padding: 16, fontSize: 13, color: '#52525b' }}>
        <strong>Identify and score relationships between entities.</strong> This graph was saved before relationship explanations
        existed; analyse the article again to see every relationship explained and scored.
      </div>
    );
  }
  const bands = count(all, (e) => e.story.score_band);
  const ids = all.reduce((m, e) => {
    (e.story.identified_by || []).forEach((k) => (m[k] = (m[k] || 0) + 1));
    return m;
  }, {});
  const data = count(all, (e) => (e.story.data_check || {}).result || 'unchecked');
  const filtered = band === 'all' ? all : all.filter((e) => e.story.score_band === band);
  const keyOf = (e) => `${e.from}>${e.to}`;
  // the 5 strongest first; a link picked on the graph stays visible even when it is not among them
  const TOP = 5;
  const picked = selectedEdge ? filtered.find((e) => e.from === selectedEdge.from && e.to === selectedEdge.to) : null;
  const rows = showAll ? filtered : [...filtered.slice(0, TOP), ...(picked && filtered.indexOf(picked) >= TOP ? [picked] : [])];

  return (
    <div className="card relationships-board" style={{ padding: '16px 18px' }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#09090b' }}>Identify and score relationships between entities</div>
      <p style={{ fontSize: 12.5, color: '#52525b', margin: '4px 0 10px', lineHeight: 1.55 }}>
        Every relationship the system identified for this event: what it says, how it was identified, what two years of market data say
        about it, and how its score is calculated. Scores run from 0 to 1 and measure plausibility, not probability. Click a row for the
        full explanation; the link is highlighted on the graph above.
      </p>

      {/* one-line summary */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12, color: '#27272a', marginBottom: 12 }}>
        <span style={{ fontWeight: 700 }}>{all.length} relationships identified:</span>
        {['strong', 'moderate', 'weak'].map((b) => bands[b] ? <span key={b} style={chip(...BAND[b])}>{bands[b]} {b}</span> : null)}
        <span style={{ color: '#a1a1aa' }}>|</span>
        <span>Identified by</span>
        {Object.keys(ID_LABEL).map((k) => ids[k] ? <span key={k} title={ID_LABEL[k][1]} style={chip('#1e3a8a', '#eff6ff', '#bfdbfe')}>{ID_LABEL[k][0]} {ids[k]}</span> : null)}
        <span style={{ color: '#a1a1aa' }}>|</span>
        <span>Market data</span>
        {Object.keys(DATA_LABEL).map((k) => data[k] ? <span key={k} style={chip(DATA_LABEL[k][1], DATA_LABEL[k][2], DATA_LABEL[k][3])}>{DATA_LABEL[k][0]} {data[k]}</span> : null)}
      </div>

      {/* filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {['all', 'strong', 'moderate', 'weak'].map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => setBand(b)}
            style={{ fontSize: 12, padding: '3px 10px', borderRadius: 12, cursor: 'pointer', border: '1px solid #d4d4d8',
              background: band === b ? '#18181b' : '#fff', color: band === b ? '#fff' : '#27272a' }}
          >
            {b === 'all' ? `All (${all.length})` : `${b[0].toUpperCase()}${b.slice(1)} (${bands[b] || 0})`}
          </button>
        ))}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 760 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#71717a', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <th style={{ padding: '8px 6px', borderBottom: '1px solid #e4e4e7' }}>Relationship</th>
              <th style={{ padding: '8px 6px', borderBottom: '1px solid #e4e4e7' }}>How it was identified</th>
              <th style={{ padding: '8px 6px', borderBottom: '1px solid #e4e4e7' }}>What market data says</th>
              <th style={{ padding: '8px 6px', borderBottom: '1px solid #e4e4e7' }}>Score (how it is calculated)</th>
              <th style={{ padding: '8px 6px', borderBottom: '1px solid #e4e4e7' }}>Shows within</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const s = e.story;
              const d = s.data_check || {};
              const dl = DATA_LABEL[d.result] || DATA_LABEL.unchecked;
              const isOpen = open === keyOf(e);
              const isSel = selectedEdge && selectedEdge.from === e.from && selectedEdge.to === e.to;
              return (
                <React.Fragment key={keyOf(e)}>
                  <tr
                    className="relationship-row"
                    onClick={() => {
                      setOpen(isOpen ? null : keyOf(e));
                      if (onSelect) onSelect(isOpen ? null : e);
                    }}
                    style={{ cursor: 'pointer', background: isSel ? '#eff6ff' : undefined, borderBottom: '1px solid #f4f4f5' }}
                  >
                    <td style={{ padding: '9px 6px', verticalAlign: 'top' }}>
                      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'flex-start' }}>
                        {isOpen ? <ChevronDown size={14} style={{ marginTop: 2, flexShrink: 0 }} /> : <ChevronRight size={14} style={{ marginTop: 2, flexShrink: 0 }} />}
                        <span>
                          <span style={{ color: s.sign > 0 ? '#16a34a' : '#dc2626', fontWeight: 700, marginRight: 4 }}>{s.sign > 0 ? '↑' : '↓'}</span>
                          {s.headline}
                        </span>
                      </span>
                    </td>
                    <td style={{ padding: '9px 6px', verticalAlign: 'top' }}>
                      <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
                        {(s.identified_by || []).map((k) => (
                          <span key={k} title={(ID_LABEL[k] || [k, ''])[1]} style={chip('#1e3a8a', '#eff6ff', '#bfdbfe')}>{(ID_LABEL[k] || [k])[0]}</span>
                        ))}
                      </span>
                    </td>
                    <td style={{ padding: '9px 6px', verticalAlign: 'top' }}>
                      <span style={chip(dl[1], dl[2], dl[3])}>{dl[0]}</span>
                      {d.corr != null && (d.result === 'agrees' || d.result === 'disagrees' || d.result === 'too_weak') && (
                        <div style={{ fontSize: 11, color: '#71717a', marginTop: 3 }}>
                          r = {d.corr > 0 ? '+' : ''}{Number(d.corr).toFixed(2)} over {d.days} days
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '9px 6px', verticalAlign: 'top' }}>
                      <span style={chip(...BAND[s.score_band])}>{Number(s.score_value).toFixed(2)} · {s.score_band}</span>
                      <div style={{ marginTop: 3 }}><ScoreMath p={s.score_parts} /></div>
                    </td>
                    <td style={{ padding: '9px 6px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{days(s.lag_days)}</td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={5} style={{ padding: '4px 6px 14px 26px', background: '#fafafa' }}>
                        <RelationshipStory story={s} showHeadline={false} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {filtered.length > TOP && (
        <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 10, fontSize: 12 }} onClick={() => setShowAll(!showAll)}>
          {showAll ? `Show the ${TOP} strongest` : `Show all ${filtered.length} relationships`}
        </button>
      )}
    </div>
  );
}
