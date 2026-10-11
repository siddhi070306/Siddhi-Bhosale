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
  User,
  Home,
} from 'lucide-react';
import { api } from '../services/api';
import { useUi } from '../context/UiContext';

export default function ChatInterface({
  messages: externalMessages,
  setMessages: externalSetMessages,
  onOpenDashboard,
  onSelectEventText,
  onAnalysisComplete,
  isAnalyzing = false,
}) {
  const [internalMessages, setInternalMessages] = useState([]);
  const messages = externalMessages !== undefined ? externalMessages : internalMessages;
  const setMessages = externalSetMessages || setInternalMessages;

  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const isLoading = loading || isAnalyzing;
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const { status } = useUi();
  const engineLabel = status && status.llm ? `LLM (${status.llm}) + quote-verified graph` : status && status.error ? 'Backend offline' : 'Graph + quote grounding';

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(Math.max(textareaRef.current.scrollHeight, 26), 180)}px`;
    }
  }, [inputText]);

  const handleSend = async (textToSend) => {
    const text = textToSend || inputText;
    if (!text.trim() || isLoading) return;

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
        contextOnly: result.contextOnly,
        kbGuard: result.kbGuard,
        input: result.input,
        context: result.context,
        hypothesis: result.hypothesis,
        emptyReason: result.emptyReason,
        emptyHint: result.emptyHint,
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
                      <span className="badge badge-black">{msg.noEvent ? 'No event detected' : msg.contextOnly ? 'Context graph (no move stated)' : 'Analysis Complete'}</span>
                    </div>

                    {/* Summary text */}
                    <p style={{ fontSize: 13.5, color: '#27272a', lineHeight: 1.6 }}>
                      {msg.summary}
                    </p>
                    {msg.llmNote && <p style={{ fontSize: 11.5, color: '#71717a' }}>{msg.llmNote}</p>}
                    {msg.input && (
                      <p style={{ fontSize: 11.5, color: msg.input.quality === 'headline_only' ? '#92400e' : '#71717a' }}>
                        <strong>
                          {{ article: 'Full article', description: 'Headline + description', headline_only: 'Headline only: low confidence', pasted: 'Pasted text' }[msg.input.quality] || 'Text'}
                        </strong>
                        {` · ${msg.input.chars.toLocaleString()} characters analysed`}
                        {msg.input.sources && msg.input.sources.length > 0 && ` · from: ${msg.input.sources.join('; ')}`}
                        {msg.input.note && ` · ${msg.input.note}`}
                      </p>
                    )}
                    {msg.hypothesis && msg.hypothesis.background && (
                      <p style={{ fontSize: 11.5, color: '#71717a', borderLeft: '3px solid #e4e4e7', paddingLeft: 8 }}>
                        <strong>Background (model knowledge, not from the article):</strong> {msg.hypothesis.background}
                      </p>
                    )}
                    {msg.context && (
                      <p style={{ fontSize: 11.5, color: '#92400e' }}>
                        Thin graph: {msg.context.reason}
                      </p>
                    )}
                    {msg.kbGuard && msg.kbGuard.rolled_back && (
                      <p style={{ fontSize: 11.5, color: '#991b1b' }}>
                        Knowledge-base guard: what the graph would have learned from this text was rolled back ({msg.kbGuard.failed.map((c) => c.name).join('; ')}). The answer above uses the last good graph.
                      </p>
                    )}
                    {msg.kbGuard && msg.kbGuard.pruned && msg.kbGuard.pruned.length > 0 && (
                      <p style={{ fontSize: 11.5, color: '#92400e' }}>
                        Knowledge-base guard: removed {msg.kbGuard.pruned.length} learned link(s) that market data contradicts: {msg.kbGuard.pruned.join(', ')}.
                      </p>
                    )}
                    {msg.kbGuard && msg.kbGuard.mode === 'static' && (
                      <p style={{ fontSize: 11.5, color: '#71717a' }}>Static mode: the graph is frozen at the curated baseline and learned nothing from this text.</p>
                    )}

                    {/* Extracted metadata box */}
                    <div className="chat-extracted-meta-grid">
                      <div>
                        <div className="chat-meta-item-label">Event Type</div>
                        <div className="chat-meta-item-val">{msg.details.eventType}</div>
                      </div>
                      <div>
                        <div className="chat-meta-item-label">Direction & Magnitude</div>
                        <div className="chat-meta-item-val" style={{ color: String(msg.details.direction).startsWith('↓') ? '#991b1b' : String(msg.details.direction).startsWith('↑') ? '#166534' : '#52525b' }}>
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

          {isLoading && (
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
            ref={textareaRef}
            className="chat-input-textarea"
            rows={1}
            placeholder="Enter financial news, headlines, or paste an article..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
          />

          <div className="chat-input-footer">
            <div className="chat-input-badges">
              <span className="chat-mode-pill">
                <ShieldCheck size={13.5} color="#15803d" />
                <span>{engineLabel}</span>
              </span>
            </div>

            <button
              className="chat-send-btn"
              onClick={() => handleSend()}
              disabled={!inputText.trim() || loading}
              title="Send message (Enter)"
            >
              <ArrowUp size={16} strokeWidth={2.4} />
            </button>
          </div>
        </div>
        <p className="chat-disclaimer">
          Events and links are proposed by the LLM and kept only when their quote appears in your text; propagation scores come from the knowledge graph, not the LLM.
        </p>
      </div>
    </div>
  );
}
