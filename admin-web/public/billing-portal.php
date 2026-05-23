<?php
// Opens the Stripe Customer Portal so a Pro user can update their card or
// cancel. Called by the app: /billing-portal.php?uid=<firebase_uid>
//
// Looks up the user's stripeCustomerId in Firestore, creates a portal session,
// and redirects to it.

require __DIR__ . '/_firebase.php';
$cfg = require __DIR__ . '/_stripe-config.php';

$uid = isset($_GET['uid']) ? trim($_GET['uid']) : '';
if ($uid === '') { http_response_code(400); echo 'Missing uid'; exit; }

$fields = fw_get_user($cfg, $uid);
$customer = $fields['stripeCustomerId']['stringValue'] ?? '';
if ($customer === '') {
  http_response_code(404);
  echo 'No subscription found for this account.';
  exit;
}

$ch = curl_init('https://api.stripe.com/v1/billing_portal/sessions');
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_USERPWD, $cfg['stripe_secret_key'] . ':');
curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query([
  'customer'   => $customer,
  'return_url' => $cfg['return_url'],
]));
$res  = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

$session = json_decode($res, true);
if ($code === 200 && !empty($session['url'])) {
  header('Location: ' . $session['url'], true, 303);
  exit;
}

http_response_code(500);
echo 'Could not open billing portal. ' . htmlspecialchars($session['error']['message'] ?? '');
