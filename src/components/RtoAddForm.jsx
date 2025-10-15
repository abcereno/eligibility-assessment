// =============================================================
// File: src/refactor/components/RtoAddForm.jsx
// Adds a new RTO (trading_name required, rto_code optional)
// Calls onCreated(newRto) on success
// =============================================================
import React, { useState } from "react";
import { supabase } from "../lib/supabase";

export default function RtoAddForm({ onCreated }) {
  const [tradingName, setTradingName] = useState("");
  const [rtoCode, setRtoCode] = useState("");
  const [email, setEmail] = useState("");       // optional, matches your rtos schema
  const [phone, setPhone] = useState("");       // optional
  const [website, setWebsite] = useState("");   // optional
  const [legalName, setLegalName] = useState("");// optional
  const [abn, setAbn] = useState("");           // optional
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!tradingName.trim()) return alert("Trading name is required");
    setLoading(true);
    try {
      const payload = {
        trading_name: tradingName.trim(),
        rto_code: rtoCode.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        website: website.trim() || null,
        legal_name: legalName.trim() || null,
        abn: abn.trim() || null,
      };

      const { data, error } = await supabase
        .from("rtos")
        .insert(payload)
        .select("id, trading_name, rto_code, email, phone, website, legal_name, abn, created_at")
        .single();

      if (error) throw error;

      // notify parent + reset
      onCreated?.(data);
      setTradingName("");
      setRtoCode("");
      setEmail("");
      setPhone("");
      setWebsite("");
      setLegalName("");
      setAbn("");
      alert("RTO added.");
    } catch (err) {
      console.error(err);
      alert("Failed to add RTO: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="card" style={{ display: "grid", gap: 12}}>
      <h3 className="section-title">Add RTO</h3>

      <div>
        <label className="label">Trading name *</label>
        <input
          value={tradingName}
          onChange={(e) => setTradingName(e.target.value)}
          placeholder="e.g., ABC Training Pty Ltd"
          required
        />
      </div>

      <div className="grid cols-2" style={{ gap: 12 }}>
        <div>
          <label className="label">RTO code (optional)</label>
          <input value={rtoCode} onChange={(e) => setRtoCode(e.target.value)} placeholder="e.g., 45637" />
        </div>
        <div>
          <label className="label">ABN (optional)</label>
          <input value={abn} onChange={(e) => setAbn(e.target.value)} placeholder="e.g., 12 345 678 901" />
        </div>
      </div>

      <div className="grid cols-2" style={{ gap: 12 }}>
        <div>
          <label className="label">Email (optional)</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contact@rto.com" />
        </div>
        <div>
          <label className="label">Phone (optional)</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="04xx xxx xxx" />
        </div>
      </div>

      <div className="grid cols-2" style={{ gap: 12 }}>
        <div>
          <label className="label">Legal name (optional)</label>
          <input value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Legal entity name" />
        </div>
        <div>
          <label className="label">Website (optional)</label>
          <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://example.com" />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn" type="submit" disabled={loading}>
          {loading ? "Saving…" : "Add RTO"}
        </button>
      </div>
    </form>
  );
}
