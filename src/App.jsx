import React from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useCompany } from "./hooks/useCompany.js";
export default function App() {
  const { company, clearCompany } = useCompany();
  const loc = useLocation();
  return (
    <div className="min-h-screen bg-var-bg text-var-fg">
      <header className="tc-navbar">
        <div className="wrap">
          <img className="logo" src="https://storage.googleapis.com/msgsndr/gU8WTxeySVWZN6JcUGsl/media/65efcc74ae69d11b44b6731a.png" />
          <nav className="nav">
            <Link className={navCls(loc.pathname==="/")} to="/">Home</Link>
            <Link className={navCls(loc.pathname==="/form")} to="/form">Form</Link>
            <Link className={navCls(loc.pathname==="/admin")} to="/admin">Admin</Link>
          </nav>
          <div className="company-pill">
            {company ? (
              <>
                <span>{company.name}</span>
                <button className="btn ghost" onClick={clearCompany}>Change</button>
              </>
            ) : <span className="muted">No company selected</span>}
          </div>
        </div>
      </header>
      <main className="wrap"><Outlet /></main>
    </div>
  );
}

const navCls = (active)=>"link " + (active?"active":"");
