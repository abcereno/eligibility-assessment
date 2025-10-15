// =============================================================
// File: src/refactor/components/UnitsTable.jsx
// =============================================================
import React from "react";


export default function UnitsTable({ units, checks, setExclusive }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="qualification-table" style={{ width: "100%", tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "calc(100% - 450px)" }} />
          <col style={{ width: 150 }} />
          <col style={{ width: 150 }} />
          <col style={{ width: 150 }} />
        </colgroup>
        <thead>
          <tr>
            <th>Unit and Description</th>
            <th>Photo / Video / Documents</th>
            <th>Referee</th>
            <th>Gap Training</th>
          </tr>
        </thead>
        <tbody>
          {units.map((u) => {
            const tga = `https://training.gov.au/Training/Details/${u.code}`;
            const typeLbl = u.type === "core" ? "Core" : u.type === "elective" ? "Elective" : "";
            const groupName = `choice-${u.code}`; // radios with same name => only one per row

            return (
              <tr key={u.code}>
                <td>
                  <strong>{u.code}: {u.name}</strong>
                  <span style={{ fontWeight: "bold", color: u.type === "core" ? "blue" : u.type === "elective" ? "green" : "red" }}>
                    {" "}({typeLbl}){" "}
                    {u.group ? <strong><span style={{ color: "green" }}>Group: {u.group}</span></strong> : null}
                  </span>
                  <br />
                  <small>{u.desc}</small>
                  <br />
                  <a href={tga} target="_blank" rel="noreferrer" className="tga-link-button">View on training.gov.au</a>
                </td>
                <td>
                  <label>
                    <input type="radio" name={groupName} checked={checks.evidence.has(u.code)} onChange={() => setExclusive("evidence", u.code)} />
                  </label>
                </td>
                <td>
                  <label>
                    <input type="radio" name={groupName} checked={checks.referee.has(u.code)} onChange={() => setExclusive("referee", u.code)} />
                  </label>
                </td>
                <td>
                  <label>
                    <input type="radio" name={groupName} checked={checks.gap.has(u.code)} onChange={() => setExclusive("gap", u.code)} />
                  </label>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}