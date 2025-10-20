import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export function useQualificationsDataset() {
    const [dataset, setDataset] = useState(null);

    useEffect(() => {
        const fetchOffers = async () => {
            try {
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
                            units (id, code, name, description)
                        ),
                        offer_streams (
                            id,
                            name,
                            offer_variation_units (
                                units (id, code, name, description)
                            )
                        )
                    `)
                    .limit(10000);

                if (error) throw error;

                const formatted = {};
                for (const offer of data) {
                    if (!offer.qualifications) continue;

                    formatted[offer.id] = {
                        offer_id: offer.id,
                        code: offer.qualifications.code,
                        name: offer.qualifications.name,
                        rto_id: offer.rto_id,
                        units: offer.offer_units.map(ou => ({
                            id: ou.units.id,
                            code: ou.units.code,
                            name: ou.units.name,
                            desc: ou.units.description,
                            type: ou.unit_type,
                            group: ou.group_code,
                            application_details: ou.application_details,
                        })),
                        variations: offer.offer_streams.map(os => ({
                            id: os.id,
                            name: os.name,
                            units: os.offer_variation_units.map(ov_unit => {
                                const standardUnit = offer.offer_units.find(ou => ou.units.id === ov_unit.units.id);
                                return {
                                    ...ov_unit.units,
                                    type: standardUnit?.unit_type || 'elective',
                                    group: standardUnit?.group_code || null,
                                    application_details: standardUnit?.application_details || null,
                                };
                            })
                        }))
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