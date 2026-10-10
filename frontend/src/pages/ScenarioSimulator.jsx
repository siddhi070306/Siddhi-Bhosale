import React, { useState } from 'react';
import { Sliders, HelpCircle, CheckCircle2, ChevronRight, FileText } from 'lucide-react';
import ScenarioChart from '../components/charts/ScenarioChart';

export default function ScenarioSimulator() {
  const [priceChange, setPriceChange] = useState(15);
  const [timeHorizon, setTimeHorizon] = useState('1 Month');
  const [scenarioType, setScenarioType] = useState('Single Event');
  const [activeScenario, setActiveScenario] = useState('current');
  const [showEvidenceModal, setShowEvidenceModal] = useState(false);

  const applyPreset = (change, horizon, scenarioName) => {
    setPriceChange(change);
    setTimeHorizon(horizon);
    setActiveScenario(scenarioName);
  };

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <h1 className="page-title">Scenario Simulator & Evidence</h1>
        <p className="page-subtitle">
          Test different scenarios and see how the impact changes across the market.
        </p>
      </div>

      {/* Simulator Layout (3 Columns) */}
      <div className="simulator-layout">
        {/* Left Column: Controls & Presets */}
        <div className="card">
          <div className="card-title">
            <span>Adjust Event Parameters</span>
          </div>

          <div className="slider-container">
            <div className="slider-header">
              <span>Oil Price Change</span>
              <strong style={{ color: priceChange >= 0 ? '#166534' : '#991b1b' }}>
                {priceChange >= 0 ? `+${priceChange}%` : `${priceChange}%`}
              </strong>
            </div>
            <input
              type="range"
              min="-25"
              max="50"
              value={priceChange}
              onChange={(e) => setPriceChange(Number(e.target.value))}
              className="slider-input"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Time Horizon</label>
            <select
              className="form-select"
              value={timeHorizon}
              onChange={(e) => setTimeHorizon(e.target.value)}
            >
              <option value="1 Week">1 Week</option>
              <option value="1 Month">1 Month</option>
              <option value="3 Months">3 Months</option>
              <option value="6 Months">6 Months</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Scenario Type</label>
            <select
              className="form-select"
              value={scenarioType}
              onChange={(e) => setScenarioType(e.target.value)}
            >
              <option value="Single Event">Single Event</option>
              <option value="Cascading Shock">Cascading Shock</option>
              <option value="Regime Shift">Regime Shift</option>
            </select>
          </div>

          <div className="stitched-divider"></div>

          <div style={{ fontSize: 13, fontWeight: 600, color: '#09090b', marginBottom: 10 }}>
            Alternative Scenarios
          </div>

          <div
            className="scenario-card-mini"
            onClick={() => applyPreset(5, '1 Month', 'minus5')}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Least Impact</div>
                <div style={{ fontSize: 11.5, color: '#71717a' }}>Oil +5%</div>
              </div>
              <span className="badge badge-subtle">View Details</span>
            </div>
          </div>

          <div
            className="scenario-card-mini"
            onClick={() => applyPreset(25, '3 Months', 'plus5')}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Higher Impact</div>
                <div style={{ fontSize: 11.5, color: '#71717a' }}>Oil +25%</div>
              </div>
              <span className="badge badge-subtle">View Details</span>
            </div>
          </div>

          <div
            className="scenario-card-mini"
            onClick={() => applyPreset(-10, '1 Month', 'minus5')}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Negative Shock</div>
                <div style={{ fontSize: 11.5, color: '#71717a' }}>Oil -10%</div>
              </div>
              <span className="badge badge-subtle">View Details</span>
            </div>
          </div>
        </div>

        {/* Center Column: Compare Scenarios & Multi-line Chart */}
        <div>
          <ScenarioChart
            activeScenario={activeScenario}
            onScenarioChange={(scen) => setActiveScenario(scen)}
          />

          <div className="card" style={{ marginTop: 20 }}>
            <div className="card-title">
              <span>Simulation Mechanics</span>
            </div>
            <p style={{ fontSize: 12.5, color: '#52525b', lineHeight: 1.6 }}>
              Simulated propagation uses 90 curated causal links calibrated against 2-year FRED and Yahoo Finance daily timeseries. Link confidence accounts for path length, per-hop decay, and conflicting evidence.
            </p>
          </div>
        </div>

        {/* Right Column: Key Insights & Evidence */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Key Insights */}
          <div className="card">
            <div className="card-title">
              <span>Key Insights</span>
            </div>

            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5, color: '#27272a' }}>
              <li style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ color: '#18181b', fontWeight: 700 }}>•</span>
                <span>
                  <strong>Energy sector</strong> shows highest sensitivity ({priceChange >= 0 ? `+${(priceChange * 0.18).toFixed(1)}%` : `${(priceChange * 0.18).toFixed(1)}%`} with {priceChange}% oil move).
                </span>
              </li>
              <li style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ color: '#18181b', fontWeight: 700 }}>•</span>
                <span>
                  <strong>Banking sector</strong> may face pressure due to elevated inflation & yield curve shifts.
                </span>
              </li>
              <li style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ color: '#18181b', fontWeight: 700 }}>•</span>
                <span>
                  <strong>Real estate</strong> negatively correlated with interest rate expectations (-0.7%).
                </span>
              </li>
            </ul>
          </div>

          {/* Supporting Evidence */}
          <div className="card">
            <div className="card-title">
              <span>Supporting Evidence</span>
            </div>

            <div className="evidence-metric-row">
              <span style={{ color: '#71717a' }}>Historical correlation (Oil vs Energy)</span>
              <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>0.82</span>
            </div>

            <div className="evidence-metric-row">
              <span style={{ color: '#71717a' }}>Fed rate hike probability (Inflation)</span>
              <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>0.67</span>
            </div>

            <div className="evidence-metric-row">
              <span style={{ color: '#71717a' }}>Sector sensitivity (past 5 years)</span>
              <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>0.61</span>
            </div>

            <div style={{ marginTop: 16 }}>
              <button
                className="btn btn-outline"
                style={{ width: '100%' }}
                onClick={() => setShowEvidenceModal(!showEvidenceModal)}
              >
                <FileText size={14} />
                <span>{showEvidenceModal ? 'Close Evidence' : 'View All Evidence'}</span>
              </button>
            </div>

            {showEvidenceModal && (
              <div
                style={{
                  marginTop: 12,
                  padding: 10,
                  background: '#f8f9fa',
                  borderRadius: 6,
                  fontSize: 12,
                  color: '#52525b',
                  lineHeight: 1.5,
                }}
              >
                Data checks verified against 40 market series with lagged cross-correlation. Offline mode uses analyst expert priors.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
