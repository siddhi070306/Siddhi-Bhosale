import React, { useState } from 'react';
import Layout from './components/layout/Layout';
import ChatInterface from './pages/ChatInterface';
import MarketIntelligence from './pages/MarketIntelligence';
import EventAnalysis from './pages/EventAnalysis';
import ImpactGraph from './pages/ImpactGraph';
import AssetImpact from './pages/AssetImpact';
import ScenarioSimulator from './pages/ScenarioSimulator';
import Settings from './pages/Settings';
import { api, MOCK_DATA } from './services/api';
import './styles/index.css';
import './styles/layout.css';
import './styles/pages.css';
import './styles/chat.css';

export default function App() {
  
  const [activeTab, setActiveTab] = useState('chat');
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [currentEventText, setCurrentEventText] = useState(
    'Brent crude jumped 12% after escalating tensions in the Middle East raised fears of supply disruptions.'
  );
  const [currentAnalysis, setCurrentAnalysis] = useState(MOCK_DATA.eventAnalysis);

  const handleAnalysisComplete = (text, analysisResult) => {
    setCurrentEventText(text);
    setCurrentAnalysis(analysisResult);
    setHasAnalyzed(true);
  };

  const handleSelectEvent = async (eventText) => {
    setCurrentEventText(eventText);
    try {
      const res = await api.analyze(eventText);
      setCurrentAnalysis(res);
    } catch (_) {}
    setActiveTab('event-analysis');
  };

  const renderPage = () => {
    switch (activeTab) {
      case 'chat':
        return (
          <ChatInterface
            onOpenDashboard={(dashboardId) => setActiveTab(dashboardId)}
            onSelectEventText={(text) => setCurrentEventText(text)}
            onAnalysisComplete={handleAnalysisComplete}
          />
        );
      case 'home':
        return (
          <MarketIntelligence
            activeEventText={hasAnalyzed ? currentEventText : null}
            analysisData={currentAnalysis}
            onSelectEvent={handleSelectEvent}
            onNavigateToTab={(tabId) => setActiveTab(tabId)}
          />
        );
      case 'event-analysis':
        return (
          <EventAnalysis
            analysisData={currentAnalysis}
            eventText={currentEventText}
            onNavigateToChat={() => setActiveTab('chat')}
            onNavigateToGraph={() => setActiveTab('impact-graph')}
          />
        );
      case 'impact-graph':
        return <ImpactGraph />;
      case 'asset-impact':
        return <AssetImpact />;
      case 'scenario-simulator':
        return <ScenarioSimulator />;
      case 'settings':
        return <Settings />;
      default:
        return (
          <ChatInterface
            onOpenDashboard={(dashboardId) => setActiveTab(dashboardId)}
            onSelectEventText={(text) => setCurrentEventText(text)}
            onAnalysisComplete={handleAnalysisComplete}
          />
        );
    }
  };

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab} hasAnalyzed={hasAnalyzed}>
      {renderPage()}
    </Layout>
  );
}
