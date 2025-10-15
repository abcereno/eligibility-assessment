import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Link, useParams } from "react-router-dom";
import OfferUnitsManager from "../sections/OfferUnitsManager.jsx";
import OfferStreamsManager from "../sections/OfferStreamsManager.jsx";

export default function OfferEditor() {
  const { offerId } = useParams();
  const [offer, setOffer] = useState(null);
  const [qual, setQual] = useState(null);

  useEffect(() => {
    supabase.from("rto_qualification_offers")
      .select("id, title, status, rto_id, qualification_id, rtos:rto_id(trading_name,rto_code), qualifications:qualification_id(code,name)")
      .eq("id", offerId)
      .single()
      .then(({ data }) => {
        setOffer(data);
        setQual(data?.qualifications);
      });
  }, [offerId]);

  if (!offer) return <p>Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">{offer.title || qual?.name} <span className="badge">{offer.status}</span></h1>
            <div className="text-sm text-slate-600">{qual?.code} — {qual?.name}</div>
            <div className="text-sm text-slate-600">RTO: {offer.rtos?.trading_name} ({offer.rtos?.rto_code || "—"})</div>
          </div>
          <Link className="btn ghost" to={`/rtos/${offer.rto_id}/offers`}>Back to offers</Link>
        </div>
      </div>

      <OfferUnitsManager offerId={offer.id} qualificationId={offer.qualification_id} />

      <OfferStreamsManager offerId={offer.id} qualificationId={offer.qualification_id} />
    </div>
  );
}
