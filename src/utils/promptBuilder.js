// Builds the prompt sent to Claude.
//
// Three pathways, in priority order:
//   1. USER EXAMPLE (few-shot)  — when the user has selected one of their
//      saved example posts (Dashboard → My examples). Claude sees the
//      example as the gold standard and is asked to match its tone,
//      structure, emoji/hashtag pattern, voice. This is the most powerful
//      path because the style is whatever the user demonstrates.
//   2. BUILT-IN STYLE  — when a style key like "viral-fb" is passed
//      (currently only via auto-detection for platforms the user hasn't
//      saved an example for). Falls back generic if not found.
//   3. GENERIC — the framing-aware rewrite prompt.
//
// All paths share one critical rule: the user is the SENDER. Whatever they
// typed is THEIR draft / topic — Claude rewrites it in their voice, never
// responds to it as if it were directed at Claude.

import { STYLE_PROMPTS } from './templates.js';

const LENGTH_DIRECTIVES = {
  Short:  '1–2 sentences',
  Medium: '1 short paragraph',
  Long:   '2–3 paragraphs',
};

const TONE_GUIDES = {
  Professional: 'polite, clear, business-appropriate',
  Friendly:     'warm, approachable, conversational',
  Persuasive:   'confident, compelling, action-oriented',
  Casual:       'relaxed, informal, like texting a friend',
  Luxury:       'refined, evocative, premium feel',
  Urgent:       'direct, action-now, time-sensitive',
  Humor:        'witty, playful, light-hearted — a smile, not a laugh',
  Joke:         'comedic — punchline-style, exaggeration or a clear gag',
};

/**
 * @param {object} fieldContext
 * @param {string} contentType
 * @param {string} tone
 * @param {string} length
 * @param {string} userInput     The user's draft / topic.
 * @param {string} [templateStyle]   Optional built-in style key.
 * @param {object} [userTemplate]    Optional user-defined example template.
 *                                   { name, platform, content, ... }
 */
export function buildPrompt(
  fieldContext,
  contentType,
  tone,
  length,
  userInput,
  templateStyle,
  userTemplate,
) {
  if (userTemplate && userTemplate.content?.trim()) {
    return buildUserExamplePrompt({
      fieldContext, contentType, tone, length, userInput, userTemplate,
    });
  }
  if (templateStyle && STYLE_PROMPTS[templateStyle]) {
    return buildStyledPrompt({
      fieldContext, contentType, tone, length, userInput, templateStyle,
    });
  }
  return buildGenericPrompt({ fieldContext, contentType, tone, length, userInput });
}

// ────────────────────────────────────────────────────────────────────────────
// 1. USER EXAMPLE (few-shot from a saved example post)
// ────────────────────────────────────────────────────────────────────────────

function buildUserExamplePrompt({
  fieldContext, contentType, tone, length, userInput, userTemplate,
}) {
  const lengthGuide = LENGTH_DIRECTIVES[length] || '1 short paragraph';
  const toneGuide = TONE_GUIDES[tone] || tone.toLowerCase();
  const app = fieldContext?.activeApp || 'an app';
  const hasDraft = (userInput || '').trim().length > 0;

  return [
    `You are a writing assistant. Your job: generate a new piece of content that matches the user's PERSONAL STYLE EXAMPLE below.`,
    ``,
    `═══════════════════════════════════════════`,
    `THE USER'S STYLE EXAMPLE — match this style exactly:`,
    `═══════════════════════════════════════════`,
    userTemplate.content,
    `═══════════════════════════════════════════`,
    ``,
    `WHAT TO MATCH FROM THE EXAMPLE:`,
    `- Voice & personality (vulnerable / confident / playful / dry / etc — read it carefully)`,
    `- Sentence length & rhythm (short punchy vs flowing vs mixed)`,
    `- Emoji usage: count, type, and placement (none / one-per-paragraph / liberal / etc)`,
    `- Hashtag pattern: count, niche-vs-popular mix, placement (end / inline / spacer block before)`,
    `- Whitespace & line breaks (Instagram-style breathing vs dense vs minimal)`,
    `- Structure (hook-first? story arc? list? question close?)`,
    `- Vocabulary level (formal / colloquial / industry-specific / slang)`,
    ``,
    `USER CONTEXT:`,
    `- Platform: ${app}`,
    `- Content type: ${contentType}`,
    `- Tone adjustment: ${tone} — ${toneGuide}. Apply this WITHIN the style above, never overriding it.`,
    `- Length target: ${lengthGuide} (only if the example doesn't dictate length).`,
    ``,
    hasDraft
      ? [
          `USER'S TOPIC / DRAFT — this is WHAT to write about (the example shows HOW):`,
          `"""`,
          userInput,
          `"""`,
        ].join('\n')
      : `USER'S TOPIC: (empty — invent something plausible for the platform.)`,
    ``,
    `CRITICAL RULES:`,
    `1. The EXAMPLE shows you HOW to write. The TOPIC tells you WHAT to write about.`,
    `2. You are the user. Never respond to the topic as if you were the recipient.`,
    `3. Don't copy the example's words — copy its STYLE.`,
    `4. Match the example's emoji and hashtag pattern precisely (same count range, same vibe).`,
    `5. Output ONLY the final content. No preamble, no quotes, no commentary, no "here you go".`,
  ].join('\n');
}

