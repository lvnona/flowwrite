<?php
// Minimal Firestore REST helper — no Composer, no SDK.
//
// Mints a Google OAuth2 access token from the service account (JWT RS256) and
// reads/patches a user document. Using a service-account token means these
// writes BYPASS Firestore security rules (like the Admin SDK), so the webhook
// can set `plan` even though clients can't.

function fw_b64url($data) {
  return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function fw_http($method, $url, $body = null, $headers = []) {
  $ch = curl_init($url);
  curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
  curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
  curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
  if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
  $res = curl_exec($ch);
  $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  return [$code, $res];
}

// Returns [accessToken, projectId].
function fw_google_token($saPath) {
  // Per-request token cache. A single mobile-proxy request reads config/apiKeys,
  // the user doc, and commits a usage increment — each of which would otherwise
  // mint a fresh service-account token. The token is valid for an hour, so
  // caching it for the life of the PHP request collapses three token exchanges
  // into one. (Shared with the Stripe endpoints — only ever a speedup.)
  static $cache = [];
  if (isset($cache[$saPath]) && $cache[$saPath]['exp'] > time() + 60) {
    return [$cache[$saPath]['token'], $cache[$saPath]['project']];
  }
  $sa = json_decode(file_get_contents($saPath), true);
  if (!$sa || empty($sa['private_key'])) {
    throw new Exception('Bad service account file');
  }
  $now = time();
  $header = ['alg' => 'RS256', 'typ' => 'JWT'];
  $claim = [
    'iss'   => $sa['client_email'],
    'scope' => 'https://www.googleapis.com/auth/datastore',
    'aud'   => 'https://oauth2.googleapis.com/token',
    'iat'   => $now,
    'exp'   => $now + 3600,
  ];
  $segments = fw_b64url(json_encode($header)) . '.' . fw_b64url(json_encode($claim));
  openssl_sign($segments, $sig, $sa['private_key'], 'sha256WithRSAEncryption');
  $jwt = $segments . '.' . fw_b64url($sig);

  list($code, $res) = fw_http(
    'POST',
    'https://oauth2.googleapis.com/token',
    http_build_query([
      'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      'assertion'  => $jwt,
    ]),
    ['Content-Type: application/x-www-form-urlencoded']
  );
  $j = json_decode($res, true);
  if (empty($j['access_token'])) throw new Exception('Token exchange failed: ' . $res);
  $cache[$saPath] = [
    'token'   => $j['access_token'],
    'project' => $sa['project_id'],
    'exp'     => $now + 3600,
  ];
  return [$j['access_token'], $sa['project_id']];
}

function fw_doc_url($project, $uid) {
  return "https://firestore.googleapis.com/v1/projects/$project/databases/(default)/documents/users/" . rawurlencode($uid);
}

// Generic document URL: fw_collection_doc_url($p, 'config', 'billing').
function fw_collection_doc_url($project, $collection, $docId) {
  return "https://firestore.googleapis.com/v1/projects/$project/databases/(default)/documents/"
    . rawurlencode($collection) . '/' . rawurlencode($docId);
}

// Decode Firestore typed values (one field) → plain PHP scalar.
function fw_untype($v) {
  if (!is_array($v)) return $v;
  if (array_key_exists('stringValue', $v))   return $v['stringValue'];
  if (array_key_exists('integerValue', $v))  return (int)$v['integerValue'];
  if (array_key_exists('doubleValue', $v))   return (float)$v['doubleValue'];
  if (array_key_exists('booleanValue', $v))  return (bool)$v['booleanValue'];
  if (array_key_exists('nullValue', $v))     return null;
  return null;
}

// Read an arbitrary config doc (e.g. config/billing) → assoc of plain values,
// or [] if missing. Uses the service account, so it bypasses security rules.
function fw_get_config_doc($cfg, $docId) {
  list($token, $project) = fw_google_token($cfg['service_account_path']);
  list($code, $res) = fw_http('GET', fw_collection_doc_url($project, 'config', $docId), null, [
    "Authorization: Bearer $token",
  ]);
  if ($code !== 200) return [];
  $j = json_decode($res, true);
  $out = [];
  foreach (($j['fields'] ?? []) as $k => $v) $out[$k] = fw_untype($v);
  return $out;
}

// Load the effective config: start from the local bootstrap file
// (_stripe-config.php — only needs `service_account_path`), then overlay any
// values stored in Firestore (config/billing), which win when non-empty. This
// lets every setting be managed from the admin panel while file replacements
// never clobber them.
function fw_load_config() {
  $local = require __DIR__ . '/_stripe-config.php';
  if (empty($local['service_account_path'])) return $local; // can't reach Firestore
  $cfg = $local;
  try {
    $remote = fw_get_config_doc($local, 'billing');
    foreach ($remote as $k => $v) {
      if ($v !== '' && $v !== null) $cfg[$k] = $v;
    }
  } catch (Exception $e) {
    /* network/SA error → fall back to local values only */
  }
  return $cfg;
}

// Read a user doc → assoc of typed values, or null.
function fw_get_user($cfg, $uid) {
  list($token, $project) = fw_google_token($cfg['service_account_path']);
  list($code, $res) = fw_http('GET', fw_doc_url($project, $uid), null, [
    "Authorization: Bearer $token",
  ]);
  if ($code !== 200) return null;
  $j = json_decode($res, true);
  return $j['fields'] ?? null;
}

// Convert a PHP value to a Firestore typed value.
function fw_typed($v) {
  if (is_int($v))  return ['integerValue' => (string)$v];
  if (is_bool($v)) return ['booleanValue' => $v];
  if ($v === null) return ['nullValue' => null];
  return ['stringValue' => (string)$v];
}

// Patch specific fields on users/{uid}. $fields is an assoc (name => value).
function fw_patch_user($cfg, $uid, $fields) {
  list($token, $project) = fw_google_token($cfg['service_account_path']);
  $mask = '';
  $body = ['fields' => []];
  foreach ($fields as $k => $v) {
    $body['fields'][$k] = fw_typed($v);
    $mask .= (strlen($mask) ? '&' : '') . 'updateMask.fieldPaths=' . rawurlencode($k);
  }
  $url = fw_doc_url($project, $uid) . '?' . $mask;
  list($code, $res) = fw_http('PATCH', $url, json_encode($body), [
    "Authorization: Bearer $token",
    'Content-Type: application/json',
  ]);
  return [$code, $res];
}

// Escape a Firestore field path so map keys that aren't simple identifiers are
// treated as a single key, not a nested path. A key like "2026-W21" starts with
// a digit and contains a hyphen, so "usageWeekly.2026-W21" must become
// "usageWeekly.`2026-W21`" or Firestore reads it as usageWeekly → 2026 → ...
function fw_escape_field_path($path) {
  $out = [];
  foreach (explode('.', $path) as $seg) {
    if (preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $seg)) {
      $out[] = $seg;
    } else {
      $out[] = '`' . str_replace(['\\', '`'], ['\\\\', '\\`'], $seg) . '`';
    }
  }
  return implode('.', $out);
}

