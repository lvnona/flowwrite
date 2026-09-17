<?php
// Opens the Stripe Customer Portal so a Pro user can update their card or
// cancel. Called by the app: /billing-portal.php?token=<firebase_id_token>
//
// Looks up the user's stripeCustomerId in Firestore, creates a portal session,
// and redirects to it. The uid is verified from the token server-side — never
// trusted from a client-supplied parameter — so this can only ever open the
// signed-in caller's own billing portal, not anyone else's.

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
