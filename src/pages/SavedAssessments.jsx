import React from 'react';

// Updated placeholder for SavedAssessments component
export default function SavedAssessments({ saved, onLoad, onDelete }) {
  if (!saved || saved.length === 0) {
    return <p>No assessments saved locally yet.</p>
  }

  // --- STYLES FOR THE TABLE ---
  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    // Use fixed layout to prevent content from stretching columns
    tableLayout: 'fixed',
  };

  const thStyle = {
    border: '1px solid #ddd',
    padding: '8px',
    textAlign: 'left',
    backgroundColor: '#f2f2f2',
  };

  // Style for cells that should truncate with an ellipsis
  const ellipsisCellStyle = {
    border: '1px solid #ddd',
    padding: '8px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };

  const actionCellStyle = {
    border: '1px solid #ddd',
    padding: '8px',
    width: '140px', // Fixed width for action buttons
    textAlign: 'right',
  };

  return (
    <table style={tableStyle}>
      {/* UPDATE: Whitespace between <col> tags has been removed to fix hydration error. */}
      <colgroup><col style={{ width: '30%' }} /><col style={{ width: '50%' }} /><col style={{ width: '20%' }} /></colgroup>
      <thead>
        <tr>
          <th style={thStyle}>Name</th>
          <th style={thStyle}>Qualification</th>
          <th style={thStyle}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {saved.map((item, index) => (
          <tr key={index}>
            <td style={ellipsisCellStyle} title={item.name}>{item.name}</td>
            <td style={ellipsisCellStyle} title={item.qualification}>{item.qualification}</td>
            <td style={actionCellStyle}>
              <button className="btn ghost" onClick={() => onLoad(item)}>Load</button>
              <button className="btn ghost" onClick={() => onDelete(index)} style={{ marginLeft: '8px' }}>Delete</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}