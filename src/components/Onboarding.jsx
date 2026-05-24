// First-run onboarding — shown once after a fresh install (gated by the
// `onboarded` flag in settings). Three short steps:
//   1. Welcome
//   2. Quick setup + permissions (mic, accessibility, start-at-login)
//   3. How to use (3 visual cards)
// "Skip" is always available; finishing or skipping sets onboarded = true.

import React, { useCallback, useEffect, useState } from 'react';

const isMac = navigator.platform.includes('Mac');

function hotkeyHuman(hk) {
  return (hk || 'CommandOrControl+Shift+W')
    .replace('CommandOrControl', isMac ? '⌘' : 'Ctrl')
    .replace('Command', '⌘').replace('Control', 'Ctrl')
    .replace('Shift', '⇧').replace('Alt', isMac ? '⌥' : 'Alt')
    .split('+').filter(Boolean);
}

export default function Onboarding({ onDone }) {
  const [step, setStep] = useState(0);
  const [settings, setSettings] = useState(null);
  const [perms, setPerms] = useState(null);
  const [micOk, setMicOk] = useState(null);   // non-mac mic test result
  const [finishing, setFinishing] = useState(false);

  const TOTAL = 3;

  // Load settings + ensure "start at login" defaults ON for new installs.
  useEffect(() => {
    window.flowwrite?.getSettings?.().then((s) => {
      setSettings(s || {});
      if (s && s.launchAtLogin === undefined) {
        window.flowwrite?.saveSettings?.({ launchAtLogin: true });
        setSettings((p) => ({ ...p, launchAtLogin: true }));
      }
    });
  }, []);

  const refreshPerms = useCallback(() => {
    window.flowwrite?.getPermissions?.().then((p) => { if (p) setPerms(p); }).catch(() => {});
  }, []);

  // Keep permission status fresh while on the setup step.
  useEffect(() => {
    refreshPerms();
    if (step !== 1) return undefined;
    const id = setInterval(refreshPerms, 2000);
    const onFocus = () => refreshPerms();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [step, refreshPerms]);

  async function finish() {
    setFinishing(true);
    try { await window.flowwrite?.saveSettings?.({ onboarded: true }); } catch { /* ignore */ }
    onDone?.();
  }

  function next() { if (step < TOTAL - 1) setStep((s) => s + 1); else finish(); }
  function back() { if (step > 0) setStep((s) => s - 1); }

  async function allowMic() {
    if (isMac) {
      try { await window.flowwrite?.requestMicrophone?.(); } catch { /* ignore */ }
      refreshPerms();
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
        setMicOk(true);
      } catch { setMicOk(false); }
    }
  }

  function setLaunch(on) {
    setSettings((s) => ({ ...s, launchAtLogin: on }));
    window.flowwrite?.saveSettings?.({ launchAtLogin: on });
  }

  const keys = hotkeyHuman(settings?.hotkey);
  const micGranted = isMac ? perms?.microphone === 'granted' : micOk === true;
  const accessibilityGranted = perms?.accessibility === true;

  return (
    <div className="page-bg min-h-screen flex flex-col text-white">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-accent/20 flex items-center justify-center text-sm font-bold text-accentSoft">FW</span>
          <span className="font-semibold text-sm">FlowWrite</span>
        </div>
        <button type="button" onClick={finish} disabled={finishing}
          className="text-xs text-white/45 hover:text-white/80 transition px-3 py-1.5 rounded-lg hover:bg-white/5">
          Skip setup →
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-lg">
          {step === 0 && <Welcome />}
          {step === 1 && (
            <Setup
              launchAtLogin={settings?.launchAtLogin !== false}
              onLaunch={setLaunch}
              micGranted={micGranted}
              accessibilityGranted={accessibilityGranted}
              perms={perms}
              onAllowMic={allowMic}
              onOpenAccessibility={() => window.flowwrite?.openPermissionSettings?.('accessibility')}
            />
          )}
          {step === 2 && <HowTo keys={keys} />}
        </div>
      </div>

      {/* Footer: progress + nav */}
      <div className="px-6 py-5">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <button type="button" onClick={back}
            className={'text-sm px-4 py-2 rounded-xl transition ' +
              (step === 0 ? 'opacity-0 pointer-events-none' : 'text-white/60 hover:text-white hover:bg-white/5')}>
            Back
          </button>

          <div className="flex items-center gap-2">
            {Array.from({ length: TOTAL }).map((_, i) => (
              <span key={i}
                className={'h-1.5 rounded-full transition-all ' +
                  (i === step ? 'w-6 bg-accent' : 'w-1.5 bg-white/20')} />
            ))}
          </div>

          <button type="button" onClick={next} disabled={finishing}
            className="gradient-btn text-sm px-6 py-2.5 disabled:opacity-50">
            {step === TOTAL - 1 ? (finishing ? 'Finishing…' : "Let's go ✨") : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Step 1: Welcome ───────────────────────────────────────────────────────────
function Welcome() {
  return (
    <div className="text-center">
      <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-accentSoft to-accent flex items-center justify-center text-2xl font-bold shadow-2xl shadow-accent/30">
        FW
      </div>
      <h1 className="text-3xl font-bold mb-3">Welcome to FlowWrite</h1>
      <p className="text-white/60 leading-relaxed max-w-md mx-auto">
        Your AI writing assistant that works in <span className="text-white">any</span> app.
        Press one shortcut, describe what you want, and FlowWrite writes it right
        into the field you're in — emails, posts, messages, anything.
      </p>
      <p className="text-white/35 text-sm mt-5">Takes about 30 seconds to set up.</p>
    </div>
  );
}

// ── Step 2: Setup + permissions ─────────────────────────────────────────────
function Setup({ launchAtLogin, onLaunch, micGranted, accessibilityGranted, perms, onAllowMic, onOpenAccessibility }) {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-1.5 text-center">Quick setup</h2>
      <p className="text-white/50 text-sm text-center mb-7">
        Recommended settings are already chosen — just confirm and grant access.
      </p>

      <div className="flex flex-col gap-3">
        {/* Start at login */}
        <button type="button" onClick={() => onLaunch(!launchAtLogin)}
          className="text-left rounded-2xl p-4 border bg-white/[0.04] border-white/10 hover:border-white/20 transition flex items-start gap-3">
          <Toggle on={launchAtLogin} />
          <div className="flex-1">
            <div className="text-sm font-medium">Start automatically</div>
            <div className="text-[12px] text-white/45 mt-0.5">
              Launch FlowWrite in the background when you log in, so it's always ready. <span className="text-white/30">Recommended</span>
            </div>
          </div>
        </button>

        {/* Microphone */}
        <div className="rounded-2xl p-4 border bg-white/[0.04] border-white/10 flex items-start gap-3">
          <Dot ok={micGranted} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">Microphone</div>
            <div className="text-[12px] text-white/45 mt-0.5">
              For voice dictation — speak and FlowWrite types it out.
            </div>
          </div>
          {micGranted
            ? <span className="text-xs text-green-300 shrink-0 mt-0.5">Granted ✓</span>
            : <button type="button" onClick={onAllowMic} className="pill text-[12px] shrink-0">Allow</button>}
        </div>

        {/* Accessibility (mac only) */}
        {isMac && (
          <div className="rounded-2xl p-4 border bg-white/[0.04] border-white/10 flex items-start gap-3">
            <Dot ok={accessibilityGranted} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">Accessibility</div>
              <div className="text-[12px] text-white/45 mt-0.5">
                Lets FlowWrite paste text into other apps for you. Without it you'd press ⌘V yourself.
              </div>
            </div>
            {accessibilityGranted
              ? <span className="text-xs text-green-300 shrink-0 mt-0.5">Granted ✓</span>
              : <button type="button" onClick={onOpenAccessibility} className="pill text-[12px] shrink-0">Open Settings</button>}
          </div>
        )}
      </div>

      <p className="text-[11px] text-white/30 mt-5 text-center leading-relaxed">
        You can change all of this later in Settings. Permissions you skip will be
        requested the first time they're needed.
      </p>
    </div>
  );
}

// ── Step 3: How to use ───────────────────────────────────────────────────────
function HowTo({ keys }) {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-1.5 text-center">How to use it</h2>
      <p className="text-white/50 text-sm text-center mb-7">Three steps. That's the whole thing.</p>

      <div className="flex flex-col gap-3">
        <StepCard n="1" title="Press your shortcut" >
          <div className="flex items-center gap-1.5 mt-2">
            {keys.map((k, i) => (
              <kbd key={i} className="kbd text-base px-2.5 py-1">{k}</kbd>
            ))}
            <span className="text-white/40 text-xs ml-2">in any text field — email, browser, chat…</span>
          </div>
        </StepCard>

        <StepCard n="2" title="Say what you want">
          <div className="mt-2 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-[13px] text-white/70">
            “reply saying I'll join the call at 3pm”
          </div>
          <p className="text-[12px] text-white/40 mt-1.5">Pick a tone if you like — or just hit Generate.</p>
        </StepCard>

        <StepCard n="3" title="Insert — done">
          <p className="text-[12px] text-white/50 mt-2">
            Hit <span className="text-accentSoft font-medium">✓ Insert</span> and the text drops straight
            into the field you were in. No copy-paste.
          </p>
        </StepCard>
      </div>

      <div className="mt-6 rounded-xl bg-accent/10 border border-accent/30 px-4 py-3 text-center">
        <p className="text-[13px] text-white/75">
          💡 Tip: hold <kbd className="kbd">{isMac ? 'Fn' : 'Right Ctrl'}</kbd> anywhere to dictate with your voice.
        </p>
      </div>
    </div>
  );
}

// ── Small UI bits ─────────────────────────────────────────────────────────────
function StepCard({ n, title, children }) {
  return (
    <div className="rounded-2xl p-4 border bg-white/[0.04] border-white/10 flex gap-3.5">
      <div className="w-8 h-8 shrink-0 rounded-full bg-accent/20 text-accentSoft font-bold flex items-center justify-center text-sm">
        {n}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">{title}</div>
        {children}
      </div>
    </div>
  );
}

function Toggle({ on }) {
  return (
    <span className={'mt-0.5 w-9 h-5 rounded-full shrink-0 relative transition ' + (on ? 'bg-accent' : 'bg-white/15')}>
      <span className={'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ' + (on ? 'left-[18px]' : 'left-0.5')} />
    </span>
  );
}

function Dot({ ok }) {
  return <span className={'mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ' + (ok ? 'bg-green-400' : 'bg-white/25')} />;
}
