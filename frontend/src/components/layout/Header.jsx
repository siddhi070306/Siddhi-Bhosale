import React, { useState, useEffect } from 'react';
import {
  Search,
  RotateCw,
  Menu,
  PanelLeft,
  SquarePen,
  ChevronDown,
  Sparkles,
} from 'lucide-react';

export default function Header({
  activeTab = 'chat',
  searchPlaceholder = 'Search...',
  showSearch = true,
  search = '',
  onSearch,
  status = null,
  refreshing = false,
  onRefresh,
  onToggleMobileMenu,
  onToggleCollapse,
  onNewChat,
  onStartTour,
}) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const isChat = activeTab === 'chat';


  return (
    <header className={`top-header ${isChat ? 'chatgpt-header' : ''}`}>
      {/* Left: Sidebar Toggle & (Model Selector or Search) */}
      <div className="header-left">
        {/* Mobile menu trigger */}
        <button
          className="mobile-menu-btn"
          onClick={onToggleMobileMenu}
          aria-label="Toggle navigation menu"
          title="Toggle mobile menu"
        >
          <Menu size={18} />
        </button>

        {/* Desktop Sidebar Collapse Toggle (ChatGPT style) */}
        <button
          className="sidebar-collapse-toggle-btn"
          onClick={onToggleCollapse}
          aria-label="Toggle sidebar"
          title="Toggle sidebar"
        >
          <PanelLeft size={18} />
        </button>

        {isChat ? (
          /* ChatGPT Style Model Selector */
          <div className="chatgpt-model-selector" title={status && status.llm ? `Causal graph engine · ${status.llm} ${status.llm_model || ''}` : 'Causal graph engine'}>
            <div className="model-logo-badge">
              <img src="/image.png" alt="AZ" className="model-logo-img" />
            </div>
            <span className="model-name">Apex Zenith</span>
            <ChevronDown size={14} className="model-chevron" />
          </div>
        ) : showSearch ? (
          /* Search Bar on Dashboards that filter their content */
          <div className="header-search">
            <Search className="header-search-icon" size={15} />
            <input
              type="text"
              className="header-search-input"
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => onSearch && onSearch(e.target.value)}
            />
          </div>
        ) : null}
      </div>

      {/* Right Actions & Meta */}
      <div className="header-right">
        {/* New Chat Button (ChatGPT style in top header) */}
        {isChat && onNewChat && (
          <button
            className="chatgpt-new-chat-top-btn"
            onClick={onNewChat}
            title="Start a new chat"
          >
            <SquarePen size={16} />
            <span>New chat</span>
          </button>
        )}


        {/* Quick Tour Button - Visible everywhere */}
        <button className="btn btn-outline badge-outline" onClick={onStartTour} style={{ padding: '6px 12px', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
          <Sparkles size={13} style={{ color: '#52525b' }} />
          Take a Quick Tour
        </button>

        {/* Live Date / Time Badge (when on dashboards) */}
        {!isChat && (
          <>
            <div className="live-time-badge">
            <span className="live-time-text">
              {now.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
            <button
              className={`refresh-spin-btn ${refreshing ? 'spinning' : ''}`}
              onClick={onRefresh}
              disabled={refreshing}
              title="Re-fetch market levels, headlines and backend status (bypasses the cache)"
            >
              <RotateCw
                size={13}
                style={{
                  transform: refreshing ? 'rotate(360deg)' : 'none',
                  transition: 'transform 0.6s ease',
                }}
              />
            </button>
          </div>
          </>
        )}

        {/* Action Icons */}
        <div className="header-actions">
          <div className="user-avatar" title="Analyst Workspace">
            <img src="/image.png" alt="Analyst AZ" className="user-avatar-img" />
          </div>
        </div>
      </div>
    </header>
  );
}
