import React, { useRef, useEffect } from 'react';
import {
  MessageSquare,
  Home,
  TrendingUp,
  History,
  Layers,
  GitBranch,
  Sliders,
} from 'lucide-react';

const TABS = [
  { id: 'chat', label: 'AI Chat', shortLabel: 'Chat', icon: MessageSquare },
  { id: 'home', label: 'Market Intel', shortLabel: 'Market', icon: Home },
  { id: 'asset-impact', label: 'Asset Impact', shortLabel: 'Impact', icon: TrendingUp },
  { id: 'econometrics', label: 'Analogs & Forecast', shortLabel: 'Analogs', icon: History },
  { id: 'event-analysis', label: 'Event Diagnostics', shortLabel: 'Diagnostics', icon: Layers },
  { id: 'impact-graph', label: 'Impact Graph', shortLabel: 'Graph', icon: GitBranch },
  { id: 'scenario-simulator', label: 'Scenario Simulator', shortLabel: 'Simulator', icon: Sliders },
];

export default function TopNavTabStrip({ activeTab, setActiveTab }) {
  const activeChipRef = useRef(null);

  useEffect(() => {
    if (activeChipRef.current) {
      activeChipRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [activeTab]);

  return (
    <nav className="top-nav-tabstrip" aria-label="Secondary horizontal navigation">
      <div className="top-nav-tabstrip-inner">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              ref={isActive ? activeChipRef : null}
              type="button"
              className={`top-nav-chip ${isActive ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={14} className="top-nav-chip-icon" />
              <span className="top-nav-chip-label">{tab.label}</span>
              <span className="top-nav-chip-short-label">{tab.shortLabel}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
