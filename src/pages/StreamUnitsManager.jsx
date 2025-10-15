import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { Link, useParams } from "react-router-dom";

// Read v_offer_stream_units for this offer_stream (gives ready-to-render list)
async function fetchStreamView(offerStreamId) {
  const { data, error } = await supabase
    .from("v_offer_stream_units")
    .select("*")
    .eq("offer_stream_id", offerStreamId);
  if (error) throw error;
  return data || [];
}

export default function StreamUnitsManager() {
  const { offerId, offerStreamId } = useParams();
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchStreamView(offerStreamId).then((data) => {
      setRows(data);
      if (data.length) {
        setMeta({
          qualification_code: data[0].qualification_code,
          stream_name: data[0].stream_name,
        });
      }
    });
  }, [offerStreamId]);

  const cores = useMemo(() => rows.filter(r => r.effective_type === "core"), [rows]);
  const electives = useMemo(() => rows.filter(r => r.effective_type === "elective"), [rows]);

  const toggleElective = async (unitCode) => {
    setSaving(true);
    // Need unit_id & offer_stream_id; we only have unit_code from the view.
    // Fetch unit_id by code:
    const { data: unit } = await supabase.from("units").select("id").eq("code", unitCode).single();
    if (!unit) { setSaving(false); return; }

    // Upsert into rto_offer_stream_units
    const current = electives.find(e => e.unit_code === unitCode);
    const newVal = !current.is_offered;
    const payload = { offer_stream_id: offerStreamId, unit_id: unit.id, is_offered: newVal };

    const { error } = await supabase
      .from("rto_offer_stream_units")
      .upsert(payload, { onConflict: "offer_stream_id,unit_id" });
    if (!error) {
      setRows(prev => prev.map(r => r.unit_code === unitCode ? { ...r, is_offered: newVal } : r));
    }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Stream — {meta?.stream_name || "…"}</h1>
            <div className="text-sm text-slate-600">{meta?.qualification_code}</div>
          </div>
          <Link className="btn ghost" to={`/offers/${offerId}`}>Back to Offer</Link>
        </div>
      </div>

      <div className="card">
        <h2 className="font-medium mb-2">Core units ({cores.length})</h2>
        <ul>{cores.map(u => <li key={u.unit_code} className="py-1"><span className="badge">Core</span> &nbsp; {u.unit_code} — {u.unit_name}</li>)}</ul>
      </div>

      <div className="card">
        <h2 className="font-medium mb-2">Electives ({electives.length})</h2>
        <ul>
          {electives.map(u => (
            <li key={u.unit_code} className="py-1 flex items-center justify-between">
              <div>
                {u.unit_code} — {u.unit_name}
                {u.group_code ? <> &nbsp;<span className="badge">Group {u.group_code}</span></> : null}
                {u.is_required_elective ? <> &nbsp;<span className="badge">Required</span></> : null}
              </div>
              <button className="btn secondary" disabled={saving} onClick={() => toggleElective(u.unit_code)}>
                {u.is_offered ? "Remove" : "Add"}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
