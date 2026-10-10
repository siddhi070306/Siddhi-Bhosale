import React, { useState } from 'react';
import { Search, RotateCw, Bell, HelpCircle, Menu } from 'lucide-react';

export default function Header({
  searchPlaceholder = 'Search events, companies, sectors...',
  onSearch,
  onToggleMobileMenu,
}) {
  const [searchValue, setSearchValue] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

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
          <Search className="header-search-icon" />
          <input
            type="text"
            className="header-search-input"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={handleSearchChange}
          />
        </div>
      </div>

      {/* Right Actions & Meta */}
      <div className="header-right">
        {/* Live Date / Time Badge */}
        <div className="live-time-badge">
          <span className="live-time-text">Apr 25, 2025 10:24 AM</span>
          <button
            className={`refresh-spin-btn ${isRefreshing ? 'spinning' : ''}`}
            onClick={handleRefresh}
            title="Refresh market data"
          >
            <RotateCw size={13} style={{ transform: isRefreshing ? 'rotate(360deg)' : 'none', transition: 'transform 0.6s ease' }} />
          </button>
        </div>

        {/* Action Icons */}
        <div className="header-actions">
          <button className="icon-btn" title="Notifications">
            <Bell size={16} />
            <span className="notification-dot"></span>
          </button>
          <button className="icon-btn" title="Help & Documentation">
            <HelpCircle size={16} />
          </button>
          <div className="user-avatar" title="User Profile">
            G
          </div>
        </div>
      </div>
    </header>
  );
}
