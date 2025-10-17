import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const LS_KEY = "rtoOfferBuilderPaste:last";

const EMPTY_ROW = {
  unit_code: "",
  unit_name: "",
  unit_description: "",
  application_details: "",
  unit_type: "core",
  group_label: "",
  qualification_variation: "",
  qualification_name: ""
};

// --- UTILITY FUNCTIONS ---
const clean = (s) => String(s ?? "").replace(/^\uFEFF/, "").replace(/\u00A0/g, " ").trim();
const norm = (s) => (s || "").trim();
const normCode = (s) => norm(s).toUpperCase();
const keyify = (s) => clean(s).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

// --- CSV PARSING LOGIC ---
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
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
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

function parseGrid(text) {
    if (!text) return { rows: [], inferred: {} };
    if (/\t/.test(text)) throw new Error("Tab-separated data detected. Please paste CSV data.");
  
    const matrix = parseCsv(text);
    if (matrix.length < 2) return { rows: [], inferred: {} };
  
    const headerKeys = matrix[0].map(keyify);
    
    const mapping = headerKeys.map(k => {
      if (["qualification_code"].includes(k)) return "qualification_code";
      if (["qualification_variation"].includes(k)) return "qualification_variation";
      if (["unit_code"].includes(k)) return "unit_code";
      if (["unit_description"].includes(k)) return "unit_name";
      if (["put_application_details_here"].includes(k)) return "application_details";
      if (["unit_name"].includes(k)) return "unit_name";
      if (["unit_type"].includes(k)) return "unit_type";
      if (["group_label", "cluster_info"].includes(k)) return "group_label";
      return null;
    });
  
    const outRows = matrix.slice(1).map(cols => {
      const obj = {};
      mapping.forEach((field, j) => {
        if (field && cols[j] !== undefined) {
          obj[field] = clean(cols[j]);
        }
      });
      
      const ut = (obj.unit_type || "").toLowerCase();
      obj.unit_type = ut.includes("elective") ? "elective" : "core";
  
      return { ...EMPTY_ROW, ...obj };
    }).filter(r => r.unit_code || r.unit_name);
  
    const firstRowWithData = outRows.find(r => r.qualification_code) || {};
    const inferred = {
      qualification_code: firstRowWithData.qualification_code || "",
      qualification_name: firstRowWithData.qualification_name || ""
    };
  
    return { rows: outRows, inferred };
}

