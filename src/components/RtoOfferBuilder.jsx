// =============================================================
// File: src/refactor/components/RtoOfferBuilderPaste.jsx
// =============================================================
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const LS_KEY = "rtoOfferBuilderPaste:last";

const EMPTY_ROW = {
  unit_code: "",
  unit_name: "",
  unit_description: "",
  unit_type: "core",
  group_label: "",
};

// We only *read* qualification_code from CSV; we ignore qualification_name for DB writes
const KNOWN_HEADERS = [
  "unit_code","unit_name","unit_description","unit_type","group_label",
  "qualification_code","qualification_name","rto_code"
];

const norm = (s) => (s || "").trim();
const normCode = (s) => norm(s).toUpperCase();

// Clean text (BOM, zero-width, LRM/RLM, bidi marks) and trim
const clean = (s) =>
  String(s ?? "")
    .replace(/^\uFEFF/, "")                 // BOM
    .replace(/[\u200B-\u200D\u2060]/g, "") // zero-width
    .replace(/[\u200E\u200F\u202A-\u202E]/g, "") // LRM/RLM & bidi
    .replace(/\u00A0/g, " ")               // NBSP → space
    .trim();

// Normalize header keys to a canonical form like "unit_code"
const keyify = (s) =>
  clean(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

// ---------- CSV (RFC4180-ish) ----------
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let i = 0;
  let inQuotes = false;

  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { rows.push(row); row = []; };

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; } // escaped quote
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }

    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ",") { pushField(); i++; continue; }
    if (ch === "\r") { if (text[i + 1] === "\n") i++; pushField(); pushRow(); i++; continue; }
    if (ch === "\n") { pushField(); pushRow(); i++; continue; }

    field += ch; i++;
  }
  pushField();
  if (row.length > 1 || (row.length === 1 && row[0].trim() !== "")) pushRow();

  return rows.filter(r => r.some(c => String(c).trim() !== ""));
}

// ---------- Grid parser (CSV only) ----------
function parseGrid(text) {
  if (!text) return { rows: [], inferred: {} };

  if (/\t/.test(text)) {
    throw new Error("It looks like you pasted tab-separated data. Please paste CSV (comma-separated).");
  }

  const matrix = parseCsv(text);
  if (!matrix.length) return { rows: [], inferred: {} };

  const headerCells = matrix[0].map(clean);
  const headerKeys  = headerCells.map(keyify);
  const headerish   = headerKeys.some(k => KNOWN_HEADERS.includes(k));

  // default positional mapping if no header row detected
  const positional = ["unit_code", "unit_name", "unit_description", "unit_type", "group_label"];

  let startIdx = 0;
  let mapping = positional;

  if (headerish) {
    const mapHeader = (k) => {
      if (k === "unit_code") return "unit_code";
      if (k === "unit_name") return "unit_name";
      if (k === "unit_description") return "unit_description";
      if (k === "unit_type") return "unit_type";
      if (k === "group_label") return "group_label";
      if (k === "rto_code") return "rto_code";
      if (k === "qualification_code") return "qualification_code";
      // NOTE: "qualification_name" intentionally ignored for DB writes
      return null;
    };
    mapping = headerKeys.map(mapHeader);
    startIdx = 1;

    // dev aid (header detection)
    try {
      console.groupCollapsed("%c[RTO Paste] header detect", "color:#6b7280");
      console.info("header cells:", headerCells);
      console.info("header keys :", headerKeys);
      console.info("mapping     :", mapping);
      console.groupEnd();
    } catch (err) { console.error("Logging error:", err); }
  } else {
    try {
      console.groupCollapsed("%c[RTO Paste] no header detected — using positional mapping", "color:#6b7280");
      console.info("positional mapping:", positional);
      console.groupEnd();
    } catch (err){console.error("Logging error:", err);}
  }

  const outRows = [];
  for (let i = startIdx; i < matrix.length; i++) {
    const cols = matrix[i];
    const obj = { ...EMPTY_ROW };
    for (let j = 0; j < cols.length; j++) {
      const field = mapping[j] || null;
      if (!field) continue;
      obj[field] = clean(cols[j]);
    }
    const ut = (obj.unit_type || "").toLowerCase();
    obj.unit_type = ut.includes("elective") ? "elective" : "core";

    if (obj.unit_code || obj.unit_name || obj.unit_description) outRows.push(obj);
  }

  // show what we parsed vs. raw matrix (first 10 to avoid noise)
  try {
    console.groupCollapsed("%c[RTO Paste] parseGrid result", "color:#2563eb");
    console.info("matrix rows:", matrix.length, "startIdx:", startIdx);
    console.table(matrix.slice(0, 10));
    console.info("outRows:", outRows.length);
    console.table(outRows.slice(0, 10));
    console.groupEnd();
  } catch (err) { console.error("Logging error:", err); }

  const inferred = {
    rto_code: outRows.find(r => r.rto_code)?.rto_code || "",
    qualification_code: outRows.find(r => r.qualification_code)?.qualification_code || "",
  };

  return { rows: outRows, inferred };
}

