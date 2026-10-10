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
} from 'lucide-react';
import { api } from '../services/api';
import AnalogChart from '../components/charts/AnalogChart';
import ForecastChart from '../components/charts/ForecastChart';
import ExecutiveMemoModal from '../components/common/ExecutiveMemoModal';

export default function EconometricAnalogs({
  analysis,
  initialAssetId,
  onNavigateToTab,
}) {
  const [nodes, setNodes] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(initialAssetId || 'crude_oil');
  const [viewMode, setViewMode] = useState('analogs'); // 'analogs' | 'forecast' | 'both'
  const [showMemoModal, setShowMemoModal] = useState(false);

  // Analogs state
  const [analogData, setAnalogData] = useState(null);
  const [analogLoading, setAnalogLoading] = useState(false);
  const [analogError, setAnalogError] = useState(null);
  const [shockThreshold, setShockThreshold] = useState(5.0);

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

            {/* Interactive Analog Chart */}
            <div style={{ marginTop: 10 }}>
              <AnalogChart
                data={analogData}
                loading={analogLoading}
                error={analogError}
                name={selectedNode.label}
              />
            </div>

            {/* Breakdown table of detected analogs */}
            {analogData && analogData.analogs && analogData.analogs.length > 0 && (
              <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid #f4f4f5' }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#09090b', marginBottom: 8 }}>
                  Detected Historical Windows
                </div>
                <div className="table-responsive">
                  <table className="data-table" style={{ fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th>Historical Event</th>
                        <th>Shock Date</th>
                        <th>Initial 5D Shock</th>
                        <th>90D Trajectory Level</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analogData.analogs.map((a, i) => {
                        const finalVal = a.values[a.values.length - 1];
                        const netMove = finalVal ? (finalVal - 100).toFixed(1) : '0.0';
                        return (
                          <tr key={i}>
                            <td style={{ fontWeight: 600 }}>{a.label}</td>
                            <td style={{ fontFamily: 'var(--font-mono)' }}>{a.shock_date}</td>
                            <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: a.shock_pct >= 0 ? '#166534' : '#991b1b' }}>
                              {a.shock_pct >= 0 ? `+${a.shock_pct.toFixed(1)}%` : `${a.shock_pct.toFixed(1)}%`}
                            </td>
                            <td style={{ fontFamily: 'var(--font-mono)' }}>
                              <span>{finalVal}</span>{' '}
                              <span style={{ fontSize: 11, color: parseFloat(netMove) >= 0 ? '#166534' : '#991b1b' }}>
                                ({parseFloat(netMove) >= 0 ? `+${netMove}%` : `${netMove}%`})
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
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
