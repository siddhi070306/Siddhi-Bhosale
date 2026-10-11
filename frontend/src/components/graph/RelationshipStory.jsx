import React from 'react';

// One relationship in plain English (built by the backend from what the graph stores on the link: impactgraph/explain.py).
const BAND = {
  strong: { bg: '#f0fdf4', fg: '#166534', border: '#bbf7d0' },
  moderate: { bg: '#fffbeb', fg: '#92400e', border: '#fde68a' },
  weak: { bg: '#f4f4f5', fg: '#52525b', border: '#e4e4e7' },
};

const strip = (s, prefix) => {
  const t = s && s.startsWith(prefix) ? s.slice(prefix.length) : s;
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; // a section starts with a capital letter
};

function Section({ title, children }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{title}</div>
      <div style={{ fontSize: 12.5, color: '#27272a', lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

export function ScorePill({ story }) {
  if (!story) return null;
  const c = BAND[story.score_band] || BAND.weak;
  return (
    <span
      title="Plausibility score of this relationship (0 to 1), not a probability"
      style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: c.bg, color: c.fg, border: `1px solid ${c.border}`, whiteSpace: 'nowrap' }}
    >
      Score {Number(story.score_value).toFixed(2)} · {story.score_band}
    </span>
  );
}

export default function RelationshipStory({ story, showHeadline = true }) {
  if (!story) return null;
  return (
    <div className="relationship-story" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px' }}>
      {showHeadline && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a', lineHeight: 1.4 }}>{story.headline}</div>
          <ScorePill story={story} />
        </div>
      )}
      <Section title="Why">
        {strip(story.why, 'Why: ')}
        {story.relation ? ` ${story.relation}` : ''}
      </Section>
      {story.identified && story.identified.length > 0 && (
        <Section title="How we identified it">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {story.identified.map((s, i) => (
              <li key={i} style={{ marginBottom: 2 }}>{s}</li>
            ))}
          </ul>
        </Section>
      )}
      <Section title="What market data says">{story.data}</Section>
      <Section title="How the score is calculated">{strip(story.score, 'Score: ')}</Section>
      <Section title="When it shows">{story.timing}</Section>
    </div>
  );
}
