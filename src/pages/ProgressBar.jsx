import React from 'react';

// This helper component is copied directly from your PdfTemplate.jsx
// and adapted to take a number for the 'value' prop.
const StyledProgressBar = ({ label, value }) => (
  <div style={{ margin: '8px 0', background: '#f5f5f5', padding: '8px', borderRadius: '6px', border: '1px solid #e0e0e0' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontWeight: 'bold', fontSize: '12px' }}>
      <span>{label}</span>
      {/* Format the number prop as a percentage string */}
      <span>{`${value}%`}</span>
    </div>
    <div style={{ height: '15px', background: '#e0e0e0', borderRadius: '8px', overflow: 'hidden' }}>
      {/* Use the number prop to set the width percentage */}
      <div style={{ width: `${value || 0}%`, height: '100%', backgroundColor: '#fdb715' }}></div>
    </div>
  </div>
);

// This is the main component that FormPage.jsx imports.
// It now renders three of the styled helper components.
export default function ProgressBar({ evidencePercent, refereePercent, gapPercent }) {
  return (
    <div style={{ margin: '20px 0 10px 0' }}>
      <StyledProgressBar label="Evidence" value={evidencePercent} />
      <StyledProgressBar label="Referee" value={refereePercent} />
      <StyledProgressBar label="Gap Training" value={gapPercent} />
    </div>
  );
}