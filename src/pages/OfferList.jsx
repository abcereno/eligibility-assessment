import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Link, useParams } from "react-router-dom";

export default function OfferList() {
  const { rtoId } = useParams();
  const [offers, setOffers] = useState([]);
  const [rto, setRto] = useState(null);

  useEffect(() => {
    supabase.from("rtos").select("id,trading_name,rto_code").eq("id", rtoId).single().then(({ data }) => setRto(data));
    supabase.from("rto_qualification_offers")
      .select("id, title, status, qualifications:qualification_id (code, name)")
      .eq("rto_id", rtoId)
      .order("created_at", { ascending: false })
      .then(({ data }) => setOffers(data || []));
  }, [rtoId]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Offers — {rto ? `${rto.trading_name} (${rto.rto_code || "no code"})` : "…"}</h1>
        <Link className="btn" to={`/rtos/${rtoId}/offers/new`}>New Offer</Link>
      </div>

      {offers.length === 0 ? <p>No offers yet.</p> : (
        <table className="table">
          <thead><tr><th>Qualification</th><th>Title</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {offers.map(o => (
              <tr key={o.id}>
                <td>{o.qualifications?.code} — {o.qualifications?.name}</td>
                <td>{o.title || "—"}</td>
                <td><span className="badge">{o.status}</span></td>
                <td><Link className="btn secondary" to={`/offers/${o.id}`}>Manage</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
