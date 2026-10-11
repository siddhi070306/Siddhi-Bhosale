import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';

const ACTOR_COLOR = { user: '#1d4ed8', system: '#52525b', restore: '#7c3aed' };
const fmtVal = (v) => (Array.isArray(v) ? v.join(', ') : typeof v === 'number' ? String(v) : v === null || v === undefined ? '–' : String(v));

/**
 * The graph's change history: every article folded in, edit, added or removed asset, restore and reset, with who made it,
 * which tiers it touched and exactly what changed. A restore is a new forward change, so nothing is ever erased.
 */
export default function KbHistory({ refreshKey, onChanged }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const [detail, setDetail] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = () => api.getKbHistory(25).then(setData).catch((e) => setMsg(e.message));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const toggle = async (seq) => {
    if (open === seq) {
      setOpen(null);
      return;
    }
    setOpen(seq);
    setDetail(null);
    try {
      setDetail(await api.getKbHistoryEntry(seq));
    } catch (e) {
      setMsg(e.message);
    }
  };

  const restore = async (version) => {
    if (!window.confirm(`Restore the graph as it was at version ${version}? This becomes a new version; nothing is erased.`)) return;
    setMsg(null);
    try {
      await api.restoreKbVersion(version, 'restored from the history panel');
      setMsg(`Restored version ${version} as a new version.`);
      await load();
      if (onChanged) onChanged();
    } catch (e) {
      setMsg(e.message);
    }
  };

  const download = async () => {
    try {
      const blob = new Blob([JSON.stringify(await api.exportKb(), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `apex-zenith-graph-v${data ? data.version : 0}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setMsg(e.message);
    }
  };

  if (!data) return <p style={{ fontSize: 12, color: '#71717a' }}>{msg || 'Loading history…'}</p>;
  const restorable = new Set(data.restorable);

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: '#09090b' }}>
          Change history <span style={{ color: '#71717a', fontWeight: 400 }}>({data.total} changes · now at version {data.version})</span>
        </div>
        <button className="btn btn-outline btn-sm" type="button" onClick={download}>Export graph (JSON)</button>
      </div>
      {msg && <p style={{ fontSize: 12, color: '#27272a', marginBottom: 6 }}>{msg}</p>}
      {data.total === 0 && <p style={{ fontSize: 12, color: '#71717a' }}>Nothing has changed since the curated baseline.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.entries.map((e) => {
          const c = e.diff_counts || {};
          return (
            <div key={e.seq} style={{ border: '1px solid #f4f4f5', borderRadius: 6, padding: '6px 10px', opacity: e.undone ? 0.55 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <div style={{ fontSize: 12, color: '#18181b', textDecoration: e.undone ? 'line-through' : 'none' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', color: '#71717a' }}>v{e.version}</span>{' '}
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: ACTOR_COLOR[e.actor] || '#52525b', textTransform: 'uppercase' }}>{e.actor}</span>{' '}
                  {e.summary}
                  {e.undone ? ' (undone)' : ''}
                </div>
                <div style={{ fontSize: 11, color: '#71717a' }}>{e.t.slice(5, 16)}</div>
              </div>
              <div style={{ fontSize: 11, color: '#71717a', marginTop: 2 }}>
                {e.tiers.length ? `tiers: ${e.tiers.join(', ')} · ` : ''}
                +{c.nodes_added || 0}/−{c.nodes_removed || 0} entities · +{c.links_added || 0}/−{c.links_removed || 0} links · {c.links_changed || 0} changed
                {e.reason ? ` · reason: ${e.reason}` : ''}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button type="button" onClick={() => toggle(e.seq)} style={{ background: 'none', border: 'none', padding: 0, color: '#2563eb', cursor: 'pointer', fontSize: 11.5 }}>
                  {open === e.seq ? 'Hide details' : 'Details'}
                </button>
                {restorable.has(e.version) && e.version !== data.version && !e.undone && (
                  <button type="button" onClick={() => restore(e.version)} style={{ background: 'none', border: 'none', padding: 0, color: '#2563eb', cursor: 'pointer', fontSize: 11.5 }}>
                    Restore this version
                  </button>
                )}
              </div>
              {open === e.seq && (
                <div style={{ marginTop: 6, fontSize: 11.5, color: '#3f3f46', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {!detail && 'Loading…'}
                  {detail && detail.diff.nodes_added.map((n) => <div key={'na' + n.id}>+ entity {n.label} ({n.tier})</div>)}
                  {detail && detail.diff.nodes_removed.map((n) => <div key={'nr' + n.id}>− entity {n.label} ({n.tier})</div>)}
                  {detail && detail.diff.links_added.map((l) => (
                    <div key={'la' + l.src + l.dst}>+ link {l.src_label} → {l.dst_label} ({l.relation}, {l.sign > 0 ? '+' : '−'}{l.strength})</div>
                  ))}
                  {detail && detail.diff.links_removed.map((l) => <div key={'lr' + l.src + l.dst}>− link {l.src_label} → {l.dst_label}</div>)}
                  {detail && detail.diff.links_changed.map((l) => (
                    <div key={'lc' + l.src + l.dst}>
                      ~ {l.src_label} → {l.dst_label}: {l.fields.map((f) => `${f.field} ${fmtVal(f.before)} → ${fmtVal(f.after)}`).join('; ')}
                    </div>
                  ))}
                  {detail && Object.values(detail.diff.counts).every((n) => !n) && <div>No change to the graph itself.</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: 11, color: '#a1a1aa', marginTop: 6 }}>
        The last {data.restorable.length} versions of this session can be restored; older entries stay readable. A restore is recorded as a new change.
      </p>
    </div>
  );
}
