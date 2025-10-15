// =============================================================
// File: src/refactor/components/RtoCsvImport.jsx
// (kept client-side import; improved error logs wording)
// =============================================================
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import Papa from "papaparse";

const BUCKET = "rto-imports";
const LS_KEY = "rtoCsvImport:last";

export default function RtoCsvImport() {
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [log, setLog] = useState([]);
  const [showPreview, setShowPreview] = useState(true);

  const addLog = (msg) => {
    setLog((L) => {
      const next = [...L, msg];
      try {
        const cached = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
        localStorage.setItem(LS_KEY, JSON.stringify({ ...cached, log: next }));
      } catch (error) {
        console.error("Persist log error:", error);
      }
      return next;
    });
  };

  // 🔁 Rehydrate last parse/log on mount
  useEffect(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
      if (Array.isArray(cached.rows) && cached.rows.length) setRows(cached.rows);
      if (Array.isArray(cached.log) && cached.log.length) setLog(cached.log);
    } catch (error) {
      console.error("Rehydrate error:", error);
    }
  }, []);

  function dumpToConsole(dataRows = rows) {
    try {
      console.groupCollapsed(`📦 RTO CSV — ${dataRows.length} parsed row(s) (preview below)`);
      const preview = dataRows.slice(0, 25);
      if (preview.length) console.table(preview);
      else console.log("No rows to preview.");
      console.log("Full rows array:", dataRows);
      console.groupEnd();
    } catch (error) {
      console.error("Console dump error:", error);
    }
  }

  function parseCsv(f) {
    if (!f) return;
    setParsing(true);
    setRows([]);
    setLog([]);

    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: ({ data, errors }) => {
        if (errors?.length) addLog(`Parser warnings: ${errors.length}`);
        const norm = data
          .map((r) => ({
            qualification_code: r["qualification_code"]?.trim() || r["Qualification Code"]?.trim() || "",
            qualification_name: r["Extra Info for names"]?.trim() || r["qualification_name"]?.trim() || "",
            unit_code: r["unit_code"]?.trim() || r["Unit Code"]?.trim() || "",
            unit_name: r["unit_name"]?.trim() || r["Unit Name"]?.trim() || "",
            unit_description: r["unit_description"]?.trim() || r["Unit Description"]?.trim() || "",
            unit_type: (r["unit_type"] || r["Unit Type"] || "").trim(),
            group_label: (r["group_label"] || r["Group Label"] || "").trim(),
            rto_code: (r["rto_code"] || r["RTO Code"] || "").trim(),
          }))
          .filter((x) => x.qualification_code && x.unit_code);

        // persist now so it survives refresh
        try {
          localStorage.setItem(LS_KEY, JSON.stringify({ rows: norm, log: [], summary: null }));
        } catch (error) {
          console.error("Persist rows error:", error);
        }

        dumpToConsole(norm);

        try {
          window.__rtoCsv = { rows: norm };
          console.info("window.__rtoCsv set for quick access in DevTools.");
        } catch (error) {
          console.error("Expose global error:", error);
        }

        setRows(norm);
        setParsing(false);
      },
      error: (err) => {
        setParsing(false);
        alert("CSV parse failed: " + err.message);
      },
    });
  }

  const summary = useMemo(() => {
    const qs = new Set(rows.map((r) => r.qualification_code));
    const us = new Set(rows.map((r) => r.unit_code));
    const rs = new Set(rows.map((r) => r.rto_code).filter(Boolean));
    const s = { qCount: qs.size, uCount: us.size, rCount: rs.size, rowCount: rows.length };
    try {
      const cached = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
      localStorage.setItem(LS_KEY, JSON.stringify({ ...cached, summary: s }));
    } catch (error) {
      console.error("Persist summary error:", error);
    }
    return s;
  }, [rows]);

  async function importNow() {
    if (!rows.length) return alert("Parse a CSV first");
    setImporting(true);
    setLog([]);
    addLog("Starting import…");

    try {
      // --- 0. Upload CSV to storage (audit) ---
      if (file) {
        const stamp = Date.now();
        const path = `imports/${stamp}_${file.name.replaceAll(" ", "_")}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { upsert: false });
        if (!upErr) addLog("CSV archived to storage");
      }

      // --- 1. Gather unique codes ---
      const qCodes = Array.from(new Set(rows.map((r) => r.qualification_code)));
      const uCodes = Array.from(new Set(rows.map((r) => r.unit_code)));
      const rtoCodes = Array.from(new Set(rows.map((r) => r.rto_code).filter(Boolean)));

      // --- 2. Upsert RTOs ---
      const { data: rtoExisting } = await supabase
        .from("rtos")
        .select("id, rto_code, trading_name")
        .in("rto_code", rtoCodes);
      const rtoByCode = new Map((rtoExisting || []).map((r) => [r.rto_code, r]));
      const rtoMissing = rtoCodes
        .filter((code) => !rtoByCode.has(code))
        .map((code) => ({ trading_name: `RTO ${code}`, rto_code: code }));
      if (rtoMissing.length) {
        const { data: inserted } = await supabase
          .from("rtos")
          .insert(rtoMissing)
          .select("id, rto_code");
        inserted?.forEach((r) => rtoByCode.set(r.rto_code, r));
        addLog(`Added ${inserted?.length || 0} RTO(s)`);
      }

      // --- 3. Upsert Qualifications ---
      const { data: qExisting } = await supabase
        .from("qualifications")
        .select("id, code")
        .in("code", qCodes);
      const qByCode = new Map((qExisting || []).map((q) => [q.code, q]));
      const qMissing = [];
      for (const r of rows) {
        if (!qByCode.has(r.qualification_code)) {
          qMissing.push({
            code: r.qualification_code,
            name: r.qualification_name || r.qualification_code,
          });
          qByCode.set(r.qualification_code, { code: r.qualification_code });
        }
      }
      if (qMissing.length) {
        const { data: inserted } = await supabase
          .from("qualifications")
          .insert(qMissing)
          .select("id, code");
        inserted?.forEach((q) => qByCode.set(q.code, q));
        addLog(`Added ${inserted?.length || 0} qualification(s)`);
      }

      // --- 4. Upsert Units ---
      const { data: uExisting } = await supabase
        .from("units")
        .select("id, code")
        .in("code", uCodes);
      const uByCode = new Map((uExisting || []).map((u) => [u.code, u]));
      const uMissing = [];
      for (const r of rows) {
        if (!uByCode.has(r.unit_code)) {
          uMissing.push({
            code: r.unit_code,
            name: r.unit_name || r.unit_code,
            description: r.unit_description || null,
          });
          uByCode.set(r.unit_code, { code: r.unit_code });
        }
      }
      if (uMissing.length) {
        const { data: inserted } = await supabase
          .from("units")
          .insert(uMissing)
          .select("id, code");
        inserted?.forEach((u) => uByCode.set(u.code, u));
        addLog(`Added ${inserted?.length || 0} unit(s)`);
      }

      // --- 5. qualification_units links ---
      const quRows = [];
      const seen = new Set();
      for (const r of rows) {
        const q = qByCode.get(r.qualification_code);
        const u = uByCode.get(r.unit_code);
        if (!q?.id || !u?.id) continue;
        const key = `${q.id}:${u.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        quRows.push({
          qualification_id: q.id,
          unit_id: u.id,
          unit_type: (r.unit_type || "").toLowerCase().includes("core") ? "core" : "elective",
          group_code: r.group_label || null,
        });
      }
      if (quRows.length) {
        await supabase.from("qualification_units").insert(quRows);
        addLog(`Linked ${quRows.length} qualification_units`);
      }

      // --- 6. rto_qualification_offers ---
      const offerPairs = new Set();
      for (const r of rows) {
        if (!r.rto_code) continue;
        const rto = rtoByCode.get(r.rto_code);
        const q = qByCode.get(r.qualification_code);
        if (!rto?.id || !q?.id) continue;
        offerPairs.add(`${rto.id}:${q.id}`);
      }
      const offers = Array.from(offerPairs).map((k) => {
        const [rto_id, qualification_id] = k.split(":");
        return { rto_id, qualification_id, status: "draft", is_public: false };
      });
      if (offers.length) {
        await supabase.from("rto_qualification_offers").insert(offers);
        addLog(`Created ${offers.length} rto_qualification_offers`);
      }

      addLog("✅ Import complete");
      alert("Import complete");
    } catch (err) {
      console.error(err);
      addLog("ERROR: " + err.message);
      alert("Import failed: " + err.message);
    } finally {
      setImporting(false);
    }
  }

  const hasRows = rows.length > 0;

  return (
    <div className="card" style={{ display: "grid", gap: 12 }}>
      <h3 className="section-title">Import RTO CSV</h3>
      <p className="muted">
        Expected headers:
        <code>
          {" "}
          qualification_code, Extra Info for names, unit_code, unit_name,
          unit_description, unit_type, group_label, rto_code
        </code>
      </p>

      <input
        type="file"
        accept=".csv"
        onChange={(e) => {
          const f = e.target.files?.[0];
          setFile(f || null);
          if (f) parseCsv(f);
        }}
      />

      {parsing && <div className="badge">Parsing…</div>}

      {hasRows && (
        <div className="card" style={{ background: "#fafafa", display: "grid", gap: 8 }}>
          <div>
            Rows: {summary.rowCount} • Qualifications: {summary.qCount} • Units: {summary.uCount} • RTOs: {summary.rCount}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" onClick={importNow} disabled={importing}>
              {importing ? "Importing…" : "Start Import"}
            </button>
            <button className="btn" type="button" onClick={() => dumpToConsole()}>
              Dump to console
            </button>
            <button className="btn" type="button" onClick={() => setShowPreview((s) => !s)}>
              {showPreview ? "Hide Preview" : "Show Preview"}
            </button>
          </div>

          {showPreview && (
            <div className="card" style={{ background: "#fff", maxHeight: 320, overflow: "auto" }}>
              <strong>Preview (first 25 rows)</strong>
              <table style={{ width: "100%", fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>qualification_code</th>
                    <th style={{ textAlign: "left" }}>qualification_name</th>
                    <th style={{ textAlign: "left" }}>unit_code</th>
                    <th style={{ textAlign: "left" }}>unit_name</th>
                    <th style={{ textAlign: "left" }}>unit_type</th>
                    <th style={{ textAlign: "left" }}>group_label</th>
                    <th style={{ textAlign: "left" }}>rto_code</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 25).map((r, i) => (
                    <tr key={i}>
                      <td style={{ wordBreak: "break-all" }}>{r.qualification_code}</td>
                      <td style={{ wordBreak: "break-all" }}>{r.qualification_name}</td>
                      <td style={{ wordBreak: "break-all" }}>{r.unit_code}</td>
                      <td style={{ wordBreak: "break-all" }}>{r.unit_name}</td>
                      <td>{r.unit_type}</td>
                      <td>{r.group_label}</td>
                      <td>{r.rto_code}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {log.length > 0 && (
        <pre style={{ whiteSpace: "pre-wrap", maxHeight: 200, overflow: "auto" }}>
          {log.join("\n")}
        </pre>
      )}
    </div>
  );
}
