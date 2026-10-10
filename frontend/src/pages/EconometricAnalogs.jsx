import React, { useState, useEffect, useCallback } from 'react';
import {
  History,
  LineChart,
  TrendingUp,
  ArrowLeft,
  RefreshCw,
  Sliders,
  Calendar,
  AlertTriangle,
  ExternalLink,
  ChevronRight,
  Info,
  FileText,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../services/api';
import AnalogChart from '../components/charts/AnalogChart';
import ForecastChart from '../components/charts/ForecastChart';
import ExecutiveMemoModal from '../components/common/ExecutiveMemoModal';

export default function EconometricAnalogs({
  analysis,
  initialAssetId,
  initialMode = 'analogs',
  onNavigateToTab,
}) {
  const [nodes, setNodes] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(initialAssetId || 'crude_oil');
  const [viewMode, setViewMode] = useState(initialMode || 'analogs'); // 'analogs' | 'forecast' | 'both'
  const [showMemoModal, setShowMemoModal] = useState(false);

  useEffect(() => {
    if (initialMode) {
      setViewMode(initialMode);
    }
  }, [initialMode]);

  useEffect(() => {
    if (initialAssetId) {
      setSelectedNodeId(initialAssetId);
    }
  }, [initialAssetId]);

  // Analogs state
  const [analogData, setAnalogData] = useState(null);
  const [analogLoading, setAnalogLoading] = useState(false);
  const [analogError, setAnalogError] = useState(null);
  const [shockThreshold, setShockThreshold] = useState(5.0);
  const [selectedAnalogIdx, setSelectedAnalogIdx] = useState(null);

  // Forecast state
  const [forecastData, setForecastData] = useState(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastError, setForecastError] = useState(null);
  const [forecastHorizon, setForecastHorizon] = useState(30);
  const [forecastShock, setForecastShock] = useState(5.0);

  // Load available assets from knowledge graph
  useEffect(() => {
    api.getGraph()
      .then((g) => {
        const raw = (g.nodes || [])
          .filter((n) => ['commodity', 'company', 'index', 'sector'].includes(n.type))
          .map((n) => ({
            id: n.id,
            label: n.label,
            type: n.type,
            ticker: n.ticker || null,
          }));
        setNodes(raw);
        if (initialAssetId && raw.some((r) => r.id === initialAssetId)) {
          setSelectedNodeId(initialAssetId);
        } else if (raw.length > 0 && !raw.some((r) => r.id === selectedNodeId)) {
          setSelectedNodeId(raw[0].id);
        }
      })
      .catch(() => {});
  }, [initialAssetId]);

  // Fetch Analogs
  const fetchAnalogs = useCallback(async (nodeId, threshold) => {
    if (!nodeId) return;
    setAnalogLoading(true);
    setAnalogError(null);
    try {
      const d = await api.getAnalogs(nodeId, threshold, true);
      setAnalogData(d);
    } catch (e) {
      setAnalogError(e.message);
    } finally {
      setAnalogLoading(false);
    }
  }, []);

  // Fetch Forecast
  const fetchForecast = useCallback(async (nodeId, shock, horizon) => {
    if (!nodeId) return;
    setForecastLoading(true);
    setForecastError(null);
    try {
      const d = await api.getForecast(nodeId, shock, horizon, true);
      setForecastData(d);
    } catch (e) {
      setForecastError(e.message);
    } finally {
      setForecastLoading(false);
    }
  }, []);

  // Sync on node change
  useEffect(() => {
    fetchAnalogs(selectedNodeId, shockThreshold);
    fetchForecast(selectedNodeId, forecastShock, forecastHorizon);
  }, [selectedNodeId, fetchAnalogs, fetchForecast]);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || { id: selectedNodeId, label: selectedNodeId };

  // Calculate quantitative statistics across analogs
  const analogStats = React.useMemo(() => {
    if (!analogData || !analogData.analogs || analogData.analogs.length === 0) return null;
    const items = analogData.analogs;
    const count = items.length;

    const d30Moves = items.map((a) => {
      const v = a.values[30] !== undefined ? a.values[30] : a.values[a.values.length - 1];
      return v - 100.0;
    }).sort((a, b) => a - b);
    const medianD30 = d30Moves[Math.floor(d30Moves.length / 2)] || 0;

    const d90Moves = items.map((a) => {
      const v = a.values[a.values.length - 1];
      return v - 100.0;
    }).sort((a, b) => a - b);
    const medianD90 = d90Moves[Math.floor(d90Moves.length / 2)] || 0;

    const positiveCount = items.filter((a) => a.values[a.values.length - 1] >= 100.0).length;
    const winRate = Math.round((positiveCount / count) * 100);

    const drawdowns = items.map((a) => Math.min(...a.values) - 100.0);
    const worstDrawdown = Math.min(...drawdowns);
    const avgShock = items.reduce((acc, a) => acc + Math.abs(a.shock_pct), 0) / count;

    return {
      count,
      medianD30: medianD30.toFixed(1),
      medianD90: medianD90.toFixed(1),
      winRate,
      positiveCount,
      worstDrawdown: worstDrawdown.toFixed(1),
      avgShock: avgShock.toFixed(1),
    };
  }, [analogData]);

  return (
    <div className="econometric-page" style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 40 }}>
      {/* Top Header & Breadcrumb */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <button
              className="btn btn-outline"
              style={{ padding: '5px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}
              onClick={() => onNavigateToTab && onNavigateToTab('asset-impact')}
            >
              <ArrowLeft size={13} />
              <span>Back to Asset Impact</span>
            </button>
            <span style={{ color: '#a1a1aa' }}>/</span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#71717a' }}>Time-Series Econometrics</span>
          </div>
          <h1 className="page-title" style={{ fontSize: 22, fontWeight: 700, margin: '4px 0 2px 0' }}>
            Historical Analogs & Monte Carlo Forecaster
          </h1>
          <p className="page-subtitle" style={{ fontSize: 13, color: '#71717a', margin: 0 }}>
            Empirical multi-year shock alignment and calibrated stochastic forward simulations.
          </p>
        </div>

        {/* View mode toggle */}
        <div style={{ display: 'flex', background: '#f4f4f5', borderRadius: 8, padding: 3, gap: 3 }}>
          <button
            className={`btn btn-sm ${viewMode === 'analogs' ? 'btn-black' : 'btn-outline'}`}
            style={{ border: 'none', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => setViewMode('analogs')}
          >
            <History size={14} />
            <span>Historical Analogs</span>
          </button>
          <button
            className={`btn btn-sm ${viewMode === 'forecast' ? 'btn-black' : 'btn-outline'}`}
            style={{ border: 'none', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => setViewMode('forecast')}
          >
            <LineChart size={14} />
            <span>Monte Carlo Forecast</span>
          </button>
          <button
            className={`btn btn-sm ${viewMode === 'both' ? 'btn-black' : 'btn-outline'}`}
            style={{ border: 'none', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => setViewMode('both')}
          >
            <Sliders size={14} />
            <span>Side-by-Side</span>
          </button>
        </div>

        <button
          className="btn btn-black btn-sm"
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '7px 14px' }}
          onClick={() => setShowMemoModal(true)}
        >
          <FileText size={14} />
          <span>Export Investment Memo</span>
        </button>
      </div>

      {/* Asset Selection Bar */}
      <div className="card" style={{ padding: '14px 18px', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#09090b' }}>Select Asset:</span>
            <select
              className="form-select"
              style={{ minWidth: 240, fontWeight: 600 }}
              value={selectedNodeId}
              onChange={(e) => setSelectedNodeId(e.target.value)}
            >
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label} {n.ticker ? `(${n.ticker})` : ''} — {n.type}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              className="btn btn-outline btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
              onClick={() => {
                fetchAnalogs(selectedNodeId, shockThreshold);
                fetchForecast(selectedNodeId, forecastShock, forecastHorizon);
              }}
            >
              <RefreshCw size={13} className={analogLoading || forecastLoading ? 'spin' : ''} />
              <span>Refresh Data</span>
            </button>
          </div>
        </div>

        {/* Quick select pills */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12, paddingTop: 10, borderTop: '1px solid #f4f4f5' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#71717a', alignSelf: 'center', marginRight: 4 }}>Quick Assets:</span>
          {nodes.slice(0, 8).map((n) => (
            <button
              key={n.id}
              className={`filter-pill ${selectedNodeId === n.id ? 'active' : ''}`}
              style={{ fontSize: 11.5, padding: '3px 10px' }}
              onClick={() => setSelectedNodeId(n.id)}
            >
              {n.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: viewMode === 'both' ? '1fr 1fr' : '1fr', gap: 20 }}>
        {/* Section 1: Historical Analogs */}
        {(viewMode === 'analogs' || viewMode === 'both') && (
          <div className="card" style={{ padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <History size={18} color="#2563eb" />
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#09090b' }}>
                    Historical Shock Analogs ({selectedNode.label})
                  </span>
                </div>
                <p style={{ fontSize: 12.5, color: '#71717a', margin: '4px 0 0 0' }}>
                  Scans 2+ years of FRED and Yahoo Finance daily OHLC data for prior moves of similar magnitude, rebased to 100 at D+0.
                </p>
              </div>

              {/* Threshold Controller */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: 6, padding: '4px 8px' }}>
                <span style={{ fontSize: 11.5, color: '#71717a' }}>Shock Min:</span>
                <select
                  style={{ border: 'none', background: 'transparent', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  value={shockThreshold}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setShockThreshold(val);
                    fetchAnalogs(selectedNodeId, val);
                  }}
                >
                  <option value={3.0}>±3% move</option>
                  <option value={5.0}>±5% move</option>
                  <option value={8.0}>±8% move</option>
                  <option value={12.0}>±12% move</option>
                </select>
              </div>
            </div>

            {/* Top KPI Metric Summary Strip */}
            {analogStats && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 16 }}>
                <div style={{ background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Matched Episodes
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#09090b', marginTop: 2 }}>
                    {analogStats.count} Prior Shocks
                  </div>
                  <div style={{ fontSize: 11, color: '#a1a1aa', marginTop: 1 }}>
                    Avg initial move: ±{analogStats.avgShock}%
                  </div>
                </div>

                <div style={{ background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Median D+30 Move
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: parseFloat(analogStats.medianD30) >= 0 ? '#166534' : '#991b1b', marginTop: 2 }}>
                    {parseFloat(analogStats.medianD30) >= 0 ? '+' : ''}{analogStats.medianD30}%
                  </div>
                  <div style={{ fontSize: 11, color: '#a1a1aa', marginTop: 1 }}>
                    Post-shock 1-month trajectory
                  </div>
                </div>

                <div style={{ background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Median D+90 Terminal
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: parseFloat(analogStats.medianD90) >= 0 ? '#166534' : '#991b1b', marginTop: 2 }}>
                    {parseFloat(analogStats.medianD90) >= 0 ? '+' : ''}{analogStats.medianD90}%
                  </div>
                  <div style={{ fontSize: 11, color: '#a1a1aa', marginTop: 1 }}>
                    90-day normalized return
                  </div>
                </div>

                <div style={{ background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Rebound Probability
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: analogStats.winRate >= 50 ? '#166534' : '#991b1b', marginTop: 2 }}>
                    {analogStats.winRate}% Rebounded
                  </div>
                  <div style={{ fontSize: 11, color: '#a1a1aa', marginTop: 1 }}>
                    {analogStats.positiveCount} of {analogStats.count} periods positive
                  </div>
                </div>
              </div>
            )}

            {/* Interactive High-Definition Analog Chart */}
            <div style={{ marginTop: 10 }}>
              <AnalogChart
                data={analogData}
                loading={analogLoading}
                error={analogError}
                name={selectedNode.label}
                isFullPage={viewMode !== 'both'}
                selectedAnalog={selectedAnalogIdx}
                onSelectAnalog={setSelectedAnalogIdx}
              />
            </div>

            {/* Breakdown table of detected analogs */}
            {analogData && analogData.analogs && analogData.analogs.length > 0 && (
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #f4f4f5' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: '#09090b' }}>
                      Historical Episode Breakdown
                    </div>
                    <div style={{ fontSize: 11.5, color: '#71717a' }}>
                      Hover or click any row to isolate the analog trajectory on the chart above.
                    </div>
                  </div>
                  {selectedAnalogIdx !== null && (
                    <button
                      className="btn btn-sm btn-outline"
                      style={{ fontSize: 11, padding: '2px 8px' }}
                      onClick={() => setSelectedAnalogIdx(null)}
                    >
                      Reset Isolation
                    </button>
                  )}
                </div>

                <div className="table-responsive">
                  <table className="data-table" style={{ fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th>Historical Shock Episode</th>
                        <th>Date</th>
                        <th>Initial Shock</th>
                        <th>D+30 Return</th>
                        <th>D+60 Return</th>
                        <th>D+89 Terminal</th>
                        <th>Max Drawdown</th>
                        <th>Pattern Outcome</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analogData.analogs.map((a, i) => {
                        const finalVal = a.values[a.values.length - 1];
                        const netMove = finalVal ? finalVal - 100 : 0;
                        const d30Val = a.values[30] !== undefined ? a.values[30] - 100 : netMove;
                        const d60Val = a.values[60] !== undefined ? a.values[60] - 100 : netMove;
                        const minVal = Math.min(...a.values) - 100;
                        const isSelected = selectedAnalogIdx === i;

                        // Classification
                        let outcomeTag = 'Mean Reversion';
                        let outcomeColor = '#166534';
                        if (netMove > 15) { outcomeTag = 'Strong Bull Expansion'; outcomeColor = '#15803d'; }
                        else if (netMove < -10) { outcomeTag = 'Extended Downtrend'; outcomeColor = '#991b1b'; }
                        else if (Math.abs(netMove) <= 5) { outcomeTag = 'Consolidation'; outcomeColor = '#475569'; }

                        return (
                          <tr
                            key={i}
                            style={{
                              backgroundColor: isSelected ? '#f8fafc' : 'transparent',
                              cursor: 'pointer',
                              fontWeight: isSelected ? 600 : 'normal',
                            }}
                            onMouseEnter={() => setSelectedAnalogIdx(i)}
                            onMouseLeave={() => setSelectedAnalogIdx(null)}
                            onClick={() => setSelectedAnalogIdx(isSelected ? null : i)}
                          >
                            <td style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{
                                width: 8, height: 8, borderRadius: '50%',
                                background: isSelected ? '#2563eb' : '#94a3b8',
                              }} />
                              <span>{a.label}</span>
                            </td>
                            <td style={{ fontFamily: 'var(--font-mono)' }}>{a.shock_date}</td>
                            <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: a.shock_pct >= 0 ? '#166534' : '#991b1b' }}>
                              {a.shock_pct >= 0 ? `+${a.shock_pct.toFixed(1)}%` : `${a.shock_pct.toFixed(1)}%`}
                            </td>
                            <td style={{ fontFamily: 'var(--font-mono)', color: d30Val >= 0 ? '#166534' : '#991b1b' }}>
                              {d30Val >= 0 ? `+${d30Val.toFixed(1)}%` : `${d30Val.toFixed(1)}%`}
                            </td>
                            <td style={{ fontFamily: 'var(--font-mono)', color: d60Val >= 0 ? '#166534' : '#991b1b' }}>
                              {d60Val >= 0 ? `+${d60Val.toFixed(1)}%` : `${d60Val.toFixed(1)}%`}
                            </td>
                            <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: netMove >= 0 ? '#166534' : '#991b1b' }}>
                              {netMove >= 0 ? `+${netMove.toFixed(1)}%` : `${netMove.toFixed(1)}%`}
                            </td>
                            <td style={{ fontFamily: 'var(--font-mono)', color: '#991b1b' }}>
                              {minVal.toFixed(1)}%
                            </td>
                            <td>
                              <span style={{
                                fontSize: 11,
                                padding: '2px 8px',
                                borderRadius: 4,
                                background: `${outcomeColor}15`,
                                color: outcomeColor,
                                fontWeight: 600,
                              }}>
                                {outcomeTag}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Econometric Pattern Takeaway Box */}
                {analogStats && (
                  <div style={{ marginTop: 14, padding: '12px 16px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <ShieldCheck size={14} color="#2563eb" />
                      <span>Econometric Synthesis & Risk Takeaway</span>
                    </div>
                    <p style={{ fontSize: 12, color: '#475569', lineHeight: 1.5, margin: 0 }}>
                      Across {analogStats.count} matched historical episodes of {selectedNode.label} exceeding ±{shockThreshold}%, {analogStats.winRate}% of historical windows posted positive cumulative returns by Day D+90 with a median terminal move of {parseFloat(analogStats.medianD90) >= 0 ? '+' : ''}{analogStats.medianD90}%. Maximum downside recorded across windows was {analogStats.worstDrawdown}%.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Section 2: Monte Carlo Forecast */}
        {(viewMode === 'forecast' || viewMode === 'both') && (
          <div className="card" style={{ padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <LineChart size={18} color="#2563eb" />
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#09090b' }}>
                    Monte Carlo Forward Simulation ({selectedNode.label})
                  </span>
                </div>
                <p style={{ fontSize: 12.5, color: '#71717a', margin: '4px 0 0 0' }}>
                  Stochastic path distribution generated via Geometric Brownian Motion calibrated on empirical daily returns.
                </p>
              </div>

              {/* Event Shock Controller */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: 6, padding: '4px 8px' }}>
                <span style={{ fontSize: 11.5, color: '#71717a' }}>Event Shock:</span>
                <select
                  style={{ border: 'none', background: 'transparent', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  value={forecastShock}
                  onChange={(e) => {
                    const s = parseFloat(e.target.value);
                    setForecastShock(s);
                    fetchForecast(selectedNodeId, s, forecastHorizon);
                  }}
                >
                  <option value={0.0}>0% (Neutral baseline)</option>
                  <option value={5.0}>+5% (Positive move)</option>
                  <option value={10.0}>+10% (Major rally)</option>
                  <option value={-5.0}>-5% (Drawdown)</option>
                  <option value={-10.0}>-10% (Major sell-off)</option>
                </select>
              </div>
            </div>

            {/* Interactive Forecast Fan Chart */}
            <div style={{ marginTop: 10 }}>
              <ForecastChart
                data={forecastData}
                loading={forecastLoading}
                error={forecastError}
                name={selectedNode.label}
                horizon={forecastHorizon}
                isFullPage={viewMode !== 'both'}
                onHorizonChange={(h) => {
                  setForecastHorizon(h);
                  fetchForecast(selectedNodeId, forecastShock, h);
                }}
              />
            </div>

            {/* Explanatory Methodology Card */}
            <div style={{ marginTop: 18, padding: '12px 14px', background: '#fafafa', borderRadius: 8, border: '1px solid #e4e4e7' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                <Info size={14} color="#71717a" />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#09090b' }}>Methodology Note</span>
              </div>
              <p style={{ fontSize: 11.5, color: '#71717a', lineHeight: 1.5, margin: 0 }}>
                Parameters are estimated by computing log return variances from historical FRED & Yahoo Finance series. 500 discrete Brownian increments simulate terminal asset distributions, projecting downside risk (VaR 95% and CVaR / Expected Shortfall) to assess worst-case exposures.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Feature 3: Executive Memo Modal */}
      <ExecutiveMemoModal
        isOpen={showMemoModal}
        onClose={() => setShowMemoModal(false)}
        analysis={analysis}
        forecastData={forecastData}
        analogData={analogData}
      />
    </div>
  );
}
