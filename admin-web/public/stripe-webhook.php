<?php
// Stripe webhook → updates the user's plan in Firestore.
//
// Configure in Stripe: endpoint = https://flowwrite.u11.ca/stripe-webhook.php
// Events: checkout.session.completed, customer.subscription.updated,
//         customer.subscription.deleted
//
// Plan mapping:
//   subscription active / trialing      → plan = "pro"
//   canceled / unpaid / past_due / etc. → plan = "free"  (payment declined or
//                                          customer cancelled)

require __DIR__ . '/_firebase.php';
$cfg = require __DIR__ . '/_stripe-config.php';

// 1. Read the raw body + verify the Stripe signature.
$payload = file_get_contents('php://input');
$sigHeader = $_SERVER['HTTP_STRIPE_SIGNATURE'] ?? '';

function fw_verify_stripe($payload, $sigHeader, $secret, $tolerance = 300) {
  $parts = [];
  foreach (explode(',', $sigHeader) as $kv) {
    $p = explode('=', $kv, 2);
    if (count($p) === 2) $parts[trim($p[0])] = trim($p[1]);
  }
  if (empty($parts['t']) || empty($parts['v1'])) return false;
  $signed = $parts['t'] . '.' . $payload;
  $expected = hash_hmac('sha256', $signed, $secret);
  if (!hash_equals($expected, $parts['v1'])) return false;
  if (abs(time() - (int)$parts['t']) > $tolerance) return false;
  return true;
}

if (!fw_verify_stripe($payload, $sigHeader, $cfg['stripe_webhook_secret'])) {
  http_response_code(400);
  echo 'Invalid signature';
  exit;
}

$event = json_decode($payload, true);
$type  = $event['type'] ?? '';
$obj   = $event['data']['object'] ?? [];

// Helper: set a user's plan + subscription fields.
function fw_set_plan($cfg, $uid, $plan, $extra = []) {
  if (!$uid) return;
  $fields = array_merge(['plan' => $plan], $extra);
  fw_patch_user($cfg, $uid, $fields);
}

try {
  if ($type === 'checkout.session.completed') {
    $uid = $obj['client_reference_id'] ?? '';
    fw_set_plan($cfg, $uid, 'pro', [
      'stripeCustomerId'   => $obj['customer'] ?? '',
      'subscriptionId'     => $obj['subscription'] ?? '',
      'subscriptionStatus' => 'active',
    ]);
  } elseif ($type === 'customer.subscription.updated' || $type === 'customer.subscription.deleted') {
    $uid    = $obj['metadata']['firebase_uid'] ?? '';
    $status = $obj['status'] ?? 'canceled';
    $active = in_array($status, ['active', 'trialing'], true);
    fw_set_plan($cfg, $uid, $active ? 'pro' : 'free', [
      'subscriptionStatus' => $status,
      'currentPeriodEnd'   => (int)($obj['current_period_end'] ?? 0),
    ]);
  }
  http_response_code(200);
  echo 'ok';
} catch (Exception $e) {
  // Return 500 so Stripe retries the delivery.
  http_response_code(500);
  echo 'error';
}