// Atomically increment integer fields on users/{uid} using the Firestore commit
// endpoint (server-side FieldValue.increment — no read-modify-write race).
// $incs is an assoc of fieldPath => integer delta, e.g.
//   [ 'usageWeekly.2026-W21' => 1, 'allTimeUsage' => 1 ]
// Map-key segments are auto-escaped. The doc must already exist (callers
// lazy-create it on first sign-in). Returns [httpCode, rawBody].
function fw_increment_user($cfg, $uid, $incs) {
  list($token, $project) = fw_google_token($cfg['service_account_path']);
  $docName = "projects/$project/databases/(default)/documents/users/$uid";
  $transforms = [];
  foreach ($incs as $path => $delta) {
    $transforms[] = [
      'fieldPath' => fw_escape_field_path($path),
      'increment' => ['integerValue' => (string)(int)$delta],
    ];
  }
  $body = json_encode([
    'writes' => [[
      'transform' => [
        'document'        => $docName,
        'fieldTransforms' => $transforms,
      ],
    ]],
  ]);
  $url = "https://firestore.googleapis.com/v1/projects/$project/databases/(default)/documents:commit";
  list($code, $res) = fw_http('POST', $url, $body, [
    "Authorization: Bearer $token",
    'Content-Type: application/json',
  ]);
  if ($code !== 200) throw new Exception("Increment failed ($code): $res");
  return [$code, $res];
}
