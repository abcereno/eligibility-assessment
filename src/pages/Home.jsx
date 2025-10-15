import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useCompany } from "../hooks/useCompany";
import { useNavigate } from "react-router-dom";

export default function Home() {
  const { chooseCompany } = useCompany();
  const nav = useNavigate();
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id,name,logo_url")
        .order("name", { ascending: true });
      if (!isMounted) return;
      if (error) console.error(error);
      setCompanies(data || []);
      setLoading(false);
    })();
    return () => { isMounted = false; };
  }, []);

  const pick = (c) => {
    chooseCompany(c);
    nav("/form");
  };

  return (
    <div className="fullscreen-hero">
      <h1 className="hero-title">Choose a Company</h1>
      <p className="hero-subtitle">Select who’s using the form today.</p>

      <div className="character-grid">
        {loading ? (
          Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)
        ) : companies.length === 0 ? (
          <div className="help">No companies found.</div>
        ) : (
          companies.map(c => (
            <button
              key={c.id}
              className="character-card"
              onClick={() => pick(c)}
              aria-label={`Use ${c.name}`}
            >
              {c.logo_url ? (
                <img className="character-logo" src={c.logo_url} alt={`${c.name} logo`} />
              ) : (
                <FallbackLogo name={c.name} />
              )}
              <div className="character-name">{c.name}</div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="character-card skeleton">
      <div className="skeleton-logo" />
      <div className="character-name skeleton-text" />
    </div>
  );
}

function FallbackLogo({ name }) {
  const letter = (name || "?").trim().charAt(0).toUpperCase();
  return (
    <div className="fallback-logo" aria-hidden="true">{letter}</div>
  );
}
