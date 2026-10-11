import React, { useState, useEffect, useMemo } from 'react';
import { FileText, Scale, AlertTriangle, Plus, Trash2, Zap, ArrowRight } from 'lucide-react';
import ScenarioChart from '../components/charts/ScenarioChart';
import { api, HORIZON_DAYS } from '../services/api';

const ARROW = (d) => (d > 0 ? '↑' : '↓');
const SOURCE_TYPES = ['commodity', 'indicator', 'institution', 'event_class', 'sector', 'instrument', 'index'];
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

const CONFLICTING_PRESETS = [
  {
    key: 'stagflation_airline',
    title: '✈️ Airline Stagflation Squeeze',
    subtitle: 'Cost-Push Inflation vs. Travel Demand Expansion',
    shocks: [
      { trigger: 'crude_oil', change: 12 },
      { trigger: 'airlines', change: 8 },
    ],
    target: 'delta',
    horizon: '1 Month',
    description: 'Crude Oil (+12%) drives jet fuel input costs up, while record airline travel demand (+8%) lifts ticket pricing power. Tests whether margin compression outweighs volume growth.',
  },
  {
    key: 'fed_vs_spending',
    title: '🏦 Rate Hike vs. Resilient Consumer',
    subtitle: 'Monetary Tightening vs. Consumer Spending',
    shocks: [
      { trigger: 'rate_exp', change: 15 },
      { trigger: 'consumer_spending', change: 8 },
    ],
    target: 'spx',
    horizon: '3 Months',
    description: 'Hawkish Fed policy rate expectations (+15%) push discount rates higher, while robust consumer spending (+8%) supports top-line earnings. Tests equity valuation vs. earnings growth.',
  },
  {
    key: 'energy_vs_growth',
    title: '⚡ Gas Crisis vs. Cyclical Boom',
    subtitle: 'Feedstock Price Spike vs. Industrial Demand',
    shocks: [
      { trigger: 'natural_gas', change: 25 },
      { trigger: 'gdp_growth', change: 6 },
    ],
    target: 'chemicals',
    horizon: '1 Month',
    description: 'European/Global natural gas price spike (+25%) inflates petrochemical feedstock costs, while GDP growth (+6%) accelerates cyclical goods demand.',
  },
  {
    key: 'oil_vs_rupee',
    title: '🇮🇳 Energy Deficit vs. IT Exporters',
    subtitle: 'Oil Import Bill vs. Rupee Depreciation',
    shocks: [
      { trigger: 'crude_oil', change: 15 },
      { trigger: 'usdinr', change: 6 },
    ],
    target: 'infosys',
    horizon: '1 Month',
    description: 'Higher crude oil widens India’s trade deficit, while USD/INR rupee weakness (+6%) lifts dollar-denominated export margins for Indian IT firms.',
  },
];

