// Length selection pills (Short / Medium / Long) with motion animations.
import React from 'react';
import { motion } from 'framer-motion';

const LENGTHS = ['Short', 'Medium', 'Long'];

export default function LengthPicker({ value, onChange }) {
  return (
    <div className="flex gap-1.5">
      {LENGTHS.map((l) => (
        <motion.button
          key={l}
          type="button"
          className={`pill flex-1 text-center${value === l ? ' active' : ''}`}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onChange(l)}
        >
          {l}
        </motion.button>
      ))}
    </div>
  );
}

export { LENGTHS };
