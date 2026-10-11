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
    if (Array.isArray(detail)) throw new Error(detail.map((d) => `${(d.loc || []).slice(1).join('.')} ${d.msg}`.trim()).join('; '));
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
  // read the full article body when a headline is opened (the backend honours robots.txt; default on)
  getFullText() {
    try {
      return localStorage.getItem('zenith.fulltext') !== '0';
    } catch (_) {
      return true;
    }
  },
  setFullText(v) {
    try {
      localStorage.setItem('zenith.fulltext', v ? '1' : '0');
    } catch (_) {
      /* storage unavailable */
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
  hypothesis: 'Model hypothesis (not stated)',
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

export function toEventView(res, text, source, link) {
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
      link: link || null,
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
    tierSentence: r.tier_sentence || null,
    why: r.why,
    spark: r.spark || null,
    posMass: r.pos_mass,
    negMass: r.neg_mass,
    ticker: r.ticker || null,
    userAdded: !!r.user_added,
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
  // where does each node's evidence come from? Derived from the incoming links' provenance / data-check verdict.
  const into = {};
  links.forEach((l) => {
    (into[l.target] = into[l.target] || []).push(l);
  });
  const ctxOnly = !!res.context_only; // a story that names entities but states no move: context, no impact claimed
  const provenanceOf = (n) => {
    if (n.role === 'focus') return { label: 'Named in the article (no move stated)', tone: 'observed' };
    if (ctxOnly && n.role === 'driver') return { label: 'What usually moves this sector (from the graph; no impact claimed)', tone: 'hypothesis' };
    if (ctxOnly && n.role === 'via') return { label: 'Step between a usual driver and the sector (no impact claimed)', tone: 'hypothesis' };
    if (ctxOnly && n.role === 'peer') return { label: 'Where it sits in the market: sector, peers, index (no impact claimed)', tone: 'hypothesis' };
    if (n.role === 'driver') return { label: 'Possible driver (traced backwards from the stated move; not in the article)', tone: 'hypothesis' };
    if (n.role === 'via') return { label: 'Link in a possible chain of causes (hypothesis)', tone: 'hypothesis' };
    if (n.role === 'peer') return { label: 'Sector context (peers of the company in the article)', tone: 'hypothesis' };
    if (n.observed) return { label: 'Observed in article', tone: 'observed' };
    if (n.inferred) return { label: 'Inferred by the system (unverified)', tone: 'inferred' };
    const inc = into[n.id] || [];
    const has = (p) => inc.some((l) => (l.provenance || []).includes(p));
    if (inc.some((l) => l.verdict === 'contradicted')) return { label: 'Prior link, contradicted by data', tone: 'contradicted' };
    if (has('observed') && has('validated')) return { label: 'Article-linked and data-supported', tone: 'validated' };
    if (has('validated') || inc.some((l) => l.verdict === 'supported')) return { label: 'Prior link, data-supported', tone: 'validated' };
    if (has('observed')) return { label: 'Linked by article evidence', tone: 'observed' };
    if (has('llm_proposed') || has('llm_extracted')) return { label: 'Proposed by the LLM, quote-verified', tone: 'llm' };
    return { label: 'Analyst prior (not data-checked)', tone: 'prior' };
  };
  const out = [];
  byCol.forEach((arr, c) => {
    arr.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
    const minStep = 56;
    const maxStep = 68;
    const step = arr.length > 1 ? Math.min(maxStep, Math.max(minStep, 600 / (arr.length - 1))) : 0;
    const totalSpan = step * (arr.length - 1);
    const start = Math.max(100, 430 - totalSpan / 2);
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
        change: n.role === 'focus' ? 'in the article' : n.role === 'driver' && n.direction ? `${ARROW(n.direction)} would explain it` : n.role ? 'context' : n.direction ? `${ARROW(n.direction)} ${n.confidence != null ? fmt(n.confidence) : 'reported'}` : '',
        direction: n.direction,
        confidence: n.confidence,
        isAnchor: !!(n.observed || srcIds.has(n.id) || n.role === 'focus'),
        isDashed: !!n.inferred,
        isHypothesis: !!n.role && n.role !== 'focus',
        role: n.role || null,
        hasMixedSignals: !!n.mixed,
        observed: n.observed,
        provenance: provenanceOf(n),
        layer: n.layer || null,
        layerName: n.layer_name || null,
        layerLevel: typeof n.level === 'number' ? n.level : null,
        parent: n.parent || null,
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
      baseStrength: l.base_strength,
      lag: l.lag,
      baseLag: l.base_lag,
      volRegime: l.vol_regime,
      mechanism: l.mechanism,
      story: l.story || null, // plain-English explanation of the relationship (impactgraph/explain.py)
      isActive: (l.paths || []).includes(0),
      provenance: l.provenance,
      verdict: l.verdict,
      tierKind: l.kind_tier || null,
      type: l.inferred ? 'indirect' : 'direct',
      style: l.inferred || l.kind === 'context' || l.verdict === 'inconclusive' ? 'dashed' : 'solid',
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
      provenance: ev0 ? { label: ev0.status === 'observed' ? 'Observed in article' : 'Stated as expected in article', tone: 'observed' }
        : ctxOnly ? { label: 'Named in the article (no move stated)', tone: 'observed' } : null,
      isAnchor: true,
    },
    nodes: out,
    edges,
    contextOnly: ctxOnly,
    pathways: (res.paths || []).slice(0, 8).map((p) => ({
      id: p.id,
      endId: p.end,
      path: p.headline,
      score: fmt(p.score),
      impact: `${p.end_dir > 0 ? 'Positive' : 'Negative'} · ${p.hops} hop${p.hops === 1 ? '' : 's'} · ~${p.horizon_days}d`,
      steps: p.steps || [],
      nodes: p.nodes || (p.steps ? [p.steps[0]?.from, ...p.steps.map((s) => s.to)] : []),
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

// The raw backend result plus the views every page reads (used for fresh analyses and for graphs reopened from the library).
export function adaptResult(res, text, source = null, link = null, title = null) {
  return {
    raw: res,
    text,
    source,
    link,
    title,
    sources: res.sources || [],
    summary: res.summary,
    llmNote: res.llm_note,
    view: toEventView(res, text, source, link),
    assetView: toAssetView(res),
    graphView: toGraphView(res),
    marketSectors: toMarketSectors(res),
    kbGuard: res.kb_guard || null,
    context: res.context || null,
    hypothesis: res.hypothesis || null,
    contextOnly: res.context_only || null, // {focus, reason}: a context graph, no impact claimed
    emptyReason: res.empty_reason || null,
    emptyHint: res.empty_hint || null,
    input: res.input || null,
    noEvent: !(res.paths && res.paths.length) && !res.context_only,
  };
}

// A raw result without sparklines (large, and not needed by the library), for importing browser history.
export function slimResult(raw) {
  const out = { ...raw };
  delete out.sparks;
  ['assets', 'sectors', 'variables'].forEach((k) => {
    if (Array.isArray(out[k])) out[k] = out[k].map(({ spark, ...rest }) => rest);
  });
  return out;
}

// ---- API ---------------------------------------------------------------------------------------------
export const api = {
  getStatus: () => request('/api/status'),
  getSamples: () => request('/api/samples'),
  getMarket: (refresh = false) => request(`/api/market${refresh ? '?refresh=true' : ''}`),
  getEvents: (limit = 8) => request(`/api/events?limit=${limit}`),
  getGraph: () => request('/api/graph'),
  resetGraph: () => request('/api/reset', { method: 'POST' }),
  getAnalogs: (nodeId, shockPct = 5.0, live = false) =>
    request(`/api/analogs?node_id=${encodeURIComponent(nodeId)}&shock_pct=${shockPct}&live=${live}`),
  getForecast: (nodeId, shockPct = 0.0, horizon = 30, live = false) =>
    request(`/api/forecast?node_id=${encodeURIComponent(nodeId)}&shock_pct=${shockPct}&horizon=${horizon}&live=${live}`),

  // live quotes (Yahoo Finance via yfinance on the backend)
  getQuotes: (symbols) => request(`/api/quotes?symbols=${encodeURIComponent(symbols.join(','))}`),
  getWatchlist: () => request('/api/watchlist'),
  addWatch: (symbol) => request('/api/watchlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol }) }),
  removeWatch: (symbol) => request(`/api/watchlist/${encodeURIComponent(symbol)}`, { method: 'DELETE' }),

  // dynamic knowledge base
  getKb: () => request('/api/kb'),
  setKbMode: (mode) => request('/api/kb/mode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }) }),
  revertKb: (to) => request('/api/kb/revert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to }) }),
  addAsset: (ticker, name, sector) =>
    request('/api/kb/asset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticker, name: name || null, sector: sector || null }) }),
  removeAsset: (id) => request(`/api/kb/asset/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  updateEdge: (source, target, weight) =>
    request('/api/kb/edge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, target, weight }),
    }),

  // knowledge-graph assistant (read only) and the graph's change history
  askAssistant: (question, history) =>
    request('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, history: history || [] }),
    }),
  getNode: (id) => request(`/api/node/${encodeURIComponent(id)}`),
  getKbHistory: (limit = 50, offset = 0) => request(`/api/kb/history?limit=${limit}&offset=${offset}`),
  getKbHistoryEntry: (seq) => request(`/api/kb/history/${seq}`),
  restoreKbVersion: (version, reason) =>
    request('/api/kb/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version, reason: reason || null }),
    }),
  exportKb: () => request('/api/kb/export'),

  // portfolio contagion & optimal hedge finder
  getPortfolioPresets: () => request('/api/portfolio/presets'),
  getPortfolioHedge: (body) =>
    request('/api/portfolio/hedge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    }),

  // Returns the raw backend result plus adapted views for the pages. Throws on any failure.
  async analyze(text, live = prefs.getLive(), source = null, link = null, title = null) {
    const res = await request('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, live, use_llm: true, link: link || null, title: title || null, full_text: !!link && prefs.getFullText() }),
    });
    return adaptResult(res, text, source, link, title);
  },

  // the analysis library: every graph the generator produced, kept on the backend for the KG assistant and the chat history
  listAnalyses: (limit = 100) => request(`/api/analyses?limit=${limit}`),
  getAnalysis: (id) => request(`/api/analyses/${encodeURIComponent(id)}`),
  deleteAnalysis: (id) => request(`/api/analyses/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  importAnalyses: (items) =>
    request('/api/analyses/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    }),

  whatIf: (trigger, magnitudePct, horizonDays, live = prefs.getLive(), shocks = null) =>
    request('/api/whatif', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trigger: trigger || 'crude_oil',
        magnitude_pct: typeof magnitudePct === 'number' ? magnitudePct : 0.0,
        horizon_days: horizonDays,
        live,
        shocks: shocks && shocks.length ? shocks : undefined,
      }),
    }),
};

export const HORIZON_DAYS = { '1 Week': 7, '1 Month': 30, '3 Months': 90, '6 Months': 180 };
