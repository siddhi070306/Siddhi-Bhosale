import React, { useState } from 'react';
import Layout from './components/layout/Layout';
import ChatInterface from './pages/ChatInterface';
import MarketIntelligence from './pages/MarketIntelligence';
import EventAnalysis from './pages/EventAnalysis';
import ImpactGraph from './pages/ImpactGraph';
import AssetImpact from './pages/AssetImpact';
import ScenarioSimulator from './pages/ScenarioSimulator';
import Settings from './pages/Settings';
import { api } from './services/api';
import './styles/index.css';
import './styles/layout.css';
import './styles/pages.css';
import './styles/chat.css';

export default function App() {
  const [activeTab, setActiveTab] = useState('chat');
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [currentEventText, setCurrentEventText] = useState('');
  const [analysis, setAnalysis] = useState(null); // real backend result (+ adapted views); null until an analysis succeeds
  const [notice, setNotice] = useState(null);

  const handleAnalysisComplete = (text, result) => {
    setCurrentEventText(text);
    setAnalysis({ ...result, at: Date.now() });
    setHasAnalyzed(true);
    setNotice(null);
  };

  const handleSelectEvent = async (eventText, source) => {
    setCurrentEventText(eventText);
    setNotice('Analysing selected event…');
    try {
      const res = await api.analyze(eventText, undefined, source);
      handleAnalysisComplete(eventText, res);
      setActiveTab('event-analysis');
    } catch (e) {
      setNotice(`Analysis failed: ${e.message}`);
    }
  };

  const chat = (
    <ChatInterface
      onOpenDashboard={(dashboardId) => setActiveTab(dashboardId)}
      onSelectEventText={(text) => setCurrentEventText(text)}
      onAnalysisComplete={handleAnalysisComplete}
    />
  );

  const renderPage = () => {
    switch (activeTab) {
      case 'home':
        return (
          <MarketIntelligence
            activeEventText={hasAnalyzed ? currentEventText : null}
            analysis={analysis}
            onSelectEvent={handleSelectEvent}
            onNavigateToTab={(tabId) => setActiveTab(tabId)}
          />
        );
      case 'event-analysis':
        return (
          <EventAnalysis
            analysisData={analysis && analysis.view}
            eventText={currentEventText}
            onNavigateToChat={() => setActiveTab('chat')}
            onNavigateToGraph={() => setActiveTab('impact-graph')}
          />
        );
      case 'impact-graph':
        return <ImpactGraph key={analysis ? analysis.at : 'none'} analysis={analysis} onNavigateToChat={() => setActiveTab('chat')} />;
      case 'asset-impact':
        return <AssetImpact key={analysis ? analysis.at : 'none'} analysis={analysis} onNavigateToChat={() => setActiveTab('chat')} />;
      case 'scenario-simulator':
        return <ScenarioSimulator />;
      case 'settings':
        return <Settings />;
      default:
        return chat;
    }
  };

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab} hasAnalyzed={hasAnalyzed}>
      {notice && (
        <div className="card" style={{ marginBottom: 16, padding: '10px 16px', fontSize: 13, color: notice.startsWith('Analysis failed') ? '#991b1b' : '#27272a' }}>
          {notice}
        </div>
      )}
      {renderPage()}
    </Layout>
  );
}
