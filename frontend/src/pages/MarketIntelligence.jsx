import React from 'react';
import { ArrowUpRight, ArrowDownRight, ChevronRight, Zap, Sparkles } from 'lucide-react';
import Sparkline from '../components/common/Sparkline';
import { MOCK_DATA } from '../services/api';

export default function MarketIntelligence({
  activeEventText,
  analysisData,
  onSelectEvent,
  onNavigateToTab,
}) {
  const { tickers, events, sectors } = MOCK_DATA;

  const shockOrigin =
    analysisData?.extractedEntities?.commodities?.[0] ||
    analysisData?.extractedEntities?.companies?.[0] ||
    'Origin Shock';

  const shockTarget =
    analysisData?.extractedEntities?.sectors?.[0] ||
    'Target Assets';

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
        <p className="page-subtitle">Real-time insights. Connected markets. Smarter decisions.</p>
      </div>

      {/* 5 Tickers Row */}
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
            <Sparkline data={t.sparkline} isPositive={t.isPositive} width={160} height={38} />
          </div>
        ))}
      </div>

      {/* Main Grid: Events & Sector Impacts */}
      <div className="market-grid">
        {/* Left Column: Latest Financial Events */}
        <div className="card">
          <div className="card-title">
            <span>Latest Financial Events</span>
            <button className="btn btn-sm btn-outline">View All</button>
          </div>

          <div className="events-list">
            {events.map((ev) => (
              <div
                key={ev.id}
                className="event-item-row"
                onClick={() => onSelectEvent && onSelectEvent(ev.text)}
                title="Click to analyze event"
              >
                <div className="event-item-left">
                  <span className="event-time">{ev.time}</span>
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
                <div className="analysis-date">Apr 25, 09:12 AM</div>
              </div>
              <span className="badge badge-black">
                {analysisData?.details?.magnitude || 'High Impact'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
