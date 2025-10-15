import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useCompany } from "../hooks/useCompany";
import BrandingContext from "./BrandingContext";

function injectGoogleFonts(fonts) {
  (fonts?.google || []).forEach((spec) => {
    const href = `https://fonts.googleapis.com/css2?family=${spec}&display=swap`;
    if (!document.querySelector(`link[data-brand-font="${spec}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.setAttribute("data-brand-font", spec);
      document.head.appendChild(link);
    }
  });
}

function applyCssVars(tokens) {
  if (!tokens?.colors) return;
  const r = document.documentElement.style;
  r.setProperty("--primary-color",   tokens.colors.primary);
  r.setProperty("--secondary-color", tokens.colors.secondary);
  r.setProperty("--background-color",tokens.colors.background);
  r.setProperty("--light-color",     tokens.colors.light);
  r.setProperty("--accent-color",    tokens.colors.accent);
  if (tokens?.transition) r.setProperty("--transition-default", tokens.transition);
  if (tokens?.radii) {
    r.setProperty("--radius-sm", `${tokens.radii.sm ?? 4}px`);
    r.setProperty("--radius-md", `${tokens.radii.md ?? 8}px`);
    r.setProperty("--radius-lg", `${tokens.radii.lg ?? 10}px`);
  }
}

const LS_KEY = (cid) => `branding:${cid}`;

export default function BrandingProvider({ children }) {
  const { company } = useCompany();
  const [branding, setBranding] = useState(null);

  useEffect(() => {
    if (!company?.id) return;

    // cache first
    const cached = localStorage.getItem(LS_KEY(company.id));
    if (cached) {
      try {
        const b = JSON.parse(cached);
        setBranding(b);
        injectGoogleFonts(b.fonts);
        applyCssVars(b.tokens);
      } catch (e) {
        console.warn("Cached branding parse error:", e);
      }
    }

    // then fetch latest
    supabase
      .from("company_branding")
      .select("*")
      .eq("company_id", company.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          if (error.code !== "PGRST116") console.warn("Branding fetch error:", error);
          return;
        }
        if (!data) return;
        const b = { tokens: data.tokens, assets: data.assets, fonts: data.fonts, pdf: data.pdf };
        setBranding(b);
        localStorage.setItem(LS_KEY(company.id), JSON.stringify(b));
        injectGoogleFonts(b.fonts);
        applyCssVars(b.tokens);
      });
  }, [company?.id]);

  const value = useMemo(() => branding || {}, [branding]);
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}
