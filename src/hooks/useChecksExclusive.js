import { useState, useCallback } from "react"; 

export function useChecksExclusive() { // No unitCount parameter
  const [checks, setChecks] = useState({
    evidence: new Set(),
    referee: new Set(),
    gap: new Set(),
  });

  const setExclusive = useCallback((which, code) => {
    setChecks((prev) => {
      const isAlreadySelected = which && prev[which]?.has(code);
      const next = {
        evidence: new Set(prev.evidence),
        referee: new Set(prev.referee),
        gap: new Set(prev.gap),
      };

      next.evidence.delete(code);
      next.referee.delete(code);
      next.gap.delete(code);

      if (which && !isAlreadySelected) {
        next[which].add(code);
      }
      return next;
    });
  }, []); 

  const resetChecks = useCallback((incoming) => { 
    if (!incoming) {
      setChecks({ evidence: new Set(), referee: new Set(), gap: new Set() });
      return;
    }
    setChecks({
      evidence: new Set(incoming.evidence || []),
      referee: new Set(incoming.referee || []),
      gap: new Set(incoming.gap || []),
    });
  }, []);

  // All percentage logic (pct, useMemo) is removed from this file.

  return { checks, setExclusive, resetChecks }; // Only return what the hook manages
}