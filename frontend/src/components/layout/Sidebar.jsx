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
  X,
  Sparkles,
  SquarePen,
  PanelLeftClose,
} from 'lucide-react';

export default function Sidebar({
  activeTab,
  setActiveTab,
  hasAnalyzed,
  isMobileMenuOpen = false,
  onCloseMobileMenu,
  isCollapsed = false,
  onToggleCollapse,
  onNewChat,
}) {
  const [kg, setKg] = useState(null);

  useEffect(() => {
    api.getStatus().then(setKg).catch(() => setKg(null));
  }, [hasAnalyzed, activeTab]);

  const dashboardItems = [
    { id: 'home', label: 'Market Intelligence', icon: Home },
    { id: 'event-analysis', label: 'Event Diagnostics', icon: Layers },
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

  const handleNewChatClick = () => {
    if (onNewChat) onNewChat();
    else setActiveTab('chat');
    if (onCloseMobileMenu) onCloseMobileMenu();
  };

  return (
    <aside className={`sidebar ${isMobileMenuOpen ? 'mobile-open' : ''} ${isCollapsed ? 'collapsed' : ''}`}>
      {/* Brand Header */}
      <div className="sidebar-header">
        <div className="brand-identity-row">
          <div className="brand-logo-emblem">
            <img src="/image.png" alt="Apex Zenith" className="brand-logo-img" />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {/* Desktop collapse button inside sidebar */}
          <button
            className="sidebar-collapse-btn"
            onClick={onToggleCollapse}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <PanelLeftClose size={18} />
          </button>

          {/* Mobile Close Button */}
          <button
            className="sidebar-close-mobile-btn"
            onClick={onCloseMobileMenu}
            aria-label="Close sidebar navigation"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Prominent ChatGPT New Chat Button */}
      <div className="sidebar-new-chat-wrapper">
        <button
          className="sidebar-new-chat-btn"
          onClick={handleNewChatClick}
          title="Start a new analysis session"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SquarePen size={16} />
            <span className="new-chat-btn-label">New chat</span>
          </div>
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="sidebar-nav">
        {/* Section Label: Primary */}
        <div className="nav-section-label">
          <span>AI Intelligence</span>
        </div>

        {/* Main Chat Interface */}
        <button
          className={`nav-item ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => handleTabClick('chat')}
        >
          <div className="nav-item-icon-wrap">
            <MessageSquare size={17} className="nav-item-icon" />
          </div>
          <span className="nav-item-label">AI Chat Assistant</span>
          <span className="nav-item-badge">Core</span>
        </button>

        {/* Dashboards Section: Dynamically revealed once an event is analyzed */}
        {hasAnalyzed && (
          <div className="sidebar-dashboards-section" style={{ animation: 'fadeIn 0.25s ease' }}>
            <div className="nav-section-divider"></div>

            <div className="nav-section-label unlocked-label">
              <Sparkles size={12} color="#818cf8" />
              <span>Unlocked Dashboards</span>
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
                  <div className="nav-item-icon-wrap">
                    <Icon size={17} className="nav-item-icon" />
                  </div>
                  <span className="nav-item-label">{item.label}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="nav-section-divider"></div>

        {/* Preferences Section */}
        <div className="nav-section-label">
          <span>Preferences</span>
        </div>

        {/* Settings */}
        <button
          className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => handleTabClick('settings')}
        >
          <div className="nav-item-icon-wrap">
            <SettingsIcon size={17} className="nav-item-icon" />
          </div>
          <span className="nav-item-label">Engine & Settings</span>
        </button>
      </nav>

      {/* Footer System Status */}
      <div className="sidebar-footer">
        <div className="system-status-indicator">
          <span className="status-dot pulsing"></span>
          <div className="status-meta">
            <span className="status-title">
              {kg ? `${kg.graph.nodes} entities · ${kg.graph.edges} links` : 'Backend not reachable'}
            </span>
            <span className="status-sub">
              {kg ? `${kg.graph.articles_ingested} article${kg.graph.articles_ingested === 1 ? '' : 's'} learned` : 'Start the backend'}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
