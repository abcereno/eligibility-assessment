import React, { useEffect, useMemo, useRef } from "react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { useBranding } from "../context/BrandingContext";

/**
 * Props:
 *  open       : boolean (show/hide modal)
 *  onClose    : function
 *  data       : {
 *    name, email, date, qualification,
 *    evidenceUnits: [{code,name}], refereeUnits: [{code,name}], gapUnits: [{code,name}],
 *    totals?: { unitCount?: number, evidencePercent?, refereePercent?, gapPercent? }
 *  }
 *
 * Notes:
 *  - Colors & fonts come from CSS vars set by BrandingProvider.
 *  - Logos/seal come from branding.assets.
 */
export default function PdfModal({ open, onClose, data }) {
  const { assets, pdf } = useBranding();
  const ref = useRef(null);

  // fallbacks + derived
  const lists = useMemo(() => {
    const e = (data?.evidenceUnits || []).map(u => `${u.code}: ${u.name}`);
    const r = (data?.refereeUnits || []).map(u => `${u.code}: ${u.name}`);
    const g = (data?.gapUnits || []).map(u => `${u.code}: ${u.name}`);

// ✅ use parentheses to make precedence explicit
const total = (data?.totals?.unitCount ?? (e.length + r.length + g.length)) || 0;


    const pct = (n) => Math.max(0, Math.min(100, Math.round((n / total) * 100)));

    return {
      evidText: e.join("\n") || "No units selected",
      refText: r.join("\n") || "No units selected",
      gapText: g.join("\n") || "No units selected",
      unitCount: total,
      evidPct: data?.totals?.evidencePercent ?? pct(e.length),
      refPct: data?.totals?.refereePercent ?? pct(r.length),
      gapPct: data?.totals?.gapPercent ?? pct(g.length),
    };
  }, [data]);

  useEffect(() => {
    if (!open) return;
    // tiny delay so images/fonts have a chance to attach
    const t = setTimeout(() => {}, 50);
    return () => clearTimeout(t);
  }, [open]);

  if (!open) return null;

  const waitForImages = (root) =>
    Promise.all(
      Array.from(root.querySelectorAll("img")).map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise((res) => {
          img.onload = () => res();
          img.onerror = () => res();
        });
      })
    );

  const download = async () => {
    const node = ref.current;
    if (!node) return;

    await waitForImages(node);

    const canvas = await html2canvas(node, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: "#ffffff",
    });

    const imgData = canvas.toDataURL("image/jpeg", 1.0);
    const pdfDoc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pdfWidth = 210;
    const pageHeight = 297;
    const imgHeight = (canvas.height * pdfWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    pdfDoc.addImage(imgData, "JPEG", 0, position, pdfWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdfDoc.addPage();
      pdfDoc.addImage(imgData, "JPEG", 0, position, pdfWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    const filename = formatFilename(data?.name);
    pdfDoc.save(filename);
  };

  const formatFilename = (fullName = "Assessment") => {
    const s = String(fullName).trim();
    if (!s) return "Assessment.pdf";
    const parts = s.split(/\s+/);
    if (parts.length >= 2) {
      const last = parts.pop();
      const first = parts.join(" ");
      return `${last}, ${first} – Assessment.pdf`;
    }
    return `Assessment – ${s}.pdf`;
  };

  // Inline style sheet (scoped-ish via prefixed class names)
  const Styles = () => (
    <style>{`
      .pdfx-overlay {
        position: fixed; inset: 0; z-index: 9999;
        background: rgba(0,0,0,.5);
        display: flex; align-items: center; justify-content: center;
      }
      .pdfx-modal {
        width: min(95vw, 860px);
        max-height: 90vh;
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 20px 60px rgba(0,0,0,.25);
        display: flex; flex-direction: column;
        overflow: hidden;
      }
      .pdfx-head {
        display:flex; align-items:center; justify-content:space-between;
        padding: 12px 16px; border-bottom: 1px solid #eee;
        background: var(--background-color);
      }
      .pdfx-head h2 { margin:0; font-family: var(--font-heading, "Elliot Sans"); }
      .pdfx-actions { display:flex; gap:8px; }
      .pdfx-btn {
        padding: 10px 14px; border: 0; border-radius: 8px; cursor: pointer;
        background: var(--primary-color); color: var(--secondary-color); font-weight: 700;
      }
      .pdfx-btn.ghost {
        background: #f2f2f2; color: #333;
      }
      .pdfx-body {
        overflow: auto; padding: 16px; background: #fafafa;
      }

      /* PDF content (A4 width @ 96dpi) */
      .pdfx-page {
        width: 794px; min-height: 1123px; margin: 0 auto;
        background: white; color: var(--secondary-color);
        box-shadow: 0 0 0 1px #eee;
        font-family: "Open Sans", Arial, sans-serif;
      }
      .pdfx-inner {
        padding: 25px;
      }
      .pdfx-header {
        text-align: center; margin-bottom: 20px; padding: 15px;
        border-bottom: 2px solid var(--primary-color);
        position: relative; background: linear-gradient(to bottom,#fff,#fafafa);
      }
      .pdfx-logo {
        max-height: 50px; width: auto; display: block; margin: 0 auto;
      }
      .pdfx-seal {
        position:absolute; top: 15px; left: 15px; width: 100px; height: 100px; opacity: .9;
      }
      .pdfx-title {
        font-size: 24px; margin: 18px 0 6px; font-weight: 700;
        font-family: "Elliot Sans", Arial, sans-serif;
      }
      .pdfx-subtitle {
        font-size: 18px; color: #555; margin: 6px 0 16px;
        font-family: "Elliot Sans", Arial, sans-serif;
      }
      .pdfx-badge {
        position:absolute; top:10px; right:10px;
        background:#f8f9fa; color:#2d3436; padding:4px 8px; border-radius:4px;
        font-size: 11px; font-weight: 700; border:1px solid #e0e0e0;
      }
      .pdfx-student {
        background: #f9f9f9; border-radius: 8px; padding: 12px; margin-bottom: 12px;
      }
      .pdfx-name { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
      .pdfx-grid { display:grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 12px; }

      .pdfx-section { margin: 12px 0; border: 1px solid #e0e0e0; border-radius: 8px; background:#fff; }
      .pdfx-section h3 { margin: 10px; font-size: 14px; font-weight: 700; }

      .pdfx-bars { padding: 10px; }
      .pdfx-bar { margin: 8px 10px; background:#f5f5f5; border:1px solid #e0e0e0; padding: 8px; border-radius: 6px; }
      .pdfx-barlabel { display:flex; justify-content:space-between; font-weight:700; font-size:12px; margin-bottom: 6px; }
      .pdfx-bartrack { position:relative; height: 15px; border-radius: 8px; overflow:hidden; background:#e0e0e0; border:1px solid #ddd; }
      .pdfx-barfill { position:absolute; left:0; top:0; bottom:0; width:0; background: var(--primary-color); }

      .pdfx-units { padding: 12px; }
      .pdfx-units h4 { font-size: 13px; margin: 10px 0; border-bottom: 1px solid var(--primary-color); padding-bottom: 4px; text-align:center; }
      .pdfx-cols { display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; }
      .pdfx-pre {
        white-space: pre-wrap; word-break: break-word; font-size: 10px; line-height: 1.3;
        background:#fff; border:1px solid #eee; border-radius:4px; padding:6px; min-height: 140px;
      }

      .pdfx-foot { margin: 12px; padding: 8px; background:#f5f5f5; border-left: 3px solid var(--primary-color); font-size: 10px; }
    `}</style>
  );

  return (
    <div className="pdfx-overlay" role="dialog" aria-modal="true">
      <Styles />
      <div className="pdfx-modal">
        <div className="pdfx-head">
          <h2>Assessment PDF Preview</h2>
          <div className="pdfx-actions">
            <button className="pdfx-btn" onClick={download}>Download PDF</button>
            <button className="pdfx-btn ghost" onClick={onClose}>Close</button>
          </div>
        </div>

        <div className="pdfx-body">
          <div className="pdfx-page" ref={ref}>
            <div className="pdfx-inner">
              <div className="pdfx-header">
                {assets?.seal ? (
                  <img className="pdfx-seal" crossOrigin="anonymous" src={assets.seal} alt="Seal" />
                ) : null}
                {assets?.logo_pdf || assets?.logo_nav ? (
                  <img
                    className="pdfx-logo"
                    crossOrigin="anonymous"
                    src={assets?.logo_pdf || assets?.logo_nav}
                    alt="Logo"
                  />
                ) : null}
                <div className="pdfx-badge">{pdf?.status_badge || "Preliminary Assessment Completed"}</div>
                <div className="pdfx-title">{pdf?.header_title || "Certificate for"}</div>
                <div className="pdfx-subtitle">{pdf?.subtitle || "Preliminary Skills Assessment & RPL Evaluation"}</div>
              </div>

              <div className="pdfx-student">
                <div className="pdfx-name">{data?.name || ""}</div>
                <div className="pdfx-grid">
                  <div><strong>Assessment Date:</strong> {data?.date || ""}</div>
                  <div><strong>Qualification:</strong> {data?.qualification || ""}</div>
                </div>
              </div>

              <div className="pdfx-section">
                <h3>Assessment Progress Overview</h3>
                <div className="pdfx-bars">
                  <div className="pdfx-bar">
                    <div className="pdfx-barlabel"><span>Evidence</span><span>{lists.evidPct}%</span></div>
                    <div className="pdfx-bartrack"><div className="pdfx-barfill" style={{ width: `${lists.evidPct}%` }} /></div>
                  </div>
                  <div className="pdfx-bar">
                    <div className="pdfx-barlabel"><span>Referee</span><span>{lists.refPct}%</span></div>
                    <div className="pdfx-bartrack"><div className="pdfx-barfill" style={{ width: `${lists.refPct}%` }} /></div>
                  </div>
                  <div className="pdfx-bar">
                    <div className="pdfx-barlabel"><span>Gap Training</span><span>{lists.gapPct}%</span></div>
                    <div className="pdfx-bartrack"><div className="pdfx-barfill" style={{ width: `${lists.gapPct}%` }} /></div>
                  </div>
                </div>
              </div>

              <div className="pdfx-section">
                <h3>Identified Competencies</h3>
                <div className="pdfx-units">
                  <div className="pdfx-cols">
                    <div>
                      <h4>Evidence Units</h4>
                      <pre className="pdfx-pre">{lists.evidText}</pre>
                    </div>
                    <div>
                      <h4>Referee Units</h4>
                      <pre className="pdfx-pre">{lists.refText}</pre>
                    </div>
                    <div>
                      <h4>Gap Training Units</h4>
                      <pre className="pdfx-pre">{lists.gapText}</pre>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pdfx-foot">
                This preliminary assessment evaluates your existing skills and experience against the
                competencies of your chosen qualification. The next steps will involve gathering
                detailed evidence and documentation for the identified units of competency.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
