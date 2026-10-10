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
  const [messages, setMessages] = useState([]);

  const handleAnalysisComplete = (text, result) => {
    setCurrentEventText(text);
    setAnalysis({ ...result, at: Date.now() });
    setHasAnalyzed(true);
    setNotice(null);
  };

  const handleNewChat = () => {
    setActiveTab('chat');
    setHasAnalyzed(false);
    setCurrentEventText('');
    setAnalysis(null);
    setNotice(null);
    setMessages([]);
  };

  // Re-run the current analysis (e.g. after an asset was added to the graph) without leaving the page
  const handleReanalyze = async (note) => {
    if (!analysis) return;
    try {
      const res = await api.analyze(analysis.text, undefined, analysis.source, analysis.link);
      handleAnalysisComplete(analysis.text, res);
      if (note) setNotice(note);
    } catch (e) {
      setNotice(`Analysis failed: ${e.message}`);
    }
  };

  const handleSelectEvent = async (eventText, source, link) => {
    setCurrentEventText(eventText);
    setNotice('Analysing selected event…');
    try {
      const res = await api.analyze(eventText, undefined, source, link);
      handleAnalysisComplete(eventText, res);
      // Add to messages if on chat
      const aiMsg = {
        id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        sender: 'ai',
        eventText,
        summary: res.summary,
        llmNote: res.llmNote,
        entities: res.view.extractedEntities,
        details: res.view.details,
        noEvent: res.noEvent,
        kbGuard: res.kbGuard,
      };
      setMessages([
        { id: `usr-${Date.now()}`, sender: 'user', text: eventText },
        aiMsg,
      ]);
      setActiveTab('chat');
    } catch (e) {
      setNotice(`Analysis failed: ${e.message}`);
    }
  };

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
        return (
          <ImpactGraph
            key={analysis ? analysis.at : 'none'}
            analysis={analysis}
            onNavigateToChat={() => setActiveTab('chat')}
            onSelectEvent={handleSelectEvent}
          />
        );
      case 'asset-impact':
        return (
          <AssetImpact
            key={analysis ? analysis.at : 'none'}
            analysis={analysis}
            onNavigateToChat={() => setActiveTab('chat')}
            onSelectEvent={handleSelectEvent}
            onReanalyze={handleReanalyze}
          />
        );
      case 'scenario-simulator':
        return <ScenarioSimulator key={analysis ? analysis.at : 'none'} analysis={analysis} />;
      case 'settings':
        return <Settings />;
      default:
        return (
          <ChatInterface
            messages={messages}
            setMessages={setMessages}
            hasAnalyzed={hasAnalyzed}
            onOpenDashboard={(dashboardId) => setActiveTab(dashboardId)}
            onSelectEventText={(text) => setCurrentEventText(text)}
            onAnalysisComplete={handleAnalysisComplete}
            onNewChat={handleNewChat}
          />
        );
    }
  };

  return (
    <Layout
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      hasAnalyzed={hasAnalyzed}
      onNewChat={handleNewChat}
    >
      {notice && (
        <div className="card" style={{ marginBottom: 16, padding: '10px 16px', fontSize: 13, color: notice.startsWith('Analysis failed') ? '#991b1b' : '#27272a' }}>
          {notice}
        </div>
      )}
      {renderPage()}
    </Layout>
  );
}
