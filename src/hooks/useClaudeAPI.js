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
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { generate as claudeGenerate } from '../utils/claudeClient.js';
import { getFirebaseAuth, getFirebaseFirestore } from '../utils/firebase.js';
import { isConfigured } from '../utils/firebaseConfig.js';

function thisMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function incrementUsage(setUsage) {
  if (!isConfigured()) return;
  try {
    const auth = getFirebaseAuth();
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const db = getFirebaseFirestore();
    const userRef = doc(db, 'users', uid);
    const month = thisMonthKey();

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists()) return;
      const data = snap.data();
      const prevUsage = data.usage || {};
      const newMonthCount = (prevUsage[month] || 0) + 1;
      const newAllTime = (data.allTimeUsage || 0) + 1;
      tx.update(userRef, {
        [`usage.${month}`]: newMonthCount,
        allTimeUsage: newAllTime,
        lastUsed: serverTimestamp(),
      });
      setUsage({
        thisMonth: newMonthCount,
        limit: data.plan === 'free' ? 30 : null,
        plan: data.plan || 'free',
      });
    });
  } catch (err) {
    // Non-fatal — usage display might be stale but generation succeeded.
    console.warn('[FlowWrite] Usage increment failed:', err.message);
  }
}

export function useClaudeAPI() {
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [usage, setUsage] = useState(null);
  const abortRef = useRef(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
  }, []);

  const generate = useCallback(async (prompt, onChunk) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);
    setError(null);

    try {
      const text = await claudeGenerate(prompt, onChunk, controller.signal);

      if (controller.signal.aborted) return null;

      if (!text) {
        setError('Empty response from Claude.');
        return null;
      }

      // Best-effort usage increment — fire and forget (errors logged, not thrown).
      incrementUsage(setUsage);

      return text;
    } catch (err) {
      if (controller.signal.aborted) return null;
      const msg = err?.message || String(err);
      setError(msg);
      return null;
    } finally {
      if (!controller.signal.aborted) setStreaming(false);
    }
  }, []);

  return { generate, cancel, streaming, error, usage };
}
