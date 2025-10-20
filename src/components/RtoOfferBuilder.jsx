import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase.js";

const LS_KEY = "rtoOfferBuilderPaste:last";

const PREDEFINED_HEADERS = [ "Qualification Code", "qualification_variation", "Unit code", "Unit Description", "Put application details here", "Unit Type", "Cluster Info" ];
const EMPTY_ROW = { unit_code: "", unit_name: "", unit_description: "", application_details: "", unit_type: "core", group_label: "", qualification_variation: "", qualification_name: "" };

const clean = (s) => String(s ?? "").replace(/^\uFEFF/, "").replace(/\u00A0/g, " ").trim();
const norm = (s) => (s || "").trim();
const normCode = (s) => norm(s).toUpperCase();
const keyify = (s) => clean(s).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

function parseCsv(text) {
 const rows = [];
 let row = [], field = "", i = 0, inQuotes = false;
 const pushField = () => { row.push(field); field = ""; };
 const pushRow = () => { rows.push(row); row = []; };
 while (i < text.length) {
  const ch = text[i];
  if (inQuotes) {
   if (ch === '"') {
    if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
    inQuotes = false; i++; continue;
   }
   field += ch; i++; continue;
  }
  if (ch === '"') { inQuotes = true; i++; continue; }
  if (ch === ",") { pushField(); i++; continue; }
  if (ch === "\r" || ch === "\n") { if (text[i + 1] === "\n" && ch === "\r") i++; pushField(); pushRow(); i++; continue; }
  field += ch; i++;
 }
 pushField();
 if (row.length > 1 || (row.length === 1 && row[0].trim() !== "")) pushRow();
 return rows.filter(r => r.some(c => String(c).trim() !== ""));
}

function parseGrid(text) {
  if (!text) return { rows: [], inferred: {} };
  const matrix = parseCsv(text);
    if (matrix.length === 0) return { rows: [], inferred: {} };
  const headerKeys = PREDEFINED_HEADERS.map(keyify);
  const mapping = headerKeys.map(k => {
      if (["qualification_code", "qual_code"].includes(k)) return "qualification_code";
      if (["qualification_name", "qual_name"].includes(k)) return "qualification_name";
      if (["qualification_variation", "variation"].includes(k)) return "qualification_variation";
      if (["unit_code", "code"].includes(k)) return "unit_code";
      if (["unit_description", "desc"].includes(k)) return "unit_name";
      if (["put_application_details_here", "application_details", "details"].includes(k)) return "application_details";
      if (["unit_type", "type"].includes(k)) return "unit_type";
      if (["group_label", "cluster_info", "group"].includes(k)) return "group_label";
      if (["unit_name", "title"].includes(k) && !headerKeys.includes("unit_description")) return "unit_name";
      return null;
  });
  const outRows = matrix.map(cols => {
   const obj = {};
   mapping.forEach((field, j) => {
    if (field && cols[j] !== undefined && obj[field] === undefined) obj[field] = clean(cols[j]);
   });
   const ut = (obj.unit_type || "").toLowerCase();
   obj.unit_type = ut.includes("elective") ? "elective" : "core";
   return { ...EMPTY_ROW, ...obj };
  }).filter(r => r.unit_code || r.unit_name);
  const firstRowWithData = outRows.find(r => r.qualification_code) || {};
  return { rows: outRows, inferred: { qualification_code: firstRowWithData.qualification_code || "", qualification_name: firstRowWithData.qualification_name || "", qualification_variation: firstRowWithData.qualification_variation || "" }};
}

