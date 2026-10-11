/**
 * Dedicated LocalStorage persistence layer for Apex Zenith Chat and Analysis Sessions.
 * 
 * Features:
 * - Persists conversation messages and associated causal graph analyses.
 * - Auto-prunes oldest sessions if quota limit is approached.
 * - Handles corrupted data gracefully.
 * - Provides clean CRUD APIs for multi-session chat histories.
 */

import { adaptResult } from '../services/api';

const STORAGE_KEY = 'apex_zenith_chat_sessions_v1';
const ACTIVE_SESSION_KEY = 'apex_zenith_active_session_id';
const MAX_SAVED_SESSIONS = 35;

// Store only the backend result and its context; the page views (graph, assets, events) are rebuilt from it when a chat is
// opened. Storing the views as well doubled every chat's size and filled the browser's storage after a handful of chats.
function compactAnalysis(a) {
  if (!a || !a.raw) return a || null;
  return { raw: a.raw, text: a.text, source: a.source, link: a.link, title: a.title, at: a.at };
}

function restoreAnalysis(a) {
  if (!a) return null;
  if (a.view && a.graphView) return a; // saved before compaction: already complete
  if (!a.raw) return null;
  return { ...adaptResult(a.raw, a.text, a.source || null, a.link || null, a.title || null), at: a.at || Date.now() };
}

/**
 * Generate a clean human-readable title from headline text or message.
 */
export function generateSessionTitle(text) {
  if (!text || typeof text !== 'string') return 'New Analysis';
  const cleaned = text.replace(/[\r\n]+/g, ' ').trim();
  if (cleaned.length <= 44) return cleaned;
  return cleaned.substring(0, 44) + '…';
}

/**
 * Retrieve all chat sessions sorted newest first.
 */
export function getAllSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } catch (err) {
    console.warn('[chatStorage] Failed to read sessions from localStorage:', err);
    return [];
  }
}

/**
 * Retrieve a specific session by ID.
 */
export function getSessionById(sessionId) {
  if (!sessionId) return null;
  const sessions = getAllSessions();
  const s = sessions.find((x) => x.id === sessionId);
  return s ? { ...s, analysis: restoreAnalysis(s.analysis) } : null;
}

/**
 * Save or update a session in localStorage.
 * 
 * @param {Object} session - { id, title, messages, analysis, currentEventText }
 * @returns {Object} saved session
 */
export function saveSession({ id, title, messages = [], analysis = null, currentEventText = '' }) {
  try {
    const sessions = getAllSessions();
    const now = Date.now();
    const existingIndex = id ? sessions.findIndex((s) => s.id === id) : -1;

    let sessionToSave;

    if (existingIndex >= 0) {
      const existing = sessions[existingIndex];
      const newTitle = title || existing.title || generateSessionTitle(currentEventText || (messages[0] && messages[0].text));
      sessionToSave = {
        ...existing,
        title: newTitle,
        messages: messages.length ? messages : existing.messages,
        analysis: analysis !== undefined ? compactAnalysis(analysis) : existing.analysis,
        currentEventText: currentEventText || existing.currentEventText,
        updatedAt: now,
      };
      sessions[existingIndex] = sessionToSave;
    } else {
      const newId = id || `chat_${now}_${Math.random().toString(36).slice(2, 7)}`;
      const derivedTitle = title || generateSessionTitle(currentEventText || (messages[0] && messages[0].text));
      sessionToSave = {
        id: newId,
        title: derivedTitle,
        createdAt: now,
        updatedAt: now,
        messages,
        analysis: compactAnalysis(analysis),
        currentEventText,
      };
      sessions.unshift(sessionToSave);
    }

    // newest first, capped; if the browser's storage is full, drop the oldest chats until this one fits. As a last resort keep
    // this chat's messages without its graph: every graph is also saved in the backend's analysis library.
    let list = sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, MAX_SAVED_SESSIONS);
    for (;;) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        break;
      } catch (quotaErr) {
        if (list.length > 1) {
          list = list.filter((s) => s.id === sessionToSave.id).concat(list.filter((s) => s.id !== sessionToSave.id).slice(0, -1));
          console.warn('[chatStorage] Browser storage full: dropped the oldest saved chat', quotaErr);
        } else if (list.length === 1 && list[0].analysis) {
          list = [{ ...list[0], analysis: null }];
          console.warn('[chatStorage] Browser storage full: saved this chat without its graph (the graph is in the analysis library)');
        } else {
          throw quotaErr;
        }
      }
    }
    if (sessionToSave.id) {
      localStorage.setItem(ACTIVE_SESSION_KEY, sessionToSave.id);
    }

    return sessionToSave;
  } catch (err) {
    console.error('[chatStorage] Error saving session:', err);
    return null;
  }
}

/**
 * Delete a session by ID.
 */
export function deleteSession(sessionId) {
  try {
    const sessions = getAllSessions().filter((s) => s.id !== sessionId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));

    const activeId = getActiveSessionId();
    if (activeId === sessionId) {
      const nextActive = sessions[0] ? sessions[0].id : null;
      if (nextActive) {
        setActiveSessionId(nextActive);
      } else {
        localStorage.removeItem(ACTIVE_SESSION_KEY);
      }
    }
    return true;
  } catch (err) {
    console.error('[chatStorage] Error deleting session:', err);
    return false;
  }
}

/**
 * Clear all chat history from localStorage.
 */
export function clearAllSessions() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(ACTIVE_SESSION_KEY);
    return true;
  } catch (err) {
    console.error('[chatStorage] Error clearing sessions:', err);
    return false;
  }
}

/**
 * Get the currently active session ID.
 */
export function getActiveSessionId() {
  try {
    return localStorage.getItem(ACTIVE_SESSION_KEY) || null;
  } catch {
    return null;
  }
}

/**
 * Set the currently active session ID.
 */
export function setActiveSessionId(sessionId) {
  try {
    if (sessionId) {
      localStorage.setItem(ACTIVE_SESSION_KEY, sessionId);
    } else {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
    }
  } catch (err) {
    console.warn('[chatStorage] Failed to set active session ID:', err);
  }
}
