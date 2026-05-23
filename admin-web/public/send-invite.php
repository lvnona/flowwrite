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
$SMTP_HOST     = 'mail.u11.ca';
$SMTP_PORT     = 465;                              // implicit SSL
$SMTP_USER     = 'flowwrite@u11.ca';
$SMTP_PASS     = 'ENTER_EMAIL_PASSWORD_HERE';      // ← paste the mailbox password
$FROM_EMAIL    = 'flowwrite@u11.ca';
$FROM_NAME     = 'FlowWrite';
$INVITE_SECRET = 'DHJRpGdj77RekFrC-uuApFerIFvuwUo5nt_gW9jzEDI'; // paste this in the admin invite dialog
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
  smtp_send($SMTP_HOST, $SMTP_PORT, $SMTP_USER, $SMTP_PASS,
            $FROM_EMAIL, $FROM_NAME, $email,
            "You're invited to FlowWrite", $text, $html);
  echo json_encode(['ok' => true]);
} catch (Exception $e) {
  http_response_code(502);
  echo json_encode(['error' => 'Could not send: ' . $e->getMessage()]);
}

// ─── Minimal authenticated SMTP sender (implicit SSL, e.g. port 465) ─────────
function smtp_send($host, $port, $user, $pass, $fromEmail, $fromName, $to, $subject, $text, $html) {
  // Lenient TLS — cPanel mail servers frequently present a cert for the server
  // hostname rather than mail.<domain>, which would otherwise fail verification.
  $ctx = stream_context_create(['ssl' => [
    'verify_peer'       => false,
    'verify_peer_name'  => false,
    'allow_self_signed' => true,
  ]]);
  $fp = @stream_socket_client("ssl://$host:$port", $errno, $errstr, 20,
                              STREAM_CLIENT_CONNECT, $ctx);
  if (!$fp) throw new Exception("connect: $errstr ($errno)");
  stream_set_timeout($fp, 20);

  $read = function () use ($fp) {
    $data = '';
    while (($line = fgets($fp, 600)) !== false) {
      $data .= $line;
      if (strlen($line) >= 4 && $line[3] === ' ') break; // last line of reply
    }
    return $data;
  };
  $expect = function ($resp, $code) {
    if (strncmp($resp, $code, 3) !== 0) throw new Exception("expected $code, got: " . trim($resp));
  };
  $cmd = function ($c) use ($fp, $read) { fwrite($fp, $c . "\r\n"); return $read(); };

  $expect($read(), '220');
  $host_ehlo = $_SERVER['SERVER_NAME'] ?? 'localhost';
  $expect($cmd("EHLO $host_ehlo"), '250');
  $expect($cmd('AUTH LOGIN'), '334');
  $expect($cmd(base64_encode($user)), '334');
  $expect($cmd(base64_encode($pass)), '235');
  $expect($cmd("MAIL FROM:<$fromEmail>"), '250');
  $expect($cmd("RCPT TO:<$to>"), '250');
  $expect($cmd('DATA'), '354');

  $boundary = 'fw_' . bin2hex(random_bytes(8));
  $headers  = 'From: ' . mime_name($fromName) . " <$fromEmail>\r\n";
  $headers .= "To: <$to>\r\n";
  $headers .= 'Subject: =?UTF-8?B?' . base64_encode($subject) . "?=\r\n";
  $headers .= "Date: " . date('r') . "\r\n";
  $headers .= "MIME-Version: 1.0\r\n";
  $headers .= "Content-Type: multipart/alternative; boundary=\"$boundary\"\r\n";

  $msg  = $headers . "\r\n";
  $msg .= "--$boundary\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n" . $text . "\r\n\r\n";
  $msg .= "--$boundary\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n" . $html . "\r\n\r\n";
  $msg .= "--$boundary--\r\n";
  $msg  = preg_replace('/^\./m', '..', $msg); // dot-stuffing

  fwrite($fp, $msg . "\r\n.\r\n");
  $expect($read(), '250');
  fwrite($fp, "QUIT\r\n");
  fclose($fp);
}

function mime_name($s) {
  return preg_match('/[^\x20-\x7e]/', $s) ? '=?UTF-8?B?' . base64_encode($s) . '?=' : $s;
}
