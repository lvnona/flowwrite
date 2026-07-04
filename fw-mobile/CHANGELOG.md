# FlowWrite Android — Changelog

All notable changes to the Android app are tracked here. Versions follow
`versionName` (and the matching `versionCode`) in `app/build.gradle.kts`.

---

## 1.0.13 — versionCode 14 (2026-06-01)

### Performance — faster dictation
- **Recording is now mono/16kHz/32kbps** instead of stereo/44.1kHz/128kbps.
  Whisper downsamples every upload to 16kHz mono internally regardless of
  input quality, so the old settings only produced a bigger file to
  upload for no transcription benefit. Smaller file → faster upload → text
  appears sooner after you stop talking.
- **The Firebase ID token is now prefetched when recording *starts***
  (fire-and-forget, both in `MicService` and the in-panel dictation),
  instead of being fetched cold right after you stop. This removes a
  potential network round trip from the critical path between "stop
  talking" and "text appears."
- Extracted the duplicated `MediaRecorder` setup from `MicService` and
  `GenerateActivity` into one shared `service/SpeechRecorder.kt` so both
  paths stay tuned identically going forward.

> Note: a meaningful part of end-to-end latency is server-side (sequential
> Whisper → polish-pass calls on `api-transcribe.php`) and is outside what
> the Android client can control.

---

## 1.0.12 — versionCode 13 (2026-06-01)

### Security / architecture
- **All AI calls now go through the server proxy** (`api-generate.php` /
  `api-transcribe.php` on flowwrite.u11.ca), authenticated with the user's
  Firebase ID token. The app **no longer contacts OpenAI / Anthropic /
  DeepSeek directly** and **no longer reads `config/apiKeys`** — API keys
  can never be extracted from the client anymore.
- **Limit enforcement + usage counting moved server-side.** The app no
  longer pre-checks limits or writes usage counters (no double-counting);
  it shows the upgrade screen when the proxy returns HTTP 402.
- Prompt building (templates, additional instructions, tone, length,
  translate) is unchanged — the app still composes the prompt and sends
  the final string to the proxy.
- Removed `ApiKeyRepository` / `ApiKeys`; `config/limits` is still read
  for the dashboard's "X / N used" denominator only.

---

## 1.0.11 — versionCode 12 (2026-06-01)

### Fixed (Google Play sensitive-permission compliance)
- **First-run onboarding now shows the prominent disclosure** before
  sending the user to enable the Accessibility service. Previously the
  disclosure only appeared on the Settings tab re-grant flow — the
  onboarding path jumped straight to system settings, which is a
  Play-policy violation for accessibility-using apps. The disclosure
  composable has been extracted into a shared file
  (`ui/screens/AccessibilityDisclosureDialog.kt`) so both screens use
  the same wording.

> **Releases now publish to `lvnona/flowwrite-android`** (separate repo,
> tag scheme `v1.0.X` with no `mobile-` prefix). See
> `fw-mobile/RELEASING.md`.

---

## 1.0.10 — versionCode 11 (2026-06-01)

### Added
- **Mobile template editor now has full desktop parity** — added the new
  **Additional Instructions** field (highest-priority verbatim rules:
  names, phone numbers, must-include phrases) and the **Notes** field
  (private reminders, never sent to the AI).
- The `additionalInstructions` field is now wired into the AI prompt the
  same way the desktop does — prepended as the highest-priority section
  before every generation that uses the template.

### Changed
- For **Email** templates, the editor now correctly treats *Signature* as
  required (instead of *content*), matching desktop. Save button stays
  disabled until you have a name + signature for emails (or a name +
  style content for other types).

---

## 1.0.9 — versionCode 10 (2026-05-31)

### Added
- **"Edit templates online" banner** at the top of the Templates tab — taps
  open the web portal (`flowwrite.u11.ca/app.html`) for a roomier template
  editor with the new "Additional Instructions" field. Templates round-trip
  via Firestore within seconds.
- **"Manage account online" row** at the top of Settings → Account — opens
  the same portal for stats, template management, and subscription
  controls on any device.
- Both entries open in **Chrome Custom Tabs** (preserves Google sign-in),
  not a WebView.

---

## 1.0.8 — versionCode 9 (2026-05-31)

### Fixed
- **New users can dictate again.** First-time accounts were getting
  *"Transcription failed: Permission denied"* because the Firestore
  owner-update rule (`expiresAt == expiresAt`) was failing when the doc
  was created without an `expiresAt` field. The user-doc create now
  includes `expiresAt: null` so the rule's equality check is satisfied
  for free-plan users. (Existing admins were unaffected because the
  rule's `isAdmin()` branch bypassed the equality check entirely.)
- **Usage-counter writes can never lose your dictation now.** The
  transcribed text is inserted into the field BEFORE the Firestore
  usage increment runs, and increment failures are logged but no longer
  surface as a user-visible error.

---

## 1.0.7 — versionCode 8 (2026-05-31)

### Fixed
- **Sign-out now fully tears down per-user state.** The Firestore snapshot
  listeners for `users/{uid}` and `users/{uid}/templates` are cancelled,
  and the in-memory profile / templates / last generation result are cleared.
  Previously the old listeners stayed alive after sign-out and could briefly
  overwrite a different account's data when switching users (no real
  counter-leak, but a visible flicker of stale data).

---

## 1.0.6 — versionCode 7 (2026-05-31)

### Fixed
- **Fresh Google sign-in no longer hangs.** The app now creates the
  `users/{uid}` Firestore document on first sign-in (with the exact
  rule-compliant fields `plan="free"`, `status="active"`, plus email,
  displayName, photoURL, createdAt, lastSeen). Previously the document was
  never created, so the snapshot listener never emitted, the Dashboard spun
  forever, and the bubble never became reachable.
- The doc-create call is also invoked on every app start, defensively, in
  case a prior attempt failed.
- Firestore listener errors are now logged loudly (tag `FwProfile`) with a
  hint pointing at the CREATE rule — no more silent failures.

---

## 1.0.5 — versionCode 6 (2026-05-31)

### Fixed
- **Google Sign-In** now works for users on the released build. The release
  signing key's SHA-1/SHA-256 fingerprints have been registered in Firebase
  Console, and the app ships with the refreshed `google-services.json`.
- This release also switches the GitHub-distributed APK from the **debug**
  build to the **release** build (R8-minified, ~3.6 MB instead of ~22 MB,
  release-signed). Users on a previous build must uninstall first before
  installing this one (Android requires matching signatures for updates).

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
