// What the user wants to say. Treated by the prompt builder as their draft
// to rewrite (not as supplementary context).
//
// Includes a microphone button for voice dictation: click to record, click
// again to stop. The audio is transcribed (OpenAI Whisper) + grammar-cleaned
// in the main process and the resulting text is appended to the textarea.
import React from 'react';
import { useDictation } from '../hooks/useDictation.js';

export default function ContextInput({ value, onChange, enabled = true, onDictated }) {
  const { recording, transcribing, error, start, stop } = useDictation();

  async function handleMic() {
    if (transcribing) return;
    if (recording) {
      const text = await stop();
      if (text) {
        const base = (value || '').trim();
        const full = base ? `${base} ${text}` : text;
        onChange(full);
        // In Translate mode the parent auto-runs the translation on this text.
        onDictated?.(full);
      }
    } else {
      await start();
    }
  }

  const placeholder = recording
    ? 'Listening… click the mic to stop.'
    : transcribing
      ? 'Transcribing…'
      : "What you want to say — I'll rewrite it in your tone & style.";

  return (
    <div className="flex flex-col gap-1">
      <div className="relative">
        <textarea
          className={`context-textarea ${enabled ? 'pr-10' : ''}`}
          rows={3}
          maxLength={1200}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={transcribing}
        />
        {enabled && (
          <button
            type="button"
            onClick={handleMic}
            disabled={transcribing}
            title={recording ? 'Stop & transcribe' : 'Dictate with your microphone'}
            aria-label={recording ? 'Stop recording' : 'Start dictation'}
            className={[
              'absolute bottom-2 right-2 w-7 h-7 rounded-full flex items-center justify-center',
              'text-[13px] leading-none transition-colors no-drag',
              transcribing
                ? 'bg-white/10 text-white/50 cursor-wait'
                : recording
                  ? 'bg-red-500/90 text-white animate-pulse'
                  : 'bg-white/10 text-white/70 hover:bg-accent/80 hover:text-white',
            ].join(' ')}
          >
            {transcribing ? (
              <span className="dot-pulse" />
            ) : recording ? (
              <span className="block w-2.5 h-2.5 rounded-[2px] bg-white" />
            ) : (
              <MicIcon />
            )}
          </button>
        )}
      </div>
      {enabled && error && (
        <p className="text-[11px] text-red-300 leading-snug">{error}</p>
      )}
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}
