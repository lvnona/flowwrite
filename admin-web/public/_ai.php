<?php
/**
 * _ai.php — dependency-free calls to the AI providers, mirroring exactly what
 * the desktop app sends (same models, same shapes). Keys come from Firestore
 * config/apiKeys via the service account — never from the client.
 */

// Claude (Anthropic). Desktop uses claude-opus-4-5, max_tokens 1024, single
// user message (the prompt already contains all instructions).
function fw_ai_claude($apiKey, $prompt, $model = 'claude-opus-4-5', $maxTokens = 1024) {
  if (!$apiKey) throw new Exception('Claude API key not configured');
  $ch = curl_init('https://api.anthropic.com/v1/messages');
  curl_setopt($ch, CURLOPT_POST, true);
  curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
  curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'x-api-key: ' . $apiKey,
    'anthropic-version: 2023-06-01',
  ]);
  curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
    'model'      => $model,
    'max_tokens' => $maxTokens,
    'messages'   => [['role' => 'user', 'content' => $prompt]],
  ]));
  curl_setopt($ch, CURLOPT_TIMEOUT, 60);
  $res  = curl_exec($ch);
  $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  if ($res === false) throw new Exception('Claude request failed');
  $j = json_decode($res, true);
  if ($code !== 200) throw new Exception($j['error']['message'] ?? "Claude HTTP $code");
  return $j['content'][0]['text'] ?? '';
}

// OpenAI-compatible chat completion (OpenAI + DeepSeek share this shape).
function fw_ai_openai($apiKey, $model, $endpoint, $prompt, $maxTokens = 1024) {
  if (!$apiKey) throw new Exception('API key not configured');
  $ch = curl_init($endpoint);
  curl_setopt($ch, CURLOPT_POST, true);
  curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
  curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'Authorization: Bearer ' . $apiKey,
  ]);
  curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
    'model'      => $model,
    'max_tokens' => $maxTokens,
    'messages'   => [['role' => 'user', 'content' => $prompt]],
  ]));
  curl_setopt($ch, CURLOPT_TIMEOUT, 60);
  $res  = curl_exec($ch);
  $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  if ($res === false) throw new Exception('AI request failed');
  $j = json_decode($res, true);
  if ($code !== 200) throw new Exception($j['error']['message'] ?? "HTTP $code");
  return $j['choices'][0]['message']['content'] ?? '';
}

// Dispatch to the configured popup provider. $keys = config/apiKeys (decoded).
function fw_ai_generate($keys, $prompt) {
  $provider = $keys['popupProvider'] ?? 'claude';
  if ($provider === 'openai') {
    return fw_ai_openai($keys['openaiPopup'] ?? '', $keys['openaiPopupModel'] ?? 'gpt-4o',
      'https://api.openai.com/v1/chat/completions', $prompt);
  }
  if ($provider === 'deepseek') {
    return fw_ai_openai($keys['deepseek'] ?? '', $keys['deepseekModel'] ?? 'deepseek-v4-flash',
      'https://api.deepseek.com/v1/chat/completions', $prompt);
  }
  return fw_ai_claude($keys['anthropic'] ?? '', $prompt);
}

// Whisper transcription. $audioPath = local temp file, returns plain text.
function fw_ai_transcribe($openaiKey, $audioPath, $mime = 'application/octet-stream') {
  if (!$openaiKey) throw new Exception('OpenAI (Whisper) key not configured');
  $ch = curl_init('https://api.openai.com/v1/audio/transcriptions');
  curl_setopt($ch, CURLOPT_POST, true);
  curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
  curl_setopt($ch, CURLOPT_HTTPHEADER, ['Authorization: Bearer ' . $openaiKey]);
  curl_setopt($ch, CURLOPT_POSTFIELDS, [
    'file'            => new CURLFile($audioPath, $mime, 'audio'),
    'model'           => 'whisper-1',
    'response_format' => 'text',
  ]);
  curl_setopt($ch, CURLOPT_TIMEOUT, 120);
  $res  = curl_exec($ch);
  $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  if ($res === false) throw new Exception('Whisper request failed');
  if ($code !== 200) {
    $j = json_decode($res, true);
    throw new Exception($j['error']['message'] ?? "Whisper HTTP $code");
  }
  return trim($res);
}

// Light grammar/punctuation cleanup of a raw transcript (matches the desktop's
// polishDictation: fix punctuation, remove filler words). Degrades gracefully —
// returns the original text on any error so dictation never breaks.
function fw_ai_polish($openaiKey, $text) {
  $text = (string)$text;
  if (!$openaiKey || trim($text) === '') return $text;
  $system = 'You clean up raw voice transcripts. Fix punctuation, capitalization '
    . 'and obvious grammar, and remove filler words (um, uh, like). Keep the '
    . 'meaning and wording faithful — do NOT rephrase, summarize, add, or answer '
    . 'anything. Output ONLY the cleaned text.';
  $ch = curl_init('https://api.openai.com/v1/chat/completions');
  curl_setopt($ch, CURLOPT_POST, true);
  curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
  curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json', 'Authorization: Bearer ' . $openaiKey]);
  curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
    'model'      => 'gpt-4o-mini',
    'max_tokens' => 1024,
    'messages'   => [
      ['role' => 'system', 'content' => $system],
      ['role' => 'user',   'content' => $text],
    ],
  ]));
  curl_setopt($ch, CURLOPT_TIMEOUT, 30);
  $res  = curl_exec($ch);
  $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  if ($res === false || $code !== 200) return $text;
  $j   = json_decode($res, true);
  $out = trim($j['choices'][0]['message']['content'] ?? '');
  return $out !== '' ? $out : $text;
}

// Word count — matches the desktop's text.split(/\s+/).filter(Boolean).length.
// PREG_SPLIT_NO_EMPTY drops empty tokens (so leading/trailing/multiple spaces
// don't inflate the count) while still counting a literal "0".
function fw_word_count($text) {
  $parts = preg_split('/\s+/', trim((string)$text), -1, PREG_SPLIT_NO_EMPTY);
  return $parts ? count($parts) : 0;
}
