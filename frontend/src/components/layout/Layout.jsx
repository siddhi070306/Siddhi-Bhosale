import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

export default function Layout({
  activeTab,
  setActiveTab,
  hasAnalyzed,
  onNewChat,
  children,
}) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const getSearchPlaceholder = () => {
    switch (activeTab) {
      case 'chat':
        return 'Search market events, companies, sectors...';
      case 'home':
        return 'Search events, companies, sectors...';
      case 'event-analysis':
        return 'Search headline, entity, or ticker...';
      case 'impact-graph':
        return 'Search nodes (companies, sectors, assets...)';
      case 'asset-impact':
        return 'Search assets, sectors, or symbols...';
      case 'scenario-simulator':
        return 'Search macroeconomic scenarios...';
      default:
        return 'Search events, companies, sectors...';
    }
  };

  return (
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
      />
      <div className="main-wrapper">
        <Header
          activeTab={activeTab}
          searchPlaceholder={getSearchPlaceholder()}
          onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          onNewChat={onNewChat}
        />
        <main className={`page-content ${activeTab === 'chat' ? 'chat-mode-content' : ''}`}>
          {children}
        </main>
      </div>
    </div>
  );
}
