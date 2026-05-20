// Horizontal pill row for picking the content type. Controlled component.
// Uses motion.button so each pill scales on hover/tap.
import React from 'react';
import { motion } from 'framer-motion';

const TYPES = ['Email', 'Bio', 'Description', 'Note', 'Post', 'Message', 'Other'];

export default function ContentTypePicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TYPES.map((t) => (
        <motion.button
          key={t}
          type="button"
          className={`pill${value === t ? ' active' : ''}`}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          onClick={() => onChange(t)}
        >
          {t}
        </motion.button>
      ))}
    </div>
  );
}

export { TYPES as CONTENT_TYPES };
