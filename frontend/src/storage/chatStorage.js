/**
 * Dedicated LocalStorage persistence layer for Apex Zenith Chat and Analysis Sessions.
 * 
 * Features:
 * - Persists conversation messages and associated causal graph analyses.
 * - Auto-prunes oldest sessions if quota limit is approached.
 * - Handles corrupted data gracefully.
 * - Provides clean CRUD APIs for multi-session chat histories.
 */

const STORAGE_KEY = 'apex_zenith_chat_sessions_v1';
const ACTIVE_SESSION_KEY = 'apex_zenith_active_session_id';
const MAX_SAVED_SESSIONS = 35;

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
  return sessions.find((s) => s.id === sessionId) || null;
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
        analysis: analysis !== undefined ? analysis : existing.analysis,
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
        analysis,
        currentEventText,
      };
      sessions.unshift(sessionToSave);
    }

    // Cap sessions to prevent localStorage overflow
    const trimmed = sessions.slice(0, MAX_SAVED_SESSIONS);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      if (sessionToSave.id) {
        localStorage.setItem(ACTIVE_SESSION_KEY, sessionToSave.id);
      }
    } catch (quotaErr) {
      // If quota exceeded, trim more aggressively
      console.warn('[chatStorage] Storage quota reached, trimming old sessions...', quotaErr);
      const aggressivelyTrimmed = trimmed.slice(0, 15);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(aggressivelyTrimmed));
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
