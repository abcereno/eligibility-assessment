// =============================================================
// File: src/refactor/hooks/useQualificationsDataset.js
// =============================================================
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export function useQualificationsDataset() {
  const [dataset, setDataset] = useState(null);

  useEffect(() => {
    async function run() {
      const { data: quals } = await supabase
        .from("qualifications")
        .select("id,code,name")
        .order("code");

      const qById = new Map((quals || []).map((q) => [q.id, q]));
      const ds = {};
      (quals || []).forEach((q) => (ds[q.code] = { code: q.code, name: q.name, units: [] }));

      const { data: qu } = await supabase
        .from("qualification_units")
        .select("qualification_id, unit_type, group_code, units:unit_id (code,name,description)");

      (qu || []).forEach((r) => {
        const qual = qById.get(r.qualification_id);
        if (!qual) return;
        const bucket = ds[qual.code];
        bucket.units.push({
          code: r.units.code,
          name: r.units.name,
          desc: r.units.description || "",
          type: r.unit_type,          // "core" | "elective" | ...
          group: r.group_code || "",
        });
      });

      // ---- NEW: stable sort by type rank then code ----
      const rank = (t) => {
        const k = String(t || "").toLowerCase();
        if (k === "core") return 0;
        if (k === "elective") return 1;
        return 2; // anything else
      };

      Object.values(ds).forEach((q) => {
        q.units = [...q.units].sort((a, b) => {
          const ra = rank(a.type);
          const rb = rank(b.type);
          if (ra !== rb) return ra - rb;

          // tie-breakers for readability
          // 1) group label present first
          const ga = (a.group || "");
          const gb = (b.group || "");
          if (ga && !gb) return -1;
          if (!ga && gb) return 1;

          // 2) code ascending (natural)
          return (a.code || "").localeCompare(b.code || "", undefined, {
            numeric: true,
            sensitivity: "base",
          });
        });
      });
      // -----------------------------------------------

      setDataset(ds);
    }
    run();
  }, []);

  return { dataset };
}
