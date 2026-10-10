import { useState, useEffect } from 'react';
import { api } from '../services/api';

// Starter prompts come from the backend (/api/samples) so the UI never carries its own copy of them.
export function useSamples() {
  const [state, setState] = useState({ samples: [], error: null, loading: true });
  useEffect(() => {
    let off = false;
    api
      .getSamples()
      .then((samples) => !off && setState({ samples, error: null, loading: false }))
      .catch((e) => !off && setState({ samples: [], error: e.message, loading: false }));
    return () => {
      off = true;
    };
  }, []);
  return state;
}
