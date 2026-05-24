<?php
/**
 * _mailer.php — shared SMTP sender for FlowWrite.
 *
 * Used by both send-invite.php (invite emails) and stripe-webhook.php
 * (new-subscriber alerts to the owner).
 *
 * SMTP credentials are NO LONGER stored here — they live in Firestore
 * (config/billing) and are edited from the admin panel. Callers build the mail
 * config with fw_mail_cfg($cfg) where $cfg comes from fw_load_config().
 *
 * The leading underscore + the .htaccess rule keep this file from ever being
 * served directly. This file only defines functions — `require` it.
 */

// ─── Authenticated SMTP sender (implicit SSL, e.g. port 465) ─────────────────
function fw_smtp_send($cfg, $to, $subject, $text, $html) {
  $host = $cfg['host']; $port = $cfg['port'];
  $user = $cfg['user']; $pass = $cfg['pass'];
  $fromEmail = $cfg['from_email']; $fromName = $cfg['from_name'];

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
  $headers  = 'From: ' . fw_mime_name($fromName) . " <$fromEmail>\r\n";
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

function fw_mime_name($s) {
  return preg_match('/[^\x20-\x7e]/', $s) ? '=?UTF-8?B?' . base64_encode($s) . '?=' : $s;
}

// Build the SMTP/mail config array fw_smtp_send() expects from the merged app
// config (fw_load_config()). All values come from Firestore (config/billing),
// editable in the admin panel's Config tab.
function fw_mail_cfg($cfg) {
  $user = $cfg['smtp_user'] ?? '';
  return [
    'host'         => $cfg['smtp_host'] ?? '',
    'port'         => (int)($cfg['smtp_port'] ?? 465),
    'user'         => $user,
    'pass'         => $cfg['smtp_pass'] ?? '',
    'from_email'   => $cfg['from_email'] ?? $user,
    'from_name'    => $cfg['from_name'] ?? 'FlowWrite',
    // Where "🎉 new Pro subscriber" alerts go. Blank = alerts disabled.
    'owner_notify' => $cfg['owner_notify'] ?? '',
  ];
}
