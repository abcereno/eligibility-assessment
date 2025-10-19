import { useMemo } from "react";

export default function MetaPickers({
  date, setDate, rtoId, setRtoId, rtos, dataset, rtoIndex,
  qualificationCode, onQualificationChange,
}) {
  const qualifications = useMemo(() => {
    if (!dataset || !rtoId) return [];
    
    // Get the map of qual codes to offer IDs for the selected RTO
    const rtoQualMap = rtoIndex.byRto.get(rtoId);
    if (!rtoQualMap) return [];

    // Create a unique list of qualifications for this RTO
    const qualList = [];
    rtoQualMap.forEach((offerId) => {
      const offer = dataset[offerId];
      if (offer) {
        qualList.push({
          offer_id: offer.offer_id,
          code: offer.code,
          name: offer.name,
        });
      }
    });

    return qualList.sort((a, b) => a.code.localeCompare(b.code));
  }, [dataset, rtoId, rtoIndex]);

  return (
    <div className="grid cols-2" style={{ alignItems: "end", gap: 12 }}>
      <div>
        <label className="label">Date of Assessment</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <div>
        <label className="label">Registered Training Organisation (RTO)</label>
        <select value={rtoId} onChange={(e) => setRtoId(e.target.value)}>
          <option value="">Select an RTO...</option>
          {(rtos || []).map((r) => (
            <option key={r.id} value={r.id}>
              {r.trading_name} {r.rto_code && `(${r.rto_code})`}
            </option>
          ))}
        </select>
      </div>

      <div className="full-width">
        <label className="label">Qualification</label>
        <select
          value={qualificationCode}
          onChange={(e) => onQualificationChange(e.target.value)}
          disabled={!rtoId}
        >
          <option value="">Select a qualification...</option>
          {/* **FIXED**: The key is now `q.offer_id`, which is always unique. */}
          {qualifications.map((q) => (
            <option key={q.offer_id} value={q.code}>
              {q.code} — {q.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}