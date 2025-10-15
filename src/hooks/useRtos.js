// =============================================================
// File: src/refactor/hooks/useRtos.js
// =============================================================
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";


export function useRtos() {
  const [rtos, setRtos] = useState([]);
  useEffect(() => {
    supabase
      .from("rtos")
      .select("id,trading_name,rto_code")
      .order("trading_name")
      .then(({ data }) => setRtos(data || []));
  }, []);
  return { rtos };
}