// --- COMPONENT ---
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
      if (cached) {
        setRtoId(cached.rtoId || "");
        setQCode(cached.qCode || "");
        setQName(cached.qName || "");
        setRows(Array.isArray(cached.rows) && cached.rows.length ? cached.rows : [{ ...EMPTY_ROW }]);
        setLog(cached.log || []);
        setPasteText(cached.pasteText || "");
      }
    } catch (err) { console.error("Error loading from localStorage:", err); }
  }, []);

  const persist = (patch) => {
    try {
      const prev = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
      localStorage.setItem(LS_KEY, JSON.stringify({ ...prev, ...patch }));
    } catch (err) { console.error("Error persisting to localStorage:", err); }
  };
  
  const addLog = (msg) => {
    const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
    setLog((L) => { const next = [...L, line]; persist({ log: next }); return next; });
    console.log(line);
  };

  useEffect(() => {
    supabase.from("rtos").select("id, trading_name, rto_code").order("trading_name")
      .then(({ data }) => setRtos(data || []));
  }, []);

  async function applyPaste(text) {
    try {
      const { rows: parsedRows, inferred } = parseGrid(text);
      if (!parsedRows.length) {
        addLog("No valid data rows were parsed from the pasted text.");
        return;
      }
      
      setRows(parsedRows);
      persist({ rows: parsedRows });
      addLog(`Pasted and parsed ${parsedRows.length} rows.`);

      if (inferred.qualification_code && !qCode) {
        setQCode(inferred.qualification_code);
        persist({ qCode: inferred.qualification_code });
      }
      if (inferred.qualification_name && !qName) {
        setQName(inferred.qualification_name);
        persist({ qName: inferred.qualification_name });
      }

    } catch (err) {
      alert(err.message);
      addLog(`Error parsing pasted text: ${err.message}`);
    }
  }
  
  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setPasteText(text);
        persist({ pasteText: text });
        applyPaste(text);
      }
    } catch {
      alert("Clipboard read failed. Please paste the content into the text area manually.");
    }
  }

  const onSave = async () => {
    const baseQualCode = normCode(qCode);
    if (!baseQualCode) {
        alert("Qualification Code is required.");
        return;
    }

    const baseQualName = norm(qName) || baseQualCode;
    const validRows = rows.filter(r => norm(r.unit_code));

    if (validRows.length === 0) {
        alert("No valid rows with unit codes to save.");
        return;
    }

    setSaving(true);
    addLog(`Starting save for qualification: ${baseQualCode}`);

    try {
        const { data: qualData, error: qualError } = await supabase
            .from('qualifications')
            .upsert({ code: baseQualCode, name: baseQualName }, { onConflict: 'code' })
            .select('id')
            .single();
        if (qualError) throw qualError;
        const qualification_id = qualData.id;
        addLog(`Upserted qualification '${baseQualCode}'.`);

        // **MODIFIED LOGIC**: Only create an offer if an RTO is selected
        if (rtoId) {
            const { error: offerError } = await supabase
                .from('rto_qualification_offers')
                .upsert({ rto_id: rtoId, qualification_id: qualification_id }, { onConflict: 'rto_id,qualification_id' });
            if (offerError) throw offerError;
            addLog(`Upserted RTO offer for qualification.`);
        } else {
            addLog(`No RTO selected. Skipping offer creation.`);
        }

        const unitsToUpsert = validRows.map(r => ({
            code: normCode(r.unit_code),
            name: norm(r.unit_name) || normCode(r.unit_code),
            description: norm(r.application_details)
        }));
        const uniqueUnits = Array.from(new Map(unitsToUpsert.map(u => [u.code, u])).values());
        
        if (uniqueUnits.length > 0) {
            const { error: unitError } = await supabase.from('units').upsert(uniqueUnits, { onConflict: 'code' });
            if (unitError) throw unitError;
            addLog(`Upserted ${uniqueUnits.length} unique units.`);
        }
        
        const { data: unitIdData, error: unitIdError } = await supabase.from('units').select('id, code').in('code', uniqueUnits.map(u => u.code));
        if (unitIdError) throw unitIdError;
        const unitIdMap = new Map(unitIdData.map(u => [u.code, u.id]));

        const qualUnitsToLink = Array.from(new Set(validRows.map(r => normCode(r.unit_code)))).map(unitCode => {
            const row = validRows.find(r => normCode(r.unit_code) === unitCode);
            return {
                qualification_id,
                unit_id: unitIdMap.get(unitCode),
                unit_type: row?.unit_type || 'core',
                group_code: norm(row?.group_label) || null,
                application_details: norm(row?.application_details) || null
            };
        }).filter(link => link.unit_id);
        
        if(qualUnitsToLink.length > 0) {
            const { error: qualUnitError } = await supabase.from('qualification_units').upsert(qualUnitsToLink, { onConflict: 'qualification_id,unit_id' });
            if (qualUnitError) throw qualUnitError;
            addLog(`Linked ${qualUnitsToLink.length} units to base qualification with application details.`);
        }

        const variations = new Map();
        validRows.forEach(r => {
            const variationName = norm(r.qualification_variation);
            const unitCode = normCode(r.unit_code);
            if(variationName && unitCode) {
                if(!variations.has(variationName)) variations.set(variationName, []);
                variations.get(variationName).push(unitCode);
            }
        });

        if (variations.size > 0) {
            const streamsToUpsert = Array.from(variations.keys()).map(name => ({ qualification_id, name }));
            const { data: streamData, error: streamError } = await supabase.from('qualification_streams').upsert(streamsToUpsert, { onConflict: 'qualification_id,name' }).select('id, name');
            if (streamError) throw streamError;
            addLog(`Upserted ${streamData.length} qualification streams (variations).`);
            const streamIdMap = new Map(streamData.map(s => [s.name, s.id]));

            const streamUnitsToLink = [];
            variations.forEach((unitCodes, streamName) => {
                const stream_id = streamIdMap.get(streamName);
                if (stream_id) {
                    unitCodes.forEach(unitCode => {
                        const unit_id = unitIdMap.get(unitCode);
                        if(unit_id) {
                            streamUnitsToLink.push({ stream_id, unit_id });
                        }
                    });
                }
            });

            if (streamUnitsToLink.length > 0) {
                const { error: streamUnitError } = await supabase.from('qualification_stream_units').upsert(streamUnitsToLink, { onConflict: 'stream_id,unit_id' });
                if (streamUnitError) throw streamUnitError;
                addLog(`Linked ${streamUnitsToLink.length} units to streams.`);
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

  const saveButtonText = rtoId ? "Save Offer & Variations" : "Save Qualification";

  return (
    <div className="card" style={{ display: "grid", gap: 12 }}>
      <h3 className="section-title">Build Qualification or Offer (Paste from Spreadsheet)</h3>

      <div className="card" style={{ display: "grid", gap: 8 }}>
        <div>
            <label className="label">RTO (Optional)</label>
            <select value={rtoId} onChange={(e) => { setRtoId(e.target.value); persist({ rtoId: e.target.value }); }}>
                <option value="">Select an RTO to create a specific offer...</option>
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
            <input type="text" value={qCode} onChange={(e) => { setQCode(e.target.value); persist({ qCode: e.target.value }); }} placeholder="e.g., AUR30320" />
          </div>
          <div>
            <label className="label">Qualification Name (Fallback)</label>
            <input type="text" value={qName} onChange={(e) => { setQName(e.target.value); persist({ qName: e.target.value }); }} placeholder="Name from CSV will be used if present" />
          </div>
        </div>
      </div>

      <div className="card" style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button className="btn" type="button" onClick={pasteFromClipboard}>📋 Paste from clipboard</button>
            <span className="muted">CSV Headers should include: Qualification Code, qualification_variation, Unit code, Unit Name, Put application details here, Unit Type</span>
        </div>
        <textarea
            rows={8}
            placeholder="Paste CSV content here..."
            value={pasteText}
            onChange={(e) => { setPasteText(e.target.value); persist({ pasteText: e.target.value }); }}
            onBlur={() => { if (pasteText?.trim()) applyPaste(pasteText); }}
            style={{ width: "100%", fontFamily: "monospace" }}
        />
      </div>

       <div className="card" style={{ display: "grid", gap: 8 }}>
        <p>{rows.length} row(s) ready to be saved.</p>
       </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn" onClick={onSave} disabled={saving || !qCode || rows.length < 2}>
          {saving ? "Saving…" : saveButtonText}
        </button>
      </div>

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