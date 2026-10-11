import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

// "Explain each impact chain and the evidence behind it": every impact chain of the analysis told step by step, with the
// evidence behind each step, the arithmetic of its score, its weakest step and what it concludes (impactgraph/explain.py).

const BAND = {
  strong: ['#166534', '#f0fdf4', '#bbf7d0'],
  moderate: ['#92400e', '#fffbeb', '#fde68a'],
  weak: ['#52525b', '#f4f4f5', '#e4e4e7'],
};
const ID_LABEL = { analyst: 'Analyst', article: 'Article', llm: 'LLM', user: 'User', inferred: 'Inferred' };
const DATA = {
  agrees: ['Agrees', '#166534', '#f0fdf4', '#bbf7d0'],
  disagrees: ['Disagrees', '#991b1b', '#fef2f2', '#fecaca'],
  too_weak: ['Too weak', '#52525b', '#f4f4f5', '#e4e4e7'],
  same_series: ['Same series', '#52525b', '#f4f4f5', '#e4e4e7'],
  no_data: ['No data', '#52525b', '#f4f4f5', '#e4e4e7'],
  unchecked: ['Not checked', '#52525b', '#f4f4f5', '#e4e4e7'],
  simulated: ['Simulated', '#52525b', '#f4f4f5', '#e4e4e7'],
};
const END_LABEL = { asset: 'assets', sector: 'sectors', variable: 'variables', event: 'events' };

const chip = (fg, bg, border) => ({
  fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 10, color: fg, background: bg, border: `1px solid ${border}`,
  whiteSpace: 'nowrap', display: 'inline-block',
});
const days = (n) => (n == null ? '–' : Math.round(n) === 0 ? 'same day' : `~${Math.round(n)} day${Math.round(n) === 1 ? '' : 's'}`);

function ChainPills({ headline }) {
  const parts = (headline || '').split(' → ');
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
      {parts.map((p, i) => {
        const up = p.endsWith('↑');
        return (
          <React.Fragment key={i}>
            <span style={{ fontSize: 12, padding: '2px 7px', borderRadius: 6, background: up ? '#f0fdf4' : '#fef2f2', color: up ? '#166534' : '#991b1b', border: `1px solid ${up ? '#bbf7d0' : '#fecaca'}` }}>
              {p}
            </span>
            {i < parts.length - 1 && <span style={{ color: '#a1a1aa' }}>→</span>}
          </React.Fragment>
        );
      })}
    </span>
  );
}

