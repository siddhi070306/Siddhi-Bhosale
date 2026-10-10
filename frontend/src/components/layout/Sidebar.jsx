import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import {
  MessageSquare,
  Home,
  Layers,
  GitBranch,
  TrendingUp,
  Sliders,
  Settings as SettingsIcon,
  Triangle,
  X,
} from 'lucide-react';

export default function Sidebar({
  activeTab,
  setActiveTab,
  hasAnalyzed,
  isMobileMenuOpen = false,
  onCloseMobileMenu,
}) {
  const [kg, setKg] = useState(null);
  useEffect(() => {
    api.getStatus().then(setKg).catch(() => setKg(null));
  }, [hasAnalyzed, activeTab]);
  const dashboardItems = [
    { id: 'home', label: 'Market Intelligence', icon: Home },
    { id: 'event-analysis', label: 'Event Analysis', icon: Layers },
    { id: 'impact-graph', label: 'Impact Graph', icon: GitBranch },
    { id: 'asset-impact', label: 'Asset Impact', icon: TrendingUp },
    { id: 'scenario-simulator', label: 'Scenario Simulator', icon: Sliders },
  ];

  const handleTabClick = (id) => {
    setActiveTab(id);
    if (onCloseMobileMenu) onCloseMobileMenu();
  };

  const handleDashboardClick = (id) => {
    setActiveTab(id);
    if (onCloseMobileMenu) onCloseMobileMenu();
  };

  return (
    <aside className={`sidebar ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
      {/* Brand Header */}
      <div className="sidebar-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="brand-logo">
            <Triangle size={20} fill="#ffffff" stroke="#ffffff" />
          </div>
          <span className="brand-name">Apex Zenith</span>
        </div>
        {/* Mobile Close Button */}
        <button
          className="sidebar-close-mobile-btn"
          onClick={onCloseMobileMenu}
          aria-label="Close sidebar navigation"
        >
          <X size={18} />
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="sidebar-nav">
        {/* Main Chat Interface */}
        <button
          className={`nav-item ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => handleTabClick('chat')}
        >
          <MessageSquare className="nav-item-icon" />
          <span>AI Chat Assistant</span>
        </button>

        {/* Dashboards Section: Only visible after the user inputs an event and analysis completes */}
        {hasAnalyzed && (
          <div className="sidebar-dashboards-section" style={{ animation: 'fadeIn 0.25s ease' }}>
            <div className="stitched-divider" style={{ margin: '12px 6px' }}></div>

            {/* Dashboards Section Header */}
            <div
              style={{
                padding: '4px 10px 8px',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.06em',
                color: '#71717a',
                textTransform: 'uppercase',
              }}
            >
              <span>Dashboards</span>
            </div>

            {/* Dashboard Items */}
            {dashboardItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  className={`nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => handleDashboardClick(item.id)}
                  title={item.label}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Icon className="nav-item-icon" />
                    <span>{item.label}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="stitched-divider" style={{ margin: '12px 6px' }}></div>

        {/* Settings */}
        <button
          className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => handleTabClick('settings')}
        >
          <SettingsIcon className="nav-item-icon" />
          <span>Settings</span>
        </button>
      </nav>

      {/* Footer System Status */}
      <div className="sidebar-footer">
        <div className="system-status-indicator">
          <span className="status-dot"></span>
          <span>{kg ? `Knowledge Graph: ${kg.graph.edges} links` : 'Backend offline'}</span>
        </div>
        <div style={{ fontSize: '11px', color: '#71717a' }}>
          {hasAnalyzed ? 'Event Active in Memory' : 'Ready for News Input'}
        </div>
      </div>
    </aside>
  );
}
