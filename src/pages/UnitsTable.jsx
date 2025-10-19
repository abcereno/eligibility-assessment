import React, { useMemo } from "react";


export default function UnitsTable({ units, checks, setExclusive }) {
  const sortedUnits = useMemo(() => {
    return [...units].sort((a, b) => {
      // Core units first
      if (a.type === 'core' && b.type !== 'core') {
        return -1;
      }
      if (a.type !== 'core' && b.type === 'core') {
        return 1;
      }

      // Then sort by group/cluster name
      const groupA = a.group || '';
      const groupB = b.group || '';
      const groupCompare = groupA.localeCompare(groupB, undefined, { numeric: true });

      if (groupCompare !== 0) {
        return groupCompare;
      }

      // Finally, sort by unit code as a tie-breaker
      return a.code.localeCompare(b.code);
    });
  }, [units]);

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
          {sortedUnits.map((u) => {
            const tga = `https://training.gov.au/Training/Details/${u.code}`;
            const typeLbl = u.type === "core" ? "Core" : u.type === "elective" ? "Elective" : "";
            const groupName = `choice-${u.code}`; // radios with same name => only one per row

            return (
              <tr key={u.code}>
<td>
  <strong>{u.code}: {u.name}</strong>
  <span style={{ fontWeight: "bold", color: u.type === "core" ? "blue" : u.type === "elective" ? "#fdb715" : "red" }}>
    {" "}({typeLbl}){" "}
    {u.group ? <strong><span style={{ color: "green" }}>Group: {u.group}</span></strong> : null}
  </span>

  {/* Adds space above the description if it exists */}
  {u.desc && (
    <div style={{ marginTop: '8px' }}>
      <small>{u.desc}</small>
    </div>
  )}

  {/* Adds space above the link */}
  <div style={{ marginTop: '4px', borderRadius: '4px', backgroundColor: '#9e8dffff', display: 'inline-block', padding: '2px 6px' }}>
    <a href={tga} target="_blank" rel="noreferrer" className="tga-link-button">
      View on training.gov.au
    </a>
  </div>
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