// API layer for Apex Zenith. Talks to the FastAPI backend only: no mock data, no silent fallbacks.
// Every call either returns real backend data or throws an Error whose message says what went wrong.

const ARROW = (d) => (d > 0 ? '↑' : d < 0 ? '↓' : '•');
const fmt = (x, n = 2) => (typeof x === 'number' ? x.toFixed(n) : '–');

async function request(path, options) {
  let res;
  try {
    res = await fetch(path, options);
  } catch (_) {
    throw new Error('Backend unreachable. Start it with `python run.py` (port 8000).');
  }
  let body = null;
  try {
    body = await res.json();
  } catch (_) {
    /* non-JSON body */
  }
  if (!res.ok) {
    const detail = body && (body.detail || body.error);
    throw new Error(typeof detail === 'string' ? detail : `Backend returned HTTP ${res.status}`);
  }
  return body;
}

// ---- user preference: live market data on/off (persisted per browser) ----------------------------
export const prefs = {
  getLive() {
    try {
      return localStorage.getItem('zenith.live') === '1';
    } catch (_) {
      return false;
    }
  },
  setLive(v) {
    try {
      localStorage.setItem('zenith.live', v ? '1' : '0');
    } catch (_) {
      /* storage unavailable */
    }
  },
};

// ---- adapters: backend response -> the shapes the pages render -------------------------------------
const TYPE_LABEL = {
  price_move: 'Price move',
  central_bank_decision: 'Central bank decision',
  supply_decision: 'Supply decision',
  geopolitical: 'Geopolitical event',
  regulation: 'Regulation',
};

const GROUP_OF = {
  company: 'companies',
  commodity: 'commodities',
  sector: 'sectors',
  indicator: 'indicators',
  index: 'instruments',
  instrument: 'instruments',
  institution: 'indicators',
};

export function toEventView(res, text, source) {
  const groups = { companies: [], commodities: [], sectors: [], indicators: [], instruments: [] };
  (res.mentions || []).forEach((m) => {
    const g = GROUP_OF[m.type];
    if (g && !groups[g].includes(m.label)) groups[g].push(m.label);
  });
  const events = res.events || [];
  const primary = events.find((e) => e.status === 'observed') || events[0] || null;
  const maxLag = Math.max(0, ...(res.assets || []).slice(0, 5).map((a) => a.horizon_days || 0));
  const sentiment = events
    .filter((e) => e.direction)
    .slice(0, 4)
    .map((e) => ({
      label: `${e.label} · ${e.status}${e.source === 'llm' ? ' · LLM' : ''}`,
      type: e.direction > 0 ? 'bullish' : 'bearish',
    }));
  return {
    eventText: text,
    extractedEntities: groups,
    details: {
      eventType: primary ? TYPE_LABEL[primary.type] || primary.type : 'No event detected',
      direction: primary ? (primary.direction > 0 ? '↑ Increase' : '↓ Decrease') : '–',
      magnitude: (primary && primary.magnitude) || 'not stated',
      timeframe: maxLag ? `Inferred lag up to ~${maxLag} days` : 'not estimated',
      source: source || 'Text as provided',
      status: primary ? primary.status : null,
      sentiment,
    },
    evidence: {
      quote: primary ? primary.quote : text,
      source: primary
        ? `${primary.status} · extracted by ${primary.source === 'llm' ? 'LLM (quote-verified)' : 'rules'}`
        : 'no event',
      related: events
        .filter((e) => e !== primary)
        .slice(0, 4)
        .map((e) => ({ title: `${e.label} (${e.status})`, date: e.magnitude || '' })),
    },
    comparison: (res.comparison || []).map((c) => ({
      statement: `${c.label} ${ARROW(c.stated)}`,
      article: c.status === 'observed' ? 'Observed' : 'Expected',
      graph:
        { consistent: 'Graph agrees', contradicts: 'Graph disagrees', model_mixed: 'Model mixed', no_upstream_path: 'No upstream path', model_has_no_path: 'No path' }[
          c.verdict
        ] || c.verdict,
      status: c.verdict,
    })),
  };
}

const ASSET_TYPE = { company: 'Stock', index: 'Index', instrument: 'Index', commodity: 'Commodity', sector: 'Sector', indicator: 'Indicator' };

function rowToAsset(r) {
  return {
    id: r.node,
    name: r.label,
    type: ASSET_TYPE[r.type] || r.type,
    impact: `${r.sensitivity_label || (typeof r.sensitivity === 'string' ? r.sensitivity : '')} sensitivity${r.mixed ? ' · mixed' : ''}`,
    isPositive: r.direction > 0,
    exposure: fmt(r.best_score ?? r.sensitivity),
    confidence: fmt(r.confidence),
    horizonDays: r.horizon_days,
    headline: r.headline,
    why: r.why,
    spark: r.spark || null,
    posMass: r.pos_mass,
    negMass: r.neg_mass,
  };
}

export function toAssetView(res) {
  return {
    assets: [...(res.assets || []), ...(res.variables || []).filter((v) => v.type === 'commodity'), ...(res.sectors || [])].map(rowToAsset),
    topSectors: (res.sectors || []).slice(0, 6).map((s) => ({
      name: s.label,
      val: `${ARROW(s.direction)} ${s.confidence_label}`,
      positive: s.direction > 0,
    })),
    sectorRows: (res.sectors || []).map(rowToAsset),
  };
}

const NODE_KIND = { sector: 'sector', company: 'industry', index: 'industry', instrument: 'industry', commodity: 'indicator', indicator: 'indicator', institution: 'indicator', event_class: 'indicator' };

