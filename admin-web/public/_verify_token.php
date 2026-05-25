<?php
// Verify a Firebase ID token (a Google-signed JWT) — no Composer, no SDK.
//
// This is what the mobile proxy uses to trust the caller. It mirrors exactly
// what the Firebase Admin SDK / Cloud Functions `onCall` do under the hood:
//   - the JWT header alg must be RS256 and carry a `kid`
//   - the signature must verify against Google's public x509 cert for that kid
//     (https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com)
//   - aud  == the Firebase project id
//   - iss  == https://securetoken.google.com/<project id>
//   - exp  is in the future (small clock-skew leeway)
//   - iat / auth_time are not in the future
//   - sub  is a non-empty string (this is the uid)
//
// WHY this matters: the existing PHP (create-checkout.php) trusts a `?uid=`
// query param because the Stripe webhook is the real source of truth there. A
// generation/transcription proxy has no such backstop — if it trusted a
// client-supplied uid, anyone could burn the admin's API budget under someone
// else's account. So every mobile call MUST pass this gate.
//
// fw_verify_id_token() returns ['uid' => ..., 'email' => ...] or throws.

const FW_FIREBASE_PROJECT_ID = 'flowwrite-3ccd2';

// Base64url-decode (JWT segments are unpadded base64url).
function fw_b64url_decode($s) {
  $pad = strlen($s) % 4;
  if ($pad) $s .= str_repeat('=', 4 - $pad);
  return base64_decode(strtr($s, '-_', '+/'));
}

// Fetch + cache Google's securetoken signing certs (PEM x509, keyed by kid).
// Honours the response's Cache-Control: max-age so we don't refetch on every
// request, and so we pick up Google's ~daily key rotation automatically.
function fw_google_certs($forceRefresh = false) {
  $cacheFile = sys_get_temp_dir() . '/fw_securetoken_certs.json';
  if (!$forceRefresh && is_readable($cacheFile)) {
    $cached = json_decode(file_get_contents($cacheFile), true);
    if ($cached && ($cached['expires'] ?? 0) > time() && !empty($cached['certs'])) {
      return $cached['certs'];
    }
  }

  $ch = curl_init('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
  curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
  curl_setopt($ch, CURLOPT_HEADER, true);
  $resp  = curl_exec($ch);
  $code  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $hsize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
  curl_close($ch);
  if ($code !== 200 || $resp === false) {
    throw new Exception('Could not fetch Google signing certs');
  }

  $rawHeaders = substr($resp, 0, $hsize);
  $body       = substr($resp, $hsize);
  $certs      = json_decode($body, true);
  if (!is_array($certs) || !$certs) {
    throw new Exception('Malformed Google certs payload');
  }

  $maxAge = 3600;
  if (preg_match('/max-age\s*=\s*(\d+)/i', $rawHeaders, $m)) {
    $maxAge = (int) $m[1];
  }
  @file_put_contents($cacheFile, json_encode([
    'expires' => time() + max(60, $maxAge),
    'certs'   => $certs,
  ]));
  return $certs;
}

// Verify a Firebase ID token. Returns ['uid' => ..., 'email' => ...] on success.
function fw_verify_id_token($idToken) {
  $idToken = trim((string) $idToken);
  if ($idToken === '') throw new Exception('Missing ID token');

  $parts = explode('.', $idToken);
  if (count($parts) !== 3) throw new Exception('Malformed token');
  list($h64, $p64, $s64) = $parts;

  $header  = json_decode(fw_b64url_decode($h64), true);
  $payload = json_decode(fw_b64url_decode($p64), true);
  $sig     = fw_b64url_decode($s64);
  if (!is_array($header) || !is_array($payload)) {
    throw new Exception('Malformed token segments');
  }
  if (($header['alg'] ?? '') !== 'RS256') throw new Exception('Unexpected token alg');
  $kid = $header['kid'] ?? '';
  if ($kid === '') throw new Exception('Token has no key id');

  // Resolve the signing cert; on a kid miss, refresh once (key rotation).
  $certs = fw_google_certs();
  if (empty($certs[$kid])) {
    $certs = fw_google_certs(true);
    if (empty($certs[$kid])) throw new Exception('Unknown signing key');
  }

  $pubKey = openssl_pkey_get_public($certs[$kid]);
  if ($pubKey === false) throw new Exception('Bad signing certificate');
  $ok = openssl_verify("$h64.$p64", $sig, $pubKey, OPENSSL_ALGO_SHA256);
  if ($ok !== 1) throw new Exception('Signature verification failed');

  // Claim checks.
  $now     = time();
  $leeway  = 60; // tolerate small clock skew
  $project = FW_FIREBASE_PROJECT_ID;
  if (($payload['aud'] ?? '') !== $project) {
    throw new Exception('Wrong audience');
  }
  if (($payload['iss'] ?? '') !== "https://securetoken.google.com/$project") {
    throw new Exception('Wrong issuer');
  }
  if ((int) ($payload['exp'] ?? 0) < $now - $leeway) {
    throw new Exception('Token expired');
  }
  if ((int) ($payload['iat'] ?? 0) > $now + $leeway) {
    throw new Exception('Token issued in the future');
  }
  if (isset($payload['auth_time']) && (int) $payload['auth_time'] > $now + $leeway) {
    throw new Exception('Invalid auth_time');
  }
  $uid = $payload['sub'] ?? '';
  if (!is_string($uid) || $uid === '') {
    throw new Exception('Token has no subject (uid)');
  }

  return ['uid' => $uid, 'email' => $payload['email'] ?? ''];
}
