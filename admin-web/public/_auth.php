<?php
/**
 * _auth.php — verify a Firebase ID token (RS256 JWT) without any SDK.
 *
 * Mobile / web clients send the ID token from the Firebase client SDK. We
 * verify Google's signature with the rotating secure-token public certs and
 * check the standard claims, then return the user's uid. This is what lets the
 * server TRUST "this request is user X" so it can enforce that user's limits.
 */

define('FW_PROJECT_ID', 'flowwrite-3ccd2');

function fw_b64url_decode($s) {
  $s = strtr($s, '-_', '+/');
  $pad = strlen($s) % 4;
  if ($pad) $s .= str_repeat('=', 4 - $pad);
  return base64_decode($s);
}

// Fetch + cache Google's secure-token x509 certs (they rotate; honour max-age).
function fw_securetoken_keys() {
  $cacheFile = sys_get_temp_dir() . '/fw_securetoken_keys.json';
  if (is_file($cacheFile)) {
    $cached = json_decode(@file_get_contents($cacheFile), true);
    if ($cached && ($cached['exp'] ?? 0) > time() && !empty($cached['keys'])) {
      return $cached['keys'];
    }
  }
  $url = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
  $ch = curl_init($url);
  curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
  curl_setopt($ch, CURLOPT_HEADER, true);
  curl_setopt($ch, CURLOPT_TIMEOUT, 15);
  $resp  = curl_exec($ch);
  $hsize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
  curl_close($ch);
  if ($resp === false) {
    // Network failure — fall back to any stale cache rather than locking users out.
    if (isset($cached['keys'])) return $cached['keys'];
    throw new Exception('Could not fetch Google public keys');
  }
  $rawHeaders = substr($resp, 0, $hsize);
  $keys = json_decode(substr($resp, $hsize), true) ?: [];
  $ttl = 3600;
  if (preg_match('/max-age=(\d+)/i', $rawHeaders, $m)) $ttl = max(300, (int)$m[1]);
  @file_put_contents($cacheFile, json_encode(['exp' => time() + $ttl, 'keys' => $keys]));
  return $keys;
}

// Returns the verified uid (sub), or throws Exception.
function fw_verify_id_token($idToken) {
  $parts = explode('.', (string)$idToken);
  if (count($parts) !== 3) throw new Exception('Malformed token');
  list($h64, $p64, $s64) = $parts;
  $header  = json_decode(fw_b64url_decode($h64), true);
  $payload = json_decode(fw_b64url_decode($p64), true);
  if (!$header || !$payload) throw new Exception('Bad token encoding');
  if (($header['alg'] ?? '') !== 'RS256') throw new Exception('Unexpected token algorithm');

  $kid  = $header['kid'] ?? '';
  $keys = fw_securetoken_keys();
  if (empty($keys[$kid])) throw new Exception('Unknown signing key');

  $pub = openssl_pkey_get_public($keys[$kid]);
  if (!$pub) throw new Exception('Invalid public certificate');
  $ok = openssl_verify("$h64.$p64", fw_b64url_decode($s64), $pub, OPENSSL_ALGO_SHA256);
  if ($ok !== 1) throw new Exception('Signature verification failed');

  $now = time();
  $pid = FW_PROJECT_ID;
  if (($payload['aud'] ?? '') !== $pid) throw new Exception('Wrong audience');
  if (($payload['iss'] ?? '') !== "https://securetoken.google.com/$pid") throw new Exception('Wrong issuer');
  if ((int)($payload['exp'] ?? 0) < $now - 30)         throw new Exception('Token expired');
  if ((int)($payload['iat'] ?? 0) > $now + 300)        throw new Exception('Token not yet valid');
  if (empty($payload['sub']))                          throw new Exception('Token has no subject');
  return (string)$payload['sub'];
}

// Read the Bearer token from the Authorization header (or a JSON body field as
// a fallback) and return the verified uid.
function fw_authed_uid($bodyToken = '') {
  $hdr = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
  if (!$hdr && function_exists('apache_request_headers')) {
    $h = apache_request_headers();
    $hdr = $h['Authorization'] ?? $h['authorization'] ?? '';
  }
  $token = (stripos($hdr, 'Bearer ') === 0) ? trim(substr($hdr, 7)) : '';
  if (!$token) $token = (string)$bodyToken;
  if (!$token) throw new Exception('Missing auth token');
  return fw_verify_id_token($token);
}
