import React, { useMemo, useState } from "react";
import Papa from "papaparse";
import { supabase } from "../lib/supabase";

const REQUIRED_COLS = ["qualification_code","qualification_name","unit_code","unit_name","unit_description","unit_type"];

const normaliseHeader = (h) =>
  String(h || "").trim().toLowerCase().replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,"")
    .replace(/extra_info_for_names/, "variations")
    .replace(/^variation$|^stream$|^streams$|^stream_names?$/, "stream_name")
    .replace(/^required$|^isrequired$/, "is_required");

const normaliseType = (t) => {
  const v = String(t || "").trim().toLowerCase();
  if (["core","c"].includes(v)) return "core";
  if (["elective","e"].includes(v)) return "elective";
  return null;
};
const toBool = (v) => /^(1|true|yes|y)$/i.test(String(v || "").trim());
const chunk = (arr, size = 500) => { const out=[]; for (let i=0;i<arr.length;i+=size) out.push(arr.slice(i,i+size)); return out; };

export default function CsvQualificationImporter() {
  const [rows, setRows] = useState([]);
  const [errors, setErrors] = useState([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [stats, setStats] = useState(null);

  const handleFile = (file) => {
    setParsing(true); setErrors([]); setRows([]); setStats(null);
    Papa.parse(file, {
      header: true, skipEmptyLines: "greedy", transformHeader: normaliseHeader,
      complete: (res) => {
        const parsed = (res.data || []).map((r, idx) => ({
          __row: idx + 2,
          qualification_code: (r.qualification_code || "").trim(),
          qualification_name: (r.qualification_name || "").trim(),
          variations: (r.variations || "").trim(),
          unit_code: (r.unit_code || "").trim(),
          unit_name: (r.unit_name || "").trim(),
          unit_description: (r.unit_description || "").trim(),
          unit_type: normaliseType(r.unit_type),
          group_label: (r.group_label || "").trim() || null,
          stream_name: (r.stream_name || "").trim(),
          is_required: toBool(r.is_required),
        }));
        const errs = [];
        parsed.forEach((r) => {
          for (const k of REQUIRED_COLS) if (!r[k]) errs.push(`Row ${r.__row}: Missing "${k}"`);
          if (!r.unit_type) errs.push(`Row ${r.__row}: unit_type must be Core or Elective`);
        });
        setRows(parsed); setErrors(errs); setParsing(false);
      },
      error: (err) => { setErrors([`Parse error: ${err.message || String(err)}`]); setParsing(false); },
    });
  };

  const summary = useMemo(() => {
    const qSet = new Map(); const uSet = new Map(); let cores=0, electives=0;
    rows.forEach(r => {
      if (r.qualification_code) qSet.set(r.qualification_code, r.qualification_name);
      if (r.unit_code) uSet.set(r.unit_code, true);
      if (r.unit_type === "core") cores++; if (r.unit_type === "elective") electives++;
    });
    return { rows: rows.length, quals: qSet.size, units: uSet.size, cores, electives };
  }, [rows]);

  const doImport = async () => {
    setImporting(true); setErrors([]); setStats(null);
    try {
      // 1) Upsert qualifications
      const qualMap = new Map(); // code -> row
      const qualPayload = [];
      const variationsByQual = new Map();
      for (const r of rows) {
        if (!qualMap.has(r.qualification_code)) {
          qualPayload.push({ code: r.qualification_code, name: r.qualification_name, training_package: r.qualification_code.slice(0,3), description: null });
          qualMap.set(r.qualification_code, null);
        }
        if (r.variations) {
          const set = variationsByQual.get(r.qualification_code) || new Set();
          r.variations.split(/[;|,]/g).map(s=>s.trim()).filter(Boolean).forEach(v => set.add(v));
          variationsByQual.set(r.qualification_code, set);
        }
      }
      for (const batch of chunk(qualPayload)) {
        const { data, error } = await supabase.from("qualifications").upsert(batch, { onConflict: "code" }).select();
        if (error) throw error; data.forEach(q => qualMap.set(q.code, q));
      }

      // 2) Upsert units
      const unitMap = new Map();
      const unitPayload = []; const dedupe = new Set();
      for (const r of rows) if (!dedupe.has(r.unit_code)) { dedupe.add(r.unit_code); unitPayload.push({ code: r.unit_code, name: r.unit_name, description: r.unit_description }); }
      for (const batch of chunk(unitPayload)) {
        const { data, error } = await supabase.from("units").upsert(batch, { onConflict: "code" }).select();
        if (error) throw error; data.forEach(u => unitMap.set(u.code, u));
      }

      // 3) Upsert qualification_units
      const quPayload = []; const seen = new Set();
      for (const r of rows) {
        const q = qualMap.get(r.qualification_code); const u = unitMap.get(r.unit_code);
        if (!q || !u) continue; const key = `${q.id}:${u.id}`; if (seen.has(key)) continue; seen.add(key);
        quPayload.push({ qualification_id: q.id, unit_id: u.id, unit_type: r.unit_type, group_code: r.group_label || null });
      }
      for (const batch of chunk(quPayload)) {
        const { error } = await supabase.from("qualification_units").upsert(batch, { onConflict: "qualification_id,unit_id" });
        if (error) throw error;
      }

      // 4) Create streams from 'variations'
      const streamIdxByQualId = new Map(); // qual_id -> Map(nameLower -> streamRow)
      let streamsCreated = 0;

      async function ensureIndex(qual) {
        if (streamIdxByQualId.has(qual.id)) return streamIdxByQualId.get(qual.id);
        const { data, error } = await supabase.from("qualification_streams").select("id,name").eq("qualification_id", qual.id);
        if (error) throw error;
        const m = new Map(); (data || []).forEach(s => m.set(s.name.trim().toLowerCase(), s));
        streamIdxByQualId.set(qual.id, m); return m;
      }

      for (const [qualCode, set] of variationsByQual.entries()) {
        const qual = qualMap.get(qualCode); if (!qual) continue;
        const idx = await ensureIndex(qual);
        const toInsert = Array.from(set).filter(v => !idx.has(v.trim().toLowerCase())).map(name => ({ qualification_id: qual.id, name }));
        if (toInsert.length) {
          const { data, error } = await supabase.from("qualification_streams").insert(toInsert).select();
          if (error) throw error;
          (data || []).forEach(s => idx.set(s.name.trim().toLowerCase(), s));
          streamsCreated += toInsert.length;
        }
      }

      // 5) Map electives to streams via 'stream_name'
      const streamUnits = [];
      for (const r of rows) {
        if (r.unit_type !== "elective" || !r.stream_name) continue;
        const q = qualMap.get(r.qualification_code); const u = unitMap.get(r.unit_code); if (!q || !u) continue;
        const idx = streamIdxByQualId.get(q.id) || (await (async()=>{ const i = await ensureIndex(q); return i; })());
        let targets = [];
        if (r.stream_name.toUpperCase() === "ALL") {
          targets = Array.from(idx.values());
        } else {
          const names = r.stream_name.split(/[;|,]/g).map(s=>s.trim()).filter(Boolean);
          const missing = names.filter(n => !idx.has(n.toLowerCase()));
          if (missing.length) {
            const { data, error } = await supabase.from("qualification_streams").insert(missing.map(name => ({ qualification_id: q.id, name }))).select();
            if (error) throw error;
            (data || []).forEach(s => idx.set(s.name.trim().toLowerCase(), s));
          }
          targets = names.map(n => idx.get(n.toLowerCase())).filter(Boolean);
        }
        targets.forEach(s => streamUnits.push({ stream_id: s.id, unit_id: u.id, group_code: r.group_label || null, is_required: !!r.is_required }));
      }
      for (const batch of chunk(streamUnits)) {
        const { error } = await supabase.from("qualification_stream_units").upsert(batch, { onConflict: "stream_id,unit_id" });
        if (error) throw error;
      }

      setStats({
        qualifications: qualMap.size,
        units: unitMap.size,
        mappings: quPayload.length,
        streamsCreated,
        streamUnitLinks: streamUnits.length,
      });
    } catch (e) {
      setErrors(prev => [...prev, `Import failed: ${e.message || String(e)}`]);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="card">
      <h2 className="text-xl font-semibold mb-2">CSV Import — Qualifications & Units</h2>
      <p className="text-sm text-slate-600 mb-3">
        Headers: <code>qualification_code, qualification_name, variations, unit_code, unit_name, unit_description, unit_type, group_label, stream_name, is_required</code>.
      </p>
      <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      {parsing && <p className="mt-3">Parsing…</p>}
      {!!errors.length && (
        <div className="mt-3 p-3 bg-red-50 text-red-700 rounded">
          <strong>Errors:</strong>
          <ul className="list-disc pl-5">{errors.map((er,i)=><li key={i}>{er}</li>)}</ul>
        </div>
      )}
      {!!rows.length && !errors.length && (
        <div className="mt-3 p-3 bg-gray-50 rounded">
          <div className="flex flex-wrap gap-4 text-sm">
            <span>Rows: <b>{summary.rows}</b></span>
            <span>Qualifications: <b>{summary.quals}</b></span>
            <span>Units: <b>{summary.units}</b></span>
            <span>Cores: <b>{summary.cores}</b></span>
            <span>Electives: <b>{summary.electives}</b></span>
          </div>
          <button className="btn mt-3" onClick={doImport} disabled={importing}>
            {importing ? "Importing…" : "Import to Supabase"}
          </button>
          {stats && (
            <div className="mt-3 text-sm">
              <b>Done.</b>
              <ul className="list-disc pl-5">
                <li>Qualifications upserted: {stats.qualifications}</li>
                <li>Units upserted: {stats.units}</li>
                <li>Qualification–Unit links: {stats.mappings}</li>
                <li>Streams created: {stats.streamsCreated}</li>
                <li>Stream–Unit links: {stats.streamUnitLinks}</li>
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
