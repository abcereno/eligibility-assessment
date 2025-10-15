// supabase/functions/import-rto-csv/index.ts

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/** ========= CORS =========
 * Set env var ALLOWED_ORIGINS to a comma-separated list
 * e.g. "http://localhost:5173,https://yourapp.com"
 * If unset, defaults to "*" (dev-friendly).
 */
function pickOrigin(req: Request): string {
  const cfg = (Deno.env.get("ALLOWED_ORIGINS") || "*").trim();
  if (cfg === "*") return "*";
  const requestOrigin = req.headers.get("Origin") || "";
  const allow = cfg.split(",").map((s) => s.trim()).filter(Boolean);
  return allow.includes(requestOrigin) ? requestOrigin : "null";
}
function corsHeadersFor(req: Request) {
  const origin = pickOrigin(req);
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  } as Record<string, string>;
}

// ======= Minimal CSV parser (no quoted commas/newlines) =======
function parseCsvSimple(text: string) {
  const lines = text.replace(/\r\n/g, "\n").trim().split("\n");
  if (!lines.length) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw?.trim()) continue;
    const cols = raw.split(",").map((c) => c.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => (row[h] = cols[idx] ?? ""));
    rows.push(row);
  }
  return rows;
}

serve(async (req) => {
  const cors = corsHeadersFor(req);

  // --- Preflight FIRST ---
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 204, headers: cors });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "POST only" }), {
        status: 405,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Read body (tolerant)
    const body = await req.json().catch(() => ({}));
    const {
      bucket,
      path,
      companyId = null,
      dry_run = false, // optional safety switch to test parsing without writes
    } = body || {};

    if (!bucket || !path) {
      return new Response(
        JSON.stringify({ error: "bucket and path required" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // Admin client
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return new Response(
        JSON.stringify({
          error:
            "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (function env)",
        }),
        { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Download CSV
    const file = await admin.storage.from(bucket).download(path);
    if (!file) {
      return new Response(JSON.stringify({ error: "File not found" }), {
        status: 404,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const text = await file.text();

    // Parse & normalize
    const raw = parseCsvSimple(text);
    const rows = raw
      .map((r) => {
        const get = (k: string) => (r[k] ?? r[k.toLowerCase()] ?? "").toString();
        const qc = get("qualification_code") || r["Qualification Code"] || r["qualification code"] || "";
        const qn = (r["Extra Info for names"] ?? r["qualification_name"] ?? "") as string;
        const uc = get("unit_code") || r["Unit Code"] || "";
        const un = get("unit_name") || r["Unit Name"] || "";
        const ud = get("unit_description") || r["Unit Description"] || "";
        const ut = get("unit_type") || r["Unit Type"] || "";
        const gl = get("group_label") || r["Group Label"] || "";
        const rc = get("rto_code") || r["RTO Code"] || "";

        return {
          qualification_code: String(qc).trim(),
          qualification_name: String(qn ?? "").trim(),
          unit_code: String(uc).trim(),
          unit_name: String(un ?? "").trim(),
          unit_description: String(ud ?? "").trim(),
          unit_type: String(ut ?? "").trim(),
          group_label: String(gl ?? "").trim(),
          rto_code: String(rc ?? "").trim(),
        };
      })
      .filter((x) => x.qualification_code && x.unit_code);

    if (!rows.length) {
      return new Response(JSON.stringify({ ok: true, summary: { rows: 0 } }), {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Gather unique codes
    const qCodes = [...new Set(rows.map((r) => r.qualification_code))];
    const uCodes = [...new Set(rows.map((r) => r.unit_code))];
    const rtoCodes = [...new Set(rows.map((r) => r.rto_code).filter(Boolean))];

    if (dry_run) {
      // Short-circuit to let you verify parsing & headers from the browser
      return new Response(
        JSON.stringify({
          ok: true,
          dry_run: true,
          summary: {
            rows: rows.length,
            quals_seen: qCodes.length,
            units_seen: uCodes.length,
            rtos_seen: rtoCodes.length,
          },
        }),
        { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // ====== Writes ======
    // Upsert RTOs
    if (rtoCodes.length) {
      const { data: rtoExisting, error } = await admin
        .from("rtos")
        .select("id, rto_code")
        .in("rto_code", rtoCodes);
      if (error) throw new Error(`rtos select: ${error.message}`);

      const rtoByCode = new Map((rtoExisting ?? []).map((r) => [r.rto_code, r]));
      const rtoMissing = rtoCodes
        .filter((code) => !rtoByCode.has(code))
        .map((code) => ({ rto_code: code, trading_name: `RTO ${code}` }));
      if (rtoMissing.length) {
        const { error: insErr } = await admin.from("rtos").insert(rtoMissing);
        if (insErr) throw new Error(`rtos insert: ${insErr.message}`);
      }
    }

    // Upsert Qualifications
    if (qCodes.length) {
      const { data: qExisting, error } = await admin
        .from("qualifications")
        .select("id, code")
        .in("code", qCodes);
      if (error) throw new Error(`qualifications select: ${error.message}`);

      const qByCode0 = new Map((qExisting ?? []).map((q) => [q.code, q]));
      const qMissing = qCodes
        .filter((code) => !qByCode0.has(code))
        .map((code) => ({
          code,
          name: rows.find((r) => r.qualification_code === code)?.qualification_name || code,
        }));
      if (qMissing.length) {
        const { error: insErr } = await admin.from("qualifications").insert(qMissing);
        if (insErr) throw new Error(`qualifications insert: ${insErr.message}`);
      }
    }

    // Upsert Units
    if (uCodes.length) {
      const { data: uExisting, error } = await admin
        .from("units")
        .select("id, code")
        .in("code", uCodes);
      if (error) throw new Error(`units select: ${error.message}`);

      const uByCode0 = new Map((uExisting ?? []).map((u) => [u.code, u]));
      const uMissing = uCodes
        .filter((code) => !uByCode0.has(code))
        .map((code) => ({
          code,
          name: rows.find((r) => r.unit_code === code)?.unit_name || code,
          description: rows.find((r) => r.unit_code === code)?.unit_description || null,
        }));
      if (uMissing.length) {
        const { error: insErr } = await admin.from("units").insert(uMissing);
        if (insErr) throw new Error(`units insert: ${insErr.message}`);
      }
    }

    // Re-fetch IDs for linking
    const [{ data: q2, error: qErr2 }, { data: u2, error: uErr2 }] =
      await Promise.all([
        admin.from("qualifications").select("id, code").in("code", qCodes),
        admin.from("units").select("id, code").in("code", uCodes),
      ]);
    if (qErr2) throw new Error(`qualifications refetch: ${qErr2.message}`);
    if (uErr2) throw new Error(`units refetch: ${uErr2.message}`);

    const qByCode = new Map((q2 ?? []).map((q) => [q.code, q]));
    const uByCode = new Map((u2 ?? []).map((u) => [u.code, u]));

    // Link qualification_units (dedupe)
    const quRows: Array<{
      qualification_id: string;
      unit_id: string;
      unit_type: "core" | "elective";
      group_code: string | null;
    }> = [];
    const seen = new Set<string>();
    for (const r of rows) {
      const q = qByCode.get(r.qualification_code);
      const u = uByCode.get(r.unit_code);
      if (!q?.id || !u?.id) continue;
      const key = `${q.id}:${u.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      quRows.push({
        qualification_id: q.id,
        unit_id: u.id,
        unit_type: (r.unit_type || "").toLowerCase().includes("core")
          ? "core"
          : "elective",
        group_code: r.group_label || null,
      });
    }
    if (quRows.length) {
      const { data: existingLinks, error } = await admin
        .from("qualification_units")
        .select("qualification_id, unit_id")
        .in("qualification_id", quRows.map((x) => x.qualification_id));
      if (error) throw new Error(`qualification_units select: ${error.message}`);

      const existingSet = new Set(
        (existingLinks ?? []).map((x) => `${x.qualification_id}:${x.unit_id}`)
      );
      const toInsert = quRows.filter(
        (x) => !existingSet.has(`${x.qualification_id}:${x.unit_id}`)
      );
      if (toInsert.length) {
        const { error: insErr } = await admin
          .from("qualification_units")
          .insert(toInsert);
        if (insErr) throw new Error(`qualification_units insert: ${insErr.message}`);
      }
    }

    // Offers (rto_qualification_offers) — dedupe
    let offersInserted = 0;
    if (rtoCodes.length) {
      const { data: rtoRefetch, error: rtoErr } = await admin
        .from("rtos")
        .select("id, rto_code")
        .in("rto_code", rtoCodes);
      if (rtoErr) throw new Error(`rtos refetch: ${rtoErr.message}`);

      const rtoByCode2 = new Map((rtoRefetch ?? []).map((r) => [r.rto_code, r]));
      const pairs = new Set<string>();
      for (const r of rows) {
        if (!r.rto_code) continue;
        const rto = rtoByCode2.get(r.rto_code);
        const q = qByCode.get(r.qualification_code);
        if (!rto?.id || !q?.id) continue;
        pairs.add(`${rto.id}:${q.id}`);
      }

      if (pairs.size) {
        const candidates = Array.from(pairs).map((k) => {
          const [rto_id, qualification_id] = k.split(":");
          return {
            rto_id,
            qualification_id,
            company_id: companyId ?? null,
            status: "draft",
            is_public: false,
          };
        });

        const { data: exOffers, error: exErr } = await admin
          .from("rto_qualification_offers")
          .select("rto_id, qualification_id")
          .in("rto_id", candidates.map((p) => p.rto_id));
        if (exErr) throw new Error(`offers select: ${exErr.message}`);

        const exSet = new Set(
          (exOffers ?? []).map((x) => `${x.rto_id}:${x.qualification_id}`)
        );
        const toInsert = candidates.filter(
          (p) => !exSet.has(`${p.rto_id}:${p.qualification_id}`)
        );
        if (toInsert.length) {
          const { error: insErr } = await admin
            .from("rto_qualification_offers")
            .insert(toInsert);
          if (insErr) throw new Error(`offers insert: ${insErr.message}`);
          offersInserted = toInsert.length;
        }
      }
    }

    const summary = {
      rows: rows.length,
      rtos_seen: rtoCodes.length,
      quals_seen: qCodes.length,
      units_seen: uCodes.length,
      offers_inserted: offersInserted,
    };

    return new Response(JSON.stringify({ ok: true, summary }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("import-rto-csv error:", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
