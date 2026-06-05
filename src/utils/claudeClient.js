// Renderer-side Claude streaming client.
//
// The actual API call (and the API key) live in the main process — this module
// talks to it via the `window.flowwrite` IPC bridge exposed by preload.cjs.
//
// API
//   stream(prompt, signal?)  → AsyncGenerator<string>   yields text chunks
//   generate(prompt, signal?) → Promise<string>          full text accumulation
//
// Cancellation
//   Pass an AbortSignal. When it fires, the generator stops consuming chunks
//   and the pending IPC call is abandoned (it still runs in main, but we stop
//   listening).

import { getFirebaseAuth } from './firebase.js';

/**
 * Async generator that yields streaming text chunks from Claude.
 * The generator returns the full accumulated text as its return value.
 *
 * @param {string} prompt
 * @param {AbortSignal} [signal]
 * @yields {string} each incremental text chunk
 * @returns {string} full accumulated text
 */
export async function* stream(prompt, signal) {
  // We receive chunks via an IPC event listener. To bridge the push-based
  // event model to a pull-based async generator, we use a micro-queue.
  const queue = [];
  let resolveWaiter = null;
  let finished = false;
  let finalText = '';
  let finalError = null;

  function drainNotify() {
    if (resolveWaiter) { resolveWaiter(); resolveWaiter = null; }
  }

  // Fetch a fresh Firebase ID token here (the popup is signed in) and pass it
  // to main, which forwards it to the server proxy. This is the proven token
  // path — the server holds the AI key and enforces limits.
  let idToken = '';
  try { idToken = (await getFirebaseAuth()?.currentUser?.getIdToken?.()) || ''; } catch { /* ignore */ }

  // Subscribe to streaming chunks BEFORE firing the request so we never miss
  // a chunk that arrives in the same tick.
  const offChunks = window.flowwrite.onGenerateChunk((chunk) => {
    queue.push(chunk);
    drainNotify();
  });

  // Fire the request. The promise resolves when the full text is available.
  const genPromise = window.flowwrite
    .generateText({ prompt, idToken })
    .then((res) => {
      finalText = res?.text ?? '';
      if (!res?.ok) {
        finalError = new Error(res?.error || 'Generation failed');
        // Surface free-tier limit signals so the UI can show an upgrade prompt.
        if (res?.limitReached) finalError.limitReached = res.limitReached;
      }
    })
    .catch((err) => { finalError = err; })
    .finally(() => { finished = true; drainNotify(); });

  try {
    while (true) {
      // Drain whatever arrived since last yield.
      while (queue.length > 0) {
        if (signal?.aborted) return finalText;
        yield queue.shift();
      }

      if (finished) break;

      // Wait for the next chunk or completion.
      await new Promise((resolve) => {
        if (signal?.aborted) { resolve(); return; }
        resolveWaiter = resolve;
        signal?.addEventListener('abort', resolve, { once: true });
      });

      if (signal?.aborted) break;
    }

    // Flush any remaining chunks that arrived while we were awaiting.
    while (queue.length > 0) yield queue.shift();
  } finally {
    offChunks?.();
  }

  await genPromise; // ensure the main-process call is fully settled
  if (finalError) throw finalError;
  return finalText;
}

/**
 * Convenience wrapper — accumulates all chunks and returns the full string.
 * Calls `onChunk` with each incremental chunk if provided.
 *
 * @param {string} prompt
 * @param {(chunk: string) => void} [onChunk]
 * @param {AbortSignal} [signal]
 * @returns {Promise<string>}
 */
export async function generate(prompt, onChunk, signal) {
  let full = '';
  const gen = stream(prompt, signal);
  for await (const chunk of gen) {
    full += chunk;
    onChunk?.(chunk);
  }
  return full;
}
