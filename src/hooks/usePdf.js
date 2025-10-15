// =============================================================
// File: src/refactor/hooks/usePdf.js
// Encapsulates html2canvas + jsPDF setup
// =============================================================
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

export function usePdf({ person, date, qualificationCode, pdfRef, onRequireFields }) {
  function openPdf(setPdfOpen) {
    if (!person.name?.trim() || !date || !qualificationCode) return onRequireFields?.();
    setPdfOpen(true);
  }

  const waitForImages = (root) =>
    Promise.all(Array.from(root.querySelectorAll("img")).map((img) => (img.complete ? Promise.resolve() : new Promise((res) => { img.onload = () => res(); img.onerror = () => res(); }))));

  async function downloadPdf(setPdfOpen) {
    const node = pdfRef.current;
    if (!node) return;
    await waitForImages(node);

    const canvas = await html2canvas(node, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
    const imgData = canvas.toDataURL("image/jpeg", 1);
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = 210; const pageHeight = 297;
    const imgWidth = pageWidth; const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight; let position = 0;

    pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
    while (heightLeft > 0) {
      position -= pageHeight;
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    const filename = (() => {
      const s = String(person.name || "").trim();
      if (!s) return "Assessment.pdf";
      const parts = s.split(/\s+/);
      if (parts.length >= 2) {
        const last = parts.pop();
        const first = parts.join(" ");
        return `${last}, ${first} — Assessment.pdf`;
      }
      return `Assessment — ${s}.pdf`;
    })();

    pdf.save(filename);
    setPdfOpen(false);
  }

  return { openPdf, downloadPdf };
}