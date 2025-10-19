import React from "react";

export default function ProgressBar({ label, value }) {
  return (
    <div className="stat-box">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}%</div>
    </div>
  );
}