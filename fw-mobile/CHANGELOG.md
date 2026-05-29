# FlowWrite Android — Changelog

All notable changes to the Android app are tracked here. Versions follow
`versionName` (and the matching `versionCode`) in `app/build.gradle.kts`.

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
