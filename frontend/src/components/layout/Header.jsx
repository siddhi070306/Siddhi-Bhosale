import React, { useState, useEffect } from 'react';
import { Search, RotateCw, Bell, HelpCircle, Menu } from 'lucide-react';

export default function Header({
  searchPlaceholder = 'Search market events, companies, sectors...',
  onSearch,
  onToggleMobileMenu,
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

  return (
    <header className="top-header">
      {/* Left: Mobile Toggle & Search */}
      <div className="header-left">
        <button
          className="mobile-menu-btn"
          onClick={onToggleMobileMenu}
          aria-label="Toggle navigation menu"
          title="Toggle navigation menu"
        >
          <Menu size={18} />
        </button>
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
      </div>

      {/* Right Actions & Meta */}
      <div className="header-right">
        {/* Live Engine Status Pill */}
        <div className="engine-status-pill" title="Deterministic Causal Knowledge Engine Active">
          <span className="engine-pulse-dot"></span>
          <span className="engine-status-text">Causal Engine Live</span>
        </div>

        {/* Live Date / Time Badge */}
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

        {/* Action Icons */}
        <div className="header-actions">
          <button className="icon-btn" title="Market Alerts & Signals">
            <Bell size={16} />
            <span className="notification-dot"></span>
          </button>
          <button className="icon-btn" title="Graph Theory & Documentation">
            <HelpCircle size={16} />
          </button>
          <div className="user-avatar" title="Analyst Workspace">
            AZ
          </div>
        </div>
      </div>
    </header>
  );
}
