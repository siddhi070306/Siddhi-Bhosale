import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import TopNavTabStrip from './TopNavTabStrip';
import { UiContext } from '../../context/UiContext';
import { api } from '../../services/api';

// Tabs whose page actually filters its content by the header search box.
const SEARCHABLE = new Set(['home', 'event-analysis', 'impact-graph', 'asset-impact']);

export default function Layout({
  activeTab,
  setActiveTab,
  hasAnalyzed,
  onNewChat,
  onStartTour,
  chatSessions = [],
  activeSessionId = null,
  onSelectSession,
  onDeleteSession,
  onClearAllSessions,
  children,
}) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [search, setSearch] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState(null); // backend /api/status, or { error } when unreachable

  const loadStatus = useCallback(() => api.getStatus().then(setStatus).catch((e) => setStatus({ error: e.message })), []);

  useEffect(() => {
    loadStatus();
    const t = setInterval(loadStatus, 30000);
    return () => clearInterval(t);
  }, [loadStatus]);

  // a search typed on one page must not silently filter the next one
  useEffect(() => setSearch(''), [activeTab]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshTick((n) => n + 1); // pages re-fetch market levels and headlines, bypassing the server cache
    await loadStatus();
    setTimeout(() => setRefreshing(false), 600);
  };

  const getSearchPlaceholder = () => {
    switch (activeTab) {
      case 'home':
        return 'Filter headlines by keyword...';
      case 'event-analysis':
        return 'Filter extracted entities...';
      case 'impact-graph':
        return 'Search nodes (companies, sectors, assets...)';
      case 'asset-impact':
        return 'Search assets, sectors, or symbols...';
      default:
        return 'Search...';
    }
  };

  return (
    <UiContext.Provider value={{ search, setSearch, refreshTick, status, refreshStatus: loadStatus }}>
      <div className={`app-container ${isSidebarCollapsed ? 'sidebar-is-collapsed' : ''}`}>
        {/* Mobile Drawer Backdrop */}
        <div
          className={`sidebar-backdrop ${isMobileMenuOpen ? 'active' : ''}`}
          onClick={() => setIsMobileMenuOpen(false)}
          aria-hidden="true"
        />
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          hasAnalyzed={hasAnalyzed}
          isMobileMenuOpen={isMobileMenuOpen}
          onCloseMobileMenu={() => setIsMobileMenuOpen(false)}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          onNewChat={onNewChat}
          chatSessions={chatSessions}
          activeSessionId={activeSessionId}
          onSelectSession={onSelectSession}
          onDeleteSession={onDeleteSession}
          onClearAllSessions={onClearAllSessions}
        />
        <div className="main-wrapper">
          <Header
            activeTab={activeTab}
            searchPlaceholder={getSearchPlaceholder()}
            showSearch={SEARCHABLE.has(activeTab)}
            search={search}
            onSearch={setSearch}
            status={status}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            isSidebarCollapsed={isSidebarCollapsed}
            onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            onNewChat={onNewChat}
            onStartTour={onStartTour}
          />
          <TopNavTabStrip
            activeTab={activeTab}
            setActiveTab={setActiveTab}
          />
          <main className={`page-content ${activeTab === 'chat' ? 'chat-mode-content' : ''}`}>
            <div key={activeTab} className="page-transition-wrapper">
              {children}
            </div>
          </main>
        </div>
      </div>
    </UiContext.Provider>
  );
}
