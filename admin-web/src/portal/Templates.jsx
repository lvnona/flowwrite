// Customer portal — Templates tab. Full CRUD on the user's saved templates,
// matching the desktop TemplateModal field set (name, purpose, platform,
// content/signature, additional instructions, notes).

import React, { useEffect, useMemo, useState } from 'react';

const PURPOSES  = ['Email', 'Post', 'Message', 'Comment', 'Reply', 'Note', 'Other'];
const PLATFORMS = ['', 'Email', 'Facebook', 'Instagram', 'X / Twitter', 'LinkedIn',
                   'TikTok', 'YouTube', 'Reddit', 'WhatsApp', 'iMessage', 'Slack',
                   'Discord', 'Teams', 'Other'];

export default function Templates({ templates, onSave, onRemove }) {
  const [editing, setEditing] = useState(null);          // null | 'new' | template
  const [filter, setFilter] = useState('All');
  const [query, setQuery] = useState('');

  const purposesPresent = useMemo(
    () => [...new Set(templates.map((t) => t.purpose).filter(Boolean))],
    [templates],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((t) => {
      if (filter !== 'All' && t.purpose !== filter) return false;
      if (q && !`${t.name || ''} ${t.platform || ''} ${t.content || ''} ${t.notes || ''}`
        .toLowerCase().includes(q)) return false;
      return true;
    });
  }, [templates, filter, query]);

  async function handleDelete(t) {
    if (!confirm(`Delete template "${t.name}"? This can't be undone.`)) return;
    await onRemove(t.id);
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-base font-semibold">Your templates</h2>
        <button type="button"
          onClick={() => setEditing('new')}
          className="ml-auto px-4 py-2 rounded-xl bg-accent hover:bg-accent/85 text-white text-sm font-medium transition">
          + New
        </button>
      </div>

      {/* Search */}
      {templates.length > 0 && (
        <input type="search" placeholder="Search by name or content…"
          value={query} onChange={(e) => setQuery(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm
                     placeholder-white/30 focus:outline-none focus:border-accent/60 transition mb-3" />
      )}

      {/* Purpose filter */}
      {purposesPresent.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          <Pill active={filter === 'All'} onClick={() => setFilter('All')}>All</Pill>
          {purposesPresent.map((p) => (
            <Pill key={p} active={filter === p} onClick={() => setFilter(p)}>{p}</Pill>
          ))}
        </div>
      )}

      {/* List */}
      {templates.length === 0 ? (
        <EmptyState onCreate={() => setEditing('new')} />
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-8 text-center text-white/55 text-sm">
          No templates match this filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {filtered.map((t) => (
            <Card key={t.id} template={t}
              onEdit={() => setEditing(t)}
              onDelete={() => handleDelete(t)} />
          ))}
        </div>
      )}

      {/* Editor modal */}
      {editing && (
        <Editor
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (t) => { await onSave(t); setEditing(null); }}
        />
      )}
    </div>
  );
}

// ── List ─────────────────────────────────────────────────────────────────────
function Card({ template, onEdit, onDelete }) {
  const isEmail = template.purpose === 'Email';
  const preview = isEmail
    ? (template.signature || template.content || '')
    : (template.content || '');

  return (
    <div className="rounded-2xl p-4 bg-white/[0.04] border border-white/10
                    hover:border-accent/40 transition flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium truncate">{template.name || '(unnamed)'}</span>
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full
                             bg-accent/15 border border-accent/30 text-accentSoft shrink-0">
              {template.purpose}
            </span>
            {template.platform && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 border border-white/15 text-white/60 shrink-0">
                {template.platform}
              </span>
            )}
          </div>
          {isEmail && template.fromName && (
            <p className="text-[11px] text-white/40 mt-0.5 truncate">from {template.fromName}</p>
          )}
        </div>
      </div>
      <pre className="font-sans text-[12px] text-white/65 whitespace-pre-wrap leading-snug line-clamp-4 mt-1 flex-1">
        {preview || '(empty)'}
      </pre>
      {template.additionalInstructions && (
        <p className="mt-2 text-[11px] text-amber-300/80 italic line-clamp-1" title={template.additionalInstructions}>
          ⚑ {template.additionalInstructions}
        </p>
      )}
      <div className="flex items-center justify-end gap-1 mt-3 pt-2 border-t border-white/5">
        <button type="button" onClick={onEdit}
          className="text-[12px] px-3 py-1 rounded-lg border border-white/15 text-white/75 hover:bg-white/5 hover:border-white/30 transition">
          Edit
        </button>
        <button type="button" onClick={onDelete}
          className="text-[12px] px-3 py-1 rounded-lg border border-red-400/25 text-red-300/80 hover:bg-red-500/10 transition">
          Delete
        </button>
      </div>
    </div>
  );
}

