// =============================================================
// File: src/hooks/useRtoQualificationIndex.js
// Build which qualifications belong to which RTO.
// Includes BOTH company-scoped (company_id = X) and global (company_id IS NULL) offers.
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

export function useRtoQualificationIndex({ dataset, companyId }) {
  const [byRto, setByRto] = useState(new Map());
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!dataset) {
      setByRto(new Map());
      return;
    }

    (async () => {
      try {
        // Pull all offers; we’ll filter in JS to include companyId OR NULL
        const { data: offers, error } = await supabase
          .from("rto_qualification_offers")
          .select("rto_id, qualification_id, company_id, status");
        if (error) throw error;

        // Keep global or company-scoped offers.
        // If you later want to restrict status, allow 'draft' too since importer sets draft.
        const relevant = (offers || []).filter(
          (o) => o.company_id === companyId || o.company_id == null
          // && (o.status === 'draft' || o.status === 'published') // optional
        );

        // Collect qualification IDs to fetch codes
        const qualIds = Array.from(new Set(relevant.map((o) => o.qualification_id).filter(Boolean)));
        if (qualIds.length === 0) {
          if (!cancelled) setByRto(new Map());
          return;
        }

        // Get codes for those quals
        const { data: quals, error: qErr } = await supabase
          .from("qualifications")
          .select("id, code")
          .in("id", qualIds);
        if (qErr) throw qErr;

        const codeById = new Map((quals || []).map((q) => [q.id, q.code]));

        // Build Map<rto_id, Set<qualification_code>>
        const map = new Map();
        for (const o of relevant) {
          const code = codeById.get(o.qualification_id);
          if (!code) continue;
          if (!map.has(o.rto_id)) map.set(o.rto_id, new Set());
          map.get(o.rto_id).add(code);
        }

        if (!cancelled) setByRto(map);
      } catch (e) {
        console.error(e);
        if (!cancelled) setErrorMsg(e.message || String(e));
        setByRto(new Map());
      }
    })();

    return () => { cancelled = true; };
  }, [dataset, companyId]);

  // quals that have no RTO offer at all → show when no RTO selected
  const withoutRto = useMemo(() => {
    if (!dataset) return new Set();
    const allCodes = new Set(Object.keys(dataset));
    for (const setOfCodes of byRto.values()) {
      for (const code of setOfCodes) allCodes.delete(code);
    }
    return allCodes;
  }, [dataset, byRto]);

  return { byRto, withoutRto, errorMsg };
}
