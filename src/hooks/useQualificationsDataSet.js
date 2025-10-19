// =============================================================
// File: src/hooks/useQualificationsDataset.js
// Fetches and formats all qualification OFFERS from the database
// =============================================================
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export function useQualificationsDataset() {
 const [dataset, setDataset] = useState(null);

 useEffect(() => {
  const fetchOffers = async () => {
   try {
        // **MODIFIED**: Query is now based on the `offers` table.
    const { data, error } = await supabase
     .from("offers")
     .select(`
            id,
            rto_id,
            qualifications ( code, name ),
            offer_units (
              unit_type,
              group_code,
              application_details,
              units (code, name, description)
            )
     `)
          .limit(10000); 

    if (error) throw error;

        // Format the data into a structure keyed by the unique offer ID.
    const formatted = {};
    for (const offer of data) {
          if (!offer.qualifications) continue;

     formatted[offer.id] = {
            offer_id: offer.id,
      code: offer.qualifications.code,
      name: offer.qualifications.name,
      rto_id: offer.rto_id,
      units: offer.offer_units.map(ou => ({
       code: ou.units.code,
       name: ou.units.name,
       desc: ou.units.description,
       type: ou.unit_type,
       group: ou.group_code,
              application_details: ou.application_details,
      })),
     };
    }
    setDataset(formatted);
   } catch (err) {
    console.error("Error fetching offers dataset:", err);
   }
  };
  fetchOffers();
 }, []);

 return { dataset };
}