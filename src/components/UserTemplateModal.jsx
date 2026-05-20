// Inline modal for adding / editing a user-defined style template (example post).
//
// A user template is a FULL EXAMPLE POST in the style they want their AI
// output to look like. The popup uses it as a few-shot reference: "match
// this style — tone, structure, emoji/hashtag pattern".

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const PLATFORMS = [
  '', // (none)
  'Facebook', 'Instagram', 'LinkedIn', 'Twitter', 'TikTok',
  'YouTube', 'Reddit',
  'WhatsApp', 'Messages', 'Slack', 'Discord',
  'Gmail', 'Mail', 'Outlook',
  'Notion', 'Salesforce', 'HubSpot', 'Airbnb',
  'Other',
];

export default function UserTemplateModal({ open, initial, onClose, onSave }) {
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState('');
  const [content, setContent] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset when modal opens with new initial data.
  useEffect(() => {
    if (!open) return;
    setName(initial?.name || '');
    setPlatform(initial?.platform || '');
    setContent(initial?.content || '');
    setNotes(initial?.notes || '');
  }, [open, initial]);

  async function handleSave() {
    if (!name.trim() || !content.trim()) return;
    setSaving(true);
    await onSave({
      id: initial?.id,
      name: name.trim(),
      platform: platform.trim(),
      content,
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
                {initial?.id ? 'Edit example' : 'New example'}
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

            <p className="text-xs text-white/50 -mt-2">
              Paste a complete example post — exactly the way you want AI output to look.
              FlowWrite will match its tone, structure, emoji style and hashtag pattern when
              you generate on this platform.
            </p>

            <Field label="Name">
              <input
                type="text"
                className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm focus:outline-none focus:border-accent"
                placeholder="e.g. My Facebook style"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
              />
            </Field>

            <Field label="Platform (optional — used to auto-pick this template when you're on that app)">
              <select
                className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm focus:outline-none focus:border-accent"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
              >
                {PLATFORMS.map((p) => (
                  <option key={p || '__none__'} value={p} className="bg-bg">
                    {p || '— No platform (manual select only) —'}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Example post (this is the gold standard for style)">
              <textarea
                className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm font-mono leading-relaxed focus:outline-none focus:border-accent resize-y"
                rows={12}
                placeholder={'Paste your example here — exactly how you want the AI output to look.\n\nKeep everything: emojis, hashtags, line breaks, the works.'}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                spellCheck={false}
              />
              <div className="flex justify-between text-[11px] text-white/40 mt-1">
                <span>{content.length} chars · {content.split(/\s+/).filter(Boolean).length} words</span>
                <span>{(content.match(/#\w+/g) || []).length} hashtag(s)</span>
              </div>
            </Field>

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
              <button
                type="button"
                className="pill text-[12px]"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="button"
                className="gradient-btn text-[13px] px-5"
                onClick={handleSave}
                disabled={saving || !name.trim() || !content.trim()}
              >
                {saving ? 'Saving…' : (initial?.id ? 'Save changes' : 'Add example')}
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
