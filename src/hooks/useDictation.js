// Voice dictation hook.
//
// Records microphone audio in the renderer via the browser MediaRecorder API,
// then ships the raw bytes to the Electron main process (window.flowwrite
// .transcribeAudio) which transcribes with OpenAI Whisper and cleans up the
// grammar. The transcribed text is returned from stop().
//
// Lifecycle
//   start()         → request mic, begin recording (sets recording=true)
//   stop()          → stop recording, transcribe, resolve with the text string
//   cancel()        → stop recording and discard (no transcription)
//
// State
//   recording       → boolean (mic is live)
//   transcribing    → boolean (audio sent, awaiting text)
//   error           → string | null
//
// The hook stops all mic tracks on unmount, so closing the popup or switching
// to the result view releases the microphone (and clears the macOS mic
// indicator) automatically.

import { useCallback, useEffect, useRef, useState } from 'react';
import { getMicStream } from '../utils/mic.js';
import { incrementAudioWords } from '../utils/usageTracking.js';

function pickMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  if (typeof MediaRecorder === 'undefined') return '';
  return candidates.find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
}

function micErrorMessage(err) {
  const name = err?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Microphone access denied. Allow FlowWrite to use the microphone in System Settings → Privacy & Security → Microphone.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No microphone found. Plug one in and try again.';
  }
  return err?.message || 'Could not start the microphone.';
}

export function useDictation() {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState(null);

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  // Stop the mic if the component using this hook unmounts mid-recording.
  useEffect(() => releaseStream, [releaseStream]);

  const start = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microphone recording is not available here.');
      return;
    }
    try {
      const stream = await getMicStream();
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch (err) {
      releaseStream();
      setError(micErrorMessage(err));
    }
  }, [releaseStream]);

  // Stop recording, transcribe, and resolve with the transcribed text (or null).
  const stop = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) return null;
    setRecording(false);
    setTranscribing(true);

    const mimeType = recorder.mimeType || 'audio/webm';
    const blob = await new Promise((resolve) => {
      recorder.onstop = () =>
        resolve(new Blob(chunksRef.current, { type: mimeType }));
      try {
        recorder.stop();
      } catch {
        resolve(new Blob(chunksRef.current, { type: mimeType }));
      }
    });
    releaseStream();

    try {
      if (!blob || blob.size === 0) {
        setError('No audio captured. Try holding the mic a little longer.');
        return null;
      }
      const arrayBuffer = await blob.arrayBuffer();
      const res = await window.flowwrite?.transcribeAudio?.({
        audio: new Uint8Array(arrayBuffer),
        mimeType: blob.type || mimeType,
      });
      if (!res?.ok) {
        setError(res?.error || 'Transcription failed.');
        return null;
      }
      const text = (res.text || '').trim();
      // Track words in Firestore — fully optional, never allowed to throw
      // into the surrounding catch (which would discard the transcribed text).
      try {
        if (text) {
          const words = text.split(/\s+/).filter(Boolean).length;
          incrementAudioWords?.(words)?.catch?.(() => {});
        }
      } catch { /* ignore */ }
      return text;
    } catch (err) {
      setError(err?.message || String(err));
      return null;
    } finally {
      setTranscribing(false);
    }
  }, [releaseStream]);

  const cancel = useCallback(() => {
    setRecording(false);
    setTranscribing(false);
    releaseStream();
  }, [releaseStream]);

  return { recording, transcribing, error, start, stop, cancel };
}
