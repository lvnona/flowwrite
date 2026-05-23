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
  return [$j['access_token'], $sa['project_id']];
}

function fw_doc_url($project, $uid) {
  return "https://firestore.googleapis.com/v1/projects/$project/databases/(default)/documents/users/" . rawurlencode($uid);
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
