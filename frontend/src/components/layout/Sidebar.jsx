import React from 'react';
import {
  MessageSquare,
  Home,
  Layers,
  GitBranch,
  TrendingUp,
  Sliders,
  Settings as SettingsIcon,
  Triangle,
  Lock,
  Unlock,
  CheckCircle,
  X,
} from 'lucide-react';

export default function Sidebar({
  activeTab,
  setActiveTab,
  hasAnalyzed,
  isMobileMenuOpen = false,
  onCloseMobileMenu,
}) {
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
    if (!hasAnalyzed) {
      alert('Please enter or select a financial event in the AI Chat Assistant first to unlock and generate these dashboards!');
      return;
    }
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

        <div className="stitched-divider" style={{ margin: '12px 6px' }}></div>

        {/* Dashboards Section Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 10px 8px',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.06em',
            color: '#71717a',
            textTransform: 'uppercase',
          }}
        >
          <span>Dashboards</span>
          {hasAnalyzed ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#22c55e', fontSize: '10.5px' }}>
              <Unlock size={11} />
              <span>Unlocked</span>
            </span>
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#a1a1aa', fontSize: '10.5px' }}>
              <Lock size={11} />
              <span>Locked</span>
            </span>
          )}
        </div>

        {/* Dashboard Items */}
        {dashboardItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const isLocked = !hasAnalyzed;

          return (
            <button
              key={item.id}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => handleDashboardClick(item.id)}
              style={{
                opacity: isLocked ? 0.45 : 1,
                cursor: isLocked ? 'not-allowed' : 'pointer',
                justifyContent: 'space-between',
              }}
              title={isLocked ? 'Enter a news event in AI Chat first to unlock' : item.label}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Icon className="nav-item-icon" />
                <span>{item.label}</span>
              </div>
              {isLocked && <Lock size={13} color="#71717a" />}
            </button>
          );
        })}

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
          <span>Knowledge Graph: 90 links</span>
        </div>
        <div style={{ fontSize: '11px', color: '#71717a' }}>
          {hasAnalyzed ? 'Event Active in Memory' : 'Ready for News Input'}
        </div>
      </div>
    </aside>
  );
}
