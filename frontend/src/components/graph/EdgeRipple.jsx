import React from 'react';

// What a link edit changes (impactgraph/ripple.py): the links that share its economic reason, proposed for the same
// proportional change (the user picks which), and the ripple on chains, sectors and companies, before -> after.
const fmtW = (w) => `${w >= 0 ? '+' : ''}${Number(w).toFixed(2)}`;
const arrow = (d) => (d > 0 ? '↑' : d < 0 ? '↓' : '–');

export default function EdgeRipple({ preview, loading = false, onToggle, checkedKeys = null, maxChains = 6, maxNodes = 8, title }) {
  if (!preview) {
    return loading ? <div style={{ fontSize: 12, color: '#71717a' }}>Working out what this changes…</div> : null;
  }
  const { edit, channel, linked = [], note, ripple } = preview;
  // the user's ticks show at once; the preview catches up a moment later
  const isOn = (l) => (checkedKeys ? checkedKeys.includes(`${l.source}>${l.target}`) : !!l.selected);
  const chosen = linked.filter(isOn);
  return (
    <div className="edge-ripple" style={{ fontSize: 12, color: '#27272a', lineHeight: 1.5 }}>
      {title && <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{title}</div>}
      <div style={{ marginBottom: 8 }}>
        <strong>{edit.source_label} → {edit.target_label}</strong>: {fmtW(edit.before)} → {fmtW(edit.after)}
        <span style={{ color: '#71717a' }}> · reason: {channel.label.toLowerCase()}</span>
      </div>

      <div className="edge-ripple-linked" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          Links that share this reason {linked.length > 0 ? `(${chosen.length} of ${linked.length} adjusted with it)` : ''}
        </div>
        {linked.length === 0 ? (
          <div style={{ color: '#52525b' }}>{note || 'No other link works through the same reason.'}</div>
        ) : (
          <>
            <div style={{ color: '#52525b', marginBottom: 4 }}>
              Same reason, same proportional change ({preview.ratio < 1 ? 'weaker' : 'stronger'} ×{Number(preview.ratio).toFixed(2)}). Links with a
              different reason keep their own evidence.
            </div>
            {linked.map((l) => {
              const key = `${l.source}>${l.target}`;
              return (
                <label key={key} className="edge-ripple-link" style={{ display: 'flex', gap: 6, alignItems: 'flex-start', padding: '2px 0', cursor: onToggle ? 'pointer' : 'default' }}>
                  {onToggle && <input type="checkbox" checked={isOn(l)} onChange={() => onToggle(key)} style={{ marginTop: 3 }} />}
                  <span>
                    {l.source_label} → {l.target_label}: {fmtW(l.before)} → <strong>{fmtW(l.after)}</strong>
                    {l.user_edited && <span style={{ color: '#92400e' }}> (you edited this link before, so it is not ticked by default)</span>}
                    {l.mechanism && <span style={{ color: '#71717a' }}> · {l.mechanism}</span>}
                  </span>
                </label>
              );
            })}
          </>
        )}
      </div>

      {ripple && (
        <div className="edge-ripple-effects">
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            What this changes, measured on {ripple.basis_label}: {ripple.chains_total} chain{ripple.chains_total === 1 ? '' : 's'} re-scored,{' '}
            {ripple.nodes_total} sector{ripple.nodes_total === 1 ? '' : 's'}/compan{ripple.nodes_total === 1 ? 'y' : 'ies'} changed
            {ripple.flipped > 0 ? `, ${ripple.flipped} flip direction` : ''}
            {loading ? ' (updating…)' : ''}
          </div>
          {ripple.nodes.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
              <tbody>
                {ripple.nodes.slice(0, maxNodes).map((n) => (
                  <tr key={n.node} className="edge-ripple-node" style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '3px 4px' }}>{n.label}</td>
                    <td style={{ padding: '3px 4px', whiteSpace: 'nowrap', color: '#52525b' }}>
                      {arrow(n.before.direction)} {n.before.label} ({n.before.confidence.toFixed(2)})
                    </td>
                    <td style={{ padding: '3px 4px' }}>→</td>
                    <td style={{ padding: '3px 4px', whiteSpace: 'nowrap', fontWeight: 600 }}>
                      {arrow(n.after.direction)} {n.after.label} ({n.after.confidence.toFixed(2)})
                      {n.flipped && <span style={{ marginLeft: 6, color: '#b91c1c' }}>flips</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {ripple.chains.length > 0 && (
            <div>
              <div style={{ color: '#52525b', marginBottom: 2 }}>Chains through the edited link{chosen.length ? 's' : ''} (plausibility before → after):</div>
              {ripple.chains.slice(0, maxChains).map((c) => (
                <div key={c.nodes.join('>')} className="edge-ripple-chain" style={{ padding: '1px 0' }}>
                  {c.labels.join(' → ')}: {c.before.toFixed(2)} → <strong>{c.after.toFixed(2)}</strong>
                </div>
              ))}
            </div>
          )}
          {ripple.nodes.length === 0 && ripple.chains.length === 0 && (
            <div style={{ color: '#52525b' }}>Nothing in this analysis runs through the edited link{chosen.length ? 's' : ''}.</div>
          )}
        </div>
      )}
    </div>
  );
}
