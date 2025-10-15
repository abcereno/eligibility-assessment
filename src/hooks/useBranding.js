import { useContext } from "react";
import BrandingContext from "../context/BrandingContext";

export default function useBranding() {
  return useContext(BrandingContext) || {};
}
