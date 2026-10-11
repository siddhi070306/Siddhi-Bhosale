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
 *   paths          - Array of explained path objects from the analysis result (raw.paths)
 *   title          - Custom section title (optional)
 */
export default function CausalChainWalkthrough({
  paths = [],
  title = 'Step-by-Step Causal Transmission Walkthrough',
}) {
  const [selectedPathIdx, setSelectedPathIdx] = useState(0);
  const [isExpanded, setIsExpanded] = useState(true);

  if (!paths || paths.length === 0) {
    return null;
  }

  // The score of a path is the product of its links' effective strengths and a decay for every hop after the first. The decay
  // is per link (0.97, 0.93 or 0.82 by how well market data supports it, 0.92 when untested) and is sent by the backend as
  // step.decay (impactgraph/propagate.py). It is a 0-1 plausibility score, never a price move, so no % is derived from it.
  const decayOf = (st, i) => (typeof st.decay === 'number' ? st.decay : i > 0 ? 0.92 : 1);
  const linkW = (st) => (typeof st.effective === 'number' ? st.effective : st.strength);
  const currentPath = paths[selectedPathIdx] || paths[0];
  const steps = currentPath.steps || [];
  const pathScore = typeof currentPath.score === 'number' ? currentPath.score : null;

  let running = 1.0;
  const mathSteps = [{
    nodeLabel: steps[0] ? steps[0].from_label : (currentPath.source || 'Trigger'),
    value: running,
    mechanism: 'Trigger: where the shock enters the graph',
    evidence: [],
  }];

  steps.forEach((step, i) => {
    running = running * linkW(step) * decayOf(step, i);
    mathSteps.push({
      nodeLabel: step.to_label,
      value: running,
      mechanism: step.mechanism,
      evidence: step.evidence || [],
    });
  });

  return (
    <div className="card" style={{ marginBottom: 32, padding: 22, border: '1px solid #e4e4e7', borderRadius: 12, background: '#ffffff', boxShadow: '0 4px 16px rgba(0, 0, 0, 0.06)' }}>
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

          {currentPath.tier_sentence && (
            <div style={{ marginBottom: 10, fontSize: 12.5, color: '#27272a' }} data-testid="walkthrough-tiers">
              <strong>Read tier by tier:</strong> {currentPath.tier_sentence}
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
                Path plausibility = link strengths × a per-link decay (0.82–0.97 by data support, 0.92 if untested; a 0–1 score, not a price move)
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: '#18181b', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ color: '#18181b' }}>
                  {mathSteps[0].nodeLabel} (start)
                </span>
                {steps.map((s, i) => {
                  const weight = linkW(s);
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
                {steps.length > 1 && (
                  <>
                    <span style={{ color: '#a1a1aa' }}>×</span>
                    <span style={{ background: '#ffffff', padding: '1px 6px', borderRadius: 4, border: '1px solid #e4e4e7' }}>
                      {steps.reduce((acc, st, i) => acc * decayOf(st, i), 1).toFixed(2)} decay
                      {' '}({steps.slice(1).map((st, i) => decayOf(st, i + 1).toFixed(2)).join(' × ')})
                    </span>
                  </>
                )}
                <span style={{ color: '#71717a' }}>=</span>
                <span style={{ color: '#18181b', background: '#f4f4f5', padding: '2px 8px', borderRadius: 6, border: '1px solid #e4e4e7' }}>
                  {(pathScore != null ? pathScore : running).toFixed(2)} Plausibility
                </span>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: '#71717a' }}>Total Chain Decoupling</div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#18181b' }}>
                {steps.length} Hop{steps.length === 1 ? '' : 's'} · ~{currentPath.horizon_days}d typical lag
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
                        {stepObj && stepObj.from_layer && (
                          <span style={{ fontSize: 10.5, color: '#a1a1aa', textTransform: 'capitalize' }}>
                            {stepObj.from_layer} → {stepObj.to_layer}
                            {stepObj.step_kind === 'skip' ? ' · skips a tier' : stepObj.step_kind === 'feedback' ? ' · feedback' : stepObj.step_kind === 'lateral' ? ' · same tier' : ''}
                          </span>
                        )}
                        {stepObj && (
                          <span style={{ fontSize: 11, color: '#71717a', fontFamily: 'var(--font-mono)' }}>
                            Link weight: {stepObj.sign >= 0 ? '+' : '−'}{linkW(stepObj).toFixed(2)}
                          </span>
                        )}
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 13,
                            fontWeight: 700,
                            color: '#18181b',
                          }}
                        >
                          {item.value.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* Causal Rationale Quote */}
                    {item.mechanism && (
                      <div style={{ fontSize: 12, color: '#52525b', marginTop: 5, lineHeight: 1.5 }}>
                        {item.mechanism}
                      </div>
                    )}

                    {/* Data check on this link (real series; flagged when simulated) */}
                    {stepObj &&
                      stepObj.validation &&
                      stepObj.validation.verdict &&
                      stepObj.validation.verdict !== 'no_data' &&
                      stepObj.validation.verdict !== 'none' && (
                      <div style={{ fontSize: 11.5, color: '#71717a', marginTop: 5 }}>
                        Data check: <strong>{stepObj.validation.verdict.replace(/_/g, ' ')}</strong>
                        {typeof stepObj.validation.corr === 'number' && ` · r = ${stepObj.validation.corr}`}
                        {stepObj.validation.n ? ` over ${stepObj.validation.n} days` : ''}
                        {stepObj.validation.simulated ? ' · simulated data (does not change confidence)' : ''}
                        {stepObj.validation.data ? ` · ${stepObj.validation.data}` : ''}
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
