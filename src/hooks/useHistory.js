// Read/write the recent-generation history via the IPC bridge.
import { useCallback, useEffect, useState } from 'react';

export function useHistory() {
  const [entries, setEntries] = useState([]);

  const refresh = useCallback(async () => {
    const list = (await window.flowwrite?.getHistory?.()) || [];
    setEntries(list);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addEntry = useCallback(async (entry) => {
    const list = (await window.flowwrite?.addHistory?.(entry)) || [];
    setEntries(list);
  }, []);

  const clear = useCallback(async () => {
    await window.flowwrite?.clearHistory?.();
    setEntries([]);
  }, []);

  return { entries, addEntry, clear, refresh };
}
