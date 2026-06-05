<?php
/**
 * api-generate.php — SERVER-SIDE text generation + limit enforcement.
 *
 * The single chokepoint every client (mobile now, desktop later) calls to
 * generate text. The server — not the device — decides whether the user is
 * allowed, calls the AI with admin keys, and records the usage in Firestore.
 * This makes Firebase the one source of truth: no client can exceed its limit
 * or hide its usage, and no AI key ever ships inside an app.
 *
 * Request  (POST, application/json):
 *   Authorization: Bearer <firebase id token>   (or "idToken" in the body)
 *   { "prompt": "<full prompt built client-side>" }
 *
 * Response:
 *   200  { "ok": true, "text": "...", "usage": { "used": 12, "limit": 35, "plan": "free" } }
 *   401  { "error": "unauthorized" }
 *   402  { "error": "limit_reached", "limitReached": "generations", "used": 35, "limit": 35 }
 *   403  { "error": "account_suspended" }
 *   502  { "error": "ai_error", "detail": "..." }
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

$cfg  = fw_load_config();
$body = json_decode(file_get_contents('php://input'), true) ?: [];

// 1. Authenticate — establishes WHICH user this is, cryptographically.
try {
  $uid = fw_authed_uid($body['idToken'] ?? '');
} catch (Exception $e) {
  http_response_code(401);
  echo json_encode(['error' => 'unauthorized', 'detail' => $e->getMessage()]);
  exit;
}

$prompt = (string)($body['prompt'] ?? '');
if (trim($prompt) === '') { http_response_code(400); echo json_encode(['error' => 'empty_prompt']); exit; }

// 2. Read the user's plan + this week's generation count (server-side truth).
$user = fw_get_user($cfg, $uid);
if (!$user) { http_response_code(404); echo json_encode(['error' => 'user_not_found']); exit; }

$plan   = $user['plan']['stringValue']   ?? 'free';
$status = $user['status']['stringValue'] ?? 'active';
if ($status === 'suspended') { http_response_code(403); echo json_encode(['error' => 'account_suspended']); exit; }
$isPro = in_array($plan, ['pro', 'team'], true);

$week = fw_iso_week();
$used = fw_usage_value($user, 'usageWeekly', $week);

// 3. Enforce the limit BEFORE spending any AI budget.
$limits   = fw_get_config_doc($cfg, 'limits');
$genLimit = (int)($limits['freeWeeklyGenerations'] ?? 50);
if (!$isPro && $used >= $genLimit) {
  http_response_code(402);
  echo json_encode(['error' => 'limit_reached', 'limitReached' => 'generations', 'used' => $used, 'limit' => $genLimit]);
  exit;
}

// 4. Call the AI with admin keys (read server-side; never sent to the client).
$keys = fw_get_config_doc($cfg, 'apiKeys');
try {
  $text = fw_ai_generate($keys, $prompt);
} catch (Exception $e) {
  http_response_code(502);
  echo json_encode(['error' => 'ai_error', 'detail' => $e->getMessage()]);
  exit;
}

// 5. Record the usage in Firestore (atomic). This is the +1 the admin sees.
$nowMs = (int) round(microtime(true) * 1000);
fw_increment_user($cfg, $uid, [
  "usageWeekly.$week"            => 1,
  'usage.' . gmdate('Y-m')       => 1,
  'allTimeUsage'                 => 1,
], ['lastSeen' => $nowMs]);

echo json_encode([
  'ok'    => true,
  'text'  => $text,
  'usage' => ['used' => $used + 1, 'limit' => $isPro ? null : $genLimit, 'plan' => $plan],
]);