function Pill({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      className={'px-3 py-1 rounded-full text-[12px] border transition ' + (active
        ? 'bg-accent/20 border-accent/50 text-white'
        : 'bg-white/[0.04] border-white/10 text-white/55 hover:text-white')}>
      {children}
    </button>
  );
}

function EmptyState({ onCreate }) {
  return (
    <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-8 text-center">
      <p className="text-base font-medium mb-1">No templates yet</p>
      <p className="text-white/50 text-[13px] mb-4 leading-relaxed">
        Templates teach FlowWrite your style. Add one and the AI will match its tone, format and
        signature when you generate.
      </p>
      <button type="button" onClick={onCreate}
        className="px-5 py-2.5 rounded-xl bg-accent hover:bg-accent/85 text-white text-sm font-medium transition">
        + Create your first template
      </button>
    </div>
  );
}

// ── Editor (create / edit) ───────────────────────────────────────────────────
function Editor({ initial, onClose, onSave }) {
  const [name, setName] = useState(initial?.name || '');
  const [purpose, setPurpose] = useState(initial?.purpose || 'Post');
  const [platform, setPlatform] = useState(initial?.platform || '');
  const [content, setContent] = useState(initial?.content || '');
  const [fromName, setFromName] = useState(initial?.fromName || '');
  const [signature, setSignature] = useState(initial?.signature || '');
  const [additionalInstructions, setAdditionalInstructions] = useState(initial?.additionalInstructions || '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [saving, setSaving] = useState(false);

  const isEmail = purpose === 'Email';
  const canSave = name.trim() && (isEmail ? signature.trim() : content.trim());

  async function handle() {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({
        id: initial?.id,
        name: name.trim(),
        purpose,
        platform: platform.trim(),
        content,
        fromName: fromName.trim(),
        signature,
        notes: notes.trim(),
        additionalInstructions: additionalInstructions.trim(),
      });
    } finally { setSaving(false); }
  }

  // Lock background scroll while modal is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}>
      <div className="w-full sm:max-w-2xl bg-bg sm:rounded-2xl rounded-t-2xl border border-white/10
                      max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <header className="sticky top-0 bg-bg/95 backdrop-blur border-b border-white/10 px-5 py-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">{initial?.id ? 'Edit template' : 'New template'}</h2>
          <button type="button" onClick={onClose}
            className="text-white/40 hover:text-white text-lg leading-none w-8 h-8 flex items-center justify-center">✕</button>
        </header>

        <div className="p-5 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <FieldLabel label="Name">
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                placeholder={isEmail ? 'e.g. norm-emails' : 'e.g. My Facebook style'}
                maxLength={80} className={inputCls} />
            </FieldLabel>
            <FieldLabel label="Purpose">
              <select value={purpose} onChange={(e) => setPurpose(e.target.value)} className={inputCls}>
                {PURPOSES.map((p) => <option key={p} value={p} className="bg-bg">{p}</option>)}
              </select>
            </FieldLabel>
          </div>

          <FieldLabel label="Platform (optional — used to auto-pick the right template)">
            <select value={platform} onChange={(e) => setPlatform(e.target.value)} className={inputCls}>
              {PLATFORMS.map((p) => (
                <option key={p || 'none'} value={p} className="bg-bg">
                  {p || '— No platform (manual select only) —'}
                </option>
              ))}
            </select>
          </FieldLabel>

          {isEmail && (
            <FieldLabel label="From whom (sender — who the email is written as)">
              <input type="text" value={fromName} onChange={(e) => setFromName(e.target.value)}
                placeholder="e.g. Norm, Head of Sales at Acme" maxLength={120} className={inputCls} />
            </FieldLabel>
          )}

          <FieldLabel label={isEmail
            ? 'Example email (optional — the AI copies this writing style)'
            : 'Example (the gold standard for style)'}>
            <textarea rows={isEmail ? 6 : 8} value={content} onChange={(e) => setContent(e.target.value)}
              placeholder={isEmail
                ? 'Paste a past email you liked — greeting, body, tone.\nLeave out the signature (set that below).'
                : 'Paste your example here — exactly how you want the AI output to look. Keep emojis, hashtags, line breaks.'}
              spellCheck={false}
              className={inputCls + ' font-mono leading-relaxed resize-y'} />
            <div className="flex justify-between text-[11px] text-white/40 mt-1">
              <span>{content.length} chars · {content.split(/\s+/).filter(Boolean).length} words</span>
              <span>{(content.match(/#\w+/g) || []).length} hashtag(s)</span>
            </div>
          </FieldLabel>

          {isEmail && (
            <FieldLabel label="Signature (always appended exactly as written)">
              <textarea rows={3} value={signature} onChange={(e) => setSignature(e.target.value)}
                placeholder={'Best,\nNorm\nFlowWrite Inc.\n+1 555 0100'} spellCheck={false}
                className={inputCls + ' font-mono leading-relaxed resize-y'} />
              <p className="text-[11px] text-white/40 mt-1">
                This block is added verbatim to every email — the AI never changes it.
              </p>
            </FieldLabel>
          )}

          <FieldLabel label="Additional Instructions (sent to AI — facts to preserve exactly)">
            <textarea rows={4} value={additionalInstructions}
              onChange={(e) => setAdditionalInstructions(e.target.value)}
              placeholder={'Lines the AI MUST follow when generating from this template. Use this for personal facts you want kept verbatim — names, phone numbers, addresses, prices, dates, links.\n\nExamples:\n- My name is Norm. Always sign emails as Norm — never "Norma" or "Norman".\n- My phone is +1 555-0100. Use exactly this number when mentioning contact info.\n- The product price is $49 — never quote any other figure.'}
              spellCheck={false}
              className={inputCls + ' leading-relaxed resize-y'} />
            <p className="text-[11px] text-white/40 mt-1">
              The AI receives these as strict rules and must preserve every fact you write here exactly — never paraphrase, abbreviate, or change a digit.
            </p>
          </FieldLabel>

          <FieldLabel label="Notes (optional — your own reminder, never sent to AI)">
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Use for product launches" maxLength={120} className={inputCls} />
          </FieldLabel>
        </div>

        <footer className="sticky bottom-0 bg-bg/95 backdrop-blur border-t border-white/10 px-5 py-3 flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-xl border border-white/15 text-white/75 text-sm hover:bg-white/5 transition">
            Cancel
          </button>
          <button type="button" onClick={handle} disabled={saving || !canSave}
            className="px-5 py-2 rounded-xl bg-accent hover:bg-accent/85 text-white text-sm font-medium transition disabled:opacity-50">
            {saving ? 'Saving…' : (initial?.id ? 'Save changes' : 'Add template')}
          </button>
        </footer>
      </div>
    </div>
  );
}

const inputCls = 'mt-0 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm '
               + 'placeholder-white/30 focus:outline-none focus:border-accent/60 transition';

function FieldLabel({ label, children }) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wider text-white/45 mb-1.5">{label}</span>
      {children}
    </label>
  );
}
