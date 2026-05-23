<?php
// Creates a Stripe Checkout Session for the FlowWrite Pro subscription and
// redirects the browser to Stripe's hosted payment page.
//
// Called by the app: /create-checkout.php?uid=<firebase_uid>&email=<email>
// The uid is attached as client_reference_id AND on the subscription metadata,
// so the webhook can map every future subscription event back to the user.

$cfg = require __DIR__ . '/_stripe-config.php';

$uid   = isset($_GET['uid']) ? trim($_GET['uid']) : '';
$email = isset($_GET['email']) ? trim($_GET['email']) : '';
if ($uid === '') { http_response_code(400); echo 'Missing uid'; exit; }

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
