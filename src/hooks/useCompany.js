import { useContext } from "react";
import CompanyContext from "../context/company-context";

export function useCompany() {
  return useContext(CompanyContext);
}
