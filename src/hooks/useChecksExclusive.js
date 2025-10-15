// =============================================================
// File: src/refactor/hooks/useChecksExclusive.js
// Keeps three Sets in sync such that only one bucket can hold a unit code
// =============================================================
import { useMemo, useState } from "react";

export function useChecksExclusive(unitCount = 0) {
  const [checks, setChecks] = useState({
    evidence: new Set(),
    referee: new Set(),
    gap: new Set(),
  });

  const setExclusive = (which, code) => {
    setChecks((prev) => {
      const next = {
        evidence: new Set(prev.evidence),
        referee: new Set(prev.referee),
        gap: new Set(prev.gap),
      };
      next.evidence.delete(code);
      next.referee.delete(code);
      next.gap.delete(code);
      if (which) next[which].add(code);
      return next;
    });
  };

  const resetChecks = (incoming) => {
    if (!incoming) {
      setChecks({ evidence: new Set(), referee: new Set(), gap: new Set() });
      return;
    }
    setChecks({
      evidence: new Set(incoming.evidence || []),
      referee: new Set(incoming.referee || []),
      gap: new Set(incoming.gap || []),
    });
  };

  const pct = (n) => (unitCount > 0 ? Math.round((n / unitCount) * 100) : 0);
  const evidencePercent = useMemo(() => pct(checks.evidence.size), [checks.evidence, unitCount]);
  const refereePercent = useMemo(() => pct(checks.referee.size), [checks.referee, unitCount]);
  const gapPercent = useMemo(() => pct(checks.gap.size), [checks.gap, unitCount]);

  return { checks, setExclusive, resetChecks, evidencePercent, refereePercent, gapPercent };
}
