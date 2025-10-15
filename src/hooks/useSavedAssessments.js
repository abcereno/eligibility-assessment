// =============================================================
// File: src/hooks/useSavedAssessments.js
// Handles LocalStorage list and database save option
// =============================================================
import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";

const LS_KEY_SAVED = "assessments";

export default function useSavedAssessments({ getPayload, onLoad }) {
  const [saved, setSaved] = useState([]);

  // Load saved list once from localStorage
  useEffect(() => {
    const list = JSON.parse(localStorage.getItem(LS_KEY_SAVED) || "[]");
    setSaved(list);
  }, []);

  // Save assessment locally
  const saveLocally = useCallback(() => {
    const newItem = getPayload();
    setSaved((prevList) => {
      const newList = [...prevList, newItem];
      localStorage.setItem(LS_KEY_SAVED, JSON.stringify(newList));
      return newList;
    });
  }, [getPayload]);

  // Delete saved assessment
  const deleteSaved = useCallback((idx) => {
    setSaved((prevList) => {
      const newList = prevList.filter((_, i) => i !== idx);
      localStorage.setItem(LS_KEY_SAVED, JSON.stringify(newList));
      return newList;
    });
  }, []);

  // Load saved assessment into the form
  const loadSavedIntoForm = useCallback((item) => {
    onLoad?.(item);
  }, [onLoad]);

  // Sync with Supabase
  const saveToDatabase = useCallback(async () => {
    const payload = getPayload();
    const { error } = await supabase.from("form_submissions_backup").insert(payload);
    if (error) throw new Error(error.message);
  }, [getPayload]);

  return { saved, saveLocally, deleteSaved, loadSavedIntoForm, saveToDatabase };
}
