import React, { useEffect, useState, useCallback } from "react";
import Papa from 'papaparse'; // Import papaparse
import { supabase } from "../lib/supabase.js";

const LS_KEY = "rtoOfferBuilderPaste:last";

// Keep PREDEFINED_HEADERS and EMPTY_ROW as they are
const PREDEFINED_HEADERS = [ "Qualification Code", "qualification_variation", "Unit code", "Unit Description", "Put application details here", "Unit Type", "Cluster Info" ];
const EMPTY_ROW = { unit_code: "", unit_name: "", unit_description: "", application_details: "", unit_type: "core", group_label: "", qualification_variation: "", qualification_name: "" };

// Keep clean, norm, normCode, keyify as they are
const clean = (s) => String(s ?? "").replace(/^\uFEFF/, "").replace(/\u00A0/g, " ").trim();
const norm = (s) => (s || "").trim();
const normCode = (s) => norm(s).toUpperCase();
const keyify = (s) => clean(s).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

// Updated parseGrid function using PapaParse
function parseGrid(text) {
  if (!text) return { rows: [], inferred: {} };

  // Use PapaParse to parse the CSV text
  const result = Papa.parse(text.trim(), {
    header: false, // Treat first row as data for now
    skipEmptyLines: true,
    transform: (value) => clean(value) // Clean each cell value
  });

  if (!result.data || result.data.length === 0) {
    console.warn("PapaParse returned no data.");
    return { rows: [], inferred: {} };
  }

  // Expecting data rows directly (assuming no header row in pasted text, adjust if needed)
  const matrix = result.data;

  // Map predefined headers to expected object keys (same logic as before)
  const headerKeys = PREDEFINED_HEADERS.map(keyify);
  const mapping = headerKeys.map(k => {
      if (["qualification_code", "qual_code"].includes(k)) return "qualification_code";
      if (["qualification_name", "qual_name"].includes(k)) return "qualification_name";
      if (["qualification_variation", "variation"].includes(k)) return "qualification_variation";
      if (["unit_code", "code"].includes(k)) return "unit_code";
      // IMPORTANT: Map "Unit Description" header key to unit_name, "Put application details here" to application_details
      if (["unit_description", "desc"].includes(k)) return "unit_name"; // Renamed from unit_description in original header
      if (["put_application_details_here", "application_details", "details"].includes(k)) return "application_details"; // Maps correctly now
      if (["unit_type", "type"].includes(k)) return "unit_type";
      if (["group_label", "cluster_info", "group"].includes(k)) return "group_label";
      // Check for unit_name only if unit_description wasn't mapped
      if (["unit_name", "title"].includes(k) && !mapping.includes("unit_name")) return "unit_name";
      return null;
  });

  // Process rows using the mapping (same logic as before)
  const outRows = matrix.map(cols => {
   const obj = {};
   mapping.forEach((field, j) => {
    // Check if the column index exists in the parsed row
    if (field && cols[j] !== undefined && obj[field] === undefined) {
      obj[field] = cols[j]; // Already cleaned by PapaParse transform
    }
   });
   const ut = (obj.unit_type || "").toLowerCase();
   // Set default type to core if not specified or unrecognized, otherwise use parsed value
   obj.unit_type = (ut === 'core' || ut === 'elective') ? ut : 'core';
   // Add the application_details if it wasn't mapped directly (or keep existing)
   obj.application_details = obj.application_details || "";

   // Ensure unit_description is set (even if empty), potentially from application_details if needed
   // This assumes application_details IS the description if unit_description/unit_name wasn't explicitly mapped as unit_name
   obj.unit_description = obj.application_details; // Use application_details as description


   return { ...EMPTY_ROW, ...obj };
  }).filter(r => r.unit_code || r.unit_name); // Keep rows with at least a code or name

  const firstRowWithData = outRows.find(r => r.qualification_code) || {};
  return {
      rows: outRows,
      inferred: {
          qualification_code: firstRowWithData.qualification_code || "",
          qualification_name: firstRowWithData.qualification_name || "",
          qualification_variation: firstRowWithData.qualification_variation || ""
      }
  };
}

