import React, { useState, useEffect } from 'react';
import { Search, ArrowUpRight, ArrowDownRight, Plus, X } from 'lucide-react';
import TrendChart from '../components/charts/TrendChart';
import ExposureHeatmap from '../components/charts/ExposureHeatmap';
import SourceTag, { StreamChip } from '../components/common/SourceTag';
import { useUi } from '../context/UiContext';
import { useLiveQuotes, fmtPrice, fmtPct } from '../context/useLiveQuotes';
import { api } from '../services/api';


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

export default function AssetImpact({ analysis, onNavigateToChat, onReanalyze }) {
  const { assets, topSectors, sectorRows } = (analysis && analysis.assetView) || { assets: [], topSectors: [], sectorRows: [] };
  const [filter, setFilter] = useState('All');
  const { search, setSearch } = useUi(); // shared with the header search box
  const [selectedAsset, setSelectedAsset] = useState(assets[0]);
  const live = useLiveQuotes(assets.map((a) => a.ticker));

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

  if (!analysis) return <EmptyState onNavigateToChat={onNavigateToChat} what="Affected assets" />;

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
      <div className="page-header">
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

        {/* Right Analytics: Trend Chart & Heatmap */}
        <div>
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
    </div>
  );
}
