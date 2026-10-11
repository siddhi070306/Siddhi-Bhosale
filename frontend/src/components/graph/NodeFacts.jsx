import React from 'react';

const ORIGIN = { curated: 'Curated baseline', learned: 'Learned from an article', user: 'Added by a user' };

function Row({ k, children }) {
  return (
    <div className="event-detail-row">
      <span className="detail-key">{k}</span>
      <span className="detail-val" style={{ textAlign: 'right', maxWidth: '62%' }}>{children}</span>
    </div>
  );
}

const names = (list) => (list && list.length ? list.map((x) => x.label).join(', ') : null);

/**
 * "What the graph knows" about one node: the properties that belong to its tier, straight from GET /api/node/{id}.
 * A variable shows how it is measured and whether it has market data, a sector its members, an asset its ticker,
 * parent sector and what it tracks; every node shows where it came from and which articles mentioned it.
 */
export default function NodeFacts({ props, error }) {
  if (error) return <p style={{ fontSize: 11.5, color: '#a1a1aa', marginTop: 12 }}>Node facts unavailable: {error}</p>;
  if (!props) return <p style={{ fontSize: 11.5, color: '#a1a1aa', marginTop: 12 }}>Loading what the graph knows…</p>;
  return (
    <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #f4f4f5' }} data-testid="node-facts">
      <div style={{ fontSize: 12, fontWeight: 700, color: '#18181b', marginBottom: 6 }}>What the graph knows</div>
      <Row k="Tier">{props.level} · {props.tier_name}</Row>
      <Row k="Origin">{ORIGIN[props.origin] || props.origin || '–'}{props.first_seen ? ` (${props.first_seen})` : ''}</Row>
      <Row k="Market">{props.market || '–'}</Row>
      <Row k="Mentioned in">{props.n_articles ? `${props.n_articles} analysed article${props.n_articles === 1 ? '' : 's'}` : 'no analysed article yet'}</Row>
      <Row k="Links">{props.links_in} in · {props.links_out} out</Row>
      {props.tier === 'event' && <Row k="Kind">{props.is_policy_body ? 'Policy body (an institution whose decisions reprice variables)' : 'Event class'}</Row>}
      {props.tier === 'event' && names(props.affects) && <Row k="Affects">{names(props.affects)}</Row>}
      {props.tier === 'variable' && <Row k="Measured as">{props.measure}</Row>}
      {props.tier === 'variable' && <Row k="Market data">{props.has_market_data ? 'yes (real series)' : 'none in the graph'}</Row>}
      {props.tier === 'variable' && names(props.tracked_by) && <Row k="Tracked by">{names(props.tracked_by)}</Row>}
      {props.tier === 'sector' && <Row k="Members">{names(props.members) || 'none'}</Row>}
      {props.tier === 'sector' && names(props.weight_in) && <Row k="Part of index weight">{names(props.weight_in)}</Row>}
      {props.tier === 'asset' && <Row k="Ticker">{props.ticker || '–'}</Row>}
      {props.tier === 'asset' && <Row k="Member of">{props.parent_sector ? props.parent_sector.label : '–'}</Row>}
      {props.tier === 'asset' && names(props.tracks) && <Row k="Tracks">{names(props.tracks)}</Row>}
      {props.tier === 'asset' && names(props.weight_in) && <Row k="Component of">{names(props.weight_in)}</Row>}
    </div>
  );
}
