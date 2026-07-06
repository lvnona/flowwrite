<?php
/**
 * api-transcribe.php — SERVER-SIDE voice dictation + word-limit enforcement.
 *
 * The client uploads recorded audio; the server authenticates the user, checks
 * the weekly dictated-word limit, transcribes with Whisper (admin key), counts
 * the words in the result, and records that exact count in Firestore. So "I
 * just dictated 25 words" becomes +25 in the user's audioWordsWeekly — decided
 * and stored by the server, on every platform, identically.
 *
 * Request  (POST, multipart/form-data):
 *   Authorization: Bearer <firebase id token>   (or "idToken" form field)
 *   file field "audio" — the recorded audio (m4a / wav / webm / mp3 …)
 *
 * Response:
 *   200  { "ok": true, "text": "...", "words": 25, "usage": { "used": 125, "limit": 2500, "plan": "free" } }
 *   401 / 402 / 403 / 502 — same shapes as api-generate.php
 */

require __DIR__ . '/_firebase.php';
require __DIR__ . '/_auth.php';
require __DIR__ . '/_ai.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: POST, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['error' => 'POST only']); exit; }

$cfg = fw_load_config();

// 1. Authenticate.
try {
  $uid = fw_authed_uid($_POST['idToken'] ?? '');
} catch (Exception $e) {
  http_response_code(401);
  echo json_encode(['error' => 'unauthorized', 'detail' => $e->getMessage()]);
  exit;
}

if (empty($_FILES['audio']) || ($_FILES['audio']['error'] ?? 1) !== UPLOAD_ERR_OK) {
  http_response_code(400);
  echo json_encode(['error' => 'missing_audio']);
  exit;
}

// 2. Read plan + this week's word count.
$user = fw_get_user($cfg, $uid);
if (!$user) { http_response_code(404); echo json_encode(['error' => 'user_not_found']); exit; }

$plan   = $user['plan']['stringValue']   ?? 'free';
$status = $user['status']['stringValue'] ?? 'active';
if ($status === 'suspended') { http_response_code(403); echo json_encode(['error' => 'account_suspended']); exit; }
$isPro = in_array($plan, ['pro', 'team'], true);

$week = fw_iso_week();
$used = fw_usage_value($user, 'audioWordsWeekly', $week);

// 3. Enforce BEFORE transcribing (block if already at/over the limit).
$limits     = fw_get_config_doc($cfg, 'limits');
$wordLimit  = (int)($limits['freeWeeklyAudioWords'] ?? 2500);
if (!$isPro && $used >= $wordLimit) {
  http_response_code(402);
  echo json_encode(['error' => 'limit_reached', 'limitReached' => 'audioWords', 'used' => $used, 'limit' => $wordLimit]);
  exit;
}

// 4. Transcribe with the admin Whisper key.
$keys = fw_get_config_doc($cfg, 'apiKeys');
$mime = $_FILES['audio']['type'] ?: 'application/octet-stream';
$name = $_FILES['audio']['name'] ?? '';   // original filename → Whisper needs its extension
try {
  // Pass the whole keys array so fw_ai_transcribe can dispatch by provider
  // (OpenAI Whisper, Hermes, future ones) without changing this endpoint.
  $text = fw_ai_transcribe($keys, $_FILES['audio']['tmp_name'], $mime, $name);
} catch (Exception $e) {
  http_response_code(502);
  echo json_encode(['error' => 'ai_error', 'detail' => $e->getMessage()]);
  exit;
}

// 5. Count words from the raw transcript and send the response to the client
//    immediately. The grammar-polish pass (GPT-4o-mini) has moved to the
//    desktop client (electron/main.js) so it no longer blocks this response.
//    Android receives the raw Whisper text; the Electron app runs its own
//    cleanup pass locally after this fast reply arrives.
$words = fw_word_count($text);
$nowMs = (int) round(microtime(true) * 1000);

echo json_encode([
  'ok'    => true,
  'text'  => $text,
  'words' => $words,
  'usage' => ['used' => $used + $words, 'limit' => $isPro ? null : $wordLimit, 'plan' => $plan],
]);

// Flush the HTTP response to the client NOW, before the Firestore write.
// On PHP-FPM (nginx/LiteSpeed) fastcgi_finish_request() closes the response
// socket while PHP keeps running — the client is unblocked immediately.
// On mod_php this is a no-op and the Firestore write stays in the critical
// path (adds ~100-300ms), but it's still faster than the old polish pass.
if (function_exists('fastcgi_finish_request')) {
  fastcgi_finish_request();
}

// 6. Record usage AFTER the client has already received the text.
if ($words > 0) {
  fw_increment_user($cfg, $uid, [
    "audioWordsWeekly.$week"          => $words,
    'audioWords.' . gmdate('Y-m')     => $words,
    'allTimeAudioWords'               => $words,
  ], ['lastSeen' => $nowMs]);
}
