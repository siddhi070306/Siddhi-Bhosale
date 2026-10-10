import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  ArrowUp,
  GitBranch,
  TrendingUp,
  Sliders,
  Layers,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Fuel,
  Landmark,
  Building2,
  Cpu,
  User,
  Home,
} from 'lucide-react';
import { api } from '../services/api';

export default function ChatInterface({
  messages: externalMessages,
  setMessages: externalSetMessages,
  onOpenDashboard,
  onSelectEventText,
  onAnalysisComplete,
}) {
  const [internalMessages, setInternalMessages] = useState([]);
  const messages = externalMessages !== undefined ? externalMessages : internalMessages;
  const setMessages = externalSetMessages || setInternalMessages;

  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const starters = [
    {
      title: 'Crude Oil Shock',
      icon: Fuel,
      colorClass: 'starter-icon-amber',
      text: 'Brent crude jumped 12% after escalating tensions in the Middle East raised fears of supply disruptions.',
    },
    {
      title: 'Federal Reserve Policy',
      icon: Landmark,
      colorClass: 'starter-icon-indigo',
      text: 'The Federal Reserve raised interest rates by 50 basis points on Wednesday, more than markets had expected.',
    },
    {
      title: 'Banking & Risk Regulation',
      icon: Building2,
      colorClass: 'starter-icon-emerald',
      text: 'The RBI imposed tighter rules on banks, raising risk weights on unsecured consumer loans. Bank stocks fell 2.5%.',
    },
    {
      title: 'Semiconductor Demand',
      icon: Cpu,
      colorClass: 'starter-icon-cyan',
      text: 'TSMC reported record quarterly net profits, forecasting a 25% surge in AI chip demand across global suppliers.',
    },
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (textToSend) => {
    const text = textToSend || inputText;
    if (!text.trim() || loading) return;

    const userMsgId = `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const userMsg = { id: userMsgId, sender: 'user', text };
    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setLoading(true);

    if (onSelectEventText) {
      onSelectEventText(text);
    }

    try {
      const result = await api.analyze(text);
      if (onAnalysisComplete) {
        onAnalysisComplete(text, result);
      }
      const aiMsgId = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const aiMsg = {
        id: aiMsgId,
        sender: 'ai',
        eventText: text,
        summary: result.summary,
        llmNote: result.llmNote,
        entities: result.view.extractedEntities,
        details: result.view.details,
        noEvent: result.noEvent,
      };
      setMessages((prev) => [...prev, aiMsg]);
      // Note: We stay on the chat page like ChatGPT, revealing the dashboards in the sidebar and action buttons
    } catch (e) {
      const errId = `err-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setMessages((prev) => [...prev, { id: errId, sender: 'ai', error: e.message }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-container">
      {messages.length === 0 ? (
        /* Welcome / Empty State Screen */
        <div className="chat-welcome-wrapper">
          <div className="chat-welcome-avatar">
            <img src="/image.png" alt="Apex Zenith" className="welcome-logo-img" />
          </div>
          <h1 className="chat-welcome-title">
            What financial event are you analyzing today?
          </h1>
          <p className="chat-welcome-desc">
            Paste news, earnings reports, or regulatory filings. Apex Zenith extracts entities, evaluates factual quotes, and maps causal propagation across connected markets instantly.
          </p>

          {/* 4 Clickable Starter Cards */}
          <div className="chat-starters-grid">
            {starters.map((s, idx) => {
              const Icon = s.icon;
              return (
                <div
                  key={idx}
                  className="chat-starter-card"
                  onClick={() => handleSend(s.text)}
                >
                  <div className="chat-starter-title">
                    <div className={`chat-starter-icon-badge ${s.colorClass}`}>
                      <Icon size={16} />
                    </div>
                    <span>{s.title}</span>
                  </div>
                  <div className="chat-starter-snippet">"{s.text}"</div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Message Stream */
        <div className="chat-messages-stream">
          {messages.map((msg) =>
            msg.sender === 'user' ? (
              <div key={msg.id} className="chat-message-row user">
                <div className="chat-msg-body" style={{ alignItems: 'flex-end' }}>
                  <div className="chat-bubble-user">{msg.text}</div>
                </div>
                <div className="chat-msg-avatar user-avatar" title="Analyst">
                  <User size={15} />
                </div>
              </div>
            ) : msg.error ? (
              <div key={msg.id} className="chat-message-row">
                <div className="chat-msg-avatar ai">
                  <img src="/image.png" alt="Apex Zenith" className="chat-ai-avatar-img" />
                </div>
                <div className="chat-msg-body">
                  <div className="chat-bubble-ai">
                    <p style={{ fontSize: 13.5, color: '#991b1b', lineHeight: 1.6 }}>Analysis failed: {msg.error}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div key={msg.id} className="chat-message-row">
                <div className="chat-msg-avatar ai">
                  <img src="/image.png" alt="Apex Zenith" className="chat-ai-avatar-img" />
                </div>
                <div className="chat-msg-body">
                  <div className="chat-bubble-ai">
                    {/* Header */}
                    <div className="chat-ai-header">
                      <div className="chat-ai-title">
                        <Sparkles size={16} />
                        <span>Analysis & Causal Mapping</span>
                      </div>
                      <span className="badge badge-black">{msg.noEvent ? 'No event detected' : 'Analysis Complete'}</span>
                    </div>

                    {/* Summary text */}
                    <p style={{ fontSize: 13.5, color: '#27272a', lineHeight: 1.6 }}>
                      {msg.summary}
                    </p>
                    {msg.llmNote && <p style={{ fontSize: 11.5, color: '#71717a' }}>{msg.llmNote}</p>}

                    {/* Extracted metadata box */}
                    <div className="chat-extracted-meta-grid">
                      <div>
                        <div className="chat-meta-item-label">Event Type</div>
                        <div className="chat-meta-item-val">{msg.details.eventType}</div>
                      </div>
                      <div>
                        <div className="chat-meta-item-label">Direction & Magnitude</div>
                        <div className="chat-meta-item-val" style={{ color: '#166534' }}>
                          {msg.details.direction} ({msg.details.magnitude})
                        </div>
                      </div>
                      <div>
                        <div className="chat-meta-item-label">Timeframe</div>
                        <div className="chat-meta-item-val">{msg.details.timeframe}</div>
                      </div>
                    </div>

                    {/* Extracted Entities preview */}
                    <div style={{ marginTop: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#71717a' }}>
                        Entities mentioned in the text:
                      </span>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                        {msg.entities.commodities.concat(msg.entities.companies, msg.entities.sectors).slice(0, 8).map((item) => (
                          <span key={item} className="entity-tag" style={{ fontSize: 11.5 }}>
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Direct Launch Buttons to Open All Dashboards */}
                    <div className="chat-dashboard-actions">
                      <div className="chat-actions-heading">
                        All Visual Dashboards are updated and unlocked for this event:
                      </div>
                      <div className="chat-dashboard-buttons-wrap">
                        <button
                          className="chat-launch-btn primary"
                          onClick={() => onOpenDashboard('event-analysis')}
                        >
                          <Layers size={13} />
                          <span>Detailed Event Diagnostics</span>
                          <ArrowRight size={12} />
                        </button>

                        <button
                          className="chat-launch-btn"
                          onClick={() => onOpenDashboard('impact-graph')}
                        >
                          <GitBranch size={13} />
                          <span>Financial Impact Graph</span>
                        </button>

                        <button
                          className="chat-launch-btn"
                          onClick={() => onOpenDashboard('asset-impact')}
                        >
                          <TrendingUp size={13} />
                          <span>Affected Assets Table</span>
                        </button>

                        <button
                          className="chat-launch-btn"
                          onClick={() => onOpenDashboard('scenario-simulator')}
                        >
                          <Sliders size={13} />
                          <span>Scenario Simulator</span>
                        </button>

                        <button
                          className="chat-launch-btn"
                          onClick={() => onOpenDashboard('home')}
                        >
                          <Home size={13} />
                          <span>Overview Dashboard</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          )}

          {loading && (
            <div className="chat-message-row">
              <div className="chat-msg-avatar ai">
                <img src="/image.png" alt="Apex Zenith" className="chat-ai-avatar-img" />
              </div>
              <div className="chat-msg-body">
                <div className="chat-bubble-ai" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14 }}>
                  <RefreshCw size={14} className="spinning" />
                  <span style={{ fontSize: 13, color: '#52525b' }}>
                    Extracting entities, checking quotes, and tracing causal graph...
                  </span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Modern ChatGPT-like Input Bar */}
      <div className="chat-input-container">
        <div className="chat-input-box">
          <textarea
            className="chat-input-textarea"
            rows={2}
            placeholder="Enter financial news, headlines, or paste an article..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
          />

          <div className="chat-input-footer">
            <div className="chat-input-badges">
              <span className="chat-mode-pill">
                <ShieldCheck size={13} color="#166534" />
                <span>Deterministic Graph + Quote Grounding</span>
              </span>
            </div>

            <button
              className="chat-send-btn"
              onClick={() => handleSend()}
              disabled={!inputText.trim() || loading}
              title="Send message (Enter)"
            >
              <ArrowUp size={16} />
            </button>
          </div>
        </div>
        <p className="chat-disclaimer">
          Apex Zenith evaluates causal propagation using deterministic knowledge graphs & verified quotes.
        </p>
      </div>
    </div>
  );
}
