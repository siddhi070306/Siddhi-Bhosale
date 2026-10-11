import React, { useState, useEffect } from 'react';
import Layout from './components/layout/Layout';
import ChatInterface from './pages/ChatInterface';
import MarketIntelligence from './pages/MarketIntelligence';
import EventAnalysis from './pages/EventAnalysis';
import ImpactGraph from './pages/ImpactGraph';
import AssetImpact from './pages/AssetImpact';
import ScenarioSimulator from './pages/ScenarioSimulator';
import EconometricAnalogs from './pages/EconometricAnalogs';
import Settings from './pages/Settings';
import KgAssistant from './pages/KgAssistant';
import PortfolioHedge from './pages/PortfolioHedge';
import { api } from './services/api';
import ProductTour from './components/ui/ProductTour';
import {
  getAllSessions,
  getSessionById,
  saveSession,
  deleteSession,
  clearAllSessions,
  getActiveSessionId,
  setActiveSessionId,
} from './storage/chatStorage';
import './styles/index.css';
import './styles/layout.css';
import './styles/pages.css';
import './styles/chat.css';

const VALID_TABS = ['chat', 'kg-assistant', 'home', 'portfolio-hedge', 'asset-impact', 'econometrics', 'event-analysis', 'impact-graph', 'scenario-simulator', 'settings'];

