import React from 'react';

// This component is a stateless template for a single PDF page.
export default function PdfTemplate({ person, date, qualificationName, progress, pageData }) {
  const { isContinuation, units } = pageData;
  const { evidencePercent, refereePercent, gapPercent } = progress;

  return (
    <div style={styles.pdfContent}>
      <div style={styles.pdfHeader}>
        {!isContinuation && (
          <div style={styles.seal}>
            <img src="https://storage.googleapis.com/msgsndr/gU8WTxeySVWZN6JcUGsl/media/67b80907162c154a86357d7b.png" alt="Seal" style={{ width: '100%', height: '100%' }} />
          </div>
        )}
        <img src="https://storage.googleapis.com/msgsndr/gU8WTxeySVWZN6JcUGsl/media/65efcc74ae69d11b44b6731a.png" alt="Logo" style={styles.logo} />
        {!isContinuation && (
          <div style={styles.status}><span style={styles.statusBadge}>✓ Preliminary Assessment Completed</span></div>
        )}
        <h1 style={styles.h1}>{isContinuation ? "Continuation of Identified Competencies" : "Certificate for"}</h1>
        {!isContinuation && <h2 style={styles.h2}>Preliminary Skills Assessment & RPL Evaluation</h2>}
      </div>

      <div style={styles.pdfBody}>
        {!isContinuation && (
          <>
            <div style={styles.studentInfo}>
              <h2 style={{ ...styles.h2, fontSize: '20px' }}>{person.name}</h2>
              <div style={styles.infoGrid}>
                <p><strong>Assessment Date:</strong> <span>{date}</span></p>
                <p><strong>Qualification:</strong> <span>{qualificationName}</span></p>
              </div>
            </div>
            <div style={styles.context}>
              <h3>Recognition of Prior Learning (RPL) - Preliminary Assessment</h3>
              <p>This preliminary assessment evaluates your existing skills and experience...</p>
            </div>
            <div style={styles.results}>
              <h3>Assessment Progress Overview</h3>
              <div style={styles.progressBars}>
                <PdfProgressBar label="Evidence" value={`${evidencePercent}%`} />
                <PdfProgressBar label="Referee" value={`${refereePercent}%`} />
                <PdfProgressBar label="Gap Training" value={`${gapPercent}%`} />
              </div>
            </div>
          </>
        )}

        <div style={styles.unitsSection}>
          {isContinuation ? null : <h3>Identified Competencies</h3>}
          <div style={styles.unitsGrid}>
            <div style={styles.unitColumn}>
              <h4>Evidence Units</h4>
              {/* UPDATE: Applying the new 'pre' style here */}
              <pre style={styles.pre}>{units.evidence.join('\n') || ' '}</pre>
            </div>
            <div style={styles.unitColumn}>
              <h4>Referee Units</h4>
              {/* UPDATE: Applying the new 'pre' style here */}
              <pre style={styles.pre}>{units.referee.join('\n') || ' '}</pre>
            </div>
            <div style={styles.unitColumn}>
              <h4>Gap Training Units</h4>
              {/* UPDATE: Applying the new 'pre' style here */}
              <pre style={styles.pre}>{units.gap.join('\n') || ' '}</pre>
            </div>
          </div>
        </div>

        {!isContinuation && (
          <div style={styles.footerNote}>
            <p>This preliminary assessment is part of the RPL process. The next steps will involve gathering detailed evidence...</p>
          </div>
        )}
      </div>
    </div>
  );
}

const PdfProgressBar = ({ label, value }) => (
    <div style={{ margin: '8px 0', background: '#f5f5f5', padding: '8px', borderRadius: '6px', border: '1px solid #e0e0e0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontWeight: 'bold', fontSize: '12px' }}>
            <span>{label}</span><span>{value}</span>
        </div>
        <div style={{ height: '15px', background: '#e0e0e0', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ width: value || '0%', height: '100%', backgroundColor: '#fdb715' }}></div>
        </div>
    </div>
);


// --- STYLES FOR PDF TEMPLATE ---
// Using JS objects for portability, mirroring the CSS from quals.html
const styles = {
    pdfContent: { width: '794px', minHeight: '1123px', padding: '25px', background: 'white', fontFamily: '"Open Sans", Arial, sans-serif', boxSizing: 'border-box' },
    pdfHeader: { textAlign: 'center', marginBottom: '25px', padding: '25px 15px', borderBottom: '2px solid #fdb715', position: 'relative' },
    seal: { position: 'absolute', top: '15px', left: '15px', width: '100px', height: '100px' },
    logo: { maxHeight: '50px', width: 'auto', margin: '0 auto', display: 'block' },
    status: { position: 'absolute', top: '10px', right: '10px' },
    statusBadge: { background: '#f8f9fa', color: '#2d3436', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', border: '1px solid #e0e0e0' },
    h1: { fontSize: '24px', margin: '20px 0 10px', color: '#373b40', fontFamily: '"Elliot Sans", sans-serif', fontWeight: 'bold' },
    h2: { fontSize: '18px', color: '#555', margin: '8px 0 25px', fontFamily: '"Elliot Sans", sans-serif', fontWeight: 'normal' },
    pdfBody: { /* styles for body */ },
    studentInfo: { marginBottom: '15px', padding: '12px', background: '#f9f9f9', borderRadius: '8px' },
    infoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12px' },
    context: { marginBottom: '15px', padding: '12px', border: '1px solid #e0e0e0', borderRadius: '8px' },
    results: { /* styles for results */ },
    progressBars: { margin: '10px 0' },
    unitsSection: { marginTop: '15px' },
    unitsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' },
    unitColumn: { background: '#f9f9f9', padding: '10px', borderRadius: '6px', border: '1px solid #e0e0e0' },
    footerNote: { marginTop: '15px', padding: '8px', background: '#f5f5f5', borderRadius: '6px', borderLeft: '3px solid #fdb715', fontSize: '10px' },
    // UPDATE: Added a dedicated style for the <pre> tags to fix overflowing
    pre: {
        whiteSpace: 'pre-wrap',    // Allows text to wrap to the next line
        wordBreak: 'break-word',     // Breaks long words that would otherwise overflow
        fontFamily: '"Open Sans", Arial, sans-serif',
        fontSize: '10px',
        lineHeight: 1.4,
        margin: 0,
        padding: '5px',
        background: '#fff',
        borderRadius: '4px',
    },
};