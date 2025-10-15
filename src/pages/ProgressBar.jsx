// =============================================================
// File: src/refactor/components/ProgressBar.jsx
// =============================================================
import React from "react";

export default function ProgressBar({ label, value }) {
  return (
    <div className="progress-container">
      <div className="progress-label">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="progress-bar">
        <div className="progress-fill" style={{ "--value": `${value}%` }} />
      </div>
    </div>
  );
}