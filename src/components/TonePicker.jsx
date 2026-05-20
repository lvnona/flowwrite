// Tone selection pills with motion hover/tap scale.
import React from 'react';
import { motion } from 'framer-motion';

const TONES = ['Professional', 'Friendly', 'Persuasive', 'Casual', 'Luxury', 'Urgent', 'Humor', 'Joke'];

export default function TonePicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TONES.map((t) => (
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

export { TONES };
