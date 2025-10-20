import { useMemo } from "react";

export default function MetaPickers({
  date, setDate, rtoId, setRtoId, rtos, dataset, rtoIndex,
  qualificationCode, onQualificationChange, streamId, setStreamId, currentQual
}) {
  const qualifications = useMemo(() => {
    if (!dataset || !rtoId) return [];
    
    const rtoQualMap = rtoIndex.byRto.get(rtoId);
    if (!rtoQualMap) return [];

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

  const variations = useMemo(() => {
    return currentQual?.variations || [];
  }, [currentQual]);

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

      <div className={qualificationCode ? "" : "full-width"}>
        <label className="label">Qualification</label>
        <select
          value={qualificationCode}
          onChange={(e) => onQualificationChange(e.target.value)}
          disabled={!rtoId}
        >
          <option value="">Select a qualification...</option>
          {qualifications.map((q) => (
            <option key={q.offer_id} value={q.code}>
              {q.code} — {q.name}
            </option>
          ))}
        </select>
      </div>

      {qualificationCode && (
        <div>
          <label className="label">Variation</label>
          {variations.length > 0 ? (
            <select
              value={streamId}
              onChange={(e) => setStreamId(e.target.value)}
            >
              <option value="">Select a variation...</option>
              {variations.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          ) : (
            <input type="text" value="Standard" disabled />
          )}
        </div>
      )}
    </div>
  );
}