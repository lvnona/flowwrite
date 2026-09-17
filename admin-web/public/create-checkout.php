<?php
// Creates a Stripe Checkout Session for the FlowWrite Pro subscription and
// redirects the browser to Stripe's hosted payment page.
//
// Called by the app: /create-checkout.php?token=<firebase_id_token>&email=<email>
// The uid (verified server-side from the token, never trusted from the client)
// is attached as client_reference_id AND on the subscription metadata, so the
// webhook can map every future subscription event back to the user.

require __DIR__ . '/_firebase.php';
require __DIR__ . '/_auth.php';
$cfg = fw_load_config();   // local bootstrap + Firestore config/billing overlay

try {
  $uid = fw_authed_uid($_GET['token'] ?? '');
} catch (Exception $e) {
  http_response_code(401);
  echo 'Not signed in — open FlowWrite and sign in again, then retry.';
  exit;
}
$email = isset($_GET['email']) ? trim($_GET['email']) : '';

// Build the form-encoded params for Stripe's API (nested keys use [] notation).
$params = [
  'mode'                      => 'subscription',
  'success_url'               => $cfg['success_url'],
  'cancel_url'                => $cfg['cancel_url'],
  'client_reference_id'       => $uid,
  'line_items[0][price]'      => $cfg['stripe_price_id'],
  'line_items[0][quantity]'   => '1',
  'subscription_data[metadata][firebase_uid]' => $uid,
  'allow_promotion_codes'     => 'true',
];
if ($email !== '') $params['customer_email'] = $email;

$ch = curl_init('https://api.stripe.com/v1/checkout/sessions');
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_USERPWD, $cfg['stripe_secret_key'] . ':');
curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($params));
$res  = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

$session = json_decode($res, true);
if ($code === 200 && !empty($session['url'])) {
  header('Location: ' . $session['url'], true, 303);
  exit;
}

http_response_code(500);
echo 'Could not start checkout. ' . htmlspecialchars($session['error']['message'] ?? '');
