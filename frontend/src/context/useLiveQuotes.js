import { useState, useEffect, useRef } from 'react';
import { API_URL, api } from '../services/api';

// Live quotes for a set of Yahoo Finance symbols.
// Preferred transport: Server-Sent Events from the backend (/api/stream), which the backend feeds from the
// yfinance WebSocket plus a batched poll. If SSE is unavailable (e.g. serverless host) it falls back to
// polling /api/quotes. `state` is 'connecting' | 'streaming' | 'polling' | 'offline'.
export function useLiveQuotes(symbols) {
  const key = [...new Set((symbols || []).filter(Boolean))].sort().join(',');
  const [data, setData] = useState({ quotes: {}, state: 'connecting', transport: null, error: null });
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    if (!key) {
      setData({ quotes: {}, state: 'connecting', transport: null, error: null });
      return () => {};
    }
    let es = null;
    let timer = null;
    const apply = (snap, state) =>
      alive.current && setData({ quotes: snap.quotes || {}, state, transport: snap.transport || null, error: snap.last_error || null });

    const poll = async () => {
      try {
        apply(await api.getQuotes(key.split(',')), 'polling');
      } catch (e) {
        alive.current && setData((d) => ({ ...d, state: 'offline', error: e.message }));
      }
    };
    const startPolling = () => {
      if (timer) return;
      poll();
      timer = setInterval(poll, 20000);
    };

    if (typeof EventSource === 'undefined') startPolling();
    else {
      es = new EventSource(`${API_URL}/api/stream?symbols=${encodeURIComponent(key)}`);
      es.addEventListener('quotes', (ev) => {
        try {
          apply(JSON.parse(ev.data), 'streaming');
        } catch (_) {
          /* ignore a malformed frame */
        }
      });
      es.onerror = () => {
        // EventSource retries by itself; if the stream is gone for good (closed), poll instead
        if (es && es.readyState === 2) {
          es.close();
          startPolling();
        } else {
          alive.current && setData((d) => ({ ...d, state: d.state === 'streaming' ? 'connecting' : d.state }));
        }
      };
    }
    return () => {
      alive.current = false;
      if (es) es.close();
      if (timer) clearInterval(timer);
    };
  }, [key]);

  return data;
}

export const fmtPrice = (p) => (typeof p === 'number' ? p.toLocaleString(undefined, { maximumFractionDigits: p >= 100 ? 2 : 4 }) : '–');
export const fmtPct = (p) => (typeof p === 'number' ? `${p >= 0 ? '+' : ''}${p.toFixed(2)}%` : '–');
