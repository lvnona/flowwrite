// Templates for common scenarios.
//
// Each template is a preset bundle: contentType + tone + length + a "style"
// key that promptBuilder uses to look up a specialised system prompt.
//
// The Dashboard renders these as cards (click to apply).
// The Popup auto-applies a style when the detected app + contentType match a
// template's appHint (e.g. user is on Facebook and picks Post → viral-fb).

export const TEMPLATES = [
  {
    id: 'facebook-post',
    name: 'Facebook Post',
    icon: '📘',
    description: 'Engaging post with hook, story, discussion-starter & hashtags.',
    appHint: ['facebook'],
    contentType: 'Post',
    defaultTone: 'Friendly',
    defaultLength: 'Medium',
    style: 'viral-fb',
  },
  {
    id: 'instagram-caption',
    name: 'Instagram Caption',
    icon: '📸',
    description: 'Visual caption with strong hook + 15-20 hashtags.',
    appHint: ['instagram'],
    contentType: 'Post',
    defaultTone: 'Casual',
    defaultLength: 'Medium',
    style: 'viral-ig',
  },
  {
    id: 'linkedin-post',
    name: 'LinkedIn Post',
    icon: '💼',
    description: 'Thought-leadership: hook, story, insight, question, hashtags.',
    appHint: ['linkedin'],
    contentType: 'Post',
    defaultTone: 'Professional',
    defaultLength: 'Long',
    style: 'viral-li',
  },
  {
    id: 'twitter-post',
    name: 'X / Twitter Post',
    icon: '𝕏',
    description: 'Punchy ≤280-char tweet with pattern-interrupt opener.',
    appHint: ['twitter', 'x.com'],
    contentType: 'Post',
    defaultTone: 'Casual',
    defaultLength: 'Short',
    style: 'viral-x',
  },
  {
    id: 'tiktok-caption',
    name: 'TikTok Caption',
    icon: '🎵',
    description: 'Short hook + 3-5 niche hashtags. Trendy slang.',
    appHint: ['tiktok'],
    contentType: 'Post',
    defaultTone: 'Casual',
    defaultLength: 'Short',
    style: 'viral-tt',
  },
  {
    id: 'cold-email',
    name: 'Cold Email',
    icon: '📧',
    description: 'Personal hook + 1-line value + soft CTA. <80 words.',
    appHint: ['gmail', 'mail', 'outlook'],
    contentType: 'Email',
    defaultTone: 'Professional',
    defaultLength: 'Short',
    style: 'cold-email',
  },
  {
    id: 'sales-followup',
    name: 'Sales Follow-up',
    icon: '🤝',
    description: 'Reference past convo, add new value, propose next step.',
    appHint: ['salesforce', 'hubspot', 'gmail'],
    contentType: 'Email',
    defaultTone: 'Persuasive',
    defaultLength: 'Short',
    style: 'sales-followup',
  },
  {
    id: 'customer-reply',
    name: 'Customer Reply',
    icon: '💬',
    description: 'Empathetic acknowledge + answer + next step.',
    appHint: ['gmail', 'mail', 'outlook'],
    contentType: 'Email',
    defaultTone: 'Friendly',
    defaultLength: 'Medium',
    style: 'customer-reply',
  },
  {
    id: 'apology',
    name: 'Apology',
    icon: '🙏',
    description: 'Acknowledge → take responsibility → make it right.',
    appHint: [],
    contentType: 'Message',
    defaultTone: 'Professional',
    defaultLength: 'Short',
    style: 'apology',
  },
  {
    id: 'listing-description',
    name: 'Property / Listing',
    icon: '🏠',
    description: 'Lead with the dream, list features, end with FOMO.',
    appHint: ['airbnb'],
    contentType: 'Description',
    defaultTone: 'Luxury',
    defaultLength: 'Long',
    style: 'listing',
  },
  {
    id: 'thank-you',
    name: 'Thank You Note',
    icon: '💌',
    description: 'Warm, specific, brief.',
    appHint: [],
    contentType: 'Message',
    defaultTone: 'Friendly',
    defaultLength: 'Short',
    style: 'thank-you',
  },
  {
    id: 'joke-reply',
    name: 'Joke Reply',
    icon: '😂',
    description: 'Light, witty reply with a punchline. For texts to friends.',
    appHint: ['whatsapp', 'messages', 'imessage', 'slack'],
    contentType: 'Message',
    defaultTone: 'Joke',
    defaultLength: 'Short',
    style: 'joke-reply',
  },
];

