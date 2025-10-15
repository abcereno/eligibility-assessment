import React, { useEffect, useState } from "react";
import CompanyContext from "./company-context";

export default function CompanyProvider({ children }) {
  const [company, setCompany] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem("tc.company");
    if (saved) setCompany(JSON.parse(saved));
  }, []);

  const chooseCompany = (c) => {
    setCompany(c);
    localStorage.setItem("tc.company", JSON.stringify(c));
  };

  const clearCompany = () => {
    setCompany(null);
    localStorage.removeItem("tc.company");
  };

  const value = { company, chooseCompany, clearCompany };
  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}
