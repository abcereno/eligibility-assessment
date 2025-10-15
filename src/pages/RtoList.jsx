import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Link } from "react-router-dom";

export default function RtoList() {
  const [rtos, setRtos] = useState([]);

  useEffect(() => {
    supabase.from("rtos").select("id, trading_name, rto_code, website").then(({ data, error }) => {
      if (!error) setRtos(data || []);
    });
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">RTOs</h1>
      {rtos.length === 0 ? <p>No RTOs yet.</p> : (
        <div className="grid">
          {rtos.map(r => (
            <div key={r.id} className="card">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{r.trading_name} {r.rto_code ? <span className="badge">RTO {r.rto_code}</span> : null}</div>
                  {r.website ? <div className="text-sm text-slate-600">{r.website}</div> : null}
                </div>
                <Link className="btn" to={`/rtos/${r.id}/offers`}>View Offers</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
