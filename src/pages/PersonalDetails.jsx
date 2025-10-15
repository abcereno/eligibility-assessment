// =============================================================
// File: src/refactor/components/PersonalDetails.jsx
// =============================================================
import React from "react";

export default function PersonalDetails({ person, setPerson, notes, setNotes, workHistory, setWorkHistory, callTranscript, setCallTranscript }) {
  return (
    <div className="grid cols-2">
      <div>
        <label className="label">Full name</label>
        <input value={person.name} onChange={(e) => setPerson((p) => ({ ...p, name: e.target.value }))} placeholder="Your name" />
      </div>
      <div>
        <label className="label">Email</label>
        <input value={person.email} onChange={(e) => setPerson((p) => ({ ...p, email: e.target.value }))} placeholder="you@example.com" />
      </div>
      <div>
        <label className="label">Phone</label>
        <input value={person.phone} onChange={(e) => setPerson((p) => ({ ...p, phone: e.target.value }))} placeholder="04xx xxx xxx" />
      </div>
      <div>
        <label className="label">Assessment Notes</label>
        <textarea rows="3" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Assessment notes…" />
      </div>
      <div style={{ gridColumn: "1 / -1" }}>
        <label className="label">Work History</label>
        <textarea rows="3" value={workHistory} onChange={(e) => setWorkHistory(e.target.value)} placeholder="Enter work history…" />
      </div>
      <div style={{ gridColumn: "1 / -1" }}>
        <label className="label">Assessment Call Transcript</label>
        <textarea rows="3" value={callTranscript} onChange={(e) => setCallTranscript(e.target.value)} placeholder="Enter call transcript…" />
      </div>
    </div>
  );
}