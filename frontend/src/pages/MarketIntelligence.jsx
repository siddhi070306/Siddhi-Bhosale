import React, { useState, useEffect } from 'react';
import { ArrowUpRight, ArrowDownRight, ChevronRight, Zap, Plus, X } from 'lucide-react';
import SourceTag, { StreamChip } from '../components/common/SourceTag';
import { useLiveQuotes, fmtPrice, fmtPct } from '../context/useLiveQuotes';
import Sparkline from '../components/common/Sparkline';
import { api } from '../services/api';
import { useUi } from '../context/UiContext';

const fmtTime = (t) => {
  const d = t ? new Date(t) : null;
  return d && !isNaN(d) ? d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
};

export default function MarketIntelligence({
  activeEventText,
  analysis,
  onSelectEvent,
  onNavigateToTab,
}) {
  const [market, setMarket] = useState({ loading: true, tickers: [], error: null });
  const [events, setEvents] = useState({ loading: true, items: [], error: null });
  const { search, refreshTick } = useUi();
  const [limit, setLimit] = useState(8);
  // refreshTick > 0 means the header refresh button was pressed: bypass the server-side cache
  useEffect(() => {
    api.getMarket(refreshTick > 0).then((m) => setMarket({ loading: false, tickers: m.tickers || [], error: m.available ? null : m.note || 'Market data unavailable' }))
      .catch((e) => setMarket({ loading: false, tickers: [], error: e.message }));
  }, [refreshTick]);
  useEffect(() => {
    setEvents((prev) => ({ ...prev, loading: true }));
    api.getEvents(limit).then((items) => setEvents({ loading: false, items, error: items.length ? null : 'No headlines reachable.' }))
      .catch((e) => setEvents({ loading: false, items: [], error: e.message }));
  }, [refreshTick, limit]);
  // user watchlist: any Yahoo Finance ticker, live
  const [watch, setWatch] = useState([]);
  const [watchInput, setWatchInput] = useState('');
  const [watchMsg, setWatchMsg] = useState(null);
  const [watchBusy, setWatchBusy] = useState(false);
  useEffect(() => {
    api.getWatchlist().then((w) => setWatch(w.symbols || [])).catch((e) => setWatchMsg(e.message));
  }, []);
  const liveWatch = useLiveQuotes(watch);
  const addWatch = async (e) => {
    e.preventDefault();
    const sym = watchInput.trim().toUpperCase();
    if (!sym || watchBusy) return;
    setWatchBusy(true);
    setWatchMsg(null);
    try {
      const r = await api.addWatch(sym);
      setWatch((w) => [...w, r.symbol]);
      setWatchInput('');
    } catch (err) {
      setWatchMsg(err.message);
    }
    setWatchBusy(false);
  };
  const removeWatch = async (sym) => {
    try {
      await api.removeWatch(sym);
      setWatch((w) => w.filter((x) => x !== sym));
    } catch (err) {
      setWatchMsg(err.message);
    }
  };

  const q = (search || '').trim().toLowerCase();
  const visibleEvents = events.items.filter((ev) => !q || ev.title.toLowerCase().includes(q) || (ev.category || '').toLowerCase().includes(q));
  const tickers = market.tickers;
  const sectors = (analysis && analysis.marketSectors) || [];
  const analysisData = analysis && analysis.view;

  const shockOrigin =
    analysisData?.extractedEntities?.commodities?.[0] ||
    analysisData?.extractedEntities?.companies?.[0] ||
    'No analysis yet';

  const shockTarget =
    analysisData?.extractedEntities?.sectors?.[0] ||
    '–';

  return (
    <div>
      {/* Active Shock Banner Generated from Chat */}
      {activeEventText && (
        <div
          className="card"
          style={{
            marginBottom: 20,
            backgroundColor: '#ffffff',
            borderLeft: '4px solid #18181b',
            padding: '14px 18px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11.5,
                fontWeight: 700,
                color: '#18181b',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              <Zap size={14} fill="#18181b" />
              <span>Active Shock Analyzed from Chat</span>
              <span className="badge badge-positive" style={{ marginLeft: 6 }}>
                All Dashboards Generated
              </span>
            </div>
            <p style={{ fontSize: 13.5, color: '#27272a', fontStyle: 'italic', margin: '4px 0 0' }}>
              "{activeEventText}"
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-sm btn-outline"
              onClick={() => onNavigateToTab && onNavigateToTab('impact-graph')}
            >
              View Impact Graph →
            </button>
            <button
              className="btn btn-sm btn-outline"
              onClick={() => onNavigateToTab && onNavigateToTab('asset-impact')}
            >
              Affected Assets →
            </button>
            <button
              className="btn btn-sm btn-outline"
              onClick={() => onNavigateToTab && onNavigateToTab('chat')}
            >
              ← Back to Chat
            </button>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="page-header">
        <h1 className="page-title">Market Intelligence</h1>
        <p className="page-subtitle">Latest market levels (FRED), headlines, and the sectors your last analysis reached.</p>
      </div>

      {/* Macro levels: FRED daily closes */}
      <div style={{ fontSize: 12, fontWeight: 700, color: '#52525b', margin: '4px 0 8px' }}>
        Macro levels<SourceTag kind="fred" title="Official FRED daily series: last close, not intraday" /> <span style={{ fontWeight: 400 }}>daily close</span>
      </div>
      {/* 5 Tickers Row */}
      {market.loading && <p style={{ fontSize: 12.5, color: '#71717a' }}>Loading market data…</p>}
      {market.error && <p style={{ fontSize: 12.5, color: '#991b1b' }}>{market.error}</p>}
      <div className="tickers-row">
        {tickers.map((t) => (
          <div key={t.id} className="ticker-card">
            <div className="ticker-header">
              <span className="ticker-name">{t.name}</span>
              <span className={`ticker-change ${t.isPositive ? 'up' : 'down'}`}>
                {t.isPositive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                {t.change}
              </span>
            </div>
            <div className="ticker-price">{t.price}</div>
            <div style={{ fontSize: 10.5, color: '#a1a1aa', marginBottom: 2 }} title={t.source}>as of {t.asof}</div>
            <Sparkline data={t.sparkline} isPositive={t.isPositive} width={160} height={38} />
          </div>
        ))}
      </div>

      {/* My watchlist: live Yahoo Finance quotes */}
      <div className="card" style={{ marginBottom: 20, padding: '14px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#09090b' }}>My watchlist<SourceTag kind="live" title="Yahoo Finance via yfinance" /></div>
          <StreamChip state={watch.length ? liveWatch.state : 'connecting'} transport={liveWatch.transport} />
        </div>
        <form onSubmit={addWatch} style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <input className="header-search-input" style={{ width: 230 }} placeholder="Add a ticker (AAPL, TCS.NS, ^NSEI, BTC-USD…)" value={watchInput} onChange={(e) => setWatchInput(e.target.value)} maxLength={15} />
          <button className="btn btn-black" type="submit" disabled={watchBusy || !watchInput.trim()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} />
            <span>{watchBusy ? 'Checking…' : 'Add'}</span>
          </button>
        </form>
        {watchMsg && <p style={{ fontSize: 12.5, color: '#991b1b', marginBottom: 8 }}>{watchMsg}</p>}
        {watch.length === 0 && <p style={{ fontSize: 12.5, color: '#71717a' }}>No tickers yet. Add any symbol Yahoo Finance knows; it is verified before it is saved.</p>}
        <div className="tickers-row">
          {watch.map((sym) => {
            const qt = liveWatch.quotes[sym];
            const ok = qt && typeof qt.price === 'number';
            const up = ok && (qt.change_pct || 0) >= 0;
            return (
              <div key={sym} className="ticker-card" data-testid={`watch-${sym}`}>
                <div className="ticker-header">
                  <span className="ticker-name">{sym}</span>
                  <button title="Remove" onClick={() => removeWatch(sym)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#71717a' }}>
                    <X size={13} />
                  </button>
                </div>
                <div className="ticker-price">{ok ? fmtPrice(qt.price) : qt && qt.error ? 'n/a' : '…'}</div>
                {ok && (
                  <span className={`ticker-change ${up ? 'up' : 'down'}`}>
                    {up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                    {fmtPct(qt.change_pct)}
                    {qt.live_tick && <span title="live tick" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#16a34a', marginLeft: 6 }} />}
                  </span>
                )}
                <div style={{ fontSize: 10.5, color: qt && qt.error ? '#991b1b' : '#a1a1aa', marginTop: 4 }} title={qt ? qt.source : ''}>
                  {qt ? (qt.error && !ok ? qt.error : `as of ${qt.asof}${qt.error ? ' · refresh failed' : ''}`) : ''}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Grid: Events & Sector Impacts */}
      <div className="market-grid">
        {/* Left Column: Latest Financial Events */}
        <div className="card">
          <div className="card-title">
            <span>Latest Financial Events</span>
            <button className="btn btn-sm btn-outline" disabled={limit >= 30} onClick={() => setLimit(30)}>{limit >= 30 ? 'Showing 30' : 'View 30'}</button>
          </div>

          <div className="events-list">
            {events.loading && <p style={{ fontSize: 12.5, color: '#71717a' }}>Loading headlines…</p>}
            {events.error && <p style={{ fontSize: 12.5, color: '#991b1b' }}>{events.error}</p>}
            {events.items.length > 0 && visibleEvents.length === 0 && <p style={{ fontSize: 12.5, color: '#71717a' }}>No headline matches “{search}”.</p>}
            {visibleEvents.map((ev) => (
              <div
                key={ev.id}
                className="event-item-row"
                onClick={() => onSelectEvent && onSelectEvent(ev.text, ev.category, ev.link)}
                title="Click to analyze event"
              >
                <div className="event-item-left">
                  <span className="event-time">{fmtTime(ev.time)}</span>
                  <span className="event-title">{ev.title}</span>
                </div>
                <div className="event-item-right">
                  <span className="badge badge-subtle">{ev.category}</span>
                  <ChevronRight size={15} color="#71717a" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Affected Sectors & Recent Analyses */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Most Affected Sectors */}
          <div className="card">
            <div className="card-title">
              <span>Most Affected Sectors</span>
            </div>

            <div className="sector-bar-list">
              {sectors.length === 0 && <p style={{ fontSize: 12.5, color: '#71717a' }}>Analyse an event to see affected sectors.</p>}
              {sectors.map((sec) => (
                <div key={sec.name} className="sector-bar-row">
                  <span className="sector-label">{sec.name}</span>
                  <div className="sector-progress-bg">
                    <div
                      className="sector-progress-fill"
                      style={{
                        width: `${Math.abs(sec.value)}%`,
                        backgroundColor: sec.isPositive ? '#18181b' : '#71717a',
                      }}
                    ></div>
                  </div>
                  <span
                    className="sector-val"
                    style={{ color: sec.isPositive ? '#166534' : '#991b1b' }}
                  >
                    {sec.change}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Impact Analyses */}
          <div className="card">
            <div className="card-title">
              <span>Recent Impact Analyses</span>
              <button
                className="btn btn-sm btn-outline"
                onClick={() => onNavigateToTab && onNavigateToTab('impact-graph')}
              >
                View Graph
              </button>
            </div>

            <div className="recent-analysis-card">
              <div>
                <div className="analysis-flow">
                  <span>{shockOrigin}</span>
                  <span>→</span>
                  <span>{shockTarget}</span>
                </div>
                <div className="analysis-date">{analysis ? new Date(analysis.at).toLocaleString() : 'No analysis yet'}</div>
              </div>
              <span className="badge badge-black">
                {analysisData?.details?.magnitude || 'n/a'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
