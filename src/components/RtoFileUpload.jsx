// =============================================================
// File: src/refactor/components/RtoFileUpload.jsx
// Upload a file to "rto-files" and (if CSV) auto-import via Edge Function.
// With on-screen logs + persistence so you can see the log before/after refresh.
// =============================================================
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";

const BUCKET = "rto-files";
const LS_KEY = "rtoFileUpload:last";

export default function RtoFileUpload() {
  const [rtos, setRtos] = useState([]);
  const [rtoId, setRtoId] = useState("");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  // New: log + import summary + CSV head preview
  const [log, setLog] = useState([]);
  const [importSummary, setImportSummary] = useState(null);
  const [csvPreview, setCsvPreview] = useState(null);
  const [showLog, setShowLog] = useState(true);

  // Rehydrate last run (so logs are visible even after refresh/navigation)
  useEffect(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
      if (Array.isArray(cached.log)) setLog(cached.log);
      if (cached.importSummary) setImportSummary(cached.importSummary);
      if (cached.csvPreview) setCsvPreview(cached.csvPreview);
      // expose to DevTools
      window.__rtoUpload = cached;
      if (Object.keys(cached).length) {
        console.info("window.__rtoUpload restored from localStorage");
      }
    } catch (error) {
      console.error(error);
    }
  }, []);

  const persist = (patch) => {
    try {
      const prev = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
      const next = { ...prev, ...patch };
      localStorage.setItem(LS_KEY, JSON.stringify(next));
      window.__rtoUpload = next;
    } catch (error) {
      console.error(error);
    }
  };

  const addLog = (msg) => {
    const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
    setLog((L) => {
      const next = [...L, line];
      persist({ log: next });
      return next;
    });
    try {
      console.log(line);
    } catch (error) {
      console.error(error);
    }
  };

  // Load RTOs
  useEffect(() => {
    supabase
      .from("rtos")
      .select("id, trading_name, rto_code")
      .order("trading_name")
      .then(({ data, error }) => {
        if (!error) setRtos(data || []);
      });
  }, []);

  const selectedRto = useMemo(
    () => rtos.find((r) => r.id === rtoId),
    [rtos, rtoId]
  );

  const fetchFiles = useCallback(async () => {
    if (!rtoId) return setFiles([]);
    setLoadingFiles(true);
    const { data, error } = await supabase
      .from("rto_files")
      .select("id, path, original_name, mime_type, size_bytes, created_at")
      .eq("rto_id", rtoId)
      .order("created_at", { ascending: false });

    if (!error) setFiles(data || []);
    setLoadingFiles(false);
  }, [rtoId]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // 🔹 Call the Edge Function to import CSV content (uses supabase.functions.invoke)
  async function runImportCsv({ bucket, path, companyId = null }) {
    addLog(`Posting to edge via invoke: import-rto-csv (bucket=${bucket}, path=${path})`);

    // supabase-js sends Authorization + apikey automatically for invoke()
    const { data, error } = await supabase.functions.invoke("import-rto-csv", {
      body: { bucket, path, companyId },
    });

    if (error) {
      // Useful diagnostics for CORS/preflight issues
      addLog(`Edge error: ${error.message || "Unknown error"}`);
      throw new Error(error.message || "Import failed");
    }
    return data;
  }

  // Helper: Capture small CSV preview (first ~100 lines) before upload/import
  async function snapshotCsvPreviewIfNeeded(f) {
    try {
      const isCsv = (f.type || "").includes("csv") || /\.csv$/i.test(f.name);
      if (!isCsv) {
        setCsvPreview(null);
        persist({ csvPreview: null });
        return;
      }
      const text = await f.text(); // beware of very large files; slice
      const lines = text.split(/\r?\n/).slice(0, 100);
      const preview = { name: f.name, firstLines: lines };
      setCsvPreview(preview);
      persist({ csvPreview: preview });
      console.groupCollapsed(`📄 CSV preview (${f.name}) — first ${lines.length} line(s)`);
      console.log(lines.join("\n"));
      console.groupEnd();
    } catch (e) {
      addLog(`(non-fatal) CSV preview failed: ${e.message}`);
    }
  }

  // 🔹 Handle file upload
  async function onUpload() {
    if (!rtoId) {
      alert("Select an RTO first");
      return;
    }
    if (!file) {
      alert("Choose a file to upload");
      return;
    }
    if (file.size === 0) {
      alert("File is empty");
      return;
    }

    setUploading(true);
    addLog(`Begin upload: "${file.name}" (${file.type || "unknown"}, ${file.size} bytes)`);
    try {
      await snapshotCsvPreviewIfNeeded(file);

      const safeName = file.name.replaceAll(" ", "_").replace(/[^\w.-]/g, "_");
      const path = `${rtoId}/${Date.now()}_${safeName}`;
      const bucket = BUCKET;

      // 1️⃣ Upload to Storage
      addLog(`Uploading to storage: ${bucket}/${path}`);
      const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(path, file, {
          upsert: false,
          cacheControl: "3600",
          contentType: file.type || "application/octet-stream",
        });

      if (upErr) {
        console.error("Storage upload error:", upErr);
        addLog(`Storage upload error: ${upErr.message || upErr}`);
        const msg = String(upErr.message || "").toLowerCase();
        if (msg.includes("exists") || msg.includes("duplicate")) {
          alert("File already exists at that path. Please try again.");
        } else if (msg.includes("row-level security")) {
          alert("Storage RLS blocked the upload. Ensure anon INSERT policy exists for bucket 'rto-files'.");
        } else if (msg.includes("bucket not found")) {
          alert("Bucket 'rto-files' not found. Create it or update BUCKET constant.");
        } else {
          alert("Upload failed (storage): " + upErr.message);
        }
        return;
      }
      addLog("Storage upload: ✅ success");

      // 2️⃣ Insert metadata row
      addLog("Inserting DB metadata row (rto_files)...");
      const { data: insertedRow, error: dbErr } = await supabase
        .from("rto_files")
        .insert({
          rto_id: rtoId,
          path,
          original_name: file.name,
          mime_type: file.type || null,
          size_bytes: file.size || null,
        })
        .select("*")
        .single();

      if (dbErr) {
        console.error("DB insert error:", dbErr);
        addLog(`DB insert error: ${dbErr.message}`);
        alert("Upload succeeded but DB insert failed: " + dbErr.message);
        return;
      }
      addLog(`DB metadata insert: ✅ success (id=${insertedRow?.id || "?"})`);

      // 3️⃣ If CSV, auto-import into relational tables
      if ((file.type || "").includes("csv") || /\.csv$/i.test(file.name)) {
        try {
          addLog("Detected CSV — starting import via edge function…");
          const result = await runImportCsv({ bucket, path, companyId: null });
          console.groupCollapsed("📦 Import summary");
          console.log(result?.summary || result);
          console.groupEnd();
          setImportSummary(result?.summary || result || null);
          persist({ importSummary: result?.summary || result || null });
          addLog(
            `Imported — rows=${result?.summary?.rows ?? "?"}, RTOs=${result?.summary?.rtos_seen ?? "?"}, ` +
            `Quals=${result?.summary?.quals_seen ?? "?"}, Units=${result?.summary?.units_seen ?? "?"}, ` +
            `Offers=${result?.summary?.offers_inserted ?? "?"}`
          );
        } catch (err) {
          console.error(err);
          addLog(`Import failed: ${err.message}`);
          alert("Uploaded file OK, but import failed: " + err.message);
        }
      } else {
        addLog("Non-CSV upload — skipping import.");
      }

      setFile(null);
      await fetchFiles();
      addLog("All done: Uploaded and linked ✅");
    } catch (err) {
      console.error(err);
      addLog("Fatal error: " + (err?.message || String(err)));
      alert("Upload failed: " + (err?.message || err));
    } finally {
      setUploading(false);
      try {
        console.groupCollapsed("🧾 RtoFileUpload log");
        (log || []).forEach((l) => console.log(l));
        console.groupEnd();
      } catch (error) {
        console.error(error);
      }
    }
  }

  function publicUrlFor(path) {
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data?.publicUrl || null;
  }

  async function onDelete(id, path) {
    if (!confirm("Delete this file?")) return;
    try {
      addLog(`Deleting storage file: ${path}`);
      await supabase.storage.from(BUCKET).remove([path]);
      addLog("Storage delete: ✅ success");
    } catch (err) {
      console.error("Storage delete failed:", err);
      addLog(`Storage delete failed: ${err.message}`);
    }
    addLog(`Deleting DB row id=${id}`);
    await supabase.from("rto_files").delete().eq("id", id);
    await fetchFiles();
    addLog("Delete complete ✅");
  }

  // UI helpers
  function clearLog() {
    setLog([]);
    setImportSummary(null);
    setCsvPreview(null);
    persist({ log: [], importSummary: null, csvPreview: null });
    addLog("Log cleared");
  }

  function dumpToConsole() {
    try {
      console.groupCollapsed("🧾 RtoFileUpload — Dump");
      console.log("Selected RTO:", selectedRto || rtoId);
      console.log("Import summary:", importSummary);
      console.log("CSV preview:", csvPreview);
      console.log("Log lines:", log);
      console.groupEnd();
    } catch (error) {
      console.error(error);
    }
  }

  return (
    <div className="card" style={{ display: "grid", gap: 12 }}>
      <h3 className="section-title">Link a File to an RTO</h3>

      <div>
        <label className="label">RTO</label>
        <select value={rtoId} onChange={(e) => setRtoId(e.target.value)}>
          <option value="">Select RTO…</option>
          {rtos.map((r) => (
            <option key={r.id} value={r.id}>
              {r.trading_name} {r.rto_code ? `(RTO ${r.rto_code})` : ""}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label">Choose file</label>
        <input
          type="file"
          onChange={(e) => {
            const f = e.target.files?.[0] || null;
            setFile(f);
            if (f) addLog(`Selected file: ${f.name}`);
          }}
          disabled={!rtoId}
        />
        {file ? <small>Selected: {file.name}</small> : null}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn" onClick={onUpload} disabled={uploading || !file || !rtoId}>
          {uploading ? "Uploading…" : "Upload & Link"}
        </button>
        <button className="btn" type="button" onClick={dumpToConsole}>
          Dump to console
        </button>
        <button className="btn" type="button" onClick={() => setShowLog((s) => !s)}>
          {showLog ? "Hide Log" : "Show Log"}
        </button>
        <button className="btn danger" type="button" onClick={clearLog}>
          Clear Log
        </button>
      </div>

      {selectedRto ? (
        <div className="card" style={{ background: "#fafafa" }}>
          <strong>Selected RTO:</strong> {selectedRto.trading_name}
          {selectedRto.rto_code ? ` (RTO ${selectedRto.rto_code})` : ""}
        </div>
      ) : null}

      {csvPreview && (
        <div className="card" style={{ background: "#fff" }}>
          <strong>CSV preview: {csvPreview.name}</strong>
          <pre style={{ whiteSpace: "pre-wrap", maxHeight: 180, overflow: "auto" }}>
            {csvPreview.firstLines.join("\n")}
          </pre>
        </div>
      )}

      {importSummary && (
        <div className="card" style={{ background: "#f5fff7" }}>
          <strong>Last Import Summary</strong>
          <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>
            {JSON.stringify(importSummary, null, 2)}
          </pre>
        </div>
      )}

      {showLog && (
        <div className="card" style={{ background: "#fafafa" }}>
          <strong>Log</strong>
          <pre style={{ whiteSpace: "pre-wrap", maxHeight: 200, overflow: "auto" }}>
            {log.join("\n")}
          </pre>
        </div>
      )}

      <div className="card">
        <h4>Files for this RTO</h4>
        {loadingFiles ? (
          <div className="badge">Loading…</div>
        ) : files.length === 0 ? (
          <div className="muted">No files yet.</div>
        ) : (
          <table style={{ width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Name</th>
                <th>Size</th>
                <th>Uploaded</th>
                <th>Link</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {files.map((f) => {
                const url = publicUrlFor(f.path);
                return (
                  <tr key={f.id}>
                    <td style={{ wordBreak: "break-all" }}>
                      {f.original_name || f.path.split("/").pop()}
                    </td>
                    <td>{f.size_bytes ? `${(f.size_bytes / 1024).toFixed(1)} KB` : "—"}</td>
                    <td>{new Date(f.created_at).toLocaleString()}</td>
                    <td>
                      {url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => addLog(`Opened public URL for ${f.original_name || f.path}`)}
                        >
                          open
                        </a>
                      ) : (
                        <span className="muted">private</span>
                      )}
                    </td>
                    <td>
                      <button className="btn danger" onClick={() => onDelete(f.id, f.path)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
