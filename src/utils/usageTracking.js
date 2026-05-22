// Shared Firestore usage-tracking helpers.
//
// Written from the renderer after each successful popup generation or audio
// transcription.  The admin panel reads these fields to show per-user cost
// analysis.
//
// Fields written to /users/{uid}:
//   usage.YYYY-MM          — popup requests this month  (existing)
//   usageWeekly.YYYY-WNN   — popup requests this ISO week
//   allTimeUsage           — total popup requests  (existing)
//   audioWords.YYYY-MM     — transcribed words this month
//   audioWordsWeekly.YYYY-WNN — transcribed words this ISO week
//   allTimeAudioWords      — total transcribed words

import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseFirestore } from './firebase.js';
import { isConfigured } from './firebaseConfig.js';

// ── Date helpers ──────────────────────────────────────────────────────────────

export function thisMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** ISO-8601 week key, e.g. "2025-W21" (Mon–Sun, year of Thursday). */
export function thisWeekKey() {
  const d = new Date();
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = utc.getUTCDay() || 7; // Mon=1 … Sun=7
  utc.setUTCDate(utc.getUTCDate() + 4 - day); // shift to Thursday of the week
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc - yearStart) / 86_400_000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// ── Popup usage ───────────────────────────────────────────────────────────────

/**
 * Atomically increment the signed-in user's popup usage counters.
 * Adds to monthly + weekly + all-time totals.
 * setUsage (optional) is the useState setter from useClaudeAPI for live UI.
 */
export async function incrementPopupUsage(setUsage) {
  if (!isConfigured()) return;
  try {
    const uid = getFirebaseAuth().currentUser?.uid;
    if (!uid) return;

    const db  = getFirebaseFirestore();
    const ref = doc(db, 'users', uid);
    const month = thisMonthKey();
    const week  = thisWeekKey();

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const data = snap.data();

      const newMonth   = ((data.usage        || {})[month] || 0) + 1;
      const newWeek    = ((data.usageWeekly  || {})[week]  || 0) + 1;
      const newAllTime = (data.allTimeUsage  || 0) + 1;

      tx.update(ref, {
        [`usage.${month}`]:      newMonth,
        [`usageWeekly.${week}`]: newWeek,
        allTimeUsage:            newAllTime,
        lastUsed:                serverTimestamp(),
      });

      setUsage?.({
        thisMonth: newMonth,
        limit: data.plan === 'free' ? 30 : null,
        plan:  data.plan || 'free',
      });
    });
  } catch (err) {
    console.warn('[FlowWrite] Popup usage increment failed:', err.message);
  }
}

// ── Audio transcription usage ─────────────────────────────────────────────────

/**
 * Increment the signed-in user's audio-word counters after a successful
 * Whisper transcription.  wordCount is the number of words in the result text.
 */
export async function incrementAudioWords(wordCount) {
  if (!wordCount || wordCount < 1 || !isConfigured()) return;
  try {
    const uid = getFirebaseAuth().currentUser?.uid;
    if (!uid) return;

    const db  = getFirebaseFirestore();
    const ref = doc(db, 'users', uid);
    const month = thisMonthKey();
    const week  = thisWeekKey();

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const data = snap.data();

      const newMonth   = ((data.audioWords       || {})[month] || 0) + wordCount;
      const newWeek    = ((data.audioWordsWeekly || {})[week]  || 0) + wordCount;
      const newAllTime = (data.allTimeAudioWords || 0) + wordCount;

      tx.update(ref, {
        [`audioWords.${month}`]:       newMonth,
        [`audioWordsWeekly.${week}`]:  newWeek,
        allTimeAudioWords:             newAllTime,
      });
    });
  } catch (err) {
    console.warn('[FlowWrite] Audio words increment failed:', err.message);
  }
}