function getTabFromHash() {
  const hash = window.location.hash.replace(/^#\/?/, '').split('?')[0].trim();
  return VALID_TABS.includes(hash) ? hash : 'chat';
}

export default function App() {
  const [activeTab, setActiveTabState] = useState(getTabFromHash);
  const [econometricAssetId, setEconometricAssetId] = useState(null);
  const [econometricMode, setEconometricMode] = useState('analogs');
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [currentEventText, setCurrentEventText] = useState('');
  const [analysis, setAnalysis] = useState(null); // real backend result (+ adapted views); null until an analysis succeeds
  const [notice, setNotice] = useState(null);
  const [messages, setMessages] = useState([]);
  const [tourIsActive, setTourIsActive] = useState(false);
  const [sessions, setSessions] = useState(() => getAllSessions());
  const [activeSessionId, setActiveSessionIdState] = useState(() => getActiveSessionId());

  const TOUR_STORAGE_KEY = 'apex_zenith_has_seen_tour_v1';

  // Automatically start tour for first-time visitors on this device
  useEffect(() => {
    try {
      const hasSeen = localStorage.getItem(TOUR_STORAGE_KEY);
      if (!hasSeen) {
        const timer = setTimeout(() => {
          setTourIsActive(true);
        }, 700);
        return () => clearTimeout(timer);
      }
    } catch (e) {
      console.warn('Failed to read tour status from localStorage:', e);
    }
  }, []);

  const handleTourComplete = () => {
    try {
      localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    } catch (e) {
      console.warn('Failed to save tour status to localStorage:', e);
    }
    setTourIsActive(false);
    setActiveTab('chat');
  };

  // Restore active session on initial mount
  useEffect(() => {
    const activeId = getActiveSessionId();
    if (activeId) {
      const sess = getSessionById(activeId);
      if (sess) {
        if (sess.messages && sess.messages.length) setMessages(sess.messages);
        if (sess.analysis) {
          setAnalysis(sess.analysis);
          setHasAnalyzed(true);
        }
        if (sess.currentEventText) setCurrentEventText(sess.currentEventText);
      }
    }
  }, []);

  // Sync session changes to localStorage
  useEffect(() => {
    if (messages.length > 0 || analysis) {
      const saved = saveSession({
        id: activeSessionId,
        currentEventText,
        analysis,
        messages,
      });
      if (saved && saved.id !== activeSessionId) {
        setActiveSessionIdState(saved.id);
        setActiveSessionId(saved.id);
      }
      setSessions(getAllSessions());
    }
  }, [messages, analysis, currentEventText]);

  const setActiveTab = (tab, assetId = null, mode = 'analogs') => {
    if (assetId) setEconometricAssetId(assetId);
    if (mode) setEconometricMode(mode);
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
    setActiveSessionIdState(null);
    setActiveSessionId(null);
    setHasAnalyzed(false);
    setCurrentEventText('');
    setAnalysis(null);
    setNotice(null);
    setMessages([]);
  };

  const handleSelectSession = (sessionId) => {
    const sess = getSessionById(sessionId);
    if (!sess) return;
    setActiveSessionIdState(sess.id);
    setActiveSessionId(sess.id);
    setMessages(sess.messages || []);
    setAnalysis(sess.analysis || null);
    setCurrentEventText(sess.currentEventText || '');
    setHasAnalyzed(!!sess.analysis);
    setActiveTab('chat');
  };

  const handleDeleteSession = (sessionId) => {
    deleteSession(sessionId);
    setSessions(getAllSessions());
    if (activeSessionId === sessionId) {
      handleNewChat();
    }
  };

  const handleClearAllSessions = () => {
    clearAllSessions();
    setSessions([]);
    handleNewChat();
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
            onNavigateToTab={(tabId, assetId, mode) => setActiveTab(tabId, assetId, mode)}
          />
        );
      case 'event-analysis':
        return (
          <EventAnalysis
            analysisData={analysis && analysis.view}
            eventText={currentEventText}
            analysis={analysis}
            onNavigateToChat={() => setActiveTab('chat')}
            onNavigateToGraph={() => setActiveTab('impact-graph')}
            onNavigateToTab={(tabId, assetId, mode) => setActiveTab(tabId, assetId, mode)}
          />
        );
      case 'impact-graph':
        return (
          <ImpactGraph
            key={analysis ? analysis.at : 'none'}
            analysis={analysis}
            onNavigateToChat={() => setActiveTab('chat')}
            onSelectEvent={handleSelectEvent}
            onReanalyze={handleReanalyze}
            onNavigateToTab={(tabId, assetId, mode) => setActiveTab(tabId, assetId, mode)}
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
            onNavigateToTab={(tabId, assetId, mode) => setActiveTab(tabId, assetId, mode)}
          />
        );
      case 'scenario-simulator':
        return (
          <ScenarioSimulator
            key={analysis ? analysis.at : 'none'}
            analysis={analysis}
            onNavigateToTab={(tabId, assetId, mode) => setActiveTab(tabId, assetId, mode)}
            onNavigateToChat={() => setActiveTab('chat')}
          />
        );
      case 'econometrics':
        return (
          <EconometricAnalogs
            key={`${econometricAssetId || 'default'}-${econometricMode}`}
            analysis={analysis}
            initialAssetId={econometricAssetId}
            initialMode={econometricMode}
            onNavigateToTab={(tabId, assetId, mode) => setActiveTab(tabId, assetId, mode)}
          />
        );
      case 'settings':
        return <Settings />;
      case 'portfolio-hedge':
        return (
          <PortfolioHedge
            analysis={analysis}
            onNavigateToTab={(tabId, assetId, mode) => setActiveTab(tabId, assetId, mode)}
            onSelectEvent={handleSelectEvent}
          />
        );
      case 'kg-assistant':
        return (
          <KgAssistant
            analysis={analysis}
            onNavigateToTab={(tabId, assetId, mode) => setActiveTab(tabId, assetId, mode)}
            onSelectEventText={(text) => setCurrentEventText(text)}
          />
        );
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
      chatSessions={sessions}
      activeSessionId={activeSessionId}
      onSelectSession={handleSelectSession}
      onDeleteSession={handleDeleteSession}
      onClearAllSessions={handleClearAllSessions}
      overlay={(
        <ProductTour
          isActive={tourIsActive}
          onComplete={handleTourComplete}
          setActiveTab={setActiveTab}
          setHasAnalyzed={setHasAnalyzed}
        />
      )}
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
