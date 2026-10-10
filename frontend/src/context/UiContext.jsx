import { createContext, useContext } from 'react';

// Shared UI state for the shell: the header search box, the header refresh button and backend status.
// Pages read it with useUi(); Layout provides it.
export const UiContext = createContext({ search: '', setSearch: () => {}, refreshTick: 0, status: null, refreshStatus: () => {} });
export const useUi = () => useContext(UiContext);
