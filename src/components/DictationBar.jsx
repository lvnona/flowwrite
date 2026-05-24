// The floating push-to-talk dictation bar (route ?route=dictation).
//
// Driven entirely by the main process via Fn key events:
//   onDictationStart  → request mic, record, animate the equalizer
//   onDictationStop   → stop, transcribe (Whisper + grammar cleanup), then
//                       insert the text at the cursor (or cancel on a quick tap)
//
// The window is non-focusable + shown inactive, so we never steal focus — the
// transcribed text pastes back into whatever field you were typing in.

import React, { useEffect, useRef, useState } from 'react';
import { getMicStream } from '../utils/mic.js';

const NUM_BARS = 5;

function pickMime() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  if (typeof MediaRecorder === 'undefined') return '';
  return candidates.find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
}

function micError(err) {
  const name = err?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Mic blocked';
  if (name === 'NotFoundError') return 'No mic found';
  return 'Mic error';
}

export default function DictationBar() {
  const [state, setState] = useState('idle'); // idle | listening | transcribing | error
  const [levels, setLevels] = useState(() => new Array(NUM_BARS).fill(0.2));
  const [errorMsg, setErrorMsg] = useState('');

  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const mimeRef = useRef('audio/webm');

  function teardownAudio() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    try { analyserRef.current?.disconnect(); } catch { /* noop */ }
    analyserRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
    }
    audioCtxRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function startRecording() {
    setErrorMsg('');
    chunksRef.current = [];
    setState('listening'); // show the pill instantly (idle wobble until audio is live)
    try {
      const stream = await getMicStream();
      streamRef.current = stream;

      const mimeType = pickMime();
      mimeRef.current = mimeType || 'audio/webm';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.start();
      recorderRef.current = recorder;

      // Real-time level analysis to drive the equalizer.
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      try { await ctx.resume(); } catch { /* may stay suspended; idle wobble covers it */ }
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.75;
      source.connect(analyser);
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);
      const binsPer = Math.max(1, Math.floor(data.length / NUM_BARS));
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const t = performance.now();
        const next = [];
        for (let i = 0; i < NUM_BARS; i++) {
          let sum = 0;
          for (let j = 0; j < binsPer; j++) sum += data[i * binsPer + j] || 0;
          const real = sum / binsPer / 255; // 0..1
          // Gentle idle wobble so the bar always looks alive, even on silence.
          const idle = 0.18 + 0.12 * Math.abs(Math.sin(t / 280 + i * 0.9));
          next.push(Math.max(idle, Math.min(1, real * 1.7)));
        }
        setLevels(next);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      teardownAudio();
      setErrorMsg(micError(err));
      setState('error');
      setTimeout(() => { window.flowwrite?.dictationCancel?.(); setState('idle'); }, 1600);
    }
  }

  async function stopRecording(discard) {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (!recorder) {
      teardownAudio();
      window.flowwrite?.dictationCancel?.();
      setState('idle');
      return;
    }

    const mimeType = mimeRef.current;
    const blob = await new Promise((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: mimeType }));
      try { recorder.stop(); } catch { resolve(new Blob(chunksRef.current, { type: mimeType })); }
    });
    teardownAudio();

    // Discard quick taps / near-silent clips without calling the API.
    if (discard || !blob || blob.size < 1200) {
      window.flowwrite?.dictationCancel?.();
      setState('idle');
      return;
    }

    setState('transcribing');
    try {
      const arr = await blob.arrayBuffer();
      const res = await window.flowwrite?.transcribeAudio?.({
        audio: new Uint8Array(arr),
        mimeType: blob.type || mimeType,
      });
      const text = res?.ok ? (res.text || '').trim() : '';
      if (!text) {
        // Free weekly dictation limit — show a brief upgrade hint, then dismiss.
        if (res && !res.ok && res.limitReached) {
          setErrorMsg('Free limit reached — go Pro');
          setState('error');
          setTimeout(() => { window.flowwrite?.dictationCancel?.(); setState('idle'); }, 2200);
          return;
        }
        if (res && !res.ok) setErrorMsg(res.error || 'No speech detected');
        await window.flowwrite?.dictationCancel?.();
        setState('idle');
        return;
      }
      // (Cloud word-count is recorded by the main process — see transcribe-audio
      // → 'usage:audio-words' — so the dictation window doesn't track it here.)
      const ins = await window.flowwrite?.dictationInsert?.(text);
      if (ins?.tier === 'clipboard-only') {
        // Couldn't type into the app (Accessibility not granted) — the text is
        // on the clipboard; prompt the user to paste, then dismiss.
        setState('pasteHint');
        setTimeout(() => { window.flowwrite?.dictationCancel?.(); setState('idle'); }, 2800);
      } else {
        setState('idle'); // typed in; main already hid the bar
      }
    } catch (err) {
      setErrorMsg(err?.message || 'Transcription failed');
      await window.flowwrite?.dictationCancel?.();
      setState('idle');
    }
  }

  useEffect(() => {
    const offStart = window.flowwrite?.onDictationStart?.(() => startRecording());
    const offStop = window.flowwrite?.onDictationStop?.(({ discard } = {}) => stopRecording(discard));
    return () => {
      offStart?.();
      offStop?.();
      teardownAudio();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (state === 'idle') return null;

  return (
    <div className="w-full h-full flex items-center justify-center select-none">
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-full bg-[#16121f]/95 border border-white/10 shadow-xl">
        <MicGlyph active={state === 'listening'} />
        {state === 'listening' && (
          <>
            <div className="flex items-end gap-[3px] h-6">
              {levels.map((l, i) => (
                <span
                  key={i}
                  className="w-[3px] rounded-full bg-accentSoft"
                  style={{ height: `${Math.round(l * 100)}%`, transition: 'height 70ms linear' }}
                />
              ))}
            </div>
            <span className="text-[11px] text-white/55 whitespace-nowrap">Listening…</span>
          </>
        )}
        {state === 'transcribing' && (
          <div className="flex items-center gap-1.5">
            <span className="dot-pulse" />
            <span className="dot-pulse" />
            <span className="dot-pulse" />
            <span className="text-[11px] text-white/55 ml-1 whitespace-nowrap">Transcribing…</span>
          </div>
        )}
        {state === 'pasteHint' && (
          <span className="text-[11px] text-white/75 whitespace-nowrap">✓ Copied — press ⌘V</span>
        )}
        {state === 'error' && (
          <span className="text-[11px] text-red-300 whitespace-nowrap">{errorMsg || 'Mic error'}</span>
        )}
      </div>
    </div>
  );
}

function MicGlyph({ active }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke={active ? '#a89dfc' : 'rgba(255,255,255,0.6)'}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}
