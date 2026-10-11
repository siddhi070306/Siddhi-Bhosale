import React, { useState, useEffect, useCallback } from 'react';
import { Search, ArrowUpRight, ArrowDownRight, Plus, X, Sparkles, TrendingUp, History, LineChart, ExternalLink, FileText } from 'lucide-react';
import TrendChart from '../components/charts/TrendChart';
import ExposureHeatmap from '../components/charts/ExposureHeatmap';
import ExecutiveMemoModal from '../components/common/ExecutiveMemoModal';
import SourceTag, { StreamChip } from '../components/common/SourceTag';
import { useUi } from '../context/UiContext';
import { useLiveQuotes, fmtPrice, fmtPct } from '../context/useLiveQuotes';
import { api, toAssetView } from '../services/api';

function EmptyState({ onNavigateToChat, what }) {
  return (
    <div className="card" style={{ padding: 28, textAlign: 'center' }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#09090b', marginBottom: 6 }}>No analysis yet</div>
      <p style={{ fontSize: 13, color: '#71717a', marginBottom: 14 }}>{what} is built from a real analysis. Paste a news event in the AI Chat first.</p>
      {onNavigateToChat && <button className="btn btn-black" onClick={onNavigateToChat}>Open AI Chat</button>}
    </div>
  );
}

// Live price cell: market data from Yahoo Finance, not from the knowledge graph.
function LiveCell({ ticker, q }) {
  if (!ticker) return <span style={{ color: '#a1a1aa' }} title="No market ticker mapped to this node">–</span>;
  if (!q) return <span style={{ color: '#a1a1aa' }}>…</span>;
  if (typeof q.price !== 'number') return <span style={{ color: '#991b1b', fontSize: 11.5 }} title={q.error}>n/a</span>;
  const up = (q.change_pct || 0) >= 0;
  const stale = !q.live_tick && q.age_s > 120;
  return (
    <span title={`${ticker} · ${q.source} · as of ${q.asof}${q.error ? ` · refresh failed: ${q.error}` : ''}`} style={{ opacity: stale || q.error ? 0.6 : 1 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fmtPrice(q.price)}</span>{' '}
      <span style={{ fontSize: 11.5, fontWeight: 600, color: up ? '#166534' : '#991b1b' }}>{fmtPct(q.change_pct)}</span>
      {q.live_tick && <span title="live tick" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#16a34a', marginLeft: 5 }} />}
    </span>
  );
}

export default function AssetImpact({ analysis, onNavigateToChat, onReanalyze, onNavigateToTab }) {
  const [baselineView, setBaselineView] = useState(null);
  const [loadingBaseline, setLoadingBaseline] = useState(!analysis);

  useEffect(() => {
    if (!analysis && !baselineView) {
      setLoadingBaseline(true);
      api.whatIf('crude_oil', 5.0)
        .then((res) => {
          setBaselineView(toAssetView(res));
        })
        .catch(() => {
          api.getGraph()
            .then((g) => {
              const rawAssets = (g.nodes || [])
                .filter((n) => ['company', 'commodity', 'index', 'sector'].includes(n.type))
                .map((n) => ({
                  id: n.id,
                  name: n.label,
                  type: n.type === 'company' ? 'Stock' : n.type === 'commodity' ? 'Commodity' : n.type === 'index' ? 'Index' : 'Sector',
                  impact: 'Baseline',
                  isPositive: true,
                  exposure: '0.00',
                  confidence: '0.85',
                  ticker: n.ticker || null,
                  userAdded: !!n.user_added,
                }));
              setBaselineView({
                assets: rawAssets,
                topSectors: (g.nodes || []).filter((n) => n.type === 'sector').slice(0, 6).map((s) => ({
                  name: s.label,
                  val: '• Baseline',
                  positive: true,
                })),
                sectorRows: rawAssets.filter((a) => a.type === 'Sector'),
              });
            })
            .catch(() => {});
        })
        .finally(() => setLoadingBaseline(false));
    }
  }, [analysis, baselineView]);

  const activeView = (analysis && analysis.assetView) || baselineView || { assets: [], topSectors: [], sectorRows: [] };
  const { assets, topSectors, sectorRows } = activeView;
  const isBaseline = !analysis && !!baselineView;

  const [filter, setFilter] = useState('All');
  const { search, setSearch } = useUi(); // shared with the header search box
  const [selectedAsset, setSelectedAsset] = useState(null);

  useEffect(() => {
    if ((!selectedAsset || !assets.some((a) => a.id === selectedAsset.id)) && assets.length) {
      setSelectedAsset(assets[0]);
    }
  }, [assets, selectedAsset]);

  const live = useLiveQuotes(assets.map((a) => a.ticker));

  // Executive Memo modal
  const [showMemoModal, setShowMemoModal] = useState(false);

  // add-asset form
  const [sectors, setSectors] = useState([]);
  const [form, setForm] = useState({ ticker: '', name: '', sector: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    api.getGraph().then((g) => setSectors((g.nodes || []).filter((n) => n.type === 'sector'))).catch(() => {});
  }, []);

  const categories = ['All', 'Stocks', 'Indices', 'Commodities', 'Sectors'];

  const filteredAssets = assets.filter((a) => {
    const matchesCategory =
      filter === 'All' ||
      (filter === 'Stocks' && a.type === 'Stock') ||
      (filter === 'Indices' && a.type === 'Index') ||
      (filter === 'Commodities' && a.type === 'Commodity') ||
      (filter === 'Sectors' && a.type === 'Sector');

    const matchesSearch =
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.type.toLowerCase().includes(search.toLowerCase()) ||
      (a.ticker || '').toLowerCase().includes(search.toLowerCase());

    return matchesCategory && matchesSearch;
  });

  if (!analysis && !baselineView && loadingBaseline) {
    return (
      <div className="card" style={{ padding: 32, textAlign: 'center', color: '#71717a' }}>
        Loading monitored market assets…
      </div>
    );
  }

  if (!analysis && !baselineView) return <EmptyState onNavigateToChat={onNavigateToChat} what="Affected assets" />;

  const addAsset = async (e) => {
    e.preventDefault();
    if (!form.ticker.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.addAsset(form.ticker.trim(), form.name.trim(), form.sector);
      setMsg({
        ok: true,
        text: r.linked
          ? `Added ${r.label} (${r.ticker}) under ${r.sector_label} (${r.sector_source}). Knowledge-base guard: v${r.guard.version}, all checks passed. Re-running the analysis to include it…`
          : `Added ${r.label} (${r.ticker}) for live prices only. ${r.note}`,
      });
      setForm({ ticker: '', name: '', sector: '' });
      if (r.linked && onReanalyze) await onReanalyze(`Added ${r.label} (${r.ticker}) under ${r.sector_label} (${r.sector_source}). Knowledge-base guard: v${r.guard.version}, all checks passed.`);
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    }
    setBusy(false);
  };

  const removeAsset = async (a) => {
    try {
      await api.removeAsset(a.id);
      if (onReanalyze) await onReanalyze(`Removed ${a.name} from the graph.`);
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    }
  };

  return (
    <div>
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title">Potentially Affected Assets</h1>
          <p className="page-subtitle">
            Model-estimated impact from the knowledge graph, next to live market prices.
          </p>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginTop: 6, fontSize: 11.5, color: '#52525b' }}>
            <span><SourceTag kind="live" /> Yahoo Finance price and day change</span>
            <span><SourceTag kind="model" /> estimated by the knowledge graph from the article (not a forecast)</span>
            <StreamChip state={live.state} transport={live.transport} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
          <button
            className="btn btn-black"
            style={{ fontSize: 12, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 5 }}
            onClick={() => setShowMemoModal(true)}
          >
            <FileText size={13} />
            <span>Export Memo</span>
          </button>

          {onNavigateToTab && (
            <>
              <button
                className="btn btn-outline"
                style={{ fontSize: 12, padding: '5px 12px' }}
                onClick={() => onNavigateToTab('impact-graph')}
              >
                Explore Impact Graph →
              </button>
              <button
                className="btn btn-outline"
                style={{ fontSize: 12, padding: '5px 12px' }}
                onClick={() => onNavigateToTab('scenario-simulator')}
              >
                Open Simulator →
              </button>
            </>
          )}
        </div>
      </div>

      {/* Baseline Knowledge Graph Banner */}
      {isBaseline && (
        <div
          className="card"
          style={{
            marginBottom: 18,
            padding: '12px 18px',
            backgroundColor: '#ffffff',
            border: '1px solid #e4e4e7',
            borderLeft: '4px solid #18181b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ display: 'inline-flex', padding: 6, borderRadius: '50%', background: '#f4f4f5', color: '#18181b' }}>
              <Sparkles size={16} />
            </span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#09090b' }}>
                Monitored Knowledge Graph Assets & Live Market Data
              </div>
              <div style={{ fontSize: 12, color: '#71717a' }}>
                Displaying baseline graph assets with live Yahoo Finance prices. Enter news in AI Chat to calculate event-specific causal impact.
              </div>
            </div>
          </div>
          {onNavigateToChat && (
            <button className="btn btn-black" onClick={onNavigateToChat} style={{ fontSize: 12, padding: '7px 14px' }}>
              Analyze News in Chat
            </button>
          )}
        </div>
      )}

      {/* Search and Filters Bar */}
      <div className="asset-filters-bar">
        <div style={{ position: 'relative', width: '100%', maxWidth: 340 }}>
          <Search
            size={14}
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#71717a' }}
          />
          <input
            type="text"
            className="header-search-input"
            placeholder="Search assets, sectors, or symbols..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="filter-pills">
          {categories.map((cat) => (
            <button
              key={cat}
              className={`filter-pill ${filter === cat ? 'active' : ''}`}
              onClick={() => setFilter(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Add an asset to the graph */}
      <form className="card" onSubmit={addAsset} style={{ padding: '14px 18px', marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#09090b', marginBottom: 8 }}>Add an asset to the graph</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="header-search-input" style={{ width: 200 }} placeholder="Ticker, e.g. MPC" value={form.ticker} onChange={(e) => setForm({ ...form, ticker: e.target.value })} maxLength={15} />
          <input className="header-search-input" style={{ width: 190 }} placeholder="Name (optional)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={60} />
          <select className="form-select" style={{ width: 220 }} value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })}>
            <option value="">Sector: let the LLM suggest</option>
            {sectors.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          <button className="btn btn-black" type="submit" disabled={busy || !form.ticker.trim()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} />
            <span>{busy ? 'Checking Yahoo…' : 'Add asset'}</span>
          </button>
        </div>
        <div style={{ fontSize: 11.5, color: '#71717a', marginTop: 8 }}>
          The ticker is checked against Yahoo Finance first. It joins the graph as a low-confidence, user-added link from its sector; the data check and the knowledge-base guard decide how much it counts.
        </div>
        {msg && <div style={{ fontSize: 12.5, marginTop: 8, color: msg.ok ? '#166534' : '#991b1b' }}>{msg.text}</div>}
      </form>

      {/* Main Grid: Data Table & Right Analytics */}
      <div className="asset-dashboard-grid">
        {/* Table of Assets */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Price · day<SourceTag kind="live" title="Yahoo Finance" /></th>
                  <th>Sensitivity<SourceTag kind="model" title="Knowledge graph" /></th>
                  <th>Exposure<SourceTag kind="model" title="Knowledge graph" /></th>
                  <th>Confidence<SourceTag kind="model" title="Knowledge graph" /></th>
                </tr>
              </thead>
              <tbody>
                {filteredAssets.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedAsset(item)}
                    style={{
                      cursor: 'pointer',
                      backgroundColor: selectedAsset?.id === item.id ? '#f4f4f5' : 'transparent',
                    }}
                  >
                    <td style={{ fontWeight: 600 }}>
                      {item.name}
                      {item.ticker && <span style={{ fontWeight: 400, color: '#a1a1aa', fontSize: 11, marginLeft: 6 }}>{item.ticker}</span>}
                      <div style={{ fontWeight: 400, fontSize: 11, color: '#71717a' }}>{item.type}</div>
                      {item.userAdded && (
                        <>
                          <span className="badge badge-subtle" style={{ marginLeft: 6, fontSize: 9.5 }}>added</span>
                          <button
                            title="Remove this asset from the graph"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeAsset(item);
                            }}
                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#71717a', marginLeft: 4, verticalAlign: 'middle' }}
                          >
                            <X size={12} />
                          </button>
                        </>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <LiveCell ticker={item.ticker} q={live.quotes[item.ticker]} />
                    </td>
                    <td>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 2,
                          fontWeight: 600,
                          color: item.isPositive ? '#166534' : '#991b1b',
                        }}
                      >
                        {item.isPositive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                        {item.impact.replace(' sensitivity', '')}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12.5px' }}>
                      {item.exposure}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12.5px' }}>
                      {item.confidence}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Analytics: Chart panel + Heatmap */}
        <div>
          {/* Header & Direct Navigation to Econometrics Full Page */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: '#ffffff',
                  padding: '5px 11px',
                  background: '#09090b',
                  borderRadius: 6,
                }}
              >
                <TrendingUp size={13} />
                <span>Price Trend</span>
              </div>

              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => {
                  if (onNavigateToTab) {
                    onNavigateToTab('econometrics', selectedAsset?.id, 'analogs');
                  }
                }}
                title={`Open full page Historical Shock Analogs for ${selectedAsset?.name || 'selected asset'}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 11.5,
                  background: '#ffffff',
                  borderColor: '#e4e4e7',
                  color: '#18181b',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                }}
              >
                <History size={13} />
                <span>Historical Analogs</span>
                <ExternalLink size={11} style={{ opacity: 0.6 }} />
              </button>

              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => {
                  if (onNavigateToTab) {
                    onNavigateToTab('econometrics', selectedAsset?.id, 'forecast');
                  }
                }}
                title={`Open full page Monte Carlo Forecast for ${selectedAsset?.name || 'selected asset'}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 11.5,
                  background: '#ffffff',
                  borderColor: '#e4e4e7',
                  color: '#18181b',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                }}
              >
                <LineChart size={13} />
                <span>Monte Carlo Forecast</span>
                <ExternalLink size={11} style={{ opacity: 0.6 }} />
              </button>
            </div>
          </div>

          {selectedAsset && selectedAsset.tierSentence && (
            <div
              data-testid="tier-sentence"
              style={{ margin: '0 0 10px', padding: '8px 12px', background: '#fafafa', border: '1px solid #f4f4f5', borderRadius: 8, fontSize: 12.5, lineHeight: 1.5, color: '#27272a' }}
            >
              <span style={{ fontWeight: 700, color: '#18181b' }}>Why {selectedAsset.name}: </span>
              {selectedAsset.tierSentence}
              <span style={{ display: 'block', fontSize: 11, color: '#71717a', marginTop: 2 }}>
                The strongest chain the graph found, read tier by tier (event, variable, sector, asset).
              </span>
            </div>
          )}
          <TrendChart name={selectedAsset?.name} spark={selectedAsset?.spark} />
          <ExposureHeatmap sectors={sectorRows} />
        </div>
      </div>

      {/* Bottom: Top Affected Sectors */}
      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#09090b', marginBottom: 10 }}>
          Top Affected Sectors<SourceTag kind="model" />
        </div>

        <div className="top-sectors-strip">
          {topSectors.map((sec) => (
            <div key={sec.name} className="sector-tile">
              <span className="sector-tile-name">{sec.name}</span>
              <span
                className="sector-tile-val"
                style={{ color: sec.positive ? '#166534' : '#991b1b' }}
              >
                {sec.val}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Feature 3: Executive Memo Modal */}
      <ExecutiveMemoModal
        isOpen={showMemoModal}
        onClose={() => setShowMemoModal(false)}
        analysis={analysis}
      />
    </div>
  );
}
