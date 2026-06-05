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
require __DIR__ . '/_mailer.php';
$cfg  = fw_load_config();        // local bootstrap + Firestore config/billing overlay
$MAIL = fw_mail_cfg($cfg);       // SMTP creds + owner-alert email from that config

// Best-effort owner alert on a new subscriber. Never throws — a mail failure
// must not make the webhook return non-200 (Stripe would retry and double-send).
function fw_notify_owner($mail, $email, $uid) {
  if (empty($mail['owner_notify'])) return;
  try {
    $e = htmlspecialchars($email, ENT_QUOTES);
    $u = htmlspecialchars($uid, ENT_QUOTES);
    fw_smtp_send(
      $mail,
      $mail['owner_notify'],
      '🎉 New FlowWrite Pro subscriber',
      "New Pro subscriber: $email\nFirebase UID: $uid",
      "<h2 style=\"font-family:system-ui,sans-serif\">🎉 New FlowWrite Pro subscriber</h2>"
      . "<p style=\"font-family:system-ui,sans-serif;font-size:15px\"><strong>$e</strong></p>"
      . "<p style=\"font-family:system-ui,sans-serif;color:#666;font-size:13px\">Firebase UID: $u</p>"
    );
  } catch (Exception $ex) { /* swallow — never break the webhook */ }
}

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

// Extract current_period_end from a subscription object across Stripe API
// versions. Before 2026-04, it sat on the subscription object directly. In
// 2026-04-22.dahlia and later, it moved onto the subscription items array.
// Returns 0 when truly unavailable (caller must skip writing in that case).
function fw_period_end($subObj) {
  if (!empty($subObj['current_period_end'])) return (int)$subObj['current_period_end'];
  $items = $subObj['items']['data'] ?? [];
  foreach ($items as $it) {
    if (!empty($it['current_period_end'])) return (int)$it['current_period_end'];
  }
  return 0;
}

// Fetch the live subscription object from Stripe by ID. Used after
// checkout.session.completed (which only carries the subscription ID, not the
// expanded object) so we can store the renewal date immediately rather than
// wait for the first customer.subscription.updated event.
function fw_fetch_subscription($cfg, $subId) {
  if (empty($subId) || empty($cfg['stripe_secret_key'])) return null;
  $ch = curl_init('https://api.stripe.com/v1/subscriptions/' . rawurlencode($subId));
  curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
  curl_setopt($ch, CURLOPT_USERPWD, $cfg['stripe_secret_key'] . ':');
  curl_setopt($ch, CURLOPT_TIMEOUT, 15);
  $res  = curl_exec($ch);
  $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  if ($code !== 200) return null;
  return json_decode($res, true);
}

try {
  if ($type === 'checkout.session.completed') {
    $uid = $obj['client_reference_id'] ?? '';
    $extra = [
      'stripeCustomerId'   => $obj['customer'] ?? '',
      'subscriptionId'     => $obj['subscription'] ?? '',
      'subscriptionStatus' => 'active',
    ];
    // checkout.session.completed only carries the subscription ID, not the
    // expanded object — fetch it so we can persist the renewal date now
    // instead of waiting up to a month for subscription.updated.
    $sub = fw_fetch_subscription($cfg, $obj['subscription'] ?? '');
    if ($sub) {
      $cpe = fw_period_end($sub);
      if ($cpe > 0) $extra['currentPeriodEnd'] = $cpe;
    }
    fw_set_plan($cfg, $uid, 'pro', $extra);
    // Alert the owner that someone just subscribed (best-effort).
    $custEmail = $obj['customer_details']['email'] ?? $obj['customer_email'] ?? 'unknown';
    fw_notify_owner($MAIL, $custEmail, $uid);
  } elseif ($type === 'customer.subscription.created'
         || $type === 'customer.subscription.updated'
         || $type === 'customer.subscription.deleted') {
    $uid    = $obj['metadata']['firebase_uid'] ?? '';
    $status = $obj['status'] ?? 'canceled';
    $active = in_array($status, ['active', 'trialing'], true);
    $extra  = ['subscriptionStatus' => $status];
    // Only write the renewal date if we actually have one — never overwrite
    // a real value with 0 / the Unix epoch.
    $cpe = fw_period_end($obj);
    if ($cpe > 0) $extra['currentPeriodEnd'] = $cpe;
    fw_set_plan($cfg, $uid, $active ? 'pro' : 'free', $extra);
  }
  http_response_code(200);
  echo 'ok';
} catch (Exception $e) {
  // Return 500 so Stripe retries the delivery.
  http_response_code(500);
  echo 'error';
}
