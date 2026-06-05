// React hook that drives generation via the Electron main-process IPC bridge.
//
// Architecture A (no Blaze)
//   The Anthropic API key is stored in electron-store (set in Settings).
//   The main process calls Claude directly and streams text chunks back via
//   the 'generate:chunk' IPC event.  claudeClient.js wraps those events into
//   a familiar async-generator API.
//
// Usage tracking
//   After every successful generation we atomically increment the user's
//   monthly counter and allTimeUsage in Firestore.  Firestore rules allow the
//   owner to update their own doc (but never to change their plan).
//
// State
//   generate(prompt, onChunk?) → Promise<string | null>
//   streaming                  → boolean (true while waiting for main process)
//   error                      → string | null
//   usage                      → { thisMonth, limit, plan } | null
//   cancel()                   → AbortController.abort()

import { useCallback, useRef, useState } from 'react';
import { generate as claudeGenerate } from '../utils/claudeClient.js';
// Usage is now recorded server-side (api-generate.php); no client-side increment.

export function useClaudeAPI() {
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [usage, setUsage] = useState(null);
  // null while under the cap; 'generations' once the free weekly limit is hit.
  const [limitReached, setLimitReached] = useState(null);
  const abortRef = useRef(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
  }, []);

  const clearLimit = useCallback(() => setLimitReached(null), []);

  const generate = useCallback(async (prompt, onChunk) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);
    setError(null);
    setLimitReached(null);

    try {
      const text = await claudeGenerate(prompt, onChunk, controller.signal);

      if (controller.signal.aborted) return null;

      if (!text) {
        setError('Empty response from Claude.');
        return null;
      }

      // Usage is now counted SERVER-SIDE (api-generate.php records it in
      // Firebase), so we no longer increment here — doing both would
      // double-count. The dashboard reads the cloud count via the profile.

      return text;
    } catch (err) {
      if (controller.signal.aborted) return null;
      // Free-tier limit → signal the UI to show an upgrade prompt (no red error).
      if (err?.limitReached) { setLimitReached(err.limitReached); return null; }
      const msg = err?.message || String(err);
      setError(msg);
      return null;
    } finally {
      if (!controller.signal.aborted) setStreaming(false);
    }
  }, []);

  return { generate, cancel, streaming, error, usage, limitReached, clearLimit };
}
