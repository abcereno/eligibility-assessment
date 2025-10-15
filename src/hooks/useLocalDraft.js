// =============================================================
// File: src/refactor/hooks/useLocalDraft.js
// Autosaves to localStorage and loads once on mount
// =============================================================
import { useEffect, useRef } from "react";

const LS_KEY_DRAFT = "tc.form.v2";

export function useLocalDraft({ seed, onLoad }) {
  const loadedRef = useRef(false);

  // load once
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    const raw = localStorage.getItem(LS_KEY_DRAFT);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        onLoad?.(parsed);
      } catch (error) {
        console.error("Failed to parse localStorage draft:", error);
      }
    }
  }, [onLoad]);

  // autosave
  useEffect(() => {
    const payload = {
      date: seed.date,
      rtoId: seed.rtoId,
      qualificationCode: seed.qualificationCode,
      person: seed.person,
      notes: seed.notes,
      workHistory: seed.workHistory,
      callTranscript: seed.callTranscript,
      checks: {
        evidence: Array.from(seed.checks?.evidence || []),
        referee: Array.from(seed.checks?.referee || []),
        gap: Array.from(seed.checks?.gap || []),
      },
    };
    localStorage.setItem(LS_KEY_DRAFT, JSON.stringify(payload));
  }, [seed]);
}