// The rest of the RtoOfferBuilder component
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
      const { rows: parsedRows, inferred } = parseGrid(text); // Uses the updated parseGrid
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
    // Use selected RTO ID or default to a known 'General Qualifications' RTO ID if available and none selected
    const generalRtoId = rtos.find(r => r.trading_name === "General Qualifications")?.id;
    const offerRtoId = rtoId.trim() ? rtoId : generalRtoId; // Fallback to General RTO ID

    if (!baseQualCode || !offerRtoId) {
        alert("Qualification Code and RTO (or default 'General Qualifications' RTO) are required.");
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
        // Step 1: Ensure core entities (Qualification, Offer, Units master list) exist
        const { data: qualData, error: qualError } = await supabase.from('qualifications').upsert({ code: baseQualCode, name: norm(qName) || baseQualCode }, { onConflict: 'code' }).select('id').single();
        if (qualError) throw new Error(`Qual upsert failed: ${qualError.message}`);
        const qualification_id = qualData.id;

        const { data: offerData, error: offerError } = await supabase.from('offers').upsert({ rto_id: offerRtoId, qualification_id }, { onConflict: 'rto_id,qualification_id' }).select('id').single();
        if (offerError) throw new Error(`Offer upsert failed: ${offerError.message}`);
        const offer_id = offerData.id;

        // --- Deduplicate units before upserting to the master 'units' table ---
        const uniqueUnitsMap = new Map();
        validRows.forEach(r => {
            const code = normCode(r.unit_code);
            if (!uniqueUnitsMap.has(code)) {
                uniqueUnitsMap.set(code, {
                    code: code,
                    name: norm(r.unit_name) || code,
                    // *** Use unit_description which now holds the correct description ***
                    description: norm(r.unit_description)
                });
            }
        });
        const unitsToUpsert = Array.from(uniqueUnitsMap.values());
        // --- End Deduplication ---


        if (unitsToUpsert.length > 0) {
            addLog(`Attempting to upsert ${unitsToUpsert.length} unique units to master list...`);
            const { error: unitError } = await supabase.from('units').upsert(unitsToUpsert, { onConflict: 'code' });
            if (unitError) throw new Error(`Master Unit upsert failed: ${unitError.message}`);
             addLog(`Successfully upserted unique units to master list.`);
        } else {
             addLog(`No unique units found in the provided data to upsert to master list.`);
        }

        // Fetch IDs for all units involved in this specific save operation
        const codesToFetch = validRows.map(r => normCode(r.unit_code)); // Use all codes from validRows
        if (codesToFetch.length === 0) {
             throw new Error("No valid unit codes were processed to fetch IDs.");
        }
        const { data: unitIdData, error: unitIdError } = await supabase.from('units').select('id, code').in('code', codesToFetch);
        if (unitIdError) throw new Error(`Fetching unit IDs failed: ${unitIdError.message}`);
         // Check if unitIdData is null or empty, indicating no units found
        if (!unitIdData || unitIdData.length === 0) {
            console.error("No unit IDs returned for codes:", codesToFetch);
            throw new Error(`Failed to fetch IDs for the provided unit codes. Ensure units exist in the master 'units' table.`);
        }
        const unitIdMap = new Map(unitIdData.map(u => [u.code, u.id]));

        // Step 2: Ensure ALL units from the CSV exist in offer_units with correct type,
        //         *** DEDUPLICATING based on unit_id for this specific offer ***
        const uniqueOfferUnitsMap = new Map(); // Use a Map for deduplication
        validRows.forEach(row => {
            const code = normCode(row.unit_code);
            const unit_id = unitIdMap.get(code);
            if (!unit_id) {
                addLog(`Warning: Could not find mapped ID for unit code ${code}. Skipping this unit for offer_units.`);
                console.warn(`Unit ID not found in map for code: ${code}. Check if it exists in the 'units' table.`);
                return; // Skip if ID wasn't found
            }
            // Use unit_id as the key to ensure uniqueness *for this offer*
            if (!uniqueOfferUnitsMap.has(unit_id)) {
                uniqueOfferUnitsMap.set(unit_id, { // Key is unit_id
                    offer_id,
                    unit_id: unit_id,
                    unit_type: row.unit_type || 'core', // Use type from first occurrence
                    group_code: norm(row.group_label) || null,
                    application_details: norm(row.application_details) || null, // Use the correct field
                });
            }
            // Optional: If you need to merge details from duplicates (e.g., take last type/group), add logic here
        });
        const allOfferUnitsToUpsert = Array.from(uniqueOfferUnitsMap.values()); // Convert Map values back to array
        // --- End Deduplication for offer_units ---


        if (allOfferUnitsToUpsert.length > 0) {
            addLog(`Upserting ${allOfferUnitsToUpsert.length} unique units into offer_units (Offer ID: ${offer_id}) with specific types...`);
            const { error } = await supabase.from('offer_units').upsert(allOfferUnitsToUpsert, { onConflict: 'offer_id,unit_id' });
            if (error) throw new Error(`Upserting units to offer_units failed: ${error.message}`);
            addLog(`Ensured ${allOfferUnitsToUpsert.length} unique units are correctly typed in the offer_units list.`);
        } else {
             addLog(`No valid units to upsert into offer_units for Offer ID: ${offer_id}.`);
        }


        // Step 3: Handle variation-specific linking (offer_variation_units)
        if (qVariation.trim()) {
            // --- VARIATION LOGIC ---
            const { data: streamData, error: streamError } = await supabase.from('offer_streams').upsert({ offer_id, name: qVariation.trim() }, { onConflict: 'offer_id,name' }).select('id').single();
            if (streamError) throw new Error(`Stream upsert failed: ${streamError.message}`);
            const stream_id = streamData.id;
            addLog(`Upserted variation/stream: ${qVariation.trim()} (Stream ID: ${stream_id})`);

            // Clear existing links for this specific stream first
            const { error: deleteError } = await supabase.from('offer_variation_units').delete().match({ stream_id });
            if (deleteError) throw new Error(`Failed to clear old variation units for Stream ID ${stream_id}: ${deleteError.message}`);
            addLog(`Cleared existing unit links for Stream ID: ${stream_id}.`);

            // Prepare links based on the units successfully processed for offer_units
            // CRITICAL: Filter `allOfferUnitsToUpsert` based on the codes PRESENT in the current variation's CSV rows (`validRows`)
const variationUnitsToLink = allOfferUnitsToUpsert.map(u => ({
        stream_id,
        unit_id: u.unit_id,
      }));


            if (variationUnitsToLink.length > 0) {
                 addLog(`Linking ${variationUnitsToLink.length} units to Stream ID: ${stream_id}...`);
                const { error: insertError } = await supabase.from('offer_variation_units').insert(variationUnitsToLink);
                // Note: No 'onConflict' needed here typically, as we just deleted.
                if (insertError) throw new Error(`Failed to link units to variation (Stream ID: ${stream_id}): ${insertError.message}`);
                addLog(`Successfully linked ${variationUnitsToLink.length} units to the variation.`);
            } else {
                 addLog(`No units to link for variation/stream: ${qVariation.trim()}.`);
            }
        } else {
            // Step 4: Clean up standard units if SAVING A STANDARD offer (no variation name)
             addLog(`Processing as standard offer (no variation specified). Cleaning up potentially obsolete units...`);
            // Fetch all unit IDs currently associated with ANY stream for this offer
            const { data: streamUnitIds, error: rpcError } = await supabase.rpc('get_all_stream_unit_ids_for_offer', { p_offer_id: offer_id });
            if (rpcError) throw new Error(`Could not fetch stream unit IDs: ${rpcError.message}`);
            const variationUnitIds = new Set((streamUnitIds || []).map(r => r.unit_id)); // Set of unit IDs used in any variation

            // Fetch all unit IDs currently in the main offer_units list for this offer
            const { data: allCurrentOfferUnits, error: fetchError } = await supabase.from('offer_units').select('unit_id').eq('offer_id', offer_id);
            if (fetchError) throw new Error(`Could not fetch current offer units: ${fetchError.message}`);

            // Determine which units are in the database (`allCurrentOfferUnits`) but NOT in the current CSV (`allOfferUnitsToUpsert`)
            // AND also NOT part of any variation (`variationUnitIds`). These are the ones safe to delete.
            const csvUnitIds = new Set(allOfferUnitsToUpsert.map(u => u.unit_id));
            const unitsToDelete = allCurrentOfferUnits
                .map(row => row.unit_id)
                .filter(unitId => !csvUnitIds.has(unitId) && !variationUnitIds.has(unitId)); // The crucial check

            if (unitsToDelete.length > 0) {
                 addLog(`Identified ${unitsToDelete.length} units in offer_units that are no longer in the standard list or any variation. Deleting...`);
                const { error: deleteError } = await supabase.from('offer_units').delete().eq('offer_id', offer_id).in('unit_id', unitsToDelete);
                if (deleteError) throw new Error(`Deleting obsolete standard units from offer_units failed: ${deleteError.message}`);
                addLog(`Removed ${unitsToDelete.length} obsolete standard units from offer_units.`);
            } else {
                 addLog(`No obsolete standard units found to remove from offer_units.`);
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


  const clearForm = () => {
    if (window.confirm("Clear form?")) {
      setRtoId(""); setQCode(""); setQName(""); setQVariation(""); setRows([EMPTY_ROW]);
      setLog([]); setPasteText(""); localStorage.removeItem(LS_KEY);
      addLog("Form cleared.");
    }
  };

  return (
    <div className="card" style={{ display: "grid", gap: 12 }}>
      <h3>Build Qualification Offer</h3>
      {/* RTO and Qualification Inputs remain the same */}
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
      {/* Paste Area remains the same */}
      <div className="card" style={{ display: "grid", gap: 8 }}>
         <div style={{ display: "flex", gap: 8 }}><button className="btn" onClick={pasteFromClipboard} disabled={isPasting}>{isPasting ? "Pasting..." : "📋 Paste Values"}</button></div>
         <textarea rows={8} placeholder="Paste CSV values here (no headers)..." value={pasteText} onChange={e => { setPasteText(e.target.value); persist({ pasteText: e.target.value }); }} onBlur={() => { if (pasteText?.trim()) applyPaste(pasteText); }} style={{ width: "100%", fontFamily: "monospace" }} />
      </div>
      {/* Row count display remains the same */}
      <div className="card"><p>{rows.filter(r => r.unit_code).length} valid unit row(s) ready.</p></div>
      {/* Buttons remain the same */}
      <div style={{ display: "flex", gap: 8 }}>
         <button className="btn" onClick={onSave} disabled={saving || !qCode || rows.filter(r => r.unit_code).length === 0}>{saving ? "Saving…" : "Save Offer"}</button>
         <button className="btn ghost" onClick={clearForm} disabled={saving}>Clear Form</button>
      </div>
      {/* Log display remains the same */}
      {log.length > 0 && <div className="card" style={{ background: "#fafafa" }}><strong>Log</strong><pre style={{ whiteSpace: "pre-wrap", maxHeight: 220, overflow: "auto", fontSize: '0.8em' }}>{log.join("\n")}</pre></div>}
    </div>
  );
}