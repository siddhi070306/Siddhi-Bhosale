import React, { useState, useEffect, useMemo } from 'react';
import { FileText } from 'lucide-react';
import ScenarioChart from '../components/charts/ScenarioChart';
import { api, HORIZON_DAYS } from '../services/api';

const PRESETS = [
  { key: 'neg', label: 'Negative Shock', change: -10, horizon: '1 Month' },
  { key: 'least', label: 'Least Impact', change: 5, horizon: '1 Month' },
  { key: 'high', label: 'Higher Impact', change: 25, horizon: '3 Months' },
];
const ARROW = (d) => (d > 0 ? '↑' : '↓');

export default function ScenarioSimulator() {
  const [priceChange, setPriceChange] = useState(15);
  const [timeHorizon, setTimeHorizon] = useState('1 Month');
  const [activeScenario, setActiveScenario] = useState('current');
  const [showEvidence, setShowEvidence] = useState(false);
  const [results, setResults] = useState({}); // scenario key -> /api/whatif result
  const [target, setTarget] = useState('spx');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const scenarios = useMemo(
    () => [{ key: 'current', label: `Selected (${priceChange >= 0 ? '+' : ''}${priceChange}%)`, change: priceChange }, ...PRESETS],
    [priceChange]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const horizon = HORIZON_DAYS[timeHorizon];
        const calls = scenarios.map((s) => (s.change === 0 ? Promise.resolve(null) : api.whatIf('crude_oil', s.change, horizon)));
        const out = await Promise.all(calls);
        if (cancelled) return;
        const next = {};
        scenarios.forEach((s, i) => {
          next[s.key] = out[i];
        });
        setResults(next);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [priceChange, timeHorizon, scenarios]);

  const active = results[activeScenario] || results.current;
  const assetOptions = (results.current && results.current.assets) || [];
  const rowFor = (res) => (res ? [...res.assets, ...res.sectors, ...res.variables].find((r) => r.node === target) || null : null);
  const chartData = {};
  scenarios.forEach((s) => {
    chartData[s.key] = rowFor(results[s.key]);
  });
  const targetLabel = (assetOptions.find((a) => a.node === target) || {}).label || target;
  const insights = active ? active.sectors.filter((s) => !s.beyond_horizon).slice(0, 3) : [];
  const evidence = active ? active.evidence : [];

  const applyPreset = (p) => {
    setPriceChange(p.change);
    setTimeHorizon(p.horizon);
    setActiveScenario('current');
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Scenario Simulator & Evidence</h1>
        <p className="page-subtitle">Test different scenarios and see how the inferred impact changes across the market.</p>
      </div>

      <div className="simulator-layout">
        <div className="card">
          <div className="card-title">
            <span>Adjust Event Parameters</span>
          </div>

          <div className="slider-container">
            <div className="slider-header">
              <span>Oil Price Change</span>
              <strong style={{ color: priceChange >= 0 ? '#166534' : '#991b1b' }}>{priceChange >= 0 ? `+${priceChange}%` : `${priceChange}%`}</strong>
            </div>
            <input type="range" min="-25" max="50" value={priceChange} onChange={(e) => setPriceChange(Number(e.target.value))} className="slider-input" />
            {priceChange === 0 && <div style={{ fontSize: 11.5, color: '#71717a', marginTop: 6 }}>0% is no shock: nothing to propagate.</div>}
          </div>

          <div className="form-group">
            <label className="form-label">Time Horizon</label>
            <select className="form-select" value={timeHorizon} onChange={(e) => setTimeHorizon(e.target.value)}>
              {Object.keys(HORIZON_DAYS).map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
            <div style={{ fontSize: 11.5, color: '#71717a', marginTop: 4 }}>Effects whose typical lag exceeds the horizon are flagged and left out of the insights.</div>
          </div>

          <div className="form-group">
            <label className="form-label">Asset to compare</label>
            <select className="form-select" value={target} onChange={(e) => setTarget(e.target.value)}>
              {assetOptions.length === 0 && <option value={target}>{target}</option>}
              {assetOptions.map((a) => (
                <option key={a.node} value={a.node}>{a.label}</option>
              ))}
            </select>
          </div>

          <div className="stitched-divider"></div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#09090b', marginBottom: 10 }}>Alternative Scenarios</div>
          {PRESETS.map((p) => (
            <div key={p.key} className="scenario-card-mini" onClick={() => applyPreset(p)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.label}</div>
                  <div style={{ fontSize: 11.5, color: '#71717a' }}>Oil {p.change > 0 ? '+' : ''}{p.change}% · {p.horizon}</div>
                </div>
                <span className="badge badge-subtle">Apply</span>
              </div>
            </div>
          ))}
        </div>

        <div>
          <ScenarioChart
            scenarios={scenarios}
            data={chartData}
            activeScenario={activeScenario}
            onScenarioChange={setActiveScenario}
            assetLabel={targetLabel}
            loading={loading}
            error={error}
          />
          <div className="card" style={{ marginTop: 20 }}>
            <div className="card-title">
              <span>Simulation Mechanics</span>
            </div>
            <p style={{ fontSize: 12.5, color: '#52525b', lineHeight: 1.6 }}>
              Each scenario re-runs the knowledge-graph propagation from Crude Oil with the chosen shock size; nothing is learned or stored. Link strengths are analyst priors
              (adjusted by data checks only when live data is on). Shock size changes sensitivity and ranking, not whether a path exists, and bars are not price forecasts.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <div className="card-title">
              <span>Key Insights</span>
            </div>
            {error && <p style={{ fontSize: 12.5, color: '#991b1b' }}>{error}</p>}
            {!error && insights.length === 0 && <p style={{ fontSize: 12.5, color: '#71717a' }}>{loading ? 'Computing…' : 'No sector is reached within this horizon.'}</p>}
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5, color: '#27272a' }}>
              {insights.map((s) => (
                <li key={s.node} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ color: '#18181b', fontWeight: 700 }}>•</span>
                  <span>
                    <strong>{s.label}</strong> {ARROW(s.direction)} {s.sensitivity_label} sensitivity, {s.confidence_label} confidence ({s.confidence.toFixed(2)}
                    {s.mixed ? ', mixed signals' : ''}). {s.why}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="card">
            <div className="card-title">
              <span>Supporting Evidence</span>
            </div>
            {evidence.slice(0, 4).map((e) => (
              <div key={e.edge} className="evidence-metric-row">
                <span style={{ color: '#71717a' }}>{e.edge}</span>
                <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                  {e.data_check ? `${e.data_check}${e.r != null ? ` (r=${Number(e.r).toFixed(2)})` : ''}` : `prior ${e.strength}`}
                </span>
              </div>
            ))}
            {evidence.length === 0 && <p style={{ fontSize: 12.5, color: '#71717a' }}>No multi-hop evidence yet.</p>}
            <div style={{ marginTop: 16 }}>
              <button className="btn btn-outline" style={{ width: '100%' }} onClick={() => setShowEvidence(!showEvidence)}>
                <FileText size={14} />
                <span>{showEvidence ? 'Close Evidence' : 'View All Evidence'}</span>
              </button>
            </div>
            {showEvidence && active && (
              <div style={{ marginTop: 12, padding: 10, background: '#f8f9fa', borderRadius: 6, fontSize: 12, color: '#52525b', lineHeight: 1.5 }}>
                {evidence.slice(4).map((e) => (
                  <div key={e.edge}>{e.edge}: {e.data_check || `prior only (${e.strength})`}, lag {e.lag_days}d</div>
                ))}
                <div style={{ marginTop: 8 }}>
                  {active.caveats.map((c) => (
                    <div key={c}>• {c}</div>
                  ))}
                </div>
                <div style={{ marginTop: 8 }}>"prior" = analyst-set strength with no data check. Turn on live market data in Settings to check links against FRED/Yahoo series.</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
