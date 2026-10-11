import React, { useState, useEffect } from 'react';
import { GitBranch, Activity, ShieldCheck, Sparkles, Check, RefreshCw, Layers } from 'lucide-react';

const STAGES = [
  { label: 'Isolating shock event & validating article quotes', detail: 'Parsing factual claims & extracting percentage moves' },
  { label: 'Resolving entities across 56 knowledge graph priors', detail: 'Mapping commodities, macro indicators, and institutions' },
  { label: 'Tracing multi-hop transmission (Event → Variable → Sector → Asset)', detail: 'Executing depth-limited multi-path causal propagation' },
  { label: 'Cross-checking edge strength against 520d FRED & Yahoo series', detail: 'Computing lagged cross-correlations & volatility regime' },
  { label: 'Verifying knowledge base guard invariants & computing net impact', detail: 'Balancing positive/negative masses & detecting mixed signals' },
];

export default function KnowledgeGraphLoader({ eventText = '', mode = 'card' }) {
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setStageIndex((prev) => (prev < STAGES.length - 1 ? prev + 1 : prev));
    }, 1250);
    return () => clearInterval(timer);
  }, []);

  const currentStage = STAGES[stageIndex];

  if (mode === 'banner') {
    return (
      <div className="kg-loader-banner">
        <div className="kg-loader-banner-left">
          <div className="kg-loader-beacon-wrap">
            <span className="kg-loader-beacon-ping" />
            <span className="kg-loader-beacon-dot" />
          </div>
          <div>
            <div className="kg-loader-banner-title">
              Constructing Knowledge Graph
              <span className="kg-loader-stage-count">Step {stageIndex + 1} of {STAGES.length}</span>
            </div>
            <div className="kg-loader-banner-sub">
              {currentStage.label}
            </div>
          </div>
        </div>
        <div className="kg-loader-banner-right">
          <div className="kg-mini-progress">
            <div
              className="kg-mini-progress-bar"
              style={{ width: `${((stageIndex + 1) / STAGES.length) * 100}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="kg-loader-card">
      {/* Header with Title and Live Pulsing Beacon */}
      <div className="kg-loader-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="kg-loader-beacon-wrap">
            <span className="kg-loader-beacon-ping" />
            <span className="kg-loader-beacon-dot" />
          </div>
          <div>
            <div className="kg-loader-title">
              Generating Dynamic Knowledge Graph
            </div>
            {eventText && (
              <div className="kg-loader-event-preview" title={eventText}>
                “{eventText.length > 90 ? eventText.slice(0, 90) + '…' : eventText}”
              </div>
            )}
          </div>
        </div>
        <div className="kg-loader-engine-pill">
          <RefreshCw size={11} className="spinning" />
          <span>Active Engine</span>
        </div>
      </div>

      {/* Captivating Causal Flow Constellation (Animated SVG) */}
      <div className="kg-constellation-container">
        <div className="kg-constellation-legend">
          <span>Tier 0: Event</span>
          <span>Tier 1: Variable</span>
          <span>Tier 2: Sector</span>
          <span>Tier 3: Asset</span>
        </div>
        <svg
          viewBox="0 0 540 80"
          className="kg-constellation-svg"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id="kgLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#18181b" stopOpacity="0.25" />
              <stop offset="50%" stopColor="#4f46e5" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#18181b" stopOpacity="0.25" />
            </linearGradient>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Static Connecting Transmission Lines */}
          <path
            id="causalPath"
            d="M 50 40 L 180 40 L 330 40 L 480 40"
            fill="none"
            stroke="url(#kgLineGrad)"
            strokeWidth="2.5"
            strokeDasharray="4 4"
            className="kg-svg-dashed-line"
          />

          {/* Pulsing Energy Particle moving from node to node along the causal path */}
          <circle r="5" fill="#4f46e5" filter="url(#glow)">
            <animateMotion
              path="M 50 40 L 180 40 L 330 40 L 480 40"
              dur="2.4s"
              repeatCount="indefinite"
            />
          </circle>
          <circle r="9" fill="rgba(79, 70, 229, 0.35)" filter="url(#glow)">
            <animateMotion
              path="M 50 40 L 180 40 L 330 40 L 480 40"
              dur="2.4s"
              repeatCount="indefinite"
            />
          </circle>

          {/* Node 1: Event / Shock */}
          <g transform="translate(50, 40)">
            <circle r="16" fill="#f4f4f5" stroke="#18181b" strokeWidth="2" />
            <circle r="6" fill="#18181b" className="kg-pulse-node" />
            <text y="28" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#18181b">Shock</text>
          </g>

          {/* Node 2: Economic Variable */}
          <g transform="translate(180, 40)">
            <circle r="16" fill="#f4f4f5" stroke="#4f46e5" strokeWidth="2" />
            <circle r="6" fill="#4f46e5" className="kg-pulse-node" />
            <text y="28" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#4f46e5">Variable</text>
          </g>

          {/* Node 3: Industry Sector */}
          <g transform="translate(330, 40)">
            <circle r="16" fill="#f4f4f5" stroke="#18181b" strokeWidth="2" />
            <circle r="6" fill="#18181b" className="kg-pulse-node" />
            <text y="28" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#18181b">Sector</text>
          </g>

          {/* Node 4: Target Asset */}
          <g transform="translate(480, 40)">
            <circle r="16" fill="#f4f4f5" stroke="#166534" strokeWidth="2" />
            <circle r="6" fill="#166534" className="kg-pulse-node" />
            <text y="28" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#166534">Asset</text>
          </g>
        </svg>
      </div>

      {/* Dynamic Stage Progression Stepper */}
      <div className="kg-stepper-list">
        {STAGES.map((s, idx) => {
          const isDone = idx < stageIndex;
          const isActive = idx === stageIndex;
          return (
            <div
              key={s.label}
              className={`kg-step-item ${isDone ? 'done' : ''} ${isActive ? 'active' : ''}`}
            >
              <div className="kg-step-icon">
                {isDone ? (
                  <Check size={12} strokeWidth={3} color="#166534" />
                ) : isActive ? (
                  <RefreshCw size={11} className="spinning" color="#4f46e5" />
                ) : (
                  <div className="kg-step-dot" />
                )}
              </div>
              <div className="kg-step-content">
                <div className="kg-step-label">{s.label}</div>
                {isActive && (
                  <div className="kg-step-detail">{s.detail}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Telemetry Ticker / System Stats */}
      <div className="kg-telemetry-bar">
        <div className="kg-telemetry-pill">
          <span className="kg-telemetry-key">Entities</span>
          <span className="kg-telemetry-val">56 Priors</span>
        </div>
        <div className="kg-telemetry-pill">
          <span className="kg-telemetry-key">Graph Edges</span>
          <span className="kg-telemetry-val">90 Curated Links</span>
        </div>
        <div className="kg-telemetry-pill">
          <span className="kg-telemetry-key">Max Hops</span>
          <span className="kg-telemetry-val">5-Step Depth</span>
        </div>
        <div className="kg-telemetry-pill">
          <span className="kg-telemetry-key">Validation</span>
          <span className="kg-telemetry-val">FRED & Yahoo Data</span>
        </div>
      </div>
    </div>
  );
}
