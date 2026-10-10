import React, { useState } from 'react';
import { Search, ArrowUpRight, ArrowDownRight, Layers, PieChart } from 'lucide-react';
import TrendChart from '../components/charts/TrendChart';
import ExposureHeatmap from '../components/charts/ExposureHeatmap';


function EmptyState({ onNavigateToChat, what }) {
  return (
    <div className="card" style={{ padding: 28, textAlign: 'center' }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#09090b', marginBottom: 6 }}>No analysis yet</div>
      <p style={{ fontSize: 13, color: '#71717a', marginBottom: 14 }}>{what} is built from a real analysis. Paste a news event in the AI Chat first.</p>
      {onNavigateToChat && <button className="btn btn-black" onClick={onNavigateToChat}>Open AI Chat</button>}
    </div>
  );
}

export default function AssetImpact({ analysis, onNavigateToChat }) {
  const { assets, topSectors, sectorRows } = (analysis && analysis.assetView) || { assets: [], topSectors: [], sectorRows: [] };
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [selectedAsset, setSelectedAsset] = useState(assets[0]);

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
      a.type.toLowerCase().includes(search.toLowerCase());

    return matchesCategory && matchesSearch;
  });

  if (!analysis) return <EmptyState onNavigateToChat={onNavigateToChat} what="Affected assets" />;

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <h1 className="page-title">Potentially Affected Assets</h1>
        <p className="page-subtitle">
          View assets with estimated impact, exposure score and supporting evidence.
        </p>
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

      {/* Main Grid: Data Table & Right Analytics */}
      <div className="asset-dashboard-grid">
        {/* Table of Assets */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Type</th>
                  <th>Impact</th>
                  <th>Exposure</th>
                  <th>Confidence</th>
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
                    <td style={{ fontWeight: 600 }}>{item.name}</td>
                    <td>
                      <span className="badge badge-subtle">{item.type}</span>
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
                        {item.impact}
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
          Top Affected Sectors
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