export default function RtoOfferBuilder() {
 const [rtos, setRtos] = useState([]);
 const [rtoId, setRtoId] = useState("");
 const [qCode, setQCode] = useState("");
 const [qName, setQName] = useState("");
 const [qVariation, setQVariation] = useState("");
 const [rows, setRows] = useState([EMPTY_ROW]);
 const [saving, setSaving] = useState(false);
 const [log, setLog] = useState([]);
 const [pasteText, setPasteText] = useState("");
  const [isPasting, setIsPasting] = useState(false);

  const persist = useCallback((patch) => {
  try {
   const prev = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
   localStorage.setItem(LS_KEY, JSON.stringify({ ...prev, ...patch }));
  } catch (err) { console.error("Error persisting to localStorage:", err); }
 }, []);
 
 const addLog = useCallback((msg) => {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
  setLog(L => { const next = [...L, line]; persist({ log: next }); return next; });
  console.log(line);
 }, [persist]);

 useEffect(() => {
  try {
   const cached = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
   if (cached) {
    setRtoId(cached.rtoId || ""); setQCode(cached.qCode || ""); setQName(cached.qName || ""); setQVariation(cached.qVariation || "");
    setRows(Array.isArray(cached.rows) && cached.rows.length ? cached.rows : [EMPTY_ROW]);
    setLog(cached.log || []); setPasteText(cached.pasteText || "");
   }
  } catch (err) { console.error("Error loading from localStorage:", err); }
 }, []);

 useEffect(() => {
  supabase.from("rtos").select("id, trading_name, rto_code").order("trading_name").then(({ data }) => setRtos(data || []));
 }, []);

 const applyPaste = useCallback((text) => {
  try {
   const { rows: parsedRows, inferred } = parseGrid(text);
   if (!parsedRows.length) { addLog("⚠️ No valid data rows parsed."); return; }
   setRows(parsedRows); persist({ rows: parsedRows });
   addLog(`📋 Parsed ${parsedRows.length} unit rows.`);
   if (inferred.qualification_code && !qCode) {
    setQCode(inferred.qualification_code); persist({ qCode: inferred.qualification_code });
        addLog(`Inferred Qual Code: ${inferred.qualification_code}`);
   }
   if (inferred.qualification_name && !qName) {
    setQName(inferred.qualification_name); persist({ qName: inferred.qualification_name });
        addLog(`Inferred Qual Name: ${inferred.qualification_name}`);
   }
   if (inferred.qualification_variation && !qVariation) {
    setQVariation(inferred.qualification_variation); persist({ qVariation: inferred.qualification_variation });
        addLog(`Inferred Qual Variation: ${inferred.qualification_variation}`);
   }
  } catch (err) { alert(err.message); addLog(`❌ Parse Error: ${err.message}`); }
 }, [addLog, persist, qCode, qName, qVariation]);
 
 const pasteFromClipboard = useCallback(async () => {
    setIsPasting(true);
  try {
   const text = await navigator.clipboard.readText();
   if (text) { setPasteText(text); persist({ pasteText: text }); applyPaste(text); } 
      else { addLog("Clipboard is empty."); }
  } catch (err) { console.error(err); alert("Clipboard read failed."); } 
    finally { setIsPasting(false); }
 }, [persist, applyPaste, addLog]);

const onSave = async () => {
    const baseQualCode = normCode(qCode);
    const offerRtoId = rtoId.trim() ? rtoId : rtos.find(r => r.trading_name === "General Qualifications")?.id;
    if (!baseQualCode || !offerRtoId) {
        alert("Qualification Code and RTO are required.");
        return;
    }

    const validRows = rows.filter(r => norm(r.unit_code));
    if (validRows.length === 0) {
        alert("No rows with unit codes to save.");
        return;
    }

    setSaving(true);
    addLog(`🚀 Saving offer for RTO ${offerRtoId} and Qual ${baseQualCode}`);

    try {
        // Step 1: Ensure Qualification, Offer, and Units exist in master tables
        const { data: qualData, error: qualError } = await supabase.from('qualifications').upsert({ code: baseQualCode, name: norm(qName) || baseQualCode }, { onConflict: 'code' }).select('id').single();
        if (qualError) throw new Error(`Qual upsert failed: ${qualError.message}`);
        const qualification_id = qualData.id;

        const { data: offerData, error: offerError } = await supabase.from('offers').upsert({ rto_id: offerRtoId, qualification_id }, { onConflict: 'rto_id,qualification_id' }).select('id').single();
        if (offerError) throw new Error(`Offer upsert failed: ${offerError.message}`);
        const offer_id = offerData.id;

        const unitsToUpsert = validRows.map(r => ({ code: normCode(r.unit_code), name: norm(r.unit_name) || normCode(r.unit_code), description: norm(r.application_details) }));
        if (unitsToUpsert.length > 0) {
            const { error: unitError } = await supabase.from('units').upsert(unitsToUpsert, { onConflict: 'code' });
            if (unitError) throw new Error(`Unit upsert failed: ${unitError.message}`);
        }

        const { data: unitIdData, error: unitIdError } = await supabase.from('units').select('id, code').in('code', unitsToUpsert.map(u => u.code));
        if (unitIdError) throw new Error(`Fetching unit IDs failed: ${unitIdError.message}`);
        const unitIdMap = new Map(unitIdData.map(u => [u.code, u.id]));

        // Step 2: (CRITICAL) Upsert all units from the CSV into the main offer_units table.
        // This ensures the offer has a "master list" of all possible units with their details.
        const allOfferUnitsToUpsert = validRows.map(row => ({
            offer_id,
            unit_id: unitIdMap.get(normCode(row.unit_code)),
            unit_type: row.unit_type || 'core',
            group_code: norm(row.group_label) || null,
            application_details: norm(row.application_details) || null,
        })).filter(link => link.unit_id);

        if (allOfferUnitsToUpsert.length > 0) {
            const { error } = await supabase.from('offer_units').upsert(allOfferUnitsToUpsert, { onConflict: 'offer_id,unit_id' });
            if (error) throw new Error(`Upserting units to master offer list failed: ${error.message}`);
            addLog(`Ensured ${allOfferUnitsToUpsert.length} units are in the master offer list.`);
        }

        // Step 3: Handle the specific logic for a variation vs. a standard save
        if (qVariation.trim()) {
            // --- VARIATION LOGIC ---
            const { data: streamData, error: streamError } = await supabase.from('offer_streams').upsert({ offer_id, name: qVariation.trim() }, { onConflict: 'offer_id,name' }).select('id').single();
            if (streamError) throw new Error(`Stream upsert failed: ${streamError.message}`);
            const stream_id = streamData.id;
            addLog(`Upserted variation: ${qVariation.trim()}`);

            const { error: deleteError } = await supabase.from('offer_variation_units').delete().match({ stream_id });
            if (deleteError) throw new Error('Failed to clear old variation units.');

            const variationUnitsToLink = allOfferUnitsToUpsert.map(u => ({
                stream_id,
                unit_id: u.unit_id,
            }));

            if (variationUnitsToLink.length > 0) {
                const { error: insertError } = await supabase.from('offer_variation_units').insert(variationUnitsToLink);
                if (insertError) throw new Error('Failed to link units to variation.');
                addLog(`Linked ${variationUnitsToLink.length} units to the variation.`);
            }
        } else {
            // --- STANDARD LOGIC ---
            const { data: streamUnitIds, error: rpcError } = await supabase.rpc('get_all_stream_unit_ids_for_offer', { p_offer_id: offer_id });
            if (rpcError) throw new Error(`Could not fetch stream unit IDs: ${rpcError.message}`);
            const variationUnitIds = new Set((streamUnitIds || []).map(r => r.unit_id));

            const { data: allCurrentOfferUnits, error: fetchError } = await supabase.from('offer_units').select('unit_id').eq('offer_id', offer_id);
            if (fetchError) throw new Error(`Could not fetch current offer units: ${fetchError.message}`);
            
            const csvUnitIds = new Set(allOfferUnitsToUpsert.map(u => u.unit_id));
            const unitsToDelete = allCurrentOfferUnits
                .map(row => row.unit_id)
                .filter(unitId => !csvUnitIds.has(unitId) && !variationUnitIds.has(unitId));
                
            if (unitsToDelete.length > 0) {
                const { error: deleteError } = await supabase.from('offer_units').delete().eq('offer_id', offer_id).in('unit_id', unitsToDelete);
                if (deleteError) throw new Error(`Deleting old standard units failed: ${deleteError.message}`);
                addLog(`Removed ${unitsToDelete.length} obsolete standard units.`);
            }
        }

        addLog("✅ Save successful!");
        alert("Save successful!");

    } catch (error) {
        console.error("Save failed:", error);
        addLog(`❌ SAVE FAILED: ${error.message}`);
        alert(`An error occurred: ${error.message}`);
    } finally {
        setSaving(false);
    }
};
    
 // ... (keep the clearForm function and the JSX return statement as they were)
  const clearForm = () => {
    if(window.confirm("Clear form?")) {
      setRtoId(""); setQCode(""); setQName(""); setQVariation(""); setRows([EMPTY_ROW]);
      setLog([]); setPasteText(""); localStorage.removeItem(LS_KEY);
      addLog("Form cleared.");
    }
  };

 return (
  <div className="card" style={{ display: "grid", gap: 12 }}>
      <h3>Build Qualification Offer</h3>
   <div className="card" style={{ display: "grid", gap: 8 }}>
        <label className="label">RTO</label>
        <select value={rtoId} onChange={e => { setRtoId(e.target.value); persist({ rtoId: e.target.value }); }}>
          <option value="">Select an RTO (defaults to General)</option>
          {rtos.map(r => <option key={r.id} value={r.id}>{r.trading_name}</option>)}
        </select>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 2fr 1fr" }}>
          <div>
            <label className="label">Qualification Code*</label>
            <input type="text" value={qCode} onChange={e => { setQCode(e.target.value); persist({ qCode: e.target.value }); }} placeholder="e.g., AUR30320" required />
          </div>
          <div>
            <label className="label">Qualification Name</label>
            <input type="text" value={qName} onChange={e => { setQName(e.target.value); persist({ qName: e.target.value }); }} placeholder="Inferred from paste" />
          </div>
          <div>
            <label className="label">Variation / Stream</label>
            <input type="text" value={qVariation} onChange={e => { setQVariation(e.target.value); persist({ qVariation: e.target.value }); }} placeholder="e.g., Electrical" />
          </div>
        </div>
   </div>
   <div className="card" style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 8 }}><button className="btn" onClick={pasteFromClipboard} disabled={isPasting}>{isPasting ? "Pasting..." : "📋 Paste Values"}</button></div>
        <textarea rows={8} placeholder="Paste CSV values here (no headers)..." value={pasteText} onChange={e => { setPasteText(e.target.value); persist({ pasteText: e.target.value }); }} onBlur={() => { if (pasteText?.trim()) applyPaste(pasteText); }} style={{ width: "100%", fontFamily: "monospace" }} />
   </div>
      <div className="card"><p>{rows.filter(r => r.unit_code).length} valid unit row(s) ready.</p></div>
   <div style={{ display: "flex", gap: 8 }}>
        <button className="btn" onClick={onSave} disabled={saving || !qCode || rows.filter(r => r.unit_code).length === 0}>{saving ? "Saving…" : "Save Offer"}</button>
        <button className="btn ghost" onClick={clearForm} disabled={saving}>Clear Form</button>
   </div>
   {log.length > 0 && <div className="card" style={{ background: "#fafafa" }}><strong>Log</strong><pre style={{ whiteSpace: "pre-wrap", maxHeight: 220, overflow: "auto", fontSize: '0.8em' }}>{log.join("\n")}</pre></div>}
  </div>
 );
}