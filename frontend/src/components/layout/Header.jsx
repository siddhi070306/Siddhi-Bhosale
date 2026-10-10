import React, { useState, useEffect } from 'react';
import {
  Search,
  RotateCw,
  Menu,
  PanelLeft,
  SquarePen,
  ChevronDown,
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
}) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const isChat = activeTab === 'chat';

  // Engine pill reflects the real backend: unreachable / LLM key missing / LLM provider active
  let pill = { text: 'Connecting…', color: '#a1a1aa', title: 'Checking the backend' };
  if (status && status.error) pill = { text: 'Backend offline', color: '#dc2626', title: status.error };
  else if (status && status.llm_required && !status.llm) pill = { text: 'LLM key missing', color: '#d97706', title: 'The LLM is required for graph building but no key is configured in .env' };
  else if (status) pill = { text: status.llm ? `Engine live · ${status.llm}` : 'Engine live · rules only', color: '#16a34a', title: `LLM: ${status.llm ? `${status.llm} (${status.llm_model || 'default model'})` : 'none'} · FRED key: ${status.fred_key ? 'set' : 'not set'} · NewsAPI key: ${status.news_key ? 'set' : 'not set'}` };

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

        {/* Live Engine Status Pill */}
        <div className="engine-status-pill" title={pill.title}>
          <span className="engine-pulse-dot" style={{ background: pill.color, boxShadow: `0 0 0 3px ${pill.color}33` }}></span>
          <span className="engine-status-text">{pill.text}</span>
        </div>

        {/* Live Date / Time Badge (when on dashboards) */}
        {!isChat && (
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
