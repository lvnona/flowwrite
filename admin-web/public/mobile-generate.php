<?php
// FlowWrite mobile — text generation proxy.
//
// POST application/json:  { "prompt": "..." }
// Header: Authorization: Bearer <Firebase ID token>
//
// Verifies the caller's Firebase ID token, enforces the free weekly generation
// limit (shared with the desktop app via the same Firestore counters), calls
// the admin-configured provider with the key from Firestore config/apiKeys, and
// returns the generated text. The API keys NEVER leave the server.
//
// Response 200: { ok:true, text, usage:{ generationsThisWeek, limit, plan } }
// Errors:       { ok:false, error, ... }   (401 auth, 429 limit, 502 provider)

require __DIR__ . '/_firebase.php';
require __DIR__ . '/_verify_token.php';
require __DIR__ . '/_mobile.php';

fw_json_header();
fw_require_post();

// ── 1. Authenticate ──────────────────────────────────────────────────────────
$claims = fw_authenticate();
$uid    = $claims['uid'];

// ── 2. Input ───────────────────────────────────────────────────────────────--
$in     = json_decode(file_get_contents('php://input'), true);
$prompt = is_array($in) ? trim((string) ($in['prompt'] ?? '')) : '';
if ($prompt === '')            fw_fail(400, 'A non-empty prompt is required.');
if (strlen($prompt) > 20000)   fw_fail(400, 'Prompt too long (max 20k chars).');

// ── 3. Config + keys ─────────────────────────────────────────────────────────
$cfg = fw_load_config();
if (empty($cfg['service_account_path'])) fw_fail(500, 'Server is not configured.');
$keys = fw_get_config_doc($cfg, 'apiKeys');

// ── 4. Plan + weekly limit (free = 50 generations/week, shared with desktop) ──
const FREE_GENERATIONS_PER_WEEK = 50;
$week  = fw_iso_week_key();
$state = fw_load_user_state($cfg, $uid, $claims['email']);
$used  = fw_read_weekly_map($state['fields'], 'usageWeekly', $week);

if (!$state['unlimited'] && $used >= FREE_GENERATIONS_PER_WEEK) {
  fw_fail(429, "You've used all " . FREE_GENERATIONS_PER_WEEK . ' free generations this week.', [
    'limitReached' => 'generations',
    'usage' => [
      'generationsThisWeek' => $used,
      'limit' => FREE_GENERATIONS_PER_WEEK,
      'plan'  => $state['plan'],
    ],
  ]);
}

// ── 5. Generate ────────────────────────────────────────────────────────────--
try {
  $text = fw_generate_text($keys, $prompt);
} catch (Exception $e) {
  fw_fail(502, $e->getMessage());
}

// ── 6. Record usage (best-effort — never fail after a successful paid call) ──
$month = fw_month_key();
try {
  fw_increment_user($cfg, $uid, [
    "usage.$month"      => 1,
    "usageWeekly.$week" => 1,
    'allTimeUsage'      => 1,
  ]);
} catch (Exception $e) { /* swallow — generation already succeeded */ }

echo json_encode([
  'ok'    => true,
  'text'  => $text,
  'usage' => [
    'generationsThisWeek' => $used + 1,
    'limit' => $state['unlimited'] ? null : FREE_GENERATIONS_PER_WEEK,
    'plan'  => $state['plan'],
  ],
]);
