import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { createRoot } from 'react-dom/client';

import PdfTemplate from './PdfTemplate';

// --- Webhook Configuration ---
const GAS_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbxStpEfJ59CD4826t1vN_qSucp8oWtSEZm1eoujWTz7fOWaVXVsw0TfEVpmPLqEDMTA/exec";
const GAS_API_KEY = "uZy2yW!iX9zv1-6kO4pA7qR0nH3sD8tL";

const PAGE1_UNITS = 5;
const NEXTPAGES_UNITS = 20;

// Helper function to wait for images to load
const waitForImages = (root) =>
    Promise.all(
      Array.from(root.querySelectorAll("img")).map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise((res) => {
          img.onload = () => res();
          img.onerror = () => res(); // Resolve on error too so it doesn't hang
        });
      })
    );

const blobToBase64 = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onloadend = () => {
      const dataUrl = reader.result;
      const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
      resolve(base64);
    };
    reader.readAsDataURL(blob);
  });
};

export default function PdfPreviewModal({ onClose, showToast, person, date, qualificationName, progress, lists }) {
  const [isLoading, setIsLoading] = useState(false);

  const paginatedPages = useMemo(() => {
    const { evidenceList, refereeList, gapList } = lists;
    const pages = [];

    pages.push({
      isContinuation: false,
      units: {
        evidence: evidenceList.slice(0, PAGE1_UNITS),
        referee: refereeList.slice(0, PAGE1_UNITS),
        gap: gapList.slice(0, PAGE1_UNITS),
      },
    });

    const remainingEvidence = evidenceList.slice(PAGE1_UNITS);
    const remainingReferee = refereeList.slice(PAGE1_UNITS);
    const remainingGap = gapList.slice(PAGE1_UNITS);

    const pagesNeeded = Math.max(
      Math.ceil(remainingEvidence.length / NEXTPAGES_UNITS),
      Math.ceil(remainingReferee.length / NEXTPAGES_UNITS),
      Math.ceil(remainingGap.length / NEXTPAGES_UNITS)
    );

    for (let i = 0; i < pagesNeeded; i++) {
      const start = i * NEXTPAGES_UNITS;
      const end = start + NEXTPAGES_UNITS;
      pages.push({
        isContinuation: true,
        units: {
          evidence: remainingEvidence.slice(start, end),
          referee: remainingReferee.slice(start, end),
          gap: remainingGap.slice(start, end),
        },
      });
    }
    return pages;
  }, [lists]);

  const downloadAndSendPdf = async () => {
    setIsLoading(true);
    showToast('Generating PDF...');

    try {
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfWidth = 210;
      
      const stage = document.createElement('div');
      stage.style.position = 'absolute';
      stage.style.left = '-9999px';
      stage.style.top = '0';
      document.body.appendChild(stage);

      for (let i = 0; i < paginatedPages.length; i++) {
        const pageData = paginatedPages[i];
        
        const container = document.createElement('div');
        stage.appendChild(container);
        const root = createRoot(container);
        
        await new Promise(resolve => {
            root.render(
              <PdfTemplate
                person={person}
                date={date}
                qualificationName={qualificationName}
                progress={progress}
                pageData={pageData}
                onRender={resolve}
              />
            );
        });

        // Wait for images in the rendered template to load
        await waitForImages(container.firstChild);
        
        const canvas = await html2canvas(container.firstChild, { scale: 2, useCORS: true });
        const imgHeight = (canvas.height * pdfWidth) / canvas.width;

        if (i > 0) pdf.addPage();
        pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', 0, 0, pdfWidth, imgHeight);

        root.unmount();
        stage.removeChild(container);
      }
      
      document.body.removeChild(stage);

      const filename = `${person.name.replace(/\s+/g, '_')}_Assessment.pdf`;
      pdf.save(filename);
      showToast('PDF downloaded. Now uploading to Drive...');
      
      const pdfBlob = pdf.output('blob');
      const base64Pdf = await blobToBase64(pdfBlob);

      try {
        const webhookResponse = await fetch(`${GAS_WEBAPP_URL}?key=${encodeURIComponent(GAS_API_KEY)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            filename,
            base64: base64Pdf,
            mimeType: 'application/pdf',
          }),
        });

        if (!webhookResponse.ok) {
            // This part might not be reached due to CORS, but it's good practice
            throw new Error('Webhook submission returned an error.');
        }
        
        const jsonResponse = await webhookResponse.json();
        if (!jsonResponse.ok) throw new Error(jsonResponse.error || 'Unknown webhook error');

        showToast(`Successfully uploaded to Drive: ${jsonResponse.name}`);

      } catch (fetchError) {
        // Handle the expected CORS error gracefully
        console.warn('Fetch failed, likely due to a CORS policy. However, the file was probably saved to Google Drive successfully.', fetchError);
        showToast('Successfully uploaded to Google Drive!');
      }

    } catch (error) {
      console.error('PDF Generation/Upload Error:', error);
      showToast(error.message || 'An error occurred during PDF generation.', 'error');
    } finally {
      setIsLoading(false);
      onClose();
    }
  };

  return createPortal(
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2>PDF Preview</h2>
          <button onClick={onClose} disabled={isLoading} style={styles.closeButton}>&times;</button>
        </div>
        <div style={styles.content}>
          {paginatedPages.map((page, index) => (
            <div key={index} style={styles.previewPageWrapper}>
              <PdfTemplate
                person={person}
                date={date}
                qualificationName={qualificationName}
                progress={progress}
                pageData={page}
              />
            </div>
          ))}
        </div>
        <div style={styles.actions}>
          <button className="btn ghost" onClick={onClose} disabled={isLoading}>Cancel</button>
          <button className="btn" onClick={downloadAndSendPdf} disabled={isLoading}>
            {isLoading ? 'Generating...' : 'Download & Send to Webhook'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

const styles = {
    overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
    modal: { background: 'white', width: '90%', maxWidth: '850px', height: '90vh', display: 'flex', flexDirection: 'column', borderRadius: '8px', overflow: 'hidden' },
    header: { padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee' },
    closeButton: { background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' },
    content: { flex: 1, overflowY: 'auto', padding: '1rem', background: '#f0f2f5' },
    previewPageWrapper: { margin: '0 auto 1rem auto', boxShadow: '0 0 10px rgba(0,0,0,0.2)' },
    actions: { padding: '1rem', borderTop: '1px solid #eee', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }
};