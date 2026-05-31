# FlowWrite Android — Changelog

All notable changes to the Android app are tracked here. Versions follow
`versionName` (and the matching `versionCode`) in `app/build.gradle.kts`.

---

## 1.0.4 — versionCode 5 (2026-05-30)

### Changed
- **Free-plan weekly limits are now admin-managed.** The app reads
  `config/limits` from Firestore live (`freeWeeklyGenerations`,
  `freeWeeklyAudioWords`) — usage bars and the client-side mic cap update
  within seconds when the admin changes the values. The hardcoded 50 / 2500
  remain only as a fallback used while the first snapshot is loading.

---

## 1.0.3 — versionCode 4 (2026-05-29)

### Added
- **Subscription (Stripe) wired in.** Dashboard's Plan card now has an
  **Upgrade to Pro** button (Free users) and **Manage subscription** (Pro users).
  Both open the existing server endpoints at `flowwrite.u11.ca` in **Chrome
  Custom Tabs** — the app never talks to Stripe directly, never ships any
  Stripe key. Plan status flips live from the Firestore user doc within ~3s of
  the server webhook (no polling).
- **Subscription status line** under the plan badge: shows *trialing*,
  *cancels at period end*, or a red warning for *past due / unpaid /
  incomplete* payments.
- **App version is now read from the build** — Settings → About always shows
  the real `BuildConfig.VERSION_NAME` (no more stale hardcoded numbers).

### Build
- Added `androidx.browser:browser:1.8.0` (Custom Tabs).

---

## 1.0.2 — versionCode 3 (2026-05-29)

### Added
- **Animated intro / onboarding** that *shows* how FlowWrite works instead of just
  describing it: a pulsing mic with voice typing itself out (dictation), a topic →
  style chips (Instagram / Facebook / Email) → polished post that types out, and a
  glowing grid of supported platforms. Pure Compose animation, no extra libraries.

### Fixed
- **Screen no longer dims or locks while dictating** in the generate/template
  panel. The panel now holds the screen on for as long as it's open, so longer
  voice inputs won't get cut off by the screen timeout.

---

## 1.0.1 — versionCode 2 (2026-05-26)

### Added
- **Create / edit / delete templates from the phone.** The Templates tab now has
  a **New** button and an editor (Name, Type, Platform, style content, plus
  From-name & Signature for Email). Tap any template to edit or delete. Saved to
  the same `users/{uid}/templates` collection as desktop, so changes sync both ways.
- **Auto-start the bubble after a reboot.** A boot receiver re-launches the
  floating bubble after the phone restarts — if it was enabled and the overlay
  permission is still granted.
- **Prominent disclosure for the Accessibility permission** (shown before enabling
  it) — required for Google Play approval.

### Fixed
- **Bubble could get stuck hidden** ("enabled but not showing"). The generate
  panel's suppression flag could stay on if the panel was killed by the system;
  it now clears on `onStop` and is reset whenever the bubble service starts. The
  service also re-checks the current focus on start, so the bubble appears
  immediately if you're already in a text field.

### Build / Store readiness
- Added release **signing config** (reads `app/keystore.properties`, git-ignored).
- Added **R8 / ProGuard keep-rules** for Firebase, Google Sign-In and Credential
  Manager so the minified release build doesn't crash.
- Produces a signed **AAB** for Play Store via `./gradlew bundleRelease`.

---

## 1.0.0 — versionCode 1 (2026-05-25)

### Initial release
- **Floating bubble** (right edge, draggable, 50% transparent) that appears when a
  text field is focused — works across normal apps and WebView editors (e.g.
  Samsung Email) by detecting the keyboard.
- **Voice dictation:** tap the bubble → record → OpenAI Whisper transcription →
  grammar/polish pass → text inserted into the focused field.
- **Generate window** (long-press the bubble) with full desktop parity:
  - Content types: Email, Post, Message, Bio, Description, Note, Translate, Other
  - Tones: Professional, Friendly, Persuasive, Casual, Luxury, Urgent, Humor, Joke
  - Lengths: Short / Medium / Long
  - **Translate** mode with a 28-language picker
  - In-panel **microphone** to dictate the topic text
- **Templates** applied as a *style* over your text (template content = style,
  your text = topic), matching the desktop prompt logic.
- Direct AI calls (no proxy): Anthropic Claude / OpenAI / DeepSeek, provider chosen
  by the admin-managed `config/apiKeys` in Firestore.
- **Dashboard** with weekly usage (generations + audio words), free-tier limits and
  all-time totals.
- **Settings** with live permission status and a dedicated **Privacy** screen.
- Google Sign-In; per-user weekly/monthly usage tracking shared with desktop.
- App icon matched to the FlowWrite desktop app.