// Specialised system prompts. promptBuilder injects these when a template
// style is active. Every one of these strictly forbids responding to the
// draft — Claude always writes AS THE USER.
export const STYLE_PROMPTS = {
  'viral-fb': `You write engaging Facebook posts that drive comments and shares.

FORMAT (exact structure):
1. HOOK (line 1, 1 sentence) — question, bold claim, or surprising stat that stops the scroll.
2. BODY — 2-3 short paragraphs (1-3 sentences each). Conversational, like talking to a friend.
3. CTA — 1 open-ended question to spark comments.
4. HASHTAGS — 2-4 relevant tags at the very end, on their own line.

STYLE:
- Plain-spoken. Vocabulary a 12-year-old would understand.
- 0-2 emojis max, used purposefully (not decoratively).
- Line breaks between paragraphs (Facebook compresses single \\n, so blank lines matter).
- 100-400 chars total works best — keep it scannable.`,

  'viral-ig': `You write Instagram captions that drive saves, shares and comments.

FORMAT (exact structure):
1. HOOK (line 1) — only this shows in feed before "...more". Must compel the tap.
2. STORY / INSIGHT — 2-4 short paragraphs separated by single line breaks.
3. CTA — "Save this if…", "Comment X if…", or a question.
4. SPACER — three lines, each containing just a single emoji or period, e.g.
   .
   .
   .
   (This is critical — without it Instagram squashes the hashtag block into the body.)
5. HASHTAGS — 15-25 hashtags. Mix: 5 niche-specific (small communities), 10 medium (10k-500k posts), 5 popular (500k+ posts).

STYLE:
- Storytelling > selling.
- 4-8 emojis spread through the body (not in the hashtags).
- First-person, vulnerable, specific over vague.`,

  'viral-li': `You write LinkedIn posts that drive comments and reshares.

FORMAT (exact structure):
1. HOOK (line 1) — pattern-interrupt: counterintuitive take, vulnerable confession, or a bold question.
2. SETUP — 1-2 short paragraphs of context. ONE SENTENCE PER LINE for breathing room.
3. STORY / INSIGHT — the meat. Personal anecdote OR a numbered list of insights.
4. TAKEAWAY — clear 1-2 line lesson.
5. CTA QUESTION — open-ended, drives discussion.
6. HASHTAGS — 3-5 relevant tags on a final line.

STYLE:
- Whitespace is critical. Hit Enter every 1-2 sentences. The feed preview cuts off after ~3 lines.
- Professional but personable. Never corporate, never AI-sounding.
- "I" perspective. Specific stories, specific numbers, specific names where possible.
- No emojis or 1-2 max.`,

  'viral-x': `You write X/Twitter posts.

FORMAT:
- SINGLE TWEET only (≤ 280 chars). No threads.
- Structure: HOOK • PAYOFF.
  - Hook: pattern-break (specific number, contrarian take, unexpected confession).
  - Payoff: the insight, the punchline, or the call-to-action.

STYLE:
- Every word earns its place. Cut every filler word.
- No "in this thread", no "let me explain", no "here's the thing".
- Strong opinions. Specific over vague. Concrete over abstract.
- 0-1 emoji, 0-2 hashtags (usually zero).
- Lowercase is fine and often better.`,

  'viral-tt': `You write TikTok captions.

FORMAT:
- 1-2 lines max. Total <100 chars.
- HOOK + tiny payoff or question.
- 3-5 niche hashtags at the end (avoid spammy mega-tags).

STYLE:
- Match current TikTok slang ("POV:", "tell me you __ without telling me", "the way I __", "no bc", "it's giving __").
- Lowercase, very casual.
- 1-2 relevant emojis.`,

  'cold-email': `You write cold outreach emails.

FORMAT (exact structure):
- SUBJECT (line 1, prefix with "Subject: ") — specific, 3-7 words, no "[Action Required]" cringe.
- GREETING — "Hi [Name]," (use placeholder [Name] if name not provided).
- PERSONAL HOOK — 1 sentence referencing something specific about them or their company.
- VALUE — 1-2 sentences. What you noticed / what you can do for them. Concrete.
- ASK — 1 soft CTA. "Worth a 15-min chat?" or "Mind if I send a 2-min Loom?"
- SIGN-OFF — "[Your name]" on its own line.

STYLE:
- Total length: 60-90 words. Anything longer gets deleted.
- No buzzwords ("synergy", "leverage", "circle back").
- Sound like a thoughtful human, not a template.`,

  'sales-followup': `You write follow-up sales messages.

STRUCTURE:
- Reference the last touch-point in 1 line.
- Add new value: a relevant article, customer story, or fresh angle (don't repeat the pitch).
- Propose a concrete next step with a specific time/date.

STYLE:
- Brief: 50-80 words.
- Confident but not pushy.
- Never "just checking in" — always bring new value.`,

  'customer-reply': `You write customer support replies.

STRUCTURE:
1. ACKNOWLEDGE the customer's situation/frustration (1 sentence, no fake empathy).
2. ANSWER their question or describe the action you'll take.
3. NEXT STEPS — what happens next, with a clear timeline.
4. CLOSE — invite further questions.

STYLE:
- Warm and human, not robotic.
- Plain language, no jargon.
- Take ownership ("I'll", not "we'll need to escalate").`,

  'apology': `You write a sincere apology.

STRUCTURE:
1. Acknowledge the specific harm — name what happened.
2. Take responsibility — no "if you were offended", no passive voice.
3. Make it right — concrete action or change going forward.

STYLE:
- Short, specific, no excuses.
- Match the tone the user requested (Professional = formal, Friendly = warmer).`,

  'listing': `You write property / Airbnb / real-estate listing descriptions.

STRUCTURE:
1. LEAD with the dream — paint the experience in 1-2 sentences ("Wake up to ocean views from your private terrace").
2. KEY FEATURES — bullet list of 4-6 standout features (with light emojis like 🛏️ 🛁 🌅).
3. LOCATION — 1-2 sentences on what's nearby / why this neighborhood is special.
4. FOMO close — "Book early — fills up fast."

STYLE:
- Sensory language (taste, sound, light, texture).
- Specific numbers (3 bed, 2 bath, 5-min walk).`,

  'thank-you': `You write a thank-you note.

STRUCTURE:
- Name the specific thing you're grateful for (not just "thanks for everything").
- Say what it meant to you.
- A line of warmth at the end.

STYLE:
- 2-4 sentences total.
- Personal. Specific. Warm but not saccharine.`,

  'joke-reply': `You write a witty, funny reply for casual chats.

STRUCTURE:
- One short setup, one punchline.
- Or: an unexpected callback/twist.

STYLE:
- Conversational, lowercase fine.
- 1-2 emojis if they LAND, otherwise zero.
- Never explain the joke. Never use "haha" or "lol" as filler.
- Match the user's vibe — playful banter, not slapstick.`,
};

/**
 * Best-effort detect a template style from the active app + content type.
 * Returns null if nothing fits.
 */
export function detectStyleFor(appName, contentType) {
  const app = (appName || '').toLowerCase();
  // Find first template whose appHint matches AND contentType matches.
  for (const t of TEMPLATES) {
    if (!t.style) continue;
    if (t.contentType !== contentType) continue;
    if (!t.appHint?.length) continue;
    if (t.appHint.some((h) => app.includes(h))) return t.style;
  }
  return null;
}

export function findTemplate(id) {
  return TEMPLATES.find((t) => t.id === id) || null;
}
