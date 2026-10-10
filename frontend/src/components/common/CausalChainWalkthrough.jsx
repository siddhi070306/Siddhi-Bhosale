import React, { useState } from 'react';
import {
  GitBranch,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Clock,
  Quote,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Calculator,
} from 'lucide-react';

/**
 * CausalChainWalkthrough:
 * Provides an auditable, step-by-step mathematical explanation of how an event
 * shock propagates across intermediate nodes to terminal asset exposures.
 *
 * Props:
 *   paths          - Array of explained path objects from analysis.paths
 *   eventMagnitude - Initial magnitude string or number (e.g. "+10%")
 *   title          - Custom section title (optional)
 */
export default function CausalChainWalkthrough({
  paths = [],
  eventMagnitude = '10%',
  title = 'Step-by-Step Causal Transmission Walkthrough',
}) {
  const [selectedPathIdx, setSelectedPathIdx] = useState(0);
  const [isExpanded, setIsExpanded] = useState(true);

  if (!paths || paths.length === 0) {
    return null;
  }

  // Parse numeric shock magnitude
  const magMatch = typeof eventMagnitude === 'string' ? eventMagnitude.match(/([\d.]+)/) : null;
  const rawShockMag = magMatch ? parseFloat(magMatch[1]) : (typeof eventMagnitude === 'number' ? Math.abs(eventMagnitude) : 10.0);
  const shockSign = typeof eventMagnitude === 'string' && eventMagnitude.includes('-') ? -1 : 1;
  const initialShockPct = rawShockMag * shockSign;

  const currentPath = paths[selectedPathIdx] || paths[0];
  const steps = currentPath.steps || [];

  // Compute cumulative values at each node
  let runningVal = initialShockPct;
  const mathSteps = [{
    nodeLabel: steps[0] ? steps[0].from_label : (currentPath.source || 'Trigger'),
    value: runningVal,
    multiplier: 1.0,
    sign: 1,
    mechanism: 'Macro trigger shock origin',
    lag: 0,
    evidence: [],
  }];

  steps.forEach((step) => {
    const mult = (step.effective || step.strength || 0.7) * (step.sign || 1);
    runningVal = runningVal * mult;
    mathSteps.push({
      nodeLabel: step.to_label,
      value: runningVal,
      multiplier: step.effective || step.strength || 0.7,
      sign: step.sign,
      mechanism: step.mechanism,
      lag: step.lag,
      provenance: step.provenance,
      evidence: step.evidence || [],
    });
  });

  return (
    <div className="card" style={{ marginBottom: 24, padding: 20, border: '1px solid #e4e4e7', background: '#ffffff' }}>
      {/* Header */}
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'inline-flex', padding: 7, borderRadius: 8, background: '#f4f4f5', color: '#18181b' }}>
            <Calculator size={18} />
          </div>
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: '#09090b', letterSpacing: '-0.01em' }}>
              {title}
            </div>
            <div style={{ fontSize: 12, color: '#71717a' }}>
              Deterministic multiplication proof across {paths.length} mapped transmission {paths.length === 1 ? 'chain' : 'chains'}.
            </div>
          </div>
        </div>

        <button
          className="btn btn-outline btn-sm"
          style={{ border: 'none', background: 'transparent', padding: 4 }}
          aria-label="Toggle section"
        >
          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
      </div>

      {isExpanded && (
        <div style={{ marginTop: 16 }}>
          {/* Pathway Selector Pills (Top 4 pathways) */}
          {paths.length > 1 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #f4f4f5' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#71717a', alignSelf: 'center', marginRight: 4 }}>
                Transmission Pathway:
              </span>
              {paths.slice(0, 5).map((p, idx) => (
                <button
                  key={idx}
                  className={`filter-pill ${selectedPathIdx === idx ? 'active' : ''}`}
                  style={{ fontSize: 11.5, padding: '3px 10px' }}
                  onClick={() => setSelectedPathIdx(idx)}
                >
                  Chain {idx + 1}: {p.end_label || `Path ${idx + 1}`}
                </button>
              ))}
            </div>
          )}

          {/* Mathematical Formula Banner */}
          <div
            style={{
              background: '#fafafa',
              border: '1px solid #e4e4e7',
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#71717a', marginBottom: 4 }}>
                Causal Transmission Formula
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: '#18181b', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ color: initialShockPct >= 0 ? '#166534' : '#991b1b' }}>
                  Shock ({initialShockPct >= 0 ? `+${initialShockPct.toFixed(1)}%` : `${initialShockPct.toFixed(1)}%`})
                </span>
                {steps.map((s, i) => {
                  const weight = (s.effective || s.strength || 0.7);
                  const signStr = s.sign >= 0 ? '+' : '−';
                  return (
                    <React.Fragment key={i}>
                      <span style={{ color: '#a1a1aa' }}>×</span>
                      <span style={{ background: '#ffffff', padding: '1px 6px', borderRadius: 4, border: '1px solid #e4e4e7' }}>
                        ({signStr}{weight.toFixed(2)})
                      </span>
                    </React.Fragment>
                  );
                })}
                <span style={{ color: '#71717a' }}>=</span>
                <span style={{ color: runningVal >= 0 ? '#166534' : '#991b1b', background: runningVal >= 0 ? '#f0fdf4' : '#fef2f2', padding: '2px 8px', borderRadius: 6, border: runningVal >= 0 ? '1px solid #bbf7d0' : '1px solid #fecaca' }}>
                  {runningVal >= 0 ? `+${runningVal.toFixed(2)}%` : `${runningVal.toFixed(2)}%`} Net Exposure
                </span>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: '#71717a' }}>Total Chain Decoupling</div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#18181b' }}>
                {steps.length} Hop{steps.length === 1 ? '' : 's'} · ~{currentPath.horizon_days || 10}d Est. Lag
              </div>
            </div>
          </div>

          {/* Step-by-Step Pathway Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {mathSteps.map((item, idx) => {
              const isFirst = idx === 0;
              const isLast = idx === mathSteps.length - 1;
              const stepObj = !isFirst ? steps[idx - 1] : null;

              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 14,
                    padding: '12px 14px',
                    borderRadius: 8,
                    background: isLast ? '#ffffff' : '#fafafa',
                    border: isLast ? '1.5px solid #18181b' : '1px solid #f4f4f5',
                  }}
                >
                  {/* Step Index Circle */}
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: isLast ? '#18181b' : isFirst ? '#2563eb' : '#71717a',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 700,
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    {idx + 1}
                  </div>

                  {/* Step Details */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 700, color: '#09090b' }}>
                          {item.nodeLabel}
                        </span>
                        {isFirst && <span className="badge badge-black">Trigger Source</span>}
                        {isLast && <span className="badge badge-black" style={{ background: '#166534', color: '#fff' }}>Terminal Asset</span>}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {stepObj && (
                          <span style={{ fontSize: 11, color: '#71717a', fontFamily: 'var(--font-mono)' }}>
                            Link weight: {stepObj.sign >= 0 ? '+' : '−'}{(stepObj.effective || stepObj.strength || 0.7).toFixed(2)}
                          </span>
                        )}
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 13,
                            fontWeight: 700,
                            color: item.value >= 0 ? '#166534' : '#991b1b',
                          }}
                        >
                          {item.value >= 0 ? `+${item.value.toFixed(2)}%` : `${item.value.toFixed(2)}%`}
                        </span>
                      </div>
                    </div>

                    {/* Causal Rationale Quote */}
                    {item.mechanism && (
                      <div style={{ fontSize: 12, color: '#52525b', marginTop: 5, lineHeight: 1.5 }}>
                        {item.mechanism}
                      </div>
                    )}

                    {/* Evidence Quote if Available */}
                    {item.evidence && item.evidence.length > 0 && (
                      <div
                        style={{
                          marginTop: 6,
                          padding: '6px 10px',
                          background: '#ffffff',
                          borderRadius: 6,
                          border: '1px solid #e4e4e7',
                          fontSize: 11.5,
                          fontStyle: 'italic',
                          color: '#71717a',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <Quote size={12} color="#a1a1aa" />
                        <span>"{item.evidence[0]}"</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