export function toGraphView(res) {
  const g = res.graph || { nodes: [], links: [] };
  const srcIds = new Set((res.sources || []).map((s) => s.trigger));
  const nodes = g.nodes.filter((n) => n.type !== 'event');
  const links = g.links.filter((l) => l.kind !== 'reports');
  const ids = new Set(nodes.map((n) => n.id));
  if (!nodes.length) return null;

  const centerId = (res.sources && res.sources[0] && res.sources[0].trigger) || nodes[0].id;
  const COL_OF = { event_class: 0, institution: 0, commodity: 1, indicator: 2, sector: 3 };
  const COL_X = [150, 340, 510, 680, 850];
  const byCol = [[], [], [], [], []];
  nodes.forEach((n) => {
    const c = COL_OF[n.type] !== undefined ? COL_OF[n.type] : 4; // companies / indices / instruments on the right
    byCol[c].push(n);
  });
  const out = [];
  byCol.forEach((arr, c) => {
    arr.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
    const top = 80;
    const bottom = 800;
    const step = arr.length > 1 ? Math.min(70, (bottom - top) / (arr.length - 1)) : 0;
    const start = arr.length > 1 ? 440 - (step * (arr.length - 1)) / 2 : 440;
    arr.forEach((n, i) => {
      out.push({
        id: n.id,
        label: n.label.length > 18 ? n.label.slice(0, 16) + '…' : n.label,
        fullName: n.label,
        type: n.type,
        category: n.type,
        col: c,
        x: COL_X[c],
        y: Math.round(start + i * step),
        change: n.direction ? `${ARROW(n.direction)} ${n.confidence != null ? fmt(n.confidence) : 'reported'}` : '',
        direction: n.direction,
        confidence: n.confidence,
        isAnchor: !!(n.observed || srcIds.has(n.id)),
        isDashed: !!n.inferred,
        hasMixedSignals: !!n.mixed,
        observed: n.observed,
      });
    });
  });

  const rowFor = {};
  [...(res.assets || []), ...(res.sectors || []), ...(res.variables || [])].forEach((r) => {
    rowFor[r.node] = r;
  });
  out.forEach((n) => {
    const r = rowFor[n.id];
    n.evidence = r ? `${r.headline} — ${r.why}` : null;
  });

  const cn = nodes.find((n) => n.id === centerId) || nodes[0];
  const src0 = (res.sources || [])[0];
  const ev0 = src0 && (res.events || []).find((e) => e.id === src0.id);
  const edges = links
    .filter((l) => ids.has(l.source) && ids.has(l.target))
    .map((l) => ({
      from: l.source,
      to: l.target,
      sign: l.sign,
      strength: l.strength,
      lag: l.lag,
      mechanism: l.mechanism,
      isActive: (l.paths || []).includes(0),
      provenance: l.provenance,
      verdict: l.verdict,
      type: l.inferred ? 'indirect' : 'direct',
      style: l.inferred || l.verdict === 'inconclusive' ? 'dashed' : 'solid',
    }));

  return {
    centerNode: {
      id: cn.id,
      label: cn.label,
      fullName: cn.label,
      type: cn.type,
      category: cn.type,
      change: src0 ? `${ARROW(src0.direction)} ${ev0 && ev0.magnitude ? ev0.magnitude : 'shock'}` : '',
      confidence: ev0 ? ev0.confidence : null,
      evidence: ev0 ? `${ev0.status}: "${ev0.quote}"` : null,
      isAnchor: true,
    },
    nodes: out,
    edges,
    pathways: (res.paths || []).slice(0, 8).map((p) => ({
      id: p.id,
      endId: p.end,
      path: p.headline,
      score: fmt(p.score),
      impact: `${p.end_dir > 0 ? 'Positive' : 'Negative'} · ${p.hops} hop${p.hops === 1 ? '' : 's'} · ~${p.horizon_days}d`,
    })),
  };
}

export function toMarketSectors(res) {
  return (res.sectors || []).slice(0, 6).map((s) => ({
    name: s.label,
    change: `${ARROW(s.direction)} ${s.confidence_label} (${fmt(s.confidence)})`,
    value: Math.round(s.confidence * 100),
    isPositive: s.direction > 0,
  }));
}

// ---- API ---------------------------------------------------------------------------------------------
export const api = {
  getStatus: () => request('/api/status'),
  getSamples: () => request('/api/samples'),
  getMarket: () => request('/api/market'),
  getEvents: (limit = 8) => request(`/api/events?limit=${limit}`),
  getGraph: () => request('/api/graph'),
  resetGraph: () => request('/api/reset', { method: 'POST' }),

  // Returns the raw backend result plus adapted views for the pages. Throws on any failure.
  async analyze(text, live = prefs.getLive(), source = null) {
    const res = await request('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, live, use_llm: true }),
    });
    return {
      raw: res,
      text,
      source,
      summary: res.summary,
      llmNote: res.llm_note,
      view: toEventView(res, text, source),
      assetView: toAssetView(res),
      graphView: toGraphView(res),
      marketSectors: toMarketSectors(res),
      noEvent: !(res.paths && res.paths.length),
    };
  },

  whatIf: (trigger, magnitudePct, horizonDays, live = prefs.getLive()) =>
    request('/api/whatif', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger, magnitude_pct: magnitudePct, horizon_days: horizonDays, live }),
    }),
};

export const HORIZON_DAYS = { '1 Week': 7, '1 Month': 30, '3 Months': 90, '6 Months': 180 };
