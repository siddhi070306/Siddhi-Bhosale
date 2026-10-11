import React, { useState, useEffect } from 'react';
import {
  Search,
  RotateCw,
  Menu,
  PanelLeft,
  SquarePen,
  ChevronDown,
  Sparkles,
  Clock,
  Activity,
} from 'lucide-react';
import { prefs } from '../../services/api';

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
  const isLive = prefs.getLive();

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
        {/* Live Market Data / Engine Connection Chip */}
        <div
          className="header-status-badge"
          title={
            status?.error
              ? `Backend offline: ${status.error}`
              : isLive
              ? 'Real-time market data active via FRED & Yahoo Finance'
              : 'Knowledge-graph prior transmission weights mode'
          }
        >
          <span className={`status-dot ${status?.error ? 'error' : isLive ? 'pulsing' : 'priors'}`} />
          <span className="header-status-text">
            {status?.error ? 'Offline' : isLive ? 'Live FRED/YF' : 'Priors'}
          </span>
        </div>

        {/* New Chat Button (ChatGPT style in top header) */}
        {isChat && onNewChat && (
          <button
            className="chatgpt-new-chat-top-btn"
            onClick={onNewChat}
            title="Start a new chat"
          >
            <SquarePen size={16} />
            <span className="new-chat-text">New chat</span>
          </button>
        )}

        {/* Quick Tour Button - Visible everywhere */}
        <button
          className="btn btn-outline badge-outline header-tour-btn"
          onClick={onStartTour}
          title="Take a Quick Tour"
        >
          <Sparkles size={13} style={{ color: '#52525b' }} />
          <span className="tour-btn-text">Quick Tour</span>
        </button>

        {/* Live Date / Time Badge (when on dashboards) */}
        {!isChat && (
          <div className="live-time-badge" title="Market clock (click arrow to re-fetch real-time data)">
            <Clock size={12} className="live-clock-icon" />
            <span className="live-time-full">
              {now.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
            </span>
            <span className="live-time-compact">
              {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <button
              className={`refresh-spin-btn ${refreshing ? 'spinning' : ''}`}
              onClick={onRefresh}
              disabled={refreshing}
              title="Re-fetch market levels, headlines and backend status"
              aria-label="Refresh market data"
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
