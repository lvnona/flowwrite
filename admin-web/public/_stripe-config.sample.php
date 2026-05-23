<?php
// FlowWrite Stripe + Firebase config.
//
// SETUP: copy this file to `_stripe-config.php` (same folder) on the server and
// fill in the real values. The leading underscore + the .htaccess rule keep
// `_*.php` from being served directly, but the SERVICE ACCOUNT JSON should still
// live OUTSIDE public_html if at all possible.
//
// Never commit the filled-in _stripe-config.php or the service-account JSON.

return [
  // ── Stripe ──────────────────────────────────────────────────────────────
  // Test keys start with sk_test_ / pk_test_; live keys with sk_live_ / pk_live_.
  'stripe_secret_key'     => 'sk_test_REPLACE_ME',
  'stripe_price_id'       => 'price_REPLACE_ME',   // the recurring Pro price
  'stripe_webhook_secret' => 'whsec_REPLACE_ME',   // from the webhook endpoint

  // ── URLs ────────────────────────────────────────────────────────────────
  'site_url'    => 'https://flowwrite.u11.ca',
  'success_url' => 'https://flowwrite.u11.ca/?upgraded=1',
  'cancel_url'  => 'https://flowwrite.u11.ca/?cancelled=1',
  'return_url'  => 'https://flowwrite.u11.ca/',     // back from the billing portal

  // ── Firebase ──────────────────────────────────────────────────────────────
  // Absolute path to the Firebase service-account JSON (Project Settings →
  // Service accounts → Generate new private key). Keep it OUTSIDE the web root.
  'service_account_path' => '/home/USERNAME/secure/flowwrite-service-account.json',
];
