import React, { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
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
import { api, adaptResult, slimResult } from './services/api';
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
const LIB_PREFIX = 'lib:'; // Recent-chats entries that exist only in the backend's analysis library

// server times are "YYYY-MM-DD HH:MM:SS" (local); browser timestamps are milliseconds
const parseServerTime = (t) => {
  const ms = Date.parse(String(t || '').replace(' ', 'T'));
  return Number.isNaN(ms) ? 0 : ms;
};
const pad = (n) => String(n).padStart(2, '0');
const toServerTime = (ms) => {
  const d = new Date(ms || Date.now());
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const libraryIdOf = (analysis) => (analysis && analysis.raw && (analysis.raw.library_id || analysis.raw.article_id)) || null;

function buildAiMessage(eventText, res) {
  return {
    id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    sender: 'ai',
    eventText,
    summary: res.summary,
    llmNote: res.llmNote,
    entities: res.view.extractedEntities,
    details: res.view.details,
    noEvent: res.noEvent,
    contextOnly: res.contextOnly,
    kbGuard: res.kbGuard,
    input: res.input,
    context: res.context,
    hypothesis: res.hypothesis,
    emptyReason: res.emptyReason,
    emptyHint: res.emptyHint,
  };
}

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
  const [library, setLibrary] = useState({ total: 0, items: [] }); // graphs saved on the backend (analysis library)
  const [isAnalyzingEvent, setIsAnalyzingEvent] = useState(false);
  const [analyzingEventInfo, setAnalyzingEventInfo] = useState(null);

  const refreshLibrary = () =>
    api
      .listAnalyses(200)
      .then(setLibrary)
      .catch(() => setLibrary((prev) => prev)); // the sidebar keeps showing browser chats if the backend is down

  useEffect(() => {
    refreshLibrary();
  }, []);

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
    refreshLibrary(); // the backend filed this graph in the library
  };

  // Reopen a graph saved in the backend library as a chat, with every dashboard (the full result is stored there).
  const handleOpenSaved = async (libraryId) => {
    setNotice('Opening saved graph…');
    try {
      const { record, result } = await api.getAnalysis(libraryId);
      if (!result) throw new Error('the full result of this analysis is no longer stored');
      const text = result.text || record.excerpt || record.title;
      const res = adaptResult(result, text, record.link ? 'Saved analysis' : null, record.link, record.title);
      setActiveSessionIdState(null); // a new browser chat is created for it by the session sync below
      setActiveSessionId(null);
      setCurrentEventText(text);
      setAnalysis({ ...res, at: Date.now() });
      setHasAnalyzed(true);
      setMessages([{ id: `usr-${Date.now()}`, sender: 'user', text: record.title || text }, buildAiMessage(text, res)]);
      setNotice(`Reopened the saved graph from ${record.t}${record.origin === 'import' ? ' (imported from chat history)' : ''}.`);
      setActiveTab('chat');
    } catch (e) {
      setNotice(`Analysis failed: could not open the saved graph (${e.message})`);
    }
  };

  // Send every analysis in this browser's chat history to the backend library, so the KG assistant can use it.
  const handleImportHistory = async () => {
    const items = getAllSessions()
      .filter((s) => s.analysis && s.analysis.raw && Array.isArray(s.analysis.raw.events))
      .map((s) => ({
        result: slimResult(s.analysis.raw),
        title: s.analysis.title || s.title || null,
        link: s.analysis.link || null,
        t: toServerTime(s.updatedAt || s.createdAt),
      }));
    const totals = { imported: 0, already_in_library: 0, skipped: 0, found: items.length, total: library.total };
    for (let i = 0; i < items.length; i += 25) {
      const out = await api.importAnalyses(items.slice(i, i + 25));
      totals.imported += out.imported;
      totals.already_in_library += out.already_in_library;
      totals.skipped += out.skipped;
      totals.total = out.total;
    }
    await refreshLibrary();
    return totals;
  };

  // Recent chats = this browser's chats + graphs saved on the backend that this browser does not hold (newest first)
  const localLibraryIds = new Set(sessions.map((s) => libraryIdOf(s.analysis)).filter(Boolean));
  const recentChats = [
    ...sessions,
    ...(library.items || [])
      .filter((it) => !localLibraryIds.has(it.id))
      .map((it) => ({ id: LIB_PREFIX + it.id, title: it.title, updatedAt: parseServerTime(it.t), saved: true, origin: it.origin })),
  ].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

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
    if (sessionId && sessionId.startsWith(LIB_PREFIX)) {
      handleOpenSaved(sessionId.slice(LIB_PREFIX.length));
      return;
    }
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
    if (sessionId && sessionId.startsWith(LIB_PREFIX)) {
      api
        .deleteAnalysis(sessionId.slice(LIB_PREFIX.length))
        .then(refreshLibrary)
        .catch((e) => setNotice(`Analysis failed: could not delete the saved graph (${e.message})`));
      return;
    }
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
    setIsAnalyzingEvent(true);
    setAnalyzingEventInfo({ text: eventText, title: title || eventText });
    setNotice(null);

    // Provide instant feedback: record user prompt in chat and transition immediately to Knowledge Graph Generator
    const userMsgId = `usr-${Date.now()}`;
    const displayText = title || eventText;
    setMessages((prev) => [...prev, { id: userMsgId, sender: 'user', text: displayText }]);
    setActiveTab('chat');

    try {
      const res = await api.analyze(eventText, undefined, source, link, title);
      // a headline analysis is a new chat: never overwrite the chat that happened to be open
      setActiveSessionIdState(null);
      setActiveSessionId(null);
      handleAnalysisComplete(eventText, res);
      setMessages((prev) => [
        ...prev,
        buildAiMessage(eventText, res),
      ]);
    } catch (e) {
      setNotice(`Analysis failed: ${e.message}`);
      setMessages((prev) => [
        ...prev,
        { id: `err-${Date.now()}`, sender: 'ai', error: e.message },
      ]);
    } finally {
      setIsAnalyzingEvent(false);
      setAnalyzingEventInfo(null);
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
            isAnalyzingEvent={isAnalyzingEvent}
            analyzingEventInfo={analyzingEventInfo}
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
            isAnalyzing={isAnalyzingEvent}
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
            libraryTotal={library.total}
            localAnalyses={sessions.filter((s) => s.analysis && s.analysis.raw).length}
            onImportHistory={handleImportHistory}
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
            isAnalyzing={isAnalyzingEvent}
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
      chatSessions={recentChats}
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
      {isAnalyzingEvent && (
        <div
          className="card"
          style={{
            marginBottom: 16,
            padding: '12px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            borderLeft: '4px solid #18181b',
            backgroundColor: '#ffffff',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <RefreshCw size={15} className="spinning" color="#18181b" />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#18181b' }}>
                Constructing Knowledge Graph…
              </div>
              <div style={{ fontSize: 12, color: '#71717a' }}>
                Tracing multi-hop causal transmission paths for “{analyzingEventInfo?.title || analyzingEventInfo?.text}”
              </div>
            </div>
          </div>
          <span className="badge badge-black" style={{ fontSize: 11, padding: '3px 8px' }}>
            Processing
          </span>
        </div>
      )}
      {renderPage()}
    </Layout>
  );
}
