<?php
/**
 * send-invite.php — FlowWrite "Invite New User" email sender.
 *
 * The admin panel POSTs { email, link, secret } here as JSON. We verify the
 * shared secret (so this can't be used as an open relay), then send a branded
 * HTML invite (with plain-text fallback) over authenticated SMTP.
 *
 * No Cloud Functions / Blaze needed — runs on plain HostArmada PHP. Deploy this
 * file next to the admin panel (it lands at https://flowwrite.u11.ca/send-invite.php).
 *
 * ┌─ SETUP ────────────────────────────────────────────────────────────────┐
 * │ 1. In cPanel → Email Accounts, create a mailbox e.g. noreply@u11.ca      │
 * │ 2. Fill in the CONFIG block below (SMTP host/user/pass + a long secret). │
 * │ 3. Enter that same INVITE_SECRET in the admin panel's invite dialog.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

// ─── CONFIG ──────────────────────────────────────────────────────────────────
// All settings (SMTP credentials, invite secret) now live in Firestore
// (config/billing) and are edited from the admin panel's Config tab. The
// hardcoded INVITE_SECRET below is only a fallback if Firestore has none set.
require __DIR__ . '/_firebase.php';
require __DIR__ . '/_mailer.php';
$cfg  = fw_load_config();
$MAIL = fw_mail_cfg($cfg);
$INVITE_SECRET = ($cfg['invite_secret'] ?? '') ?: 'DHJRpGdj77RekFrC-uuApFerIFvuwUo5nt_gW9jzEDI';
$TEMPLATE_FILE = __DIR__ . '/invite-email.html';
$DEFAULT_LINK  = 'https://flowwrite.u11.ca/welcome.html';
// ─────────────────────────────────────────────────────────────────────────────

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  http_response_code(405); echo json_encode(['error' => 'POST only']); exit;
}

$body   = json_decode(file_get_contents('php://input'), true) ?: [];
$email  = trim($body['email']  ?? '');
$link   = trim($body['link']   ?? $DEFAULT_LINK);
$secret = (string)($body['secret'] ?? '');

if (!hash_equals($INVITE_SECRET, $secret)) {
  http_response_code(403); echo json_encode(['error' => 'Invalid invite key.']); exit;
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
  http_response_code(400); echo json_encode(['error' => 'Invalid email address.']); exit;
}

// Build the message bodies.
$html = @file_get_contents($TEMPLATE_FILE);
if ($html === false) {
  $html = '<p>You have been invited to FlowWrite. Download it here: <a href="{{LINK}}">{{LINK}}</a></p>';
}
$html = str_replace(['{{LINK}}', '{{EMAIL}}'],
                    [htmlspecialchars($link, ENT_QUOTES), htmlspecialchars($email, ENT_QUOTES)],
                    $html);

$text = "You're invited to FlowWrite!\r\n\r\n"
      . "FlowWrite is an AI writing assistant that helps you write better, anywhere.\r\n\r\n"
      . "Get started — download the app:\r\n$link\r\n\r\n"
      . "Then open it and sign in with your Google account to create your account.\r\n\r\n"
      . "— The FlowWrite team";

try {
  fw_smtp_send($MAIL, $email, "You're invited to FlowWrite", $text, $html);
  echo json_encode(['ok' => true]);
} catch (Exception $e) {
  http_response_code(502);
  echo json_encode(['error' => 'Could not send: ' . $e->getMessage()]);
}
