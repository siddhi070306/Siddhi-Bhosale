import React, { useState, useEffect, useMemo } from 'react';
import { FileText } from 'lucide-react';
import ScenarioChart from '../components/charts/ScenarioChart';
import { api, HORIZON_DAYS } from '../services/api';

const ARROW = (d) => (d > 0 ? '↑' : '↓');
const SOURCE_TYPES = ['commodity', 'indicator', 'institution', 'event_class', 'instrument', 'index'];
const clamp = (v) => Math.max(-25, Math.min(50, Math.round(v)));

// Starting shock: the size stated in the analysed article for the chosen source (signed), else 15%.
function baseShock(analysis, trigger) {
  const raw = analysis && analysis.raw;
  const src = raw && (raw.sources || []).find((x) => x.trigger === trigger);
  const ev = src && (raw.events || []).find((e) => e.id === src.id);
  const m = ev && ev.magnitude && /([\d.]+)\s*%/.exec(ev.magnitude);
  if (m && src) return clamp(parseFloat(m[1]) * (src.direction >= 0 ? 1 : -1)) || 15;
  return src && src.direction < 0 ? -15 : 15;
}

export default function ScenarioSimulator({ analysis = null, onNavigateToTab, onNavigateToChat }) {
  // The simulator starts from what was analysed: its first source node and the move the article stated.
  const analysedSources = (analysis && analysis.sources) || [];
  const [trigger, setTrigger] = useState((analysedSources[0] && analysedSources[0].trigger) || 'crude_oil');
  const [kbNodes, setKbNodes] = useState([]);
  const [priceChange, setPriceChange] = useState(() => baseShock(analysis, (analysedSources[0] && analysedSources[0].trigger) || 'crude_oil'));
  const [timeHorizon, setTimeHorizon] = useState('1 Month');
  const [activeScenario, setActiveScenario] = useState('current');
  const [showEvidence, setShowEvidence] = useState(false);
  const [results, setResults] = useState({}); // scenario key -> /api/whatif result
  const topAsset = analysis && analysis.assetView && analysis.assetView.assets[0];
  const [target, setTarget] = useState(topAsset ? topAsset.id : 'spx');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getGraph().then((g) => setKbNodes((g.nodes || []).filter((n) => SOURCE_TYPES.includes(n.type)))).catch(() => {});
  }, []);
  const sourceLabel = (kbNodes.find((n) => n.id === trigger) || analysedSources.find((x) => x.trigger === trigger) || {}).label || trigger;

  // Alternative scenarios are relative to the starting shock instead of fixed numbers
  const base = baseShock(analysis, trigger);
  const PRESETS = useMemo(
    () => [
      { key: 'neg', label: 'Reversed shock', change: clamp(-base), horizon: '1 Month' },
      { key: 'least', label: 'Half-size shock', change: clamp(base / 2) || (base < 0 ? -1 : 1), horizon: '1 Month' },
      { key: 'high', label: 'Double shock', change: clamp(base * 2), horizon: '3 Months' },
    ],
    [base]
  );
  const scenarios = useMemo(
    () => [{ key: 'current', label: `Selected (${priceChange >= 0 ? '+' : ''}${priceChange}%)`, change: priceChange }, ...PRESETS],
    [priceChange, PRESETS]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const horizon = HORIZON_DAYS[timeHorizon];
        const calls = scenarios.map((s) => (s.change === 0 ? Promise.resolve(null) : api.whatIf(trigger, s.change, horizon)));
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
  }, [priceChange, timeHorizon, scenarios, trigger]);

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
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title">Scenario Simulator & Evidence</h1>
          <p className="page-subtitle">Test different scenarios and see how the inferred impact changes across the market.</p>
        </div>

        {onNavigateToTab && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
            <button
              className="btn btn-outline"
              style={{ fontSize: 12, padding: '5px 12px' }}
              onClick={() => onNavigateToTab('asset-impact')}
            >
              Asset Impact & Forecasts →
            </button>
            <button
              className="btn btn-outline"
              style={{ fontSize: 12, padding: '5px 12px' }}
              onClick={() => onNavigateToTab('impact-graph')}
            >
              Impact Graph →
            </button>
          </div>
        )}
      </div>

      <div className="simulator-layout">
        <div className="card">
          <div className="card-title">
            <span>Adjust Event Parameters</span>
          </div>

          <div className="slider-container">
            <div className="slider-header">
              <span>{sourceLabel} change</span>
              <strong style={{ color: priceChange >= 0 ? '#166534' : '#991b1b' }}>{priceChange >= 0 ? `+${priceChange}%` : `${priceChange}%`}</strong>
            </div>
            <input type="range" min="-25" max="50" value={priceChange} onChange={(e) => setPriceChange(Number(e.target.value))} className="slider-input" />
            {['institution', 'event_class', 'indicator'].includes((kbNodes.find((n) => n.id === trigger) || {}).type) && (
              <div style={{ fontSize: 11.5, color: '#71717a', marginTop: 6 }}>
                {sourceLabel} is not a price: the % is a generic shock size that scales sensitivity (e.g. a bigger surprise), not a literal percentage move.
              </div>
            )}
            {priceChange === 0 && <div style={{ fontSize: 11.5, color: '#71717a', marginTop: 6 }}>0% is no shock: nothing to propagate.</div>}
          </div>

          <div className="form-group">
            <label className="form-label">Shock source</label>
            <select
              className="form-select"
              value={trigger}
              onChange={(e) => {
                setTrigger(e.target.value);
                setPriceChange(baseShock(analysis, e.target.value));
                setActiveScenario('current');
              }}
            >
              {analysedSources.length > 0 && (
                <optgroup label="From your analysis">
                  {analysedSources.map((x) => (
                    <option key={x.trigger} value={x.trigger}>{(kbNodes.find((n) => n.id === x.trigger) || {}).label || x.trigger}</option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Other macro drivers">
                {(kbNodes.length ? kbNodes : [{ id: 'crude_oil', label: 'Crude Oil' }])
                  .filter((n) => !analysedSources.some((x) => x.trigger === n.id))
                  .map((n) => (
                    <option key={n.id} value={n.id}>{n.label}</option>
                  ))}
              </optgroup>
            </select>
            <div style={{ fontSize: 11.5, color: '#71717a', marginTop: 4 }}>
              {analysedSources.length ? 'Starts from the event you analysed; change it to test any other driver.' : 'No analysis yet: pick any driver to simulate.'}
            </div>
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
                  <div style={{ fontSize: 11.5, color: '#71717a' }}>{sourceLabel} {p.change > 0 ? '+' : ''}{p.change}% · {p.horizon}</div>
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
              Each scenario re-runs the knowledge-graph propagation from {sourceLabel} with the chosen shock size; nothing is learned or stored. Link strengths are analyst priors
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
