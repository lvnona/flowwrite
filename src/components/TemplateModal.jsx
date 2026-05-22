// Add / edit a unified template.
//
// Every template has a NAME, a PURPOSE (what you're writing — Email, Post,
// Message, …) and an optional PLATFORM (Facebook, Gmail, …) used for filtering
// and popup auto-selection.
//
// Fields shown depend on purpose:
//   • Email   → From whom (sender) + Example email (style) + Signature (fixed,
//               appended verbatim to every generated email).
//   • Others  → Example (a sample in the style you want) + Notes.

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TEMPLATE_PURPOSES, TEMPLATE_PLATFORMS } from '../utils/templateKinds.js';

export default function TemplateModal({ open, initial, onClose, onSave }) {
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('Post');
  const [platform, setPlatform] = useState('');
  const [content, setContent] = useState('');
  const [fromName, setFromName] = useState('');
  const [signature, setSignature] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name || '');
    setPurpose(initial?.purpose || 'Post');
    setPlatform(initial?.platform || '');
    setContent(initial?.content || '');
    setFromName(initial?.fromName || '');
    setSignature(initial?.signature || '');
    setNotes(initial?.notes || '');
  }, [open, initial]);

  const isEmail = purpose === 'Email';
  // Email needs a signature; everything else needs an example.
  const canSave = name.trim() && (isEmail ? signature.trim() : content.trim());

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    await onSave({
      id: initial?.id,
      name: name.trim(),
      purpose,
      platform: platform.trim(),
      content,
      fromName: fromName.trim(),
      signature,
      notes: notes.trim(),
    });
    setSaving(false);
    onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="modal-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            key="modal"
            className="popup-card w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 flex flex-col gap-4 text-white"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between">
              <h2 className="text-base font-semibold">
                {initial?.id ? 'Edit template' : 'New template'}
              </h2>
              <button
                type="button"
                className="text-white/40 hover:text-white text-lg leading-none"
                onClick={onClose}
                aria-label="Close"
              >
                ✕
              </button>
            </header>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Name">
                <input
                  type="text"
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm focus:outline-none focus:border-accent"
                  placeholder={isEmail ? 'e.g. norm, get-together' : 'e.g. My Facebook style'}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                />
              </Field>

              <Field label="Purpose">
                <select
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm focus:outline-none focus:border-accent"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                >
                  {TEMPLATE_PURPOSES.map((p) => (
                    <option key={p} value={p} className="bg-bg">{p}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Platform (optional — used to auto-pick this template when you're on that app, and for filtering)">
              <select
                className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm focus:outline-none focus:border-accent"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
              >
                {TEMPLATE_PLATFORMS.map((p) => (
                  <option key={p || '__none__'} value={p} className="bg-bg">
                    {p || '— No platform (manual select only) —'}
                  </option>
                ))}
              </select>
            </Field>

            {isEmail && (
              <Field label="From whom (sender — who the email is written as)">
                <input
                  type="text"
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm focus:outline-none focus:border-accent"
                  placeholder="e.g. Norm, Head of Sales at Acme"
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                  maxLength={120}
                />
              </Field>
            )}

            <Field
              label={
                isEmail
                  ? 'Example email (optional — the AI copies this writing style)'
                  : 'Example (the gold standard for style — match its tone, structure, emojis & hashtags)'
              }
            >
              <textarea
                className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm font-mono leading-relaxed focus:outline-none focus:border-accent resize-y"
                rows={isEmail ? 7 : 10}
                placeholder={
                  isEmail
                    ? 'Paste a past email you liked — greeting, body, tone.\nLeave out the signature (set that below).'
                    : 'Paste your example here — exactly how you want the AI output to look.\nKeep everything: emojis, hashtags, line breaks.'
                }
                value={content}
                onChange={(e) => setContent(e.target.value)}
                spellCheck={false}
              />
              <div className="flex justify-between text-[11px] text-white/40 mt-1">
                <span>{content.length} chars · {content.split(/\s+/).filter(Boolean).length} words</span>
                <span>{(content.match(/#\w+/g) || []).length} hashtag(s)</span>
              </div>
            </Field>

            {isEmail && (
              <Field label="Signature (always appended exactly as written)">
                <textarea
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm font-mono leading-relaxed focus:outline-none focus:border-accent resize-y"
                  rows={4}
                  placeholder={'Best,\nNorm\nFlowWrite Inc.\n+1 555 0100'}
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  spellCheck={false}
                />
                <p className="text-[11px] text-white/40 mt-1">
                  This block is added verbatim to every email — the AI never changes it.
                </p>
              </Field>
            )}

            <Field label="Notes (optional — your own reminder, never sent to AI)">
              <input
                type="text"
                className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm focus:outline-none focus:border-accent"
                placeholder="e.g. Use for product launches"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={120}
              />
            </Field>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="pill text-[12px]" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="gradient-btn text-[13px] px-5"
                onClick={handleSave}
                disabled={saving || !canSave}
              >
                {saving ? 'Saving…' : (initial?.id ? 'Save changes' : 'Add template')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wider text-white/45 mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}
