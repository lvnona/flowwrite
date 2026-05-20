// Full-width gradient generate button with animated loading state and glow pulse.
import React from 'react';

export default function GenerateButton({ loading, onClick }) {
  return (
    <button
      type="button"
      className={`gradient-btn w-full flex items-center justify-center gap-1.5${loading ? ' loading' : ''}`}
      disabled={loading}
      onClick={onClick}
    >
      {loading ? (
        <>
          <span className="dot-pulse" />
          <span className="dot-pulse" />
          <span className="dot-pulse" />
        </>
      ) : (
        <>
          <span style={{ fontSize: '14px' }}>✨</span>
          <span>Generate</span>
        </>
      )}
    </button>
  );
}