// ────────────────────────────────────────────────────────────────────────────
// 2. BUILT-IN STYLE (platform-specific format spec — fallback when no user
//    example is selected for that platform)
// ────────────────────────────────────────────────────────────────────────────

function buildStyledPrompt({ fieldContext, contentType, tone, length, userInput, templateStyle }) {
  const styleSpec = STYLE_PROMPTS[templateStyle];
  const lengthGuide = LENGTH_DIRECTIVES[length] || '1 short paragraph';
  const toneGuide = TONE_GUIDES[tone] || tone.toLowerCase();
  const app = fieldContext?.activeApp || 'an app';
  const windowTitle = fieldContext?.windowTitle || '';
  const hasDraft = (userInput || '').trim().length > 0;

  return [
    `You are an elite copywriter specialised in this exact format.`,
    ``,
    styleSpec,
    ``,
    `USER CONTEXT:`,
    `- Platform/app: ${app}`,
    windowTitle ? `- Window: ${windowTitle}` : null,
    `- Tone preference: ${tone} — ${toneGuide}. Apply within the format's bounds; never override the structure above.`,
    `- Length preference: ${lengthGuide} (only relevant if the format above doesn't dictate length).`,
    ``,
    hasDraft
      ? [
          `USER'S DRAFT / TOPIC (this is what THEY want to convey — rewrite/expand it in their voice, never respond to it):`,
          `"""`,
          userInput,
          `"""`,
        ].join('\n')
      : `USER'S DRAFT: (empty — invent a plausible post for the platform based on the context.)`,
    ``,
    `RULES:`,
    `1. Follow the FORMAT above precisely.`,
    `2. Output ONLY the final post. No preamble, no quotes around it, no commentary.`,
    `3. You are the user. Never address the user as if they were the recipient.`,
    `4. Sound human — no AI-isms, no "I hope this finds you well", no overused phrases.`,
  ].filter(Boolean).join('\n');
}

// ────────────────────────────────────────────────────────────────────────────
// 3. GENERIC (no style reference — just rewrite-or-generate with tone)
// ────────────────────────────────────────────────────────────────────────────

function buildGenericPrompt({ fieldContext, contentType, tone, length, userInput }) {
  const lengthGuide = LENGTH_DIRECTIVES[length] || '1 short paragraph';
  const toneGuide = TONE_GUIDES[tone] || tone.toLowerCase();
  const hasDraft = (userInput || '').trim().length > 0;
  const app = fieldContext?.activeApp || 'an app';
  const windowTitle = fieldContext?.windowTitle || '';
  const fieldLabel = fieldContext?.fieldLabel || '';

  if (hasDraft) {
    return [
      `You are a writing assistant operating inside the user's text field.`,
      `You write AS THE USER, in first person, from their perspective.`,
      ``,
      `Context (where the user is typing):`,
      `- App: ${app}`,
      windowTitle ? `- Window: ${windowTitle}` : null,
      fieldLabel ? `- Field: ${fieldLabel}` : null,
      `- Type of content: ${contentType.toLowerCase()}`,
      ``,
      `The user's draft (this is what THEY want to say):`,
      `"""`,
      userInput,
      `"""`,
      ``,
      `Your task: Rewrite the draft above in this style:`,
      `- Tone: ${tone} — ${toneGuide}`,
      `- Length: ${lengthGuide}`,
      ``,
      `RULES — read carefully:`,
      `1. The draft is what the USER wants to send. You are rewriting THEIR words.`,
      `2. Do NOT answer questions in the draft — questions in the draft stay as questions in the output.`,
      `3. Do NOT respond as the recipient. You are not the person being addressed.`,
      `4. Preserve the user's intent and meaning exactly — only change the style.`,
      `5. Keep names, dates, places, numbers, and any specific details from the draft.`,
      `6. Output ONLY the rewritten message. No preface, no quotes around it, no explanation.`,
      `7. Sound human, not AI.`,
    ].filter(Boolean).join('\n');
  }

  return [
    `You are a writing assistant. Generate a ${contentType.toLowerCase()} suitable for the user's current context.`,
    ``,
    `Context:`,
    `- App: ${app}`,
    windowTitle ? `- Window: ${windowTitle}` : null,
    fieldLabel ? `- Field: ${fieldLabel}` : null,
    ``,
    `Style:`,
    `- Tone: ${tone} — ${toneGuide}`,
    `- Length: ${lengthGuide}`,
    ``,
    `Rules:`,
    `- Write AS THE USER, in first person.`,
    `- Output ONLY the final message. No preface, no quotes, no explanation.`,
    `- Sound human, not AI.`,
  ].filter(Boolean).join('\n');
}
