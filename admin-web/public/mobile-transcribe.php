<?php
// FlowWrite mobile — voice transcription proxy.
//
// POST multipart/form-data with an "audio" file part (m4a/mp4/webm/wav/ogg).
// Header: Authorization: Bearer <Firebase ID token>
//
// Verifies the caller, enforces the free weekly dictated-words limit (shared
// with the desktop app), runs OpenAI Whisper + the hardened grammar-polish
// pass, records the word count, and returns the cleaned transcript. Keys never
// leave the server.
//
// Response 200: { ok:true, text, words, usage:{ audioWordsThisWeek, limit, plan } }
// Errors:       { ok:false, error, ... }  (401 auth, 413 too big, 429 limit, 502 whisper)

require __DIR__ . '/_firebase.php';
require __DIR__ . '/_verify_token.php';
require __DIR__ . '/_mobile.php';

fw_json_header();
fw_require_post();

// ── 1. Authenticate ──────────────────────────────────────────────────────────
$claims = fw_authenticate();
$uid    = $claims['uid'];

// ── 2. Audio upload ───────────────────────────────────────────────────────---
if (empty($_FILES['audio']) || !is_uploaded_file($_FILES['audio']['tmp_name'] ?? '')) {
  fw_fail(400, 'No audio uploaded (expected multipart field "audio").');
}
$audio = $_FILES['audio'];
$size  = (int) ($audio['size'] ?? 0);
if ($size <= 0)                 fw_fail(400, 'Empty audio. Hold the mic a little longer.');
if ($size > 25 * 1024 * 1024)   fw_fail(413, 'Audio too large (max 25MB).'); // Whisper cap

// ── 3. Config + key ──────────────────────────────────────────────────────────
$cfg = fw_load_config();
if (empty($cfg['service_account_path'])) fw_fail(500, 'Server is not configured.');
$keys      = fw_get_config_doc($cfg, 'apiKeys');
$openaiKey = $keys['openai'] ?? '';
if ($openaiKey === '') fw_fail(503, "Voice transcription isn't configured yet.");

// ── 4. Plan + weekly limit (free = 2500 dictated words/week, shared) ─────────-
const FREE_WORDS_PER_WEEK = 2500;
$week  = fw_iso_week_key();
$state = fw_load_user_state($cfg, $uid, $claims['email']);
$used  = fw_read_weekly_map($state['fields'], 'audioWordsWeekly', $week);

if (!$state['unlimited'] && $used >= FREE_WORDS_PER_WEEK) {
  fw_fail(429, "You've used all " . FREE_WORDS_PER_WEEK . ' free dictated words this week.', [
    'limitReached' => 'audio',
    'usage' => [
      'audioWordsThisWeek' => $used,
      'limit' => FREE_WORDS_PER_WEEK,
      'plan'  => $state['plan'],
    ],
  ]);
}

// ── 5. Transcribe (+ best-effort grammar polish) ────────────────────────────-
try {
  $text = fw_call_whisper($openaiKey, $audio['tmp_name'], $audio['name'] ?? 'dictation.m4a', $audio['type'] ?? '');
} catch (Exception $e) {
  fw_fail(502, $e->getMessage());
}
$polished = fw_polish_dictation($openaiKey, $text);
if ($polished !== null) $text = $polished;
$text  = trim($text);
$words = $text === '' ? 0 : count(preg_split('/\s+/', $text, -1, PREG_SPLIT_NO_EMPTY));

// ── 6. Record usage (best-effort) ────────────────────────────────────────────
if ($words > 0) {
  $month = fw_month_key();
  try {
    fw_increment_user($cfg, $uid, [
      "audioWords.$month"      => $words,
      "audioWordsWeekly.$week" => $words,
      'allTimeAudioWords'      => $words,
    ]);
  } catch (Exception $e) { /* swallow — transcription already succeeded */ }
}

echo json_encode([
  'ok'    => true,
  'text'  => $text,
  'words' => $words,
  'usage' => [
    'audioWordsThisWeek' => $used + $words,
    'limit' => $state['unlimited'] ? null : FREE_WORDS_PER_WEEK,
    'plan'  => $state['plan'],
  ],
]);
