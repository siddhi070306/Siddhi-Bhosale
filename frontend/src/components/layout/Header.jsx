import React, { useState, useEffect } from 'react';
import {
  Search,
  RotateCw,
  Bell,
  HelpCircle,
  Menu,
  PanelLeft,
  SquarePen,
  ChevronDown,
} from 'lucide-react';

export default function Header({
  activeTab = 'chat',
  searchPlaceholder = 'Search market events, companies, sectors...',
  onSearch,
  onToggleMobileMenu,
  onToggleCollapse,
  onNewChat,
}) {
  const [searchValue, setSearchValue] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 800);
  };

  const handleSearchChange = (e) => {
    setSearchValue(e.target.value);
    if (onSearch) onSearch(e.target.value);
  };

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
          <div className="chatgpt-model-selector" title="Apex Zenith 3.0 Causal Graph Engine">
            <div className="model-logo-badge">
              <img src="/image.png" alt="AZ" className="model-logo-img" />
            </div>
            <span className="model-name">Apex Zenith 3.0</span>
            <ChevronDown size={14} className="model-chevron" />
          </div>
        ) : (
          /* Search Bar on Dashboards */
          <div className="header-search">
            <Search className="header-search-icon" size={15} />
            <input
              type="text"
              className="header-search-input"
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={handleSearchChange}
            />
            <span className="search-shortcut-pill">⌘K</span>
          </div>
        )}
      </div>

      {/* Right Actions & Meta */}
      <div className="header-right">
        {/* New Chat Button (ChatGPT style in top header) */}
        {isChat && onNewChat && (
          <button
            className="chatgpt-new-chat-top-btn"
            onClick={onNewChat}
            title="Start new chat (⌘N)"
          >
            <SquarePen size={16} />
            <span>New chat</span>
          </button>
        )}

        {/* Live Engine Status Pill */}
        <div className="engine-status-pill" title="Deterministic Causal Knowledge Engine Active">
          <span className="engine-pulse-dot"></span>
          <span className="engine-status-text">Causal Engine Live</span>
        </div>

        {/* Live Date / Time Badge (when on dashboards) */}
        {!isChat && (
          <div className="live-time-badge">
            <span className="live-time-text">
              {now.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
            <button
              className={`refresh-spin-btn ${isRefreshing ? 'spinning' : ''}`}
              onClick={handleRefresh}
              title="Refresh market data feed"
            >
              <RotateCw
                size={13}
                style={{
                  transform: isRefreshing ? 'rotate(360deg)' : 'none',
                  transition: 'transform 0.6s ease',
                }}
              />
            </button>
          </div>
        )}

        {/* Action Icons */}
        <div className="header-actions">
          {!isChat && (
            <button className="icon-btn" title="Market Alerts & Signals">
              <Bell size={16} />
              <span className="notification-dot"></span>
            </button>
          )}
          <button className="icon-btn" title="Graph Theory & Documentation">
            <HelpCircle size={16} />
          </button>
          <div className="user-avatar" title="Analyst Workspace">
            <img src="/image.png" alt="Analyst AZ" className="user-avatar-img" />
          </div>
        </div>
      </div>
    </header>
  );
}
