// What the user wants to say. Treated by the prompt builder as their draft
// to rewrite (not as supplementary context).
import React from 'react';

export default function ContextInput({ value, onChange }) {
  return (
    <textarea
      className="context-textarea"
      rows={3}
      maxLength={1200}
      placeholder="What you want to say — I'll rewrite it in your tone & style."
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