function Block({ title, children }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12.5, color: '#27272a', lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

function ChainDetail({ s }) {
  return (
    <div className="chain-story" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px' }}>
      <Block title="What the article says">{s.opening}</Block>
      <Block title="The chain, step by step">{s.narrative}</Block>
      <Block title="The evidence behind each step">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 680 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#71717a', fontSize: 10.5, textTransform: 'uppercase' }}>
                <th style={{ padding: '6px 4px', borderBottom: '1px solid #e4e4e7' }}>Step</th>
                <th style={{ padding: '6px 4px', borderBottom: '1px solid #e4e4e7' }}>Relationship and why</th>
                <th style={{ padding: '6px 4px', borderBottom: '1px solid #e4e4e7' }}>Identified by</th>
                <th style={{ padding: '6px 4px', borderBottom: '1px solid #e4e4e7' }}>Market data</th>
                <th style={{ padding: '6px 4px', borderBottom: '1px solid #e4e4e7' }}>Step score</th>
              </tr>
            </thead>
            <tbody>
              {s.steps.map((st) => {
                const d = DATA[(st.data_check || {}).result] || DATA.unchecked;
                const dc = st.data_check || {};
                return (
                  <tr key={st.n} style={{ borderBottom: '1px solid #f4f4f5', verticalAlign: 'top' }}>
                    <td style={{ padding: '7px 4px', fontWeight: 700 }}>{st.n}</td>
                    <td style={{ padding: '7px 4px' }}>
                      <div style={{ fontWeight: 600 }}>{st.sentence}</div>
                      <div style={{ color: '#52525b' }}>Why: {st.why}</div>
                      {st.quote && <div style={{ color: '#3f3f46', fontStyle: 'italic', marginTop: 2 }}>Article: “{st.quote}”</div>}
                    </td>
                    <td style={{ padding: '7px 4px' }}>
                      <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
                        {(st.identified_by || []).map((k) => <span key={k} style={chip('#1e3a8a', '#eff6ff', '#bfdbfe')}>{ID_LABEL[k] || k}</span>)}
                      </span>
                    </td>
                    <td style={{ padding: '7px 4px' }}>
                      <span style={chip(d[1], d[2], d[3])}>{d[0]}</span>
                      {dc.corr != null && ['agrees', 'disagrees', 'too_weak'].includes(dc.result) && (
                        <div style={{ fontSize: 11, color: '#71717a', marginTop: 2 }}>r = {dc.corr > 0 ? '+' : ''}{Number(dc.corr).toFixed(2)}, {dc.days} days</div>
                      )}
                    </td>
                    <td style={{ padding: '7px 4px', fontFamily: 'var(--font-mono, monospace)', fontSize: 11.5, whiteSpace: 'nowrap' }}>
                      {st.n === 1 ? Number(st.strength).toFixed(2) : `${Number(st.strength).toFixed(2)} × ${Number(st.discount).toFixed(2)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Block>
      <Block title="Evidence behind the chain">{(s.evidence || '').replace(/^Evidence: /, '')}</Block>
      <Block title="How the chain's score is calculated">{s.arithmetic}</Block>
      {s.weakest && <Block title="Weakest step">{s.weakest}</Block>}
      <Block title="What it concludes">{s.conclusion}</Block>
    </div>
  );
}

export default function ChainsBoard({ paths = [], onFocusNode, contextOnly = null }) {
  const [endFilter, setEndFilter] = useState('all');
  const [open, setOpen] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const all = paths.filter((p) => p.story).sort((a, b) => b.story.score - a.story.score);

  if (!all.length && contextOnly) {
    return (
      <div className="card" style={{ padding: 16, fontSize: 13, color: '#52525b' }}>
        <strong>Explain each impact chain and the evidence behind it.</strong> There are no impact chains for this story: it names{' '}
        {contextOnly.focus.join(', ')} but states no price move or policy decision, so nothing is propagated. The graph above shows where{' '}
        {contextOnly.focus.length === 1 ? 'it sits' : 'they sit'} in the market and what usually moves {contextOnly.focus.length === 1 ? 'it' : 'them'};
        the relationships table explains each of those links.
      </div>
    );
  }
  if (!all.length) {
    return (
      <div className="card" style={{ padding: 16, fontSize: 13, color: '#52525b' }}>
        <strong>Explain each impact chain and the evidence behind it.</strong> This graph was saved before chain explanations existed;
        analyse the article again to see every impact chain explained.
      </div>
    );
  }
  const endOf = (p) => (p.layers && p.layers.length ? p.layers[p.layers.length - 1] : 'asset');
  const ends = all.reduce((m, p) => ({ ...m, [endOf(p)]: (m[endOf(p)] || 0) + 1 }), {});
  // evidence over the distinct steps of all chains
  const seen = {};
  all.forEach((p) => p.story.steps.forEach((st) => { seen[`${st.from}>${st.to}`] = st; }));
  const distinct = Object.values(seen);
  const agree = distinct.filter((st) => (st.data_check || {}).result === 'agrees').length;
  const article = distinct.filter((st) => (st.identified_by || []).includes('article')).length;
  const llm = distinct.filter((st) => (st.identified_by || []).includes('llm')).length;
  const filtered = endFilter === 'all' ? all : all.filter((p) => endOf(p) === endFilter);
  const TOP = 5;
  const rows = showAll ? filtered : filtered.slice(0, TOP);
  const conditional = all.some((p) => p.story.conditional);

  return (
    <div className="card chains-board" style={{ padding: '16px 18px' }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#09090b' }}>Explain each impact chain and the evidence behind it</div>
      <p style={{ fontSize: 12.5, color: '#52525b', margin: '4px 0 10px', lineHeight: 1.55 }}>
        Each chain shows how the event can travel through the economy, step by step: why each step happens, who identified it, what
        market data says about it, and how the chain's plausibility is calculated. Inferences are labelled as inferences; what the
        article itself says is quoted. Click a chain to open it.
      </p>
      {conditional && contextOnly && (
        <div style={{ fontSize: 12.5, color: '#1e3a8a', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '8px 12px', marginBottom: 10, lineHeight: 1.5 }}>
          <strong>Conditional chains.</strong> This story names {contextOnly.focus.join(', ')} but states no price move or policy decision.
          These chains show how {contextOnly.focus.length === 1 ? 'it is' : 'they are'} usually affected if a driver moves, with the
          evidence for every step. No impact is claimed.
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12, color: '#27272a', marginBottom: 12, alignItems: 'center' }}>
        <span style={{ fontWeight: 700 }}>{all.length} impact chains explained</span>
        <span>ending at {Object.entries(ends).map(([k, v]) => `${v} ${END_LABEL[k] || k}`).join(', ')}</span>
        <span style={{ color: '#a1a1aa' }}>|</span>
        <span>Over their {distinct.length} distinct steps:</span>
        <span style={chip('#166534', '#f0fdf4', '#bbf7d0')}>market data agrees with {agree}</span>
        {article > 0 && <span style={chip('#1e3a8a', '#eff6ff', '#bfdbfe')}>{article} backed by article sentences</span>}
        {llm > 0 && <span style={chip('#1e3a8a', '#eff6ff', '#bfdbfe')}>{llm} read by the LLM with verified quotes</span>}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        {['all', 'asset', 'sector', 'variable'].filter((k) => k === 'all' || ends[k]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setEndFilter(k)}
            style={{ fontSize: 12, padding: '3px 10px', borderRadius: 12, cursor: 'pointer', border: '1px solid #d4d4d8',
              background: endFilter === k ? '#18181b' : '#fff', color: endFilter === k ? '#fff' : '#27272a' }}
          >
            {k === 'all' ? `All (${all.length})` : `Ending at ${END_LABEL[k]} (${ends[k]})`}
          </button>
        ))}
      </div>

      {rows.map((p) => {
        const s = p.story;
        const c = s.evidence_counts || {};
        const isOpen = open === p.id;
        const b = BAND[s.score_band] || BAND.weak;
        return (
          <div key={p.id} className="chain-row" style={{ borderBottom: '1px solid #f4f4f5', padding: '9px 2px' }}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                setOpen(isOpen ? null : p.id);
                if (!isOpen && onFocusNode) onFocusNode(p.end);
              }}
              onKeyDown={(ev) => ev.key === 'Enter' && setOpen(isOpen ? null : p.id)}
              style={{ display: 'flex', gap: 10, alignItems: 'flex-start', justifyContent: 'space-between', cursor: 'pointer', flexWrap: 'wrap' }}
            >
              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'flex-start', flex: 1, minWidth: 280 }}>
                {isOpen ? <ChevronDown size={14} style={{ marginTop: 4, flexShrink: 0 }} /> : <ChevronRight size={14} style={{ marginTop: 4, flexShrink: 0 }} />}
                <ChainPills headline={s.headline} />
              </span>
              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={chip(...b)} title="Plausibility of the whole chain (0 to 1), not a probability">{Number(s.score).toFixed(2)} · {s.score_band}</span>
                <span style={c.data_agrees ? chip('#166534', '#f0fdf4', '#bbf7d0') : chip('#52525b', '#f4f4f5', '#e4e4e7')} title="Steps whose relationship market data supports">data {c.data_agrees}/{c.steps}</span>
                {c.article > 0 && <span style={chip('#1e3a8a', '#eff6ff', '#bfdbfe')} title="Steps backed by an article sentence">article {c.article}</span>}
                {c.llm > 0 && <span style={chip('#1e3a8a', '#eff6ff', '#bfdbfe')} title="Steps read by the LLM with a verified quote">LLM {c.llm}</span>}
                <span style={{ fontSize: 11.5, color: '#71717a', whiteSpace: 'nowrap' }}>{c.steps} step{c.steps === 1 ? '' : 's'} · {days(s.horizon_days)}</span>
              </span>
            </div>
            {isOpen && <div style={{ marginTop: 10, marginLeft: 20 }}><ChainDetail s={s} /></div>}
          </div>
        );
      })}
      {filtered.length > TOP && (
        <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 10, fontSize: 12 }} onClick={() => setShowAll(!showAll)}>
          {showAll ? `Show the ${TOP} strongest` : `Show all ${filtered.length} chains`}
        </button>
      )}
    </div>
  );
}