export default function ScenarioSimulator({ analysis = null, onNavigateToTab, onNavigateToChat }) {
  // Mode: 'single' shock vs 'multi' (conflicting forces)
  const [mode, setMode] = useState('single');

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

  // Multi-shock state
  const [multiShocks, setMultiShocks] = useState([
    { id: 's1', trigger: 'crude_oil', change: 10 },
    { id: 's2', trigger: 'airlines', change: 8 },
  ]);

  useEffect(() => {
    api.getGraph().then((g) => setKbNodes((g.nodes || []).filter((n) => SOURCE_TYPES.includes(n.type)))).catch(() => {});
  }, []);

  const getNodeLabel = (nodeId) => {
    if (nodeId === 'airlines') return 'Airlines / Air Travel';
    const found = kbNodes.find((n) => n.id === nodeId) || analysedSources.find((x) => x.trigger === nodeId);
    return (found && found.label) || nodeId;
  };

  const sourceLabel = getNodeLabel(trigger);

  // Alternative scenarios for Single Mode
  const base = baseShock(analysis, trigger);
  const PRESETS = useMemo(
    () => [
      { key: 'neg', label: 'Reversed shock', change: clamp(-base), horizon: '1 Month' },
      { key: 'least', label: 'Half-size shock', change: clamp(base / 2) || (base < 0 ? -1 : 1), horizon: '1 Month' },
      { key: 'high', label: 'Double shock', change: clamp(base * 2), horizon: '3 Months' },
    ],
    [base]
  );
  const singleScenarios = useMemo(
    () => [{ key: 'current', label: `Selected (${priceChange >= 0 ? '+' : ''}${priceChange}%)`, change: priceChange }, ...PRESETS],
    [priceChange, PRESETS]
  );

  // Scenarios for Multi Mode
  const multiScenarios = useMemo(() => {
    const s0 = multiShocks[0] || { trigger: 'crude_oil', change: 10 };
    const s1 = multiShocks[1] || { trigger: 'airlines', change: 8 };
    const lbl0 = getNodeLabel(s0.trigger);
    const lbl1 = getNodeLabel(s1.trigger);

    const list = [
      {
        key: 'net',
        label: `Net Combined (${multiShocks.map((s) => `${s.change >= 0 ? '+' : ''}${s.change}%`).join(' & ')})`,
        shocks: multiShocks,
      },
      {
        key: 'shock_0',
        label: `${lbl0} Only (${s0.change >= 0 ? '+' : ''}${s0.change}%)`,
        shocks: [s0],
      },
    ];
    if (multiShocks.length > 1) {
      list.push({
        key: 'shock_1',
        label: `${lbl1} Only (${s1.change >= 0 ? '+' : ''}${s1.change}%)`,
        shocks: [s1],
      });
    }
    list.push({
      key: 'inverted',
      label: `Inverted (${multiShocks.map((s) => `${-s.change >= 0 ? '+' : ''}${-s.change}%`).join(' & ')})`,
      shocks: multiShocks.map((s) => ({ ...s, change: -s.change })),
    });
    return list;
  }, [multiShocks, kbNodes]);

  const scenarios = mode === 'multi' ? multiScenarios : singleScenarios;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const horizon = HORIZON_DAYS[timeHorizon];
        const activeList = mode === 'multi' ? multiScenarios : singleScenarios;
        const calls = activeList.map((s) => {
          if (mode === 'multi') {
            const validShocks = (s.shocks || []).filter((x) => x.change !== 0);
            return validShocks.length === 0
              ? Promise.resolve(null)
              : api.whatIf(null, null, horizon, undefined, validShocks.map((x) => ({ trigger: x.trigger, magnitude_pct: x.change })));
          }
          return s.change === 0 ? Promise.resolve(null) : api.whatIf(trigger, s.change, horizon);
        });
        const out = await Promise.all(calls);
        if (cancelled) return;
        const next = {};
        activeList.forEach((s, i) => {
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
  }, [mode, priceChange, timeHorizon, singleScenarios, multiScenarios, trigger, multiShocks]);

  const activeKey = mode === 'multi' ? (activeScenario === 'current' ? 'net' : activeScenario) : activeScenario;
  const active = results[activeKey] || results.net || results.current;
  const assetOptions = (active && active.assets) || (results.net && results.net.assets) || (results.current && results.current.assets) || [];
  const rowFor = (res) => (res ? [...res.assets, ...res.sectors, ...res.variables].find((r) => r.node === target) || null : null);
  const chartData = {};
  scenarios.forEach((s) => {
    chartData[s.key] = rowFor(results[s.key]);
  });
  const targetLabel = (assetOptions.find((a) => a.node === target) || {}).label || target;
  const insights = active ? active.sectors.filter((s) => !s.beyond_horizon).slice(0, 3) : [];
  const evidence = active ? active.evidence : [];
  const targetRow = rowFor(active);

  // Opposing balance metrics
  const posMass = (targetRow && targetRow.pos_mass) || 0;
  const negMass = (targetRow && targetRow.neg_mass) || 0;
  const totalMass = posMass + negMass;
  const posPct = totalMass > 0 ? Math.round((posMass / totalMass) * 100) : 50;
  const negPct = 100 - posPct;

  const applyPreset = (p) => {
    setPriceChange(p.change);
    setTimeHorizon(p.horizon);
    setActiveScenario('current');
  };

  const applyConflictingPreset = (p) => {
    setMode('multi');
    setMultiShocks(p.shocks.map((s, i) => ({ id: `s_${i + 1}`, trigger: s.trigger, change: s.change })));
    setTimeHorizon(p.horizon);
    setTarget(p.target);
    setActiveScenario('net');
  };

  const handleUpdateMultiShock = (idx, field, val) => {
    setMultiShocks((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: val };
      return copy;
    });
  };

  const handleAddMultiShock = () => {
    if (multiShocks.length >= 4) return;
    const available = kbNodes.filter((n) => !multiShocks.some((s) => s.trigger === n.id));
    const nextNode = available[0] ? available[0].id : 'consumer_spending';
    setMultiShocks((prev) => [...prev, { id: `s_${Date.now()}`, trigger: nextNode, change: 10 }]);
  };

  const handleRemoveMultiShock = (idx) => {
    if (multiShocks.length <= 1) return;
    setMultiShocks((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title">Scenario Simulator & Evidence</h1>
          <p className="page-subtitle">Test multi-shock scenarios and evaluate how opposing market forces balance out across the economy.</p>
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
          <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Adjust Event Parameters</span>
          </div>

          {/* Mode Switcher Tabs */}
          <div style={{ display: 'flex', gap: 4, background: '#f4f4f5', padding: 3, borderRadius: 8, marginBottom: 16 }}>
            <button
              type="button"
              className={`btn btn-sm ${mode === 'single' ? 'btn-black' : 'btn-ghost'}`}
              style={{ flex: 1, fontSize: 12, padding: '6px 8px' }}
              onClick={() => {
                setMode('single');
                setActiveScenario('current');
              }}
            >
              🎯 Single Shock
            </button>
            <button
              type="button"
              className={`btn btn-sm ${mode === 'multi' ? 'btn-black' : 'btn-ghost'}`}
              style={{ flex: 1, fontSize: 12, padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
              onClick={() => {
                setMode('multi');
                setActiveScenario('net');
              }}
            >
              <Zap size={13} color={mode === 'multi' ? '#60a5fa' : '#71717a'} />
              <span>Multi-Shock Balance</span>
            </button>
          </div>

          {/* SINGLE SHOCK CONTROLS */}
          {mode === 'single' && (
            <>
              <div className="slider-container">
                <div className="slider-header">
                  <span>{sourceLabel} change</span>
                  <strong style={{ color: priceChange >= 0 ? '#166534' : '#991b1b' }}>{priceChange >= 0 ? `+${priceChange}%` : `${priceChange}%`}</strong>
                </div>
                <input type="range" min="-25" max="50" value={priceChange} onChange={(e) => setPriceChange(Number(e.target.value))} className="slider-input" />
                {['institution', 'event_class', 'indicator'].includes((kbNodes.find((n) => n.id === trigger) || {}).type) && (
                  <div style={{ fontSize: 11.5, color: '#71717a', marginTop: 6 }}>
                    {sourceLabel} is not a price: the % is a generic shock size that scales sensitivity, not a literal percentage move.
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
                        <option key={x.trigger} value={x.trigger}>{getNodeLabel(x.trigger)}</option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="Macro & Sector Drivers">
                    {(kbNodes.length ? kbNodes : [{ id: 'crude_oil', label: 'Crude Oil' }])
                      .filter((n) => !analysedSources.some((x) => x.trigger === n.id))
                      .map((n) => (
                        <option key={n.id} value={n.id}>{getNodeLabel(n.id)}</option>
                      ))}
                  </optgroup>
                </select>
                <div style={{ fontSize: 11.5, color: '#71717a', marginTop: 4 }}>
                  {analysedSources.length ? 'Starts from the event you analysed; change it to test any other driver.' : 'No analysis yet: pick any driver to simulate.'}
                </div>
              </div>

              {/* Multi-Shock Pro Tip Callout */}
              <div
                style={{
                  margin: '14px 0',
                  padding: '10px 12px',
                  background: 'linear-gradient(135deg, #f0fdf4 0%, #eff6ff 100%)',
                  border: '1px solid #bfdbfe',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
                onClick={() => {
                  setMode('multi');
                  setActiveScenario('net');
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1e40af', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Zap size={14} color="#3b82f6" />
                    <span>Need to test conflicting forces?</span>
                  </div>
                  <span className="badge badge-subtle" style={{ fontSize: 10, background: '#2563eb', color: '#fff' }}>Try Multi-Shock</span>
                </div>
                <div style={{ fontSize: 11, color: '#475569', marginTop: 4, lineHeight: 1.4 }}>
                  Simulate simultaneous opposing shocks (e.g. <strong>Oil +10%</strong> AND <strong>Air Travel +8%</strong>) to compute net equilibrium.
                </div>
              </div>
            </>
          )}

          {/* MULTI-SHOCK CONTROLS */}
          {mode === 'multi' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>
                Simulate multiple simultaneous shocks to test how supply-push inflation balances against demand-pull growth.
              </div>

              {multiShocks.map((s, idx) => {
                const sLabel = getNodeLabel(s.trigger);
                return (
                  <div
                    key={s.id || idx}
                    style={{
                      padding: '10px 12px',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: 8,
                      position: 'relative',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>
                        Trigger {idx + 1}: {sLabel}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{
                            fontSize: 11.5,
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: 4,
                            background: s.change >= 0 ? '#dcfce7' : '#fee2e2',
                            color: s.change >= 0 ? '#166534' : '#991b1b',
                          }}
                        >
                          {s.change >= 0 ? `+${s.change}%` : `${s.change}%`}
                        </span>
                        {multiShocks.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveMultiShock(idx)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}
                            title="Remove shock trigger"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>

                    <select
                      className="form-select"
                      style={{ fontSize: 12, padding: '5px 8px', marginBottom: 8 }}
                      value={s.trigger}
                      onChange={(e) => handleUpdateMultiShock(idx, 'trigger', e.target.value)}
                    >
                      <optgroup label="Macro Drivers & Sectors">
                        {kbNodes.map((n) => (
                          <option key={n.id} value={n.id}>{getNodeLabel(n.id)}</option>
                        ))}
                      </optgroup>
                    </select>

                    <input
                      type="range"
                      min="-25"
                      max="50"
                      value={s.change}
                      onChange={(e) => handleUpdateMultiShock(idx, 'change', Number(e.target.value))}
                      className="slider-input"
                    />
                  </div>
                );
              })}

              {multiShocks.length < 4 && (
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ fontSize: 11.5, padding: '5px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  onClick={handleAddMultiShock}
                >
                  <Plus size={13} />
                  <span>Add Concurrent Shock Trigger</span>
                </button>
              )}
            </div>
          )}

          {/* COMMON PARAMETERS */}
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
            <label className="form-label">Target Asset to Compare</label>
            <select className="form-select" value={target} onChange={(e) => setTarget(e.target.value)}>
              {assetOptions.length === 0 && <option value={target}>{target}</option>}
              {assetOptions.map((a) => (
                <option key={a.node} value={a.node}>{a.label}</option>
              ))}
            </select>
            <div style={{ fontSize: 11.5, color: '#71717a', marginTop: 4 }}>Select any asset or sector to inspect the net colliding forces.</div>
          </div>

          <div className="stitched-divider"></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#09090b' }}>
              {mode === 'multi' ? 'Macro Stress Test Presets' : 'Alternative Scenarios'}
            </div>
            {mode === 'single' && (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: 11, padding: '2px 6px', color: '#2563eb' }}
                onClick={() => { setMode('multi'); setActiveScenario('net'); }}
              >
                ⚡ Multi-Shock Mode
              </button>
            )}
          </div>

          {mode === 'multi' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {CONFLICTING_PRESETS.map((p) => (
                <div
                  key={p.key}
                  className="scenario-card-mini"
                  style={{ cursor: 'pointer', padding: '10px 12px', border: '1px solid #e4e4e7', borderRadius: 8 }}
                  onClick={() => applyConflictingPreset(p)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: '#09090b' }}>{p.title}</div>
                      <div style={{ fontSize: 11.5, color: '#2563eb', fontWeight: 600, margin: '2px 0' }}>{p.subtitle}</div>
                      <div style={{ fontSize: 11, color: '#71717a', lineHeight: 1.4 }}>{p.description}</div>
                    </div>
                    <span className="badge badge-subtle" style={{ fontSize: 11, padding: '3px 8px', flexShrink: 0 }}>Apply</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            PRESETS.map((p) => (
              <div key={p.key} className="scenario-card-mini" onClick={() => applyPreset(p)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{p.label}</div>
                    <div style={{ fontSize: 11.5, color: '#71717a' }}>{sourceLabel} {p.change > 0 ? '+' : ''}{p.change}% · {p.horizon}</div>
                  </div>
                  <span className="badge badge-subtle">Apply</span>
                </div>
              </div>
            ))
          )}
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

          {/* NET FORCE BALANCE CARD */}
          {mode === 'multi' && targetRow && (
            <div
              className="card"
              style={{
                marginTop: 20,
                border: targetRow.mixed ? '1px solid #f59e0b' : '1px solid #e2e8f0',
                background: targetRow.mixed ? '#fffdf5' : '#ffffff',
              }}
            >
              <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Scale size={18} color={targetRow.mixed ? '#d97706' : '#2563eb'} />
                  <span style={{ fontWeight: 700, fontSize: 14 }}>Net Force Balance: {targetRow.label}</span>
                </div>
                {targetRow.mixed ? (
                  <span
                    className="badge badge-warning"
                    style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, background: '#fef3c7', color: '#92400e' }}
                  >
                    <AlertTriangle size={12} />
                    Opposing Forces (Mixed Signals)
                  </span>
                ) : (
                  <span className="badge badge-subtle" style={{ fontSize: 11, color: '#166534', background: '#dcfce7' }}>
                    Dominant Consensus
                  </span>
                )}
              </div>

              {/* Mass comparison meter */}
              <div style={{ margin: '10px 0 14px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                  <span style={{ color: '#166534', fontWeight: 600 }}>
                    Demand-Pull / Tailwind Force: {((targetRow.pos_mass || 0) * 100).toFixed(0)} ({posPct}%)
                  </span>
                  <span style={{ color: '#991b1b', fontWeight: 600 }}>
                    Cost-Push / Headwind Force: {((targetRow.neg_mass || 0) * 100).toFixed(0)} ({negPct}%)
                  </span>
                </div>
                <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', background: '#e4e4e7' }}>
                  <div style={{ width: `${posPct}%`, background: '#22c55e', transition: 'width 0.3s ease' }} title={`Positive Force: ${posPct}%`} />
                  <div style={{ width: `${negPct}%`, background: '#ef4444', transition: 'width 0.3s ease' }} title={`Negative Force: ${negPct}%`} />
                </div>
              </div>

              {/* Synthesis Verdict */}
              <div style={{ padding: 12, background: '#f8fafc', borderRadius: 8, fontSize: 12.5, lineHeight: 1.6, color: '#334155' }}>
                <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>Net Equilibrium Verdict:</span>
                  <span style={{ color: targetRow.direction > 0 ? '#166534' : '#991b1b' }}>
                    {targetRow.direction > 0 ? '↑ Net Positive Tailwind' : '↓ Net Negative Margin Compression'}
                    {targetRow.mixed ? ` (Dominance margin: ${Math.abs(posPct - negPct)}%)` : ''}
                  </span>
                </div>
                <div>
                  {targetRow.direction > 0
                    ? `Demand-pull volume expansion outweighs input cost inflation. While rising commodities exert downward pressure on operating margins, strong end-market demand provides pricing power to absorb the shock.`
                    : `Supply-push cost inflation dominates over top-line demand. Input cost escalation outpaces pricing elasticity, resulting in net margin compression.`}
                </div>
                <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 6 }}>
                  Agreement Ratio: <strong>{((targetRow.agreement || 1) * 100).toFixed(0)}%</strong> · Confidence: <strong>{targetRow.confidence?.toFixed(2)} ({targetRow.confidence_label})</strong>
                </div>
              </div>

              {/* Colliding Transmission Chains */}
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8 }}>
                  Colliding Transmission Chains Arriving at {targetRow.label}:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {active && active.paths && active.paths.filter((p) => p.steps && p.steps[p.steps.length - 1].to === targetRow.node).slice(0, 3).map((p, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, padding: '6px 10px', background: '#f1f5f9', borderRadius: 6 }}>
                      <span style={{ fontWeight: 700, color: p.sign > 0 ? '#166534' : '#991b1b', minWidth: 65 }}>
                        {p.sign > 0 ? '↑ Tailwind' : '↓ Headwind'}
                      </span>
                      <span style={{ color: '#334155', flex: 1 }}>
                        {p.steps.map((st) => st.from_label).concat([targetRow.label]).join(' → ')}
                      </span>
                      <span style={{ color: '#64748b', fontFamily: 'monospace' }}>
                        score {p.score?.toFixed(2)}
                      </span>
                    </div>
                  ))}
                  {(!active || !active.paths || !active.paths.some((p) => p.steps && p.steps[p.steps.length - 1].to === targetRow.node)) && (
                    <div style={{ fontSize: 11.5, color: '#94a3b8', fontStyle: 'italic' }}>
                      Transmitted through sector aggregation & multi-hop priors.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="card" style={{ marginTop: 20 }}>
            <div className="card-title">
              <span>Simulation Mechanics</span>
            </div>
            <p style={{ fontSize: 12.5, color: '#52525b', lineHeight: 1.6 }}>
              {mode === 'multi'
                ? 'Multi-shock mode runs concurrent exogenous shocks through the knowledge graph. When opposing shocks collide at the same target asset (e.g. higher oil costs vs. higher travel volume), the engine balances positive vs. negative transmission masses to compute net equilibrium.'
                : `Each scenario re-runs the knowledge-graph propagation from ${sourceLabel} with the chosen shock size; nothing is learned or stored. Link strengths are analyst priors (adjusted by data checks only when live data is on).`}
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
                  {active.caveats && active.caveats.map((c) => (
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
