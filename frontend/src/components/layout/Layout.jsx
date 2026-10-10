import React from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

export default function Layout({ activeTab, setActiveTab, hasAnalyzed, children }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  const getSearchPlaceholder = () => {
    switch (activeTab) {
      case 'chat':
        return 'Search conversations, market shocks, or filings...';
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
    <div className="app-container">
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
      />
      <div className="main-wrapper">
        <Header
          searchPlaceholder={getSearchPlaceholder()}
          onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        />
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
