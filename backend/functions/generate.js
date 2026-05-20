// Claude proxy.
//
// The Anthropic API key lives ONLY here (as a Firebase Functions secret).
// Customers never see it. Every call is authenticated via a Firebase ID
// token and gated by the user's plan + monthly quota.
//
// Request shape (httpsCallable from the client):
//   { prompt: string, model?: string }
// Response shape:
//   { text: string, usage: { thisMonth, limit, plan } }

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import Anthropic from '@anthropic-ai/sdk';

if (admin.apps.length === 0) admin.initializeApp();

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

// Free-tier monthly quota. Pro / Team plans are unlimited (null limit).
const FREE_PROMPTS_PER_MONTH = 30;

// Cap each request's max tokens to keep cost predictable.
const MAX_TOKENS_PER_REQUEST = 1024;

// "YYYY-MM" key used as a per-month bucket inside the user's usage map.
function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function quotaFor(plan) {
  switch (plan) {
    case 'pro':
    case 'team':
      return null; // unlimited
    case 'free':
    default:
      return FREE_PROMPTS_PER_MONTH;
  }
}

export const generate = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [ANTHROPIC_API_KEY],
    // Limit concurrency so a runaway client can't flood Claude.
    maxInstances: 50,
    memory: '256MiB',
    timeoutSeconds: 60,
  },
  async (request) => {
    // ── Auth check (onCall auto-verifies the Firebase ID token) ──────────
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    const uid = request.auth.uid;

    // ── Input validation ─────────────────────────────────────────────────
    const { prompt, model = 'claude-opus-4-5' } = request.data || {};
    if (!prompt || typeof prompt !== 'string') {
      throw new HttpsError('invalid-argument', 'A non-empty prompt is required.');
    }
    if (prompt.length > 20_000) {
      throw new HttpsError('invalid-argument', 'Prompt too long (max 20k chars).');
    }

    // ── Quota check ──────────────────────────────────────────────────────
    const db = admin.firestore();
    const userRef = db.collection('users').doc(uid);
    const snap = await userRef.get();
    const data = snap.exists ? snap.data() : {};

    const plan = data.plan || 'free';
    const month = monthKey();
    const usageThisMonth = data.usage?.[month] || 0;
    const limit = quotaFor(plan);

    if (limit !== null && usageThisMonth >= limit) {
      throw new HttpsError(
        'resource-exhausted',
        `You've used all ${limit} prompts on the ${plan} plan this month.`,
      );
    }

    // ── Call Claude ──────────────────────────────────────────────────────
    let text = '';
    try {
      const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
      const message = await client.messages.create({
        model,
        max_tokens: MAX_TOKENS_PER_REQUEST,
        messages: [{ role: 'user', content: prompt }],
      });
      text = message?.content?.find?.((b) => b.type === 'text')?.text?.trim() || '';
    } catch (err) {
      console.error('[FlowWrite/generate] Anthropic error:', err);
      throw new HttpsError('internal', `Generation failed: ${err.message || 'unknown'}`);
    }

    if (!text) {
      throw new HttpsError('internal', 'Empty response from Claude.');
    }

    // ── Record usage ────────────────────────────────────────────────────
    // We do this AFTER a successful response so failed calls don't count.
    // Atomic increment so concurrent requests don't lose updates.
    await userRef.set(
      {
        usage: {
          [month]: admin.firestore.FieldValue.increment(1),
        },
        allTimeUsage: admin.firestore.FieldValue.increment(1),
        lastUsed: admin.firestore.FieldValue.serverTimestamp(),
        // Ensure the doc has a plan field even if it was just lazily created.
        plan: data.plan || 'free',
      },
      { merge: true },
    );

    return {
      text,
      usage: {
        thisMonth: usageThisMonth + 1,
        limit,
        plan,
      },
    };
  },
);