export default function RtoOfferBuilderPaste() {
  const [rtos, setRtos] = useState([]);
  const [rtoId, setRtoId] = useState("");

  const [qCode, setQCode] = useState("");
  const [qName, setQName] = useState("");

  const [rows, setRows] = useState([{ ...EMPTY_ROW }]);
  const [saving, setSaving] = useState(false);
  const [log, setLog] = useState([]);
  const [pasteText, setPasteText] = useState("");

  useEffect(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
      if (cached?.rtoId) setRtoId(cached.rtoId);
      if (cached?.qCode) setQCode(cached.qCode);
      if (cached?.qName) setQName(cached.qName);
      if (Array.isArray(cached?.rows) && cached.rows.length) setRows(cached.rows);
      if (Array.isArray(cached?.log)) setLog(cached.log);
      if (typeof cached?.pasteText === "string") setPasteText(cached.pasteText);
    } catch (err) { console.error("Logging error:", err); }
  }, []);

  const persist = (patch) => {
    try {
      const prev = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
      localStorage.setItem(LS_KEY, JSON.stringify({ ...prev, ...patch }));
    } catch (err) { console.error("Logging error:", err); }
  };

  const addLog = (msg) => {
    const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
    setLog((L) => { const next = [...L, line]; persist({ log: next }); return next; });
    try { console.log(line); } catch (err) { console.error("Logging error:", err); }
  };

  useEffect(() => {
    supabase
      .from("rtos")
      .select("id, trading_name, rto_code")
      .order("trading_name")
      .then(({ data }) => setRtos(data || []));
  }, []);

  const selectedRto = useMemo(() => rtos.find((r) => r.id === rtoId), [rtos, rtoId]);

  async function prefillQualificationName(code) {
    const codeUC = normCode(code);
    if (!codeUC) return;
    const { data } = await supabase
      .from("qualifications")
      .select("name")
      .eq("code", codeUC)
      .maybeSingle();
    if (data?.name) {
      setQName(data.name);
      persist({ qName: data.name });
      addLog(`Prefilled qualification name: ${data.name}`);
    }
  }
  async function maybePrefillQualificationName() {
    if (!normCode(qCode) || norm(qName)) return;
    await prefillQualificationName(qCode);
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      setPasteText(text); persist({ pasteText: text });
      try {
        console.groupCollapsed("%c[RTO Paste] from clipboard", "color:#16a34a");
        console.info("text length:", text.length);
        console.info("preview:", text.slice(0, 200).replace(/\n/g,"⏎"));
        console.groupEnd();
      } catch (err){console.error("Logging error:", err);}
      applyPaste(text);
    } catch {
      alert("Clipboard read blocked by browser. Paste into the area manually.");
    }
  }

  function applyPaste(text) {
    try {
      const parsed = parseGrid(text);
      let nextRows = parsed?.rows || [];
      if (!nextRows.length) { addLog("Nothing parsed from pasted CSV."); return; }

      if (parsed.inferred?.qualification_code && !norm(qCode)) {
        setQCode(parsed.inferred.qualification_code);
        persist({ qCode: parsed.inferred.qualification_code });
        if (!norm(qName)) prefillQualificationName(parsed.inferred.qualification_code);
      }

      nextRows = nextRows.map(r => ({
        unit_code: normCode(r.unit_code),
        unit_name: norm(r.unit_name),
        unit_description: norm(r.unit_description),
        unit_type: (r.unit_type || "core").toLowerCase() === "elective" ? "elective" : "core",
        group_label: norm(r.group_label),
      }));

      // log what will actually be set into state
      try {
        console.groupCollapsed("%c[RTO Paste] normalized rows", "color:#0ea5e9");
        console.info("count:", nextRows.length);
        console.table(nextRows.slice(0, 20));
        console.groupEnd();
      } catch (err){console.error("Logging error:", err);}

      setRows(nextRows);
      persist({ rows: nextRows });

      // quick debug: show first few unit_codes so we see if we parsed them
      addLog(`Pasted ${nextRows.length} row(s). First unit_codes: ${nextRows.slice(0,3).map(r=>r.unit_code||"(blank)").join(", ")}`);
    } catch (err) {
      alert(err.message || "Could not parse CSV. Please ensure it’s comma-separated (no tabs).");
    }
  }

  function onTableChange(idx, key, val) {
    const next = rows.map((r, i) => i === idx ? { ...r, [key]: val } : r);
    setRows(next); persist({ rows: next });
  }

  function removeRow(idx) {
    const next = rows.filter((_, i) => i !== idx);
    setRows(next.length ? next : [{ ...EMPTY_ROW }]);
    persist({ rows: next.length ? next : [{ ...EMPTY_ROW }] });
  }

  function clearGrid() {
    setRows([{ ...EMPTY_ROW }]);
    persist({ rows: [{ ...EMPTY_ROW }] });
  }

  function bulkFixes(action) {
    if (action === "uppercase_codes") {
      const next = rows.map(r => ({ ...r, unit_code: normCode(r.unit_code) }));
      setRows(next); persist({ rows: next }); return;
    }
    if (action === "set_core") {
      const next = rows.map(r => ({ ...r, unit_type: "core" }));
      setRows(next); persist({ rows: next }); return;
    }
    if (action === "set_elective") {
      const next = rows.map(r => ({ ...r, unit_type: "elective" }));
      setRows(next); persist({ rows: next }); return;
    }
    if (action === "drop_empty") {
      const next = rows.filter(r => norm(r.unit_code) || norm(r.unit_name) || norm(r.unit_description));
      setRows(next.length ? next : [{ ...EMPTY_ROW }]); persist({ rows: next }); return;
    }
  }

  function isValidRow(r) { return !!norm(r.unit_code); }

  async function onSave() {
    // RTO is optional now — we can save qualification + units without it
    const code = normCode(qCode);
    const name = norm(qName) || code;
    if (!code) return alert("Qualification code is required.");

    const validRows = rows.map(r => ({
      unit_code: normCode(r.unit_code),
      unit_name: norm(r.unit_name),
      unit_description: norm(r.unit_description),
      unit_type: (r.unit_type || "core").toLowerCase() === "elective" ? "elective" : "core",
      group_label: norm(r.group_label),
    })).filter(isValidRow);

    if (!validRows.length) {
      try {
        console.groupCollapsed("%c[RTO Paste] save blocked — no validRows", "color:#ef4444");
        console.info("rows in state:", rows.length);
        console.table(rows.slice(0, 30));
        console.groupEnd();
      } catch (err){console.error("Logging error:", err);}
      if (!confirm("No valid unit rows (unit_code missing). Continue and save only the qualification?")) {
        return;
      }
    }

    setSaving(true);
    addLog(`Saving: QUAL=${code}, rows=${validRows.length}${rtoId ? `, RTO=${selectedRto?.trading_name || rtoId}` : " (no RTO yet)"}`);
    try {
      console.groupCollapsed("%c[RTO Paste] saving payload", "color:#7c3aed");
      console.info("qualification:", { code, name });
      console.table(validRows.slice(0, 50));
      console.groupEnd();
    } catch (err){console.error("Logging error:", err);}

    try {
      // 1) upsert qualification
      let qualification_id = null;
      const { data: existingQ, error: qErr } = await supabase
        .from("qualifications")
        .select("id")
        .eq("code", code)
        .maybeSingle();
      if (qErr) throw qErr;

      if (!existingQ?.id) {
        const { data: qIns, error: qInsErr } = await supabase
          .from("qualifications")
          .insert({ code, name })
          .select("id")
          .single();
        if (qInsErr) throw qInsErr;
        qualification_id = qIns.id;
        addLog(`Inserted qualification ${code}`);
      } else {
        qualification_id = existingQ.id;
        if (name) await supabase.from("qualifications").update({ name }).eq("id", qualification_id);
        addLog(`Using existing qualification ${code}`);
      }

      // 2) upsert units
      let unitMap = new Map();
      if (validRows.length) {
        const codes = [...new Set(validRows.map(r => r.unit_code))];
        const { data: uSel, error: uSelErr } = await supabase
          .from("units")
          .select("id, code")
          .in("code", codes);
        if (uSelErr) throw uSelErr;
        unitMap = new Map((uSel || []).map(u => [u.code, u]));

        const missing = codes
          .filter(c => !unitMap.has(c))
          .map(c => {
            const src = validRows.find(r => r.unit_code === c);
            return { code: c, name: src?.unit_name || c, description: src?.unit_description || null };
          });

        if (missing.length) {
          const { data: uIns, error: uInsErr } = await supabase
            .from("units")
            .insert(missing)
            .select("id, code");
          if (uInsErr) throw uInsErr;
          (uIns || []).forEach(u => unitMap.set(u.code, u));
          addLog(`Inserted ${uIns?.length || 0} unit(s).`);
        } else {
          addLog("No new units to insert.");
        }
      }

      // 3) link qualification_units
      if (validRows.length) {
        const candidateLinks = [];
        const seen = new Set();
        for (const r of validRows) {
          const u = unitMap.get(r.unit_code);
          if (!u?.id) continue;
          const key = `${qualification_id}:${u.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          candidateLinks.push({
            qualification_id,
            unit_id: u.id,
            unit_type: r.unit_type,
            group_code: r.group_label || null,
          });
        }

        if (candidateLinks.length) {
          const { data: existingLinks, error: exErr } = await supabase
            .from("qualification_units")
            .select("qualification_id, unit_id")
            .eq("qualification_id", qualification_id);
          if (exErr) throw exErr;

          const exSet = new Set((existingLinks || []).map(x => `${x.qualification_id}:${x.unit_id}`));
          const toInsert = candidateLinks.filter(x => !exSet.has(`${x.qualification_id}:${x.unit_id}`));
          if (toInsert.length) {
            const { error: linkErr } = await supabase.from("qualification_units").insert(toInsert);
            if (linkErr) throw linkErr;
            addLog(`Linked ${toInsert.length} unit(s).`);
          } else {
            addLog("All unit links already existed.");
          }
        }
      }

      // 4) ensure rto_qualification_offers — only if an RTO is chosen
      if (rtoId) {
        const { data: exOffer, error: exOfferErr } = await supabase
          .from("rto_qualification_offers")
          .select("rto_id, qualification_id")
          .eq("rto_id", rtoId)
          .eq("qualification_id", qualification_id)
          .maybeSingle();
        if (exOfferErr) throw exOfferErr;

        if (!exOffer) {
          const { error: insOfferErr } = await supabase
            .from("rto_qualification_offers")
            .insert({ rto_id: rtoId, qualification_id, status: "draft", is_public: false });
          if (insOfferErr) throw insOfferErr;
          addLog("Created rto_qualification_offers (draft).");
        } else {
          addLog("Offer already exists (skipped).");
        }
      } else {
        addLog("Skipped creating offer: no RTO selected yet.");
      }

      addLog("✅ Saved successfully.");
      alert("Saved successfully!");
    } catch (e) {
      console.error(e);
      addLog("❌ Save failed: " + (e?.message || String(e)));
      alert("Save failed: " + (e?.message || String(e)));
    } finally {
      setSaving(false);
    }
  }

  const counts = useMemo(() => {
    const codes = new Set(rows.map(r => normCode(r.unit_code)).filter(Boolean));
    const core = rows.filter(r => (r.unit_type || "core") === "core").length;
    const elec = rows.length - core;
    return { rowCount: rows.length, codeCount: codes.size, core, elec };
  }, [rows]);

  // SAFER NORMALIZE (no CSV round-trip)
  function normalizeGrid() {
    if (!rows.length) return;
    const next = rows.map(r => ({
      unit_code: normCode(r.unit_code),
      unit_name: norm(r.unit_name),
      unit_description: norm(r.unit_description),
      unit_type: (r.unit_type || "core").toLowerCase() === "elective" ? "elective" : "core",
      group_label: norm(r.group_label),
    }));
    try {
      console.groupCollapsed("%c[RTO Paste] normalize (in-memory)", "color:#10b981");
      console.info("before:", rows.length);
      console.table(rows.slice(0, 10));
      console.info("after:", next.length);
      console.table(next.slice(0, 10));
      console.groupEnd();
    } catch (err){console.error("Logging error:", err);}
    setRows(next);
    persist({ rows: next });
  }

  return (
    <div className="card" style={{ display: "grid", gap: 12 }}>
      <h3 className="section-title">Build RTO Offer (Paste from Spreadsheet)</h3>

      {/* RTO + Qualification */}
      <div className="card" style={{ display: "grid", gap: 8 }}>
        <div>
          <label className="label">RTO</label>
          <select value={rtoId} onChange={(e) => { setRtoId(e.target.value); persist({ rtoId: e.target.value }); }}>
            <option value="">Select RTO…</option>
            {rtos.map((r) => (
              <option key={r.id} value={r.id}>
                {r.trading_name} {r.rto_code ? `(RTO ${r.rto_code})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 2fr" }}>
          <div>
            <label className="label">Qualification Code</label>
            <input
              type="text"
              value={qCode}
              onChange={(e) => { setQCode(e.target.value); persist({ qCode: e.target.value }); }}
              onBlur={maybePrefillQualificationName}
              placeholder="e.g., BSB30120"
            />
          </div>
          <div>
            <label className="label">Qualification Name</label>
            <input
              type="text"
              value={qName}
              onChange={(e) => { setQName(e.target.value); persist({ qName: e.target.value }); }}
              placeholder="e.g., Certificate III in Business"
            />
          </div>
        </div>
      </div>

      {/* Paste helpers */}
      <div className="card" style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn" type="button" onClick={pasteFromClipboard}>📋 Paste from clipboard</button>
          <button className="btn" type="button" onClick={() => applyPaste(pasteText)}>Apply paste</button>
          <button className="btn" type="button" onClick={() => { setPasteText(""); persist({ pasteText: "" }); }}>Clear paste box</button>
          <span className="muted">
            Tip: Paste <strong>CSV (comma-separated)</strong>. Columns:
            <code> unit_code, unit_name, unit_description, unit_type, group_label </code>.
            Optional headers we detect: <code>qualification_code</code>, <code>rto_code</code>.
            Quoted fields & multi-line descriptions are supported.
          </span>
        </div>
        <textarea
          rows={6}
          placeholder={`Paste CSV from Google Sheets/Excel...\n(Commas + quotes supported. Headers optional.)`}
          value={pasteText}
          onChange={(e) => { setPasteText(e.target.value); persist({ pasteText: e.target.value }); }}
          onBlur={() => { if (pasteText?.trim()) applyPaste(pasteText); }}   // auto-apply on blur
          style={{ width: "100%", fontFamily: "monospace" }}
        />
      </div>

      {/* Grid */}
      <div className="card" style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <strong>Rows:</strong> {counts.rowCount} &nbsp;|&nbsp;
            <strong>Unique Codes:</strong> {counts.codeCount} &nbsp;|&nbsp;
            <strong>Core:</strong> {counts.core} &nbsp;|&nbsp;
            <strong>Elective:</strong> {counts.elec}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" type="button" onClick={normalizeGrid}>Normalize</button>
            <button className="btn" type="button" onClick={() => bulkFixes("uppercase_codes")}>Uppercase codes</button>
            <button className="btn" type="button" onClick={() => bulkFixes("set_core")}>All core</button>
            <button className="btn" type="button" onClick={() => bulkFixes("set_elective")}>All elective</button>
            <button className="btn danger" type="button" onClick={clearGrid}>Clear table</button>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>unit_code</th>
                <th style={{ textAlign: "left" }}>unit_name</th>
                <th style={{ textAlign: "left" }}>unit_description</th>
                <th style={{ textAlign: "left" }}>unit_type</th>
                <th style={{ textAlign: "left" }}>group_label</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const invalid = !norm(r.unit_code);
                return (
                  <tr key={i} style={invalid ? { background: "#fff4f4" } : undefined}>
                    <td>
                      <input
                        value={r.unit_code}
                        onChange={(e) => onTableChange(i, "unit_code", e.target.value)}
                        placeholder="e.g., BSBWHS311"
                        style={{ width: 160 }}
                      />
                    </td>
                    <td>
                      <input
                        value={r.unit_name}
                        onChange={(e) => onTableChange(i, "unit_name", e.target.value)}
                        placeholder="Unit name"
                        style={{ width: 280 }}
                      />
                    </td>
                    <td>
                      <input
                        value={r.unit_description}
                        onChange={(e) => onTableChange(i, "unit_description", e.target.value)}
                        placeholder="(optional)"
                        style={{ width: 360 }}
                      />
                    </td>
                    <td>
                      <select
                        value={r.unit_type}
                        onChange={(e) => onTableChange(i, "unit_type", e.target.value)}
                      >
                        <option value="core">core</option>
                        <option value="elective">elective</option>
                      </select>
                    </td>
                    <td>
                      <input
                        value={r.group_label}
                        onChange={(e) => onTableChange(i, "group_label", e.target.value)}
                        placeholder="(optional)"
                        style={{ width: 160 }}
                      />
                    </td>
                    <td>
                      <button className="btn danger" type="button" onClick={() => removeRow(i)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="muted">No rows.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn" onClick={onSave} disabled={saving || !qCode}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {/* Context + Log */}
      {selectedRto ? (
        <div className="card" style={{ background: "#fafafa" }}>
          <strong>Selected RTO:</strong> {selectedRto.trading_name}
          {selectedRto.rto_code ? ` (RTO ${selectedRto.rto_code})` : ""}
        </div>
      ) : (
        <div className="card" style={{ background: "#fff9e6" }}>
          <strong>No RTO selected.</strong> You can save the qualification and units now,
          and link an RTO later to create an offer.
        </div>
      )}

      {log.length > 0 && (
        <div className="card" style={{ background: "#fafafa" }}>
          <strong>Log</strong>
          <pre style={{ whiteSpace: "pre-wrap", maxHeight: 220, overflow: "auto" }}>
            {log.join("\n")}
          </pre>
        </div>
      )}
    </div>
  );
}
