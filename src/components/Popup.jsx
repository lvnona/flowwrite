// The floating popup UI — TWO-MODE LAYOUT (Wispr Flow style).
//
//   COMPOSE MODE                  RESULT MODE
//   ┌───────────────────┐         ┌───────────────────┐
//   │ Header            │         │ ← Header        ✕ │
//   │ Content Type      │         │                   │
//   │ Tone              │         │   Big editable    │
//   │ Length            │   →     │   result          │
//   │ Your message      │         │   textarea        │
//   │                   │         │                   │
//   │ [✨ Generate]     │         │ [Insert][Copy][↻] │
//   └───────────────────┘         └───────────────────┘
//
// Transitions
//   compose → result   on Generate click
//   result  → compose  on "← Back to edit" click
//   any     → compose  whenever a fresh popup:context arrives (new summon)
//
// VISIBILITY MODEL
//   The popup BrowserWindow is reused across summons (hide + show, never
//   destroyed). React state therefore persists between summons. When the
//   user closes the popup we set visible=false → exit animation → 200ms
//   later we hide() the window. On the next summon, main pushes a fresh
//   popup:context IPC event which is our cue to set visible=true again
//   AND to cancel any pending hide-timer. Without that re-set every
//   resummon after the first close would render a blank dark window.
//
// @refresh reset

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

// Pill-style pickers are kept around (still imported by Settings.jsx for their
// TONES / LENGTHS constants) but the popup itself now uses compact dropdowns.
import { CONTENT_TYPES } from './ContentTypePicker.jsx';
import { TONES } from './TonePicker.jsx';
import { LENGTHS } from './LengthPicker.jsx';
import ContextInput from './ContextInput.jsx';
import GenerateButton from './GenerateButton.jsx';
import { useClaudeAPI } from '../hooks/useClaudeAPI.js';
import { useHistory } from '../hooks/useHistory.js';
import { useTemplates } from '../hooks/useTemplates.js';
import { autoPickTemplate } from '../utils/templateKinds.js';
import { buildPrompt, LANGUAGES } from '../utils/promptBuilder.js';
import { detectStyleFor, findTemplate } from '../utils/templates.js';

// ─── helpers ────────────────────────────────────────────────────────────────

function inferContentType(fieldType) {
  const map = {
    email: 'Email',
    'professional-bio': 'Bio',
    'listing-description': 'Description',
    document: 'Description',
    'crm-note': 'Note',
    message: 'Message',
  };
  return map[fieldType] ?? 'Other';
}

const MOCK_CONTEXT = {
  isTextField: true,
  fieldLabel: '',
  fieldPlaceholder: '',
  activeApp: 'App',
  windowTitle: '',
  surroundingText: '',
  fieldType: 'general',
};

// ─── motion variants ────────────────────────────────────────────────────────

const cardVariants = {
  hidden:  { opacity: 0, x: 28, scale: 0.97 },
  visible: { opacity: 1, x: 0, scale: 1, transition: { type: 'spring', stiffness: 340, damping: 28 } },
  exit:    { opacity: 0, x: 28, scale: 0.97, transition: { duration: 0.18, ease: 'easeIn' } },
};

const composeViewVariants = {
  hidden:  { opacity: 0, x: -16 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.18, ease: 'easeOut' } },
  exit:    { opacity: 0, x: -16, transition: { duration: 0.14, ease: 'easeIn' } },
};
const resultViewVariants = {
  hidden:  { opacity: 0, x: 16 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.18, ease: 'easeOut' } },
  exit:    { opacity: 0, x: 16, transition: { duration: 0.14, ease: 'easeIn' } },
};

const stageVariants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.045, delayChildren: 0.04 } },
};
const itemVariants = {
  hidden:  { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.18 } },
};

// ─── Main component ─────────────────────────────────────────────────────────

