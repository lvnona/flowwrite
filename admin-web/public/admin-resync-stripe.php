<?php
// Admin endpoint: re-fetch a user's Stripe subscription and update Firestore.
//
// Used to fix records where the webhook missed the renewal date (e.g. older
// subscriptions, Stripe 2026 API change moving current_period_end onto items).
//
// Auth: shared invite secret — already stored client-side by the admin panel.
// POST body: { uid: "<firebase_uid>", secret: "<invite_secret>" }
// Response: { ok: true, currentPeriodEnd: 1722556800, status: "active" } | { error: "..." }

require __DIR__ . '/_firebase.php';
$cfg = fw_load_config();

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  http_response_code(405); echo json_encode(['error' => 'POST only']); exit;
}

$body   = json_decode(file_get_contents('php://input'), true) ?: [];
$uid    = trim($body['uid']    ?? '');
$secret = (string)($body['secret'] ?? '');

$inviteSecret = ($cfg['invite_secret'] ?? '') ?: 'DHJRpGdj77RekFrC-uuApFerIFvuwUo5nt_gW9jzEDI';
if (!hash_equals($inviteSecret, $secret)) {
  http_response_code(403); echo json_encode(['error' => 'Invalid admin secret.']); exit;
}
if ($uid === '') {
  http_response_code(400); echo json_encode(['error' => 'Missing uid.']); exit;
}

// 1. Read the user's stripeCustomerId / subscriptionId from Firestore.
$fields = fw_get_user($cfg, $uid);
if (!$fields) {
  http_response_code(404); echo json_encode(['error' => 'User not found in Firestore.']); exit;
}
$subId = $fields['subscriptionId']['stringValue'] ?? '';
if ($subId === '') {
  http_response_code(400);
  echo json_encode(['error' => 'No subscriptionId on user — they were never a Stripe subscriber.']);
  exit;
}

// 2. Pull the live subscription object from Stripe.
$ch = curl_init('https://api.stripe.com/v1/subscriptions/' . rawurlencode($subId));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_USERPWD, $cfg['stripe_secret_key'] . ':');
curl_setopt($ch, CURLOPT_TIMEOUT, 15);
$res  = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($code !== 200) {
  $err = json_decode($res, true);
  http_response_code(502);
  echo json_encode(['error' => 'Stripe error: ' . ($err['error']['message'] ?? 'http ' . $code)]);
  exit;
}
$sub = json_decode($res, true);

// 3. Extract the renewal date (Stripe API-version-tolerant) and current status.
function fw_resync_period_end($s) {
  if (!empty($s['current_period_end'])) return (int)$s['current_period_end'];
  foreach (($s['items']['data'] ?? []) as $it) {
    if (!empty($it['current_period_end'])) return (int)$it['current_period_end'];
  }
  return 0;
}
$cpe    = fw_resync_period_end($sub);
$status = $sub['status'] ?? 'unknown';
$active = in_array($status, ['active', 'trialing'], true);

// 4. Patch Firestore — plan reflects current Stripe status; only write
//    currentPeriodEnd when we actually have one.
$patch = [
  'plan'               => $active ? 'pro' : 'free',
  'subscriptionStatus' => $status,
];
if ($cpe > 0) $patch['currentPeriodEnd'] = $cpe;
fw_patch_user($cfg, $uid, $patch);

echo json_encode([
  'ok'                 => true,
  'plan'               => $patch['plan'],
  'subscriptionStatus' => $status,
  'currentPeriodEnd'   => $cpe > 0 ? $cpe : null,
]);
