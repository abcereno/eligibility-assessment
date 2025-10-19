// =============================================================
// File: src/hooks/useRtoQualificationIndex.js
// Creates an index of which RTOs have which qualifications/offers
// =============================================================
import { useMemo } from "react";

export function useRtoQualificationIndex({ dataset }) {
 const index = useMemo(() => {
  const byRto = new Map();
    // withoutRto is no longer relevant in the new structure but is kept for compatibility.
  const withoutRto = new Set(); 

  if (!dataset) return { byRto, withoutRto };

    // **MODIFIED**: The dataset is now a collection of offers.
  for (const offer of Object.values(dataset)) {
      if (!offer.rto_id || !offer.code) continue;

      if (!byRto.has(offer.rto_id)) {
        byRto.set(offer.rto_id, new Map());
      }
      // The inner map now stores the unique offer_id for each qualification code.
      byRto.get(offer.rto_id).set(offer.code, offer.offer_id);
  }

  return { byRto, withoutRto };
 }, [dataset]);

 return index;
}