export default function Popup() {
  const [fieldContext, setFieldContext] = useState(MOCK_CONTEXT);
  const [contentType, setContentType] = useState('Email');
  const [tone, setTone] = useState('Professional');
  const [length, setLength] = useState('Medium');
  const [translateTo, setTranslateTo] = useState('English');
  const [micEnabled, setMicEnabled] = useState(true);
  const [extra, setExtra] = useState('');
  const [generated, setGenerated] = useState('');
  const [visible, setVisible] = useState(true);
  const [pasteHint, setPasteHint] = useState(false);
  const [copied, setCopied] = useState(false);

  // 'compose' → form. 'result' → result + actions.
  const [mode, setMode] = useState('compose');
  // The currently-active built-in template (only set when explicit Dashboard
  // template was applied). Shown as a small badge.
  const [activeTemplate, setActiveTemplate] = useState(null);
  // The user-defined example template currently selected for few-shot
  // generation. Auto-picked from saved templates based on the active app,
  // overrideable via the in-popup picker.
  // The unified template selected for this generation (matches the current
  // Content type). null = none. Auto-picked by platform, overrideable in-popup.
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  const { templates, refresh: refreshTemplates } = useTemplates();

  const { generate, cancel, streaming, error, limitReached, clearLimit } = useClaudeAPI();
  const { addEntry } = useHistory();
  const generatedRef = useRef('');
  const hideTimerRef = useRef(null);

  // ── IPC: fresh context on each summon. Resets everything to a clean
  // compose view, cancels any pending hide timer, and ensures visible=true.
  useEffect(() => {
    if (!window.flowwrite?.onPopupContext) return;
    const off = window.flowwrite.onPopupContext((ctx) => { // eslint-disable-line react-hooks/exhaustive-deps
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      // Always reload templates so new ones created in Settings appear immediately.
      refreshTemplates();
      const safeCtx = ctx || MOCK_CONTEXT;
      setFieldContext(safeCtx);
      setGenerated('');
      generatedRef.current = '';
      setExtra('');
      setPasteHint(false);
      setCopied(false);
      setMode('compose');
      setVisible(true);
      setSelectedTemplate(null);

      // If main passed a template ID, apply it. Otherwise just infer the
      // content type from the field type as before.
      if (safeCtx.pendingTemplate) {
        const t = findTemplate(safeCtx.pendingTemplate);
        if (t) {
          setContentType(t.contentType);
          setTone(t.defaultTone);
          setLength(t.defaultLength);
          setActiveTemplate(t);
          return;
        }
      }
      setActiveTemplate(null);
      setContentType(inferContentType(safeCtx.fieldType));
    });
    return () => off?.();
  }, []);

  // Auto-pick a template that matches the current Content type + detected app
  // (e.g. on Gmail with Content=Email, grab the matching email template).
  // Re-runs when the content type changes so switching type re-selects sensibly.
  useEffect(() => {
    setSelectedTemplate(autoPickTemplate(templates, contentType, fieldContext?.activeApp));
  }, [templates, contentType, fieldContext?.activeApp]);

  // Hydrate default tone / length from stored settings once on mount.
  useEffect(() => {
    window.flowwrite?.getSettings?.().then((s) => {
      if (s?.defaultTone && TONES.includes(s.defaultTone)) setTone(s.defaultTone);
      if (s?.defaultLength && LENGTHS.includes(s.defaultLength)) setLength(s.defaultLength);
      setMicEnabled(s?.transcriberEnabled !== false);
    });
  }, []);

  // Esc closes the popup.
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // If a template is active, prefer its name in the subtitle. Otherwise show
  // the detected app + content type. If we auto-detected a viral-style for
  // the current app+contentType combo, surface the matching template name.
  const subtitle = useMemo(() => {
    if (activeTemplate) return `${activeTemplate.icon} ${activeTemplate.name}`;
    const autoStyle = detectStyleFor(fieldContext?.activeApp, contentType);
    if (autoStyle) {
      // Find template whose style matches — usually the platform-specific one.
      // (We don't import TEMPLATES directly here; lookup via findTemplate by
      // scanning the imported list is overkill — just show the app · type.)
    }
    return `${fieldContext?.activeApp || 'App'} · ${contentType}`;
  }, [activeTemplate, fieldContext?.activeApp, contentType]);

  // ── handlers ──────────────────────────────────────────────────────────────

  function handleClose() {
    if (streaming) cancel();
    setVisible(false);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      window.flowwrite?.hidePopup?.();
      hideTimerRef.current = null;
    }, 200);
  }

  async function handleGenerate(overrideInput) {
    // overrideInput is a string when called right after dictation (avoids
    // reading stale `extra` state); GenerateButton/Regenerate pass a click
    // event, so we fall back to `extra` for anything that isn't a string.
    const input = typeof overrideInput === 'string' ? overrideInput : extra;
    const isTranslate = contentType === 'Translate';
    // Only apply the selected template if it's for the current Content type.
    const tpl = selectedTemplate && selectedTemplate.purpose === contentType ? selectedTemplate : null;
    const emailTpl = tpl && tpl.purpose === 'Email' ? tpl : null;
    const exampleTpl = tpl && !emailTpl ? tpl : null; // few-shot example path
    // Priority: translate > template (email or example) > built-in style > generic.
    const style = (isTranslate || tpl)
      ? null
      : detectStyleFor(fieldContext?.activeApp, contentType);
    const prompt = buildPrompt(
      fieldContext,
      contentType,
      tone,
      length,
      input,
      style,
      isTranslate ? null : exampleTpl,
      translateTo,
      emailTpl,
    );
    setGenerated('');
    generatedRef.current = '';
    setPasteHint(false);
    setCopied(false);
    setMode('result'); // Switch immediately so the user sees streaming progress here.

    const full = await generate(prompt, (chunk) => {
      generatedRef.current += chunk;
      setGenerated((g) => g + chunk);
    });

    if (full) {
      // Append the email template's signature verbatim — the model was told not
      // to write its own sign-off, so this guarantees a consistent signature.
      let finalText = full;
      if (emailTpl && emailTpl.signature?.trim()) {
        finalText = `${full.trimEnd()}\n\n${emailTpl.signature.trim()}`;
      }
      // Defensive: ensure final text is rendered even if streaming chunks
      // landed after our listener was torn down (IPC race).
      setGenerated(finalText);
      generatedRef.current = finalText;
      addEntry({ app: fieldContext.activeApp, contentType, tone, length, text: finalText });
    }
  }

  // Called after the popup mic finishes a dictation. In Translate mode we
  // immediately run the translation on what was spoken (so you speak → see the
  // translation, no Generate click). In every other mode the transcript just
  // sits in the box for review (handled by ContextInput via onChange).
  function handleDictated(text) {
    if (contentType === 'Translate' && text && text.trim()) {
      handleGenerate(text);
    }
  }

  async function handleInsert() {
    const text = generated.trim();
    if (!text || streaming) return;
    // Collapse the card in React; the main process hides the popup window,
    // restores focus to the app you were in, then pastes into that field.
    setVisible(false);
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    await window.flowwrite?.insertText?.({ text, targetField: fieldContext });
  }

  async function handleCopy() {
    const text = generated.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Fallback via main process clipboard. Best-effort.
      try { await window.flowwrite?.autofillText?.({ text, targetField: null }); } catch {}
    }
  }

  function handleBackToEdit() {
    if (streaming) cancel();
    setMode('compose');
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="popup"
          className="popup-card relative w-[320px] h-full p-4 flex flex-col gap-3 overflow-hidden"
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <Header subtitle={subtitle} mode={mode} onClose={handleClose} onBack={handleBackToEdit} />
          <div className="h-px bg-white/[0.07] shrink-0" />

          {limitReached ? (
            <UpgradeNotice
              kind={limitReached}
              onUpgrade={() => { window.flowwrite?.openMain?.('dashboard'); handleClose(); }}
              onDismiss={() => { clearLimit(); setMode('compose'); }}
            />
          ) : (
          <AnimatePresence mode="wait">
            {mode === 'compose' ? (
              <ComposeView
                key="compose"
                {...{
                  contentType, setContentType,
                  tone, setTone,
                  length, setLength,
                  translateTo, setTranslateTo,
                  micEnabled,
                  extra, setExtra,
                  streaming,
                  onGenerate: handleGenerate,
                  onDictated: handleDictated,
                  error,
                  templatesForType: templates.filter((t) => t.purpose === contentType),
                  selectedTemplate,
                  onTemplateChange: setSelectedTemplate,
                }}
              />
            ) : (
              <ResultView
                key="result"
                {...{
                  text: generated,
                  streaming,
                  copied,
                  pasteHint,
                  error,
                  onChange: setGenerated,
                  onInsert: handleInsert,
                  onCopy: handleCopy,
                  onRegenerate: handleGenerate,
                  onBack: handleBackToEdit,
                  onCancel: cancel,
                }}
              />
            )}
          </AnimatePresence>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Upgrade notice (free-tier limit hit) ─────────────────────────────────────

function UpgradeNotice({ kind, onUpgrade, onDismiss }) {
  const label = kind === 'audio' ? 'voice dictation' : 'AI generations';
  return (
    <motion.div
      className="flex-1 flex flex-col items-center justify-center text-center gap-3 px-3"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="w-11 h-11 rounded-full bg-accent/20 flex items-center justify-center text-xl">⚡</div>
      <div>
        <p className="text-white font-semibold text-sm mb-1">You've hit your free weekly limit</p>
        <p className="text-white/50 text-xs leading-relaxed">
          You've used all your free {label} this week. It resets Monday — or go Pro for unlimited.
        </p>
      </div>
      <button
        onClick={onUpgrade}
        className="w-full px-4 py-2.5 bg-accent rounded-lg text-sm font-medium text-white hover:bg-accent/80 active:scale-95 transition-all"
      >
        Upgrade to Pro
      </button>
      <button onClick={onDismiss} className="text-white/40 hover:text-white/70 text-xs transition-colors">
        Maybe later
      </button>
    </motion.div>
  );
}

// ─── Header ─────────────────────────────────────────────────────────────────

function Header({ subtitle, mode, onClose, onBack }) {
  // The whole header is the drag handle for the frameless window.
  // Interactive children (back button, close button) opt out via no-drag.
  return (
    <div className="drag-region flex items-center justify-between shrink-0 -mx-1 -mt-1 px-1 pt-1 pb-1">
      <div className="flex items-center gap-1.5 min-w-0">
        {mode === 'result' && (
          <motion.button
            type="button"
            className="no-drag text-white/50 hover:text-white text-[12px] mr-1"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onBack}
            title="Back to edit"
          >
            ←
          </motion.button>
        )}
        <span className="text-[15px]">✨</span>
        <span className="font-semibold text-[13px] tracking-tight">FlowWrite</span>
      </div>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[11px] text-white/40 truncate max-w-[130px]">{subtitle}</span>
        <motion.button
          type="button"
          className="no-drag text-white/30 hover:text-white/80 text-sm leading-none transition-colors"
          whileHover={{ scale: 1.2 }}
          whileTap={{ scale: 0.9 }}
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </motion.button>
      </div>
    </div>
  );
}

// ─── Compose view ───────────────────────────────────────────────────────────

function ComposeView({
  contentType, setContentType,
  tone, setTone,
  length, setLength,
  translateTo, setTranslateTo,
  micEnabled,
  extra, setExtra,
  streaming,
  onGenerate,
  onDictated,
  error,
  templatesForType,
  selectedTemplate,
  onTemplateChange,
}) {
  const isTranslate = contentType === 'Translate';
  // Compact dropdown layout: one row per control, label on the left, select
  // on the right. Far less vertical space than the pill grids.
  return (
    <motion.div
      className="flex-1 flex flex-col gap-3 min-h-0"
      variants={composeViewVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <motion.div
        className="flex-1 overflow-y-auto pr-0.5 flex flex-col gap-2"
        variants={stageVariants}
        initial="hidden"
        animate="visible"
      >
        <DropRow
          label="Content"
          value={contentType}
          onChange={setContentType}
          options={CONTENT_TYPES.map((v) => ({ value: v, label: v }))}
        />

        {!isTranslate && templatesForType && templatesForType.length > 0 && (
          <DropRow
            label="Template"
            value={selectedTemplate?.id ?? ''}
            onChange={(id) =>
              onTemplateChange(
                id ? templatesForType.find((t) => t.id === id) ?? null : null,
              )
            }
            options={[
              { value: '', label: '— None —' },
              ...templatesForType.map((t) => ({
                value: t.id,
                label:
                  t.purpose === 'Email'
                    ? (t.fromName ? `${t.name} · ${t.fromName}` : t.name)
                    : (t.platform ? `${t.name} · ${t.platform}` : t.name),
              })),
            ]}
          />
        )}

        {isTranslate ? (
          <DropRow
            label="To"
            value={translateTo}
            onChange={setTranslateTo}
            options={LANGUAGES.map((v) => ({ value: v, label: v }))}
          />
        ) : (
          <>
            <DropRow
              label="Tone"
              value={tone}
              onChange={setTone}
              options={TONES.map((v) => ({ value: v, label: v }))}
            />

            <DropRow
              label="Length"
              value={length}
              onChange={setLength}
              options={LENGTHS.map((v) => ({ value: v, label: v }))}
            />
          </>
        )}

        <motion.div className="flex flex-col gap-1.5 mt-1" variants={itemVariants}>
          <h3 className="section-title">{isTranslate ? 'Text to translate' : 'Your message'}</h3>
          <ContextInput value={extra} onChange={setExtra} enabled={micEnabled} onDictated={onDictated} />
        </motion.div>

        {error && <ErrorBanner text={error} />}
      </motion.div>

      <div className="shrink-0">
        <GenerateButton loading={streaming} onClick={onGenerate} />
      </div>
    </motion.div>
  );
}

// Compact label + native <select>. The native select keeps keyboard nav,
// touch behaviour and Type-to-jump for free. Styling is via popup.css
// (.drop-row / .popup-select).
function DropRow({ label, value, onChange, options }) {
  return (
    <motion.div className="drop-row" variants={itemVariants}>
      <span className="drop-label">{label}</span>
      <select
        className="popup-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </motion.div>
  );
}

// ─── Result view ────────────────────────────────────────────────────────────

function ResultView({
  text, streaming, copied, pasteHint, error,
  onChange, onInsert, onCopy, onRegenerate, onBack, onCancel,
}) {
  return (
    <motion.div
      className="flex-1 flex flex-col gap-3 min-h-0"
      variants={resultViewVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      {/* The large editable result — takes up all available vertical space */}
      <div className="flex-1 min-h-0 relative">
        <textarea
          className="preview-textarea w-full h-full text-[13px] leading-relaxed"
          value={text}
          onChange={(e) => onChange(e.target.value)}
          placeholder={streaming ? 'Writing…' : 'Your generated message will appear here.'}
          spellCheck={false}
          autoFocus
        />
        {streaming && !text && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex items-center gap-1.5 text-white/50 text-[12px]">
              <span className="dot-pulse" />
              <span className="dot-pulse" />
              <span className="dot-pulse" />
              <span className="ml-2">Writing your message…</span>
            </div>
          </div>
        )}
        {streaming && text && (
          <span
            className="tw-cursor pointer-events-none"
            style={{ position: 'absolute', bottom: 14, right: 14 }}
          />
        )}
      </div>

      {pasteHint && (
        <p className="paste-hint shrink-0">
          ⌘V — Text copied to clipboard. Paste manually into the field.
        </p>
      )}

      {error && <ErrorBanner text={error} />}

      {/* Action row */}
      <div className="shrink-0 flex gap-1.5">
        {streaming ? (
          <motion.button
            type="button"
            className="pill w-full text-center text-[12px] text-red-300 border-red-400/30"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={onCancel}
          >
            ✕ Stop
          </motion.button>
        ) : (
          <>
            <motion.button
              type="button"
              className="gradient-btn flex-[2] text-[13px] py-2.5"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={onInsert}
              disabled={!text}
              title="Insert into the focused field"
            >
              ✓ Insert
            </motion.button>
            <motion.button
              type="button"
              className="pill flex-1 text-center text-[12px]"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={onCopy}
              disabled={!text}
              title="Copy to clipboard"
            >
              {copied ? '✓ Copied' : '⧉ Copy'}
            </motion.button>
            <motion.button
              type="button"
              className="pill text-center text-[12px] px-3"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onRegenerate}
              title="Regenerate with the same settings"
            >
              ↻
            </motion.button>
          </>
        )}
      </div>
    </motion.div>
  );
}

// ─── Shared atoms ───────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <motion.div className="flex flex-col gap-1.5" variants={itemVariants}>
      <h3 className="section-title">{title}</h3>
      {children}
    </motion.div>
  );
}

function ErrorBanner({ text }) {
  return (
    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="shrink-0 text-[11px] text-red-300 bg-red-500/10 border border-red-400/20 rounded-lg p-2"
    >
      {text}
    </motion.p>
  );
}
