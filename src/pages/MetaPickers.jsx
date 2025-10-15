// =============================================================
// File: src/refactor/components/MetaPickers.jsx
// =============================================================
import React, { useMemo } from "react";
export default function MetaPickers({ date, setDate, rtoId, setRtoId, rtos, dataset, rtoIndex, qualificationCode, onQualificationChange, unitCount, evidencePercent, refereePercent, gapPercent }) {
  // Build filtered qual list based on RTO selection
  const filteredQuals = useMemo(() => {
    if (!dataset) return [];
    const all = Object.values(dataset);
    if (!rtoId) {
      // Show only quals with NO RTO mapping
      const codes = rtoIndex?.withoutRto || new Set();
      return all.filter((q) => codes.has(q.code)).sort((a, b) => a.code.localeCompare(b.code));
    }
    const codes = rtoIndex?.byRto?.get(rtoId);
    if (!codes) return [];
    return all.filter((q) => codes.has(q.code)).sort((a, b) => a.code.localeCompare(b.code));
  }, [dataset, rtoId, rtoIndex]);

  return (
    <div className="grid cols-2" style={{ gap: 16 }}>
      <div>
        <label className="label">Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div>
        <label className="label">RTO</label>
        <select value={rtoId} onChange={(e) => setRtoId(e.target.value)}>
          <option value="">Select RTO…</option>
          {rtos.map((r) => (
            <option key={r.id} value={r.id}>{r.trading_name} {r.rto_code ? `(RTO ${r.rto_code})` : ""}</option>
          ))}
        </select>
      </div>
      <div className="grid cols-2" style={{ gridColumn: "1 / -1", gap: 16 }}>
        <div>
          <label className="label">Qualification</label>
          <select value={qualificationCode} onChange={(e) => onQualificationChange(e.target.value)}>
            <option value="">{rtoId ? "Select an RTO’s qualification…" : "Select a qualification without RTO…"}</option>
            {filteredQuals.map((q) => (
              <option key={q.code} value={q.code}>{q.code} — {q.name}</option>
            ))}
          </select>
        </div>
        <div className="card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="badge">Units: {unitCount}</span>
          <span className="badge">Evidence: {evidencePercent}%</span>
          <span className="badge">Referee: {refereePercent}%</span>
          <span className="badge">Gap: {gapPercent}%</span>
        </div>
      </div>
    </div>
  );
}