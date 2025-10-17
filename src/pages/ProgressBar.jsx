// src/pages/ProgressBar.jsx

import React from "react";

export default function ProgressBar({ label, value }) {
  return (
    <div className="progress-component">
      <div className="progress-label">
        <span className="progress-label-text">{label}</span>
        <span className="progress-label-value">{value}%</span>
      </div>
      <div className="progress-bar">
        <div className="progress-fill" style={{ "--value": `${value}%` }} />
      </div>
    </div>
  );
}