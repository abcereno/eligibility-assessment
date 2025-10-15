import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

// Helper to get canonical units (with IDs) and current overrides for this offer
async function fetchCanonicalAndOverrides(offerId, qualificationId) {
  const { data: qu, error: quErr } = await supabase
    .from("qualification_units")
    .select("unit_type, group_code, units:unit_id (id, code, name)")
    .eq("qualification_id", qualificationId);
  if (quErr) throw quErr;

  const { data: overrides, error: ovErr } = await supabase
    .from("rto_qualification_units")
    .select("unit_id, is_offered, is_core_override, group_code")
    .eq("offer_id", offerId);
  if (ovErr) throw ovErr;

  const oMap = new Map(overrides.map(o => [o.unit_id, o]));
  const rows = qu.map(r => {
    const ov = oMap.get(r.units.id);
    const isCore = r.unit_type === "core";
    // cores default true; electives default false unless override says true
    const effective = ov?.is_offered ?? (isCore ? true : false);
    return {
      unit_id: r.units.id,
      unit_code: r.units.code,
      unit_name: r.units.name,
      unit_type: r.unit_type,
      group_code: ov?.group_code ?? r.group_code ?? null,
      is_offered: effective,
      is_core_override: !!ov?.is_core_override,
      has_override: !!ov,
    };
  });

  rows.sort((a,b) => a.unit_type.localeCompare(b.unit_type) || a.unit_code.localeCompare(b.unit_code));
  return rows;
}

export default function OfferUnitsManager({ offerId, qualificationId }) {
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);

  const cores = useMemo(() => rows.filter(r => r.unit_type === "core"), [rows]);
  const electives = useMemo(() => rows.filter(r => r.unit_type === "elective"), [rows]);

  useEffect(() => {
    fetchCanonicalAndOverrides(offerId, qualificationId).then(setRows);
  }, [offerId, qualificationId]);

  const toggleElective = async (row) => {
    setSaving(true);
    const payload = {
      offer_id: offerId,
      unit_id: row.unit_id,
      is_offered: !row.is_offered,
    };
    const { error } = await supabase.from("rto_qualification_units").upsert(payload, { onConflict: "offer_id,unit_id" });
    if (!error) {
      setRows(prev => prev.map(r => r.unit_id === row.unit_id ? { ...r, is_offered: !r.is_offered, has_override: true } : r));
    }
    setSaving(false);
  };

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-3">Units (Core & Electives)</h2>
      <div className="grid" style={{gridTemplateColumns:"1fr 1fr"}}>
        <div>
          <h3 className="font-medium mb-2">Core ({cores.length})</h3>
          <ul>
            {cores.map(u => (
              <li key={u.unit_id} className="py-1">
                <span className="badge">Core</span> &nbsp; {u.unit_code} — {u.unit_name}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="font-medium mb-2">Electives ({electives.length})</h3>
          <ul>
            {electives.map(u => (
              <li key={u.unit_id} className="py-1 flex items-center justify-between">
                <div>{u.unit_code} — {u.unit_name} {u.group_code ? <span className="badge">Group {u.group_code}</span> : null}</div>
                <button className="btn secondary" disabled={saving} onClick={() => toggleElective(u)}>
                  {u.is_offered ? "Remove" : "Add"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
