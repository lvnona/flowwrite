<?php
// FlowWrite backend BOOTSTRAP config.
//
// As of the "config in Firebase" change, almost everything (Stripe keys, price,
// webhook secret, URLs, SMTP credentials, owner-alert email, invite secret) is
// managed from the admin panel → Config tab and stored in Firestore
// (config/billing). The PHP backend reads it via fw_load_config().
//
// The ONLY thing that must live in this file is `service_account_path` — the
// path to the Firebase service-account JSON, which is the root credential PHP
// uses to read everything else from Firestore. (Chicken-and-egg: it can't read
// itself from Firestore.) Set it once; file replacements never touch it.
//
// The other keys below are OPTIONAL FALLBACKS — used only if the matching
// Firestore value is empty. You can leave them as placeholders once you've
// entered everything in the admin Config tab.
//
// SETUP:
//   1. Copy this file to `_stripe-config.php` (same folder) on the server.
//   2. Set `service_account_path` to the absolute path of your service-account
//      JSON (keep that JSON OUTSIDE public_html if at all possible).
//   3. Open the admin panel → Config tab and fill in Stripe + email settings.
//
// Never commit the filled-in _stripe-config.php or the service-account JSON.

return [
  // ── REQUIRED: Firebase service account (bootstrap credential) ─────────────
  'service_account_path' => '/home/USERNAME/secure/flowwrite-service-account.json',

  // ── OPTIONAL FALLBACKS (managed in the admin Config tab) ──────────────────
  'stripe_secret_key'     => '',
  'stripe_price_id'       => '',
  'stripe_webhook_secret' => '',
  'site_url'    => 'https://flowwrite.u11.ca',
  'success_url' => 'https://flowwrite.u11.ca/thank-you.html',
  'cancel_url'  => 'https://flowwrite.u11.ca/?cancelled=1',
  'return_url'  => 'https://flowwrite.u11.ca/',
];
