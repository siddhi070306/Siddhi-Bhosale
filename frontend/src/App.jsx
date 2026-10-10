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
import ProductTour from './components/ui/ProductTour';
import './styles/index.css';
import './styles/layout.css';
import './styles/pages.css';
import './styles/chat.css';

const VALID_TABS = ['chat', 'home', 'asset-impact', 'event-analysis', 'impact-graph', 'scenario-simulator', 'settings'];

function getTabFromHash() {
  const hash = window.location.hash.replace(/^#\/?/, '').trim();
  return VALID_TABS.includes(hash) ? hash : 'chat';
}

export default function App() {
  const [activeTab, setActiveTabState] = useState(getTabFromHash);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [currentEventText, setCurrentEventText] = useState('');
  const [analysis, setAnalysis] = useState(null); // real backend result (+ adapted views); null until an analysis succeeds
  const [notice, setNotice] = useState(null);
  const [messages, setMessages] = useState([]);
  const [tourIsActive, setTourIsActive] = useState(false);

  const setActiveTab = (tab) => {
    setActiveTabState(tab);
    if (window.location.hash !== `#/${tab}`) {
      window.location.hash = `#/${tab}`;
    }
  };

  useEffect(() => {
    const handleHashChange = () => {
      const tab = getTabFromHash();
      setActiveTabState(tab);
    };
    window.addEventListener('hashchange', handleHashChange);
    if (!window.location.hash) {
      window.location.hash = '#/' + activeTab;
    }
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

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
      const res = await api.analyze(analysis.text, undefined, analysis.source, analysis.link, analysis.title);
      handleAnalysisComplete(analysis.text, res);
      if (note) setNotice(note);
    } catch (e) {
      setNotice(`Analysis failed: ${e.message}`);
    }
  };

  const handleSelectEvent = async (eventText, source, link, title) => {
    setCurrentEventText(eventText);
    setNotice('Analysing selected event…');
    try {
      const res = await api.analyze(eventText, undefined, source, link, title);
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
        input: res.input,
        context: res.context,
        hypothesis: res.hypothesis,
        emptyReason: res.emptyReason,
        emptyHint: res.emptyHint,
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
            onNavigateToTab={(tabId) => setActiveTab(tabId)}
          />
        );
      case 'impact-graph':
        return (
          <ImpactGraph
            key={analysis ? analysis.at : 'none'}
            analysis={analysis}
            onNavigateToChat={() => setActiveTab('chat')}
            onSelectEvent={handleSelectEvent}
            onNavigateToTab={(tabId) => setActiveTab(tabId)}
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
            onNavigateToTab={(tabId) => setActiveTab(tabId)}
          />
        );
      case 'scenario-simulator':
        return (
          <ScenarioSimulator
            key={analysis ? analysis.at : 'none'}
            analysis={analysis}
            onNavigateToTab={(tabId) => setActiveTab(tabId)}
            onNavigateToChat={() => setActiveTab('chat')}
          />
        );
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
      onStartTour={() => setTourIsActive(true)}
    >
      <ProductTour 
        isActive={tourIsActive} 
        onComplete={() => setTourIsActive(false)} 
        setActiveTab={setActiveTab} 
        setHasAnalyzed={setHasAnalyzed} 
      />
      {notice && (
        <div className="card" style={{ marginBottom: 16, padding: '10px 16px', fontSize: 13, color: notice.startsWith('Analysis failed') ? '#991b1b' : '#27272a' }}>
          {notice}
        </div>
      )}
      {renderPage()}
    </Layout>
  );
}
