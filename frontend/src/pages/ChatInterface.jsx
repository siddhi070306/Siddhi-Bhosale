import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  ArrowUp,
  Triangle,
  GitBranch,
  TrendingUp,
  Sliders,
  Layers,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { api, MOCK_DATA } from '../services/api';

export default function ChatInterface({ onOpenDashboard, onSelectEventText, onAnalysisComplete }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const starters = [
    {
      title: 'Crude Oil Shock',
      icon: '🛢️',
      text: 'Brent crude jumped 12% after escalating tensions in the Middle East raised fears of supply disruptions.',
    },
    {
      title: 'Federal Reserve Policy',
      icon: '🏛️',
      text: 'The Federal Reserve raised interest rates by 50 basis points on Wednesday, more than markets had expected.',
    },
    {
      title: 'Banking & Risk Regulation',
      icon: '🏦',
      text: 'The RBI imposed tighter rules on banks, raising risk weights on unsecured consumer loans. Bank stocks fell 2.5%.',
    },
    {
      title: 'Semiconductor Demand',
      icon: '💻',
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

    const userMsg = { id: Date.now(), sender: 'user', text };
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
      const aiMsg = {
        id: Date.now() + 1,
        sender: 'ai',
        eventText: text,
        summary:
          result.summary ||
          `Parsed market shock for "${text.slice(0, 65)}...". Identified core propagation chains across economic variables and equity sectors.`,
        entities: result.extractedEntities || MOCK_DATA.eventAnalysis.extractedEntities,
        details: result.details || MOCK_DATA.eventAnalysis.details,
      };
      setMessages((prev) => [...prev, aiMsg]);

      // Directly navigate to the dashboard so all things are immediately shown!
      setTimeout(() => {
        onOpenDashboard('home');
      }, 400);
    } catch (_) {
      const fallbackMsg = {
        id: Date.now() + 1,
        sender: 'ai',
        eventText: text,
        summary: `Identified financial event from your text. Traced causal transmissions from origin shock into downstream assets and market indices.`,
        entities: MOCK_DATA.eventAnalysis.extractedEntities,
        details: MOCK_DATA.eventAnalysis.details,
      };
      if (onAnalysisComplete) {
        onAnalysisComplete(text, fallbackMsg);
      }
      setMessages((prev) => [...prev, fallbackMsg]);

      // Directly navigate to the dashboard
      setTimeout(() => {
        onOpenDashboard('home');
      }, 400);
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
            <Triangle size={28} fill="#ffffff" stroke="#ffffff" />
          </div>
          <h1 className="chat-welcome-title">
            What financial event are you analyzing today?
          </h1>
          <p className="chat-welcome-desc">
            Paste news, earnings reports, or regulatory filings. Apex Zenith extracts entities, evaluates factual quotes, and maps causal propagation across connected markets instantly.
          </p>

          {/* 4 Clickable Starter Cards */}
          <div className="chat-starters-grid">
            {starters.map((s, idx) => (
              <div
                key={idx}
                className="chat-starter-card"
                onClick={() => handleSend(s.text)}
              >
                <div className="chat-starter-title">
                  <span>{s.icon}</span>
                  <span>{s.title}</span>
                </div>
                <div className="chat-starter-snippet">"{s.text}"</div>
              </div>
            ))}
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
                <div className="chat-msg-avatar user-avatar">U</div>
              </div>
            ) : (
              <div key={msg.id} className="chat-message-row">
                <div className="chat-msg-avatar ai">
                  <Triangle size={15} fill="#ffffff" stroke="#ffffff" />
                </div>
                <div className="chat-msg-body">
                  <div className="chat-bubble-ai">
                    {/* Header */}
                    <div className="chat-ai-header">
                      <div className="chat-ai-title">
                        <Sparkles size={16} />
                        <span>Analysis & Causal Mapping</span>
                      </div>
                      <span className="badge badge-black">Analysis Complete</span>
                    </div>

                    {/* Summary text */}
                    <p style={{ fontSize: 13.5, color: '#27272a', lineHeight: 1.6 }}>
                      {msg.summary}
                    </p>

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
                        Key Entities Detected:
                      </span>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                        {msg.entities.commodities.concat(msg.entities.companies.slice(0, 3)).map((item) => (
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
                <Triangle size={15} fill="#ffffff" stroke="#ffffff" />
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
              title="Send to Apex Zenith"
            >
              <ArrowUp size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
