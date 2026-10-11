import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  ArrowUp,
  Bot,
  User,
  ArrowRight,
  GitBranch,
  TrendingUp,
  Layers,
  HelpCircle,
  Copy,
  Check,
} from 'lucide-react';
import { api } from '../services/api';
import { useUi } from '../context/UiContext';

export default function KgAssistant({ analysis, onNavigateToTab, onSelectEventText }) {
  const [messages, setMessages] = useState([
    {
      id: 'welcome-1',
      sender: 'assistant',
      text: 'Hello! I am your **KG-Powered AI Assistant**.\n\nYou can ask me questions about macroeconomic transmission paths, sector dependencies, contagion channels, and causal graph dynamics.',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const { status } = useUi();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(Math.max(textareaRef.current.scrollHeight, 26), 180)}px`;
    }
  }, [inputText]);

  const handleCopy = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSend = async (textToSend) => {
    const text = (textToSend || inputText).trim();
    if (!text || loading) return;

    const userMsgId = `usr-${Date.now()}`;
    const userMsg = {
      id: userMsgId,
      sender: 'user',
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setLoading(true);

    try {
      // The assistant answers from the knowledge graph only and never changes it (/api/assistant is read only).
      const history = messages
        .filter((m) => m.id !== 'welcome-1')
        .slice(-6)
        .map((m) => ({ role: m.sender === 'user' ? 'user' : 'assistant', text: m.text }));
      const res = await api.askAssistant(text, history);
      const botMsg = {
        id: `bot-${Date.now()}`,
        sender: 'assistant',
        text: res.answer,
        sources: res.sources || [],
        graphVersion: res.graph_version || null,
        mode: res.mode,
        note: res.note || null,
        grounded: !!res.grounded,
        suggestions: res.suggestions || null,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-${Date.now()}`,
          sender: 'assistant',
          text: `Error processing query: ${e.message}`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
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
    <div className="chat-page-container" style={{ maxWidth: 940, margin: '0 auto', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      {/* Page Header */}
      <div style={{ padding: '20px 24px 12px', borderBottom: '1px solid #e4e4e7', background: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: '#18181b', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Bot size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ fontSize: 17, fontWeight: 700, color: '#09090b', margin: 0 }}>KG Powered AI Assistant</h1>
              <span className="nav-item-badge">Core</span>
            </div>
            <p style={{ fontSize: 12, color: '#71717a', margin: '2px 0 0' }}>
              Causal reasoning and multi-hop macro transmission intelligence.
            </p>
          </div>
        </div>

        {onNavigateToTab && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-outline"
              style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={() => onNavigateToTab('impact-graph')}
            >
              <GitBranch size={13} style={{ marginRight: 5 }} />
              View Graph Canvas
            </button>
            <button
              className="btn btn-outline"
              style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={() => onNavigateToTab('asset-impact')}
            >
              <TrendingUp size={13} style={{ marginRight: 5 }} />
              Asset Forecasts
            </button>
          </div>
        )}
      </div>

      {/* Messages Scroll Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {messages.map((msg) => {
          const isUser = msg.sender === 'user';
          return (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                gap: 12,
                alignSelf: isUser ? 'flex-end' : 'flex-start',
                maxWidth: isUser ? '75%' : '85%',
                flexDirection: isUser ? 'row-reverse' : 'row',
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: isUser ? '#f4f4f5' : '#18181b',
                  color: isUser ? '#18181b' : '#ffffff',
                  flexShrink: 0,
                  marginTop: 2,
                }}
              >
                {isUser ? <User size={16} /> : <Bot size={16} />}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start' }}>
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: 12,
                    fontSize: 13.5,
                    lineHeight: 1.6,
                    background: isUser ? '#18181b' : '#ffffff',
                    color: isUser ? '#ffffff' : '#18181b',
                    border: isUser ? 'none' : '1px solid #e4e4e7',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {msg.text}
                </div>

                {!isUser && msg.sources && msg.sources.length > 0 && (
                  <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 5, maxWidth: 640 }}>
                    <span style={{ fontSize: 11, color: '#71717a', alignSelf: 'center' }}>Sources:</span>
                    {msg.sources.map((s) => (
                      <span
                        key={s.id}
                        title={s.text}
                        style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, border: '1px solid #e4e4e7', background: '#fafafa', color: '#3f3f46' }}
                      >
                        {s.kind === 'link' ? 'Link' : s.kind === 'path' ? 'Path' : s.kind === 'node' ? 'Entity' : 'Note'}: {s.title}
                      </span>
                    ))}
                  </div>
                )}
                {!isUser && msg.suggestions && (
                  <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 5, maxWidth: 640 }}>
                    {[...(msg.suggestions.variables || []), ...(msg.suggestions.sectors || []), ...(msg.suggestions.assets || [])].map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => handleSend(`Tell me about ${name}`)}
                        style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, border: '1px solid #e4e4e7', background: '#fff', cursor: 'pointer', color: '#27272a' }}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                )}
                {!isUser && (msg.graphVersion || msg.note) && (
                  <div style={{ marginTop: 4, fontSize: 11, color: '#a1a1aa', maxWidth: 640 }}>
                    {msg.graphVersion ? `Answered from graph version ${msg.graphVersion.version}. ` : ''}
                    {msg.note || ''}
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, padding: '0 4px', fontSize: 11, color: '#a1a1aa' }}>
                  <span>{msg.time}</span>
                  {!isUser && (
                    <button
                      type="button"
                      onClick={() => handleCopy(msg.id, msg.text)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', padding: 0, display: 'flex', alignItems: 'center', gap: 3 }}
                      title="Copy text"
                    >
                      {copiedId === msg.id ? <Check size={11} color="#166534" /> : <Copy size={11} />}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {loading && (
          <div style={{ display: 'flex', gap: 12, alignSelf: 'flex-start', maxWidth: '85%' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#18181b', color: '#ffffff', flexShrink: 0 }}>
              <Bot size={16} />
            </div>
            <div style={{ padding: '12px 16px', borderRadius: 12, background: '#ffffff', border: '1px solid #e4e4e7', fontSize: 13, color: '#71717a', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={14} className="spin" color="#6366f1" />
              <span>Synthesizing causal reasoning across graph pathways…</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Box Footer */}
      <div style={{ padding: '14px 24px 20px', background: '#ffffff', borderTop: '1px solid #e4e4e7' }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', background: '#f4f4f5', borderRadius: 12, padding: '8px 12px', border: '1px solid #e4e4e7' }}>
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about transmission channels, macro shocks, or graph entities..."
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              fontSize: 13.5,
              color: '#09090b',
              resize: 'none',
              lineHeight: 1.5,
              maxHeight: 180,
            }}
          />
          <button
            type="button"
            onClick={() => handleSend()}
            disabled={!inputText.trim() || loading}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: inputText.trim() && !loading ? '#18181b' : '#e4e4e7',
              color: inputText.trim() && !loading ? '#ffffff' : '#a1a1aa',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: inputText.trim() && !loading ? 'pointer' : 'not-allowed',
              transition: 'background 0.15s ease',
              marginLeft: 8,
              flexShrink: 0,
            }}
          >
            <ArrowUp size={16} />
          </button>
        </div>
        <div style={{ textAlign: 'center', fontSize: 11, color: '#a1a1aa', marginTop: 8 }}>
          Answers come from the knowledge graph only and cite what they use. Scores are plausibility, not probabilities or price forecasts.
        </div>
      </div>
    </div>
  );
}
