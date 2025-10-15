import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate, useParams } from "react-router-dom";

export default function CreateOffer() {
  const { rtoId } = useParams();
  const nav = useNavigate();
  const [quals, setQuals] = useState([]);
  const [form, setForm] = useState({
    qualification_id: "",
    title: "",
    delivery_mode: "RPL",
    price_cents: "",
    status: "draft",
    is_public: false,
  });

  useEffect(() => {
    supabase.from("qualifications").select("id,code,name").order("code").then(({ data }) => setQuals(data || []));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      rto_id: rtoId,
      price_cents: form.price_cents ? Number(form.price_cents) : null,
    };
    const { data, error } = await supabase.from("rto_qualification_offers").insert(payload).select().single();
    if (!error && data) nav(`/offers/${data.id}`);
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">New Offer</h1>
      <form onSubmit={submit} className="card max-w-xl space-y-3">
        <div>
          <label>Qualification</label>
          <select value={form.qualification_id} onChange={e => setForm(f => ({ ...f, qualification_id: e.target.value }))} required>
            <option value="">Select…</option>
            {quals.map(q => <option key={q.id} value={q.id}>{q.code} — {q.name}</option>)}
          </select>
        </div>
        <div>
          <label>Title</label>
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Display title (optional)" />
        </div>
        <div className="grid" style={{gridTemplateColumns:"1fr 1fr"}}>
          <div>
            <label>Delivery mode</label>
            <input value={form.delivery_mode} onChange={e => setForm(f => ({ ...f, delivery_mode: e.target.value }))} />
          </div>
          <div>
            <label>Price (cents)</label>
            <input value={form.price_cents} onChange={e => setForm(f => ({ ...f, price_cents: e.target.value }))} type="number" min="0" />
          </div>
        </div>
        <div className="grid" style={{gridTemplateColumns:"1fr 1fr"}}>
          <div>
            <label>Status</label>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              <option>draft</option><option>published</option><option>archived</option>
            </select>
          </div>
          <div>
            <label>Public</label>
            <select value={form.is_public ? "1" : "0"} onChange={e => setForm(f => ({ ...f, is_public: e.target.value === "1" }))}>
              <option value="0">No</option>
              <option value="1">Yes</option>
            </select>
          </div>
        </div>
        <button className="btn" type="submit">Create Offer</button>
      </form>
    </div>
  );
}
