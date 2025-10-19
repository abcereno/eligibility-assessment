import { useMemo, useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useCompany } from "../hooks/useCompany";
import { useNavigate } from "react-router-dom";
import useRevealOnScroll from "../hooks/useRevealOnScroll";
import { useQualificationsDataset } from "../hooks/useQualificationsDataSet";
import { useRtos } from "../hooks/useRtos";
import { useChecksExclusive } from "../hooks/useChecksExclusive";
import { useLocalDraft } from "../hooks/useLocalDraft";
import useSavedAssessments from "../hooks/useSavedAssessments";
import MetaPickers from "./MetaPickers";
import PersonalDetails from "./PersonalDetails";
import UnitsTable from "./UnitsTable";
import SavedAssessments from "./SavedAssessments";
import PdfPreviewModal from "./PdfPreviewModal";
import { useRtoQualificationIndex } from "../hooks/useRtoQualificationIndex";

const LEAD_CONNECTOR_WEBHOOK_URL = "https://services.leadconnectorhq.com/hooks/gU8WTxeySVWZN6JcUGsl/webhook-trigger/20f49e59-0fe1-4334-91ac-9cf4b82c47c8";
const LS_DRAFT_KEY = "tc.form.v2";

const getTodayString = () => new Date("2025-10-14T18:11:08-08:00").toISOString().split('T')[0];

export default function FormPage() {
  useRevealOnScroll();
  const { company } = useCompany();
  const nav = useNavigate();

  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => { if (!company) nav("/"); }, [company, nav]);

  const { dataset } = useQualificationsDataset();
  const { byRto } = useRtoQualificationIndex({ dataset });
  const { rtos } = useRtos();

  useEffect(() => { if (dataset && rtos) setIsLoading(false); }, [dataset, rtos]);

  const [date, setDate] = useState(getTodayString());
  const [rtoId, setRtoId] = useState("");
  const [qualificationCode, setQualificationCode] = useState("");
  const [person, setPerson] = useState({ name: "", email: "", phone: "" });
  const [notes, setNotes] = useState("");
  const [workHistory, setWorkHistory] = useState("");
  const [callTranscript, setCallTranscript] = useState("");

  // **MODIFIED**: Logic to find the current offer and its units based on the new data structure.
  const currentOfferId = useMemo(() => {
    if (!rtoId || !qualificationCode) return null;
    return byRto.get(rtoId)?.get(qualificationCode) || null;
  }, [byRto, rtoId, qualificationCode]);

  const currentQual = useMemo(() => dataset?.[currentOfferId] || null, [dataset, currentOfferId]);
  const allUnits = currentQual?.units || [];
  const unitCount = allUnits.length;

  useEffect(() => {
    if (!dataset || !qualificationCode) return;
    const rtoHasQual = byRto.get(rtoId)?.has(qualificationCode);
    if (!rtoHasQual) setQualificationCode("");
  }, [rtoId, qualificationCode, byRto, dataset]);

  const { checks, setExclusive, resetChecks, evidencePercent, refereePercent, gapPercent } = useChecksExclusive(unitCount);

  useLocalDraft({
    seed: { date, rtoId, qualificationCode, person, notes, workHistory, callTranscript, checks },
    onLoad: (s) => {
      setDate(s.date || getTodayString()); setRtoId(s.rtoId || "");
      setQualificationCode(s.qualificationCode || "");
      setPerson(s.person || { name: "", email: "", phone: "" });
      setNotes(s.notes || ""); setWorkHistory(s.workHistory || "");
      setCallTranscript(s.callTranscript || ""); resetChecks(s.checks);
    },
  });
  
  useEffect(() => {
    if (rtos?.length && !localStorage.getItem(LS_DRAFT_KEY)) {
      const generalRto = rtos.find(r => r.trading_name === "General Qualifications");
      if (generalRto) setRtoId(generalRto.id);
    }
  }, [rtos]);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type }); setTimeout(() => setToast(null), 3500);
  }, []);

  const confirmAction = useCallback((message) => {
    return new Promise((resolve) => setModal({ message, onConfirm: (confirmed) => { setModal(null); resolve(confirmed); } }));
  }, []);

  const { saved, deleteSaved, loadSavedIntoForm, saveToDatabase } = useSavedAssessments({
    getPayload: () => ({
      name: person.name, email: person.email || "", phone: person.phone || "", date, notes, workHistory, callTranscript, rtoId,
      qualification: `${qualificationCode} — ${currentQual?.name || ""}`,
      qualificationCode, evidenceCodes: [...checks.evidence], refereeCodes: [...checks.referee], gapCodes: [...checks.gap],
      unitCount, percentageOfEvidence: `${evidencePercent}%`, percentageOfReferee: `${refereePercent}%`, percentageOfGap: `${gapPercent}%`,
    }),
    onLoad: (item) => {
      setPerson(p => ({ ...p, name: item.name, email: item.email || "", phone: item.phone || "" }));
      setDate(item.date || getTodayString()); setNotes(item.notes || "");
      setWorkHistory(item.workHistory || ""); setCallTranscript(item.callTranscript || "");
      setRtoId(item.rtoId || ""); setQualificationCode(item.qualificationCode || "");
      resetChecks({ evidence: new Set(item.evidenceCodes), referee: new Set(item.refereeCodes), gap: new Set(item.gapCodes) });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  });

  const evidenceList = useMemo(() => allUnits.filter(u => checks.evidence.has(u.code)).map(u => `${u.code}: ${u.name}`), [allUnits, checks.evidence]);
  const refereeList = useMemo(() => allUnits.filter(u => checks.referee.has(u.code)).map(u => `${u.code}: ${u.name}`), [allUnits, checks.referee]);
  const gapList = useMemo(() => allUnits.filter(u => checks.gap.has(u.code)).map(u => `${u.code}: ${u.name}`), [allUnits, checks.gap]);

  const handleAction = async (actionFn, successMsg, errorMsg) => {
    if (!person.name?.trim() || !date || !qualificationCode) {
      return showToast("Name, Date, and Qualification are required.", "error");
    }
    const confirmed = await confirmAction(`Are you sure you want to ${successMsg.toLowerCase()}?`);
    if (!confirmed) return;

    setIsSubmitting(true);
    showToast("Processing...");
    try {
      await actionFn();
      showToast(successMsg);
    } catch (err) {
      showToast(errorMsg + `: ${err.message}`, "error");
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleSendToWebhook = () => handleAction(
    async () => {
      const [year, month, day] = date.split('-');
      const payload = {
        name: person.name, email: person.email, phone: person.phone, date: `${day}-${month}-${year}`, notes, workHistory, callTranscript,
        qualification: `${qualificationCode} — ${currentQual?.name || ""}`, unitCount,
        percentageOfEvidence: `${evidencePercent}%`, percentageOfReferee: `${refereePercent}%`, percentageOfGap: `${gapPercent}%`,
        unitsEvidenceList: evidenceList.join('\n'), unitsRefereeList: refereeList.join('\n'), unitsGapList: gapList.join('\n'),
      };
      const response = await fetch(LEAD_CONNECTOR_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error("Server responded with an error.");
    },
    "Saved to CRM successfully!",
    "Error sending to CRM"
  );
  
  const handleDatabaseSave = () => handleAction(saveToDatabase, "Saved to database backup!", "Failed to save to database");
  
  if (isLoading) return <div className="card">Loading assessment data...</div>;

  return (
    <>
      <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
        <div className="card reveal"><h2 className="section-title">Personal Details</h2><PersonalDetails {...{ person, setPerson, notes, setNotes, workHistory, setWorkHistory, callTranscript, setCallTranscript }} /></div>
        <div className="card reveal"><h1 className="section-title">Skills & Eligibility Assessment</h1><MetaPickers {...{ date, setDate, rtoId, setRtoId, rtos, dataset, rtoIndex: { byRto }, qualificationCode, onQualificationChange: val => { setQualificationCode(val); resetChecks(); }, unitCount, evidencePercent, refereePercent, gapPercent }} /></div>
        {currentQual && <div className="card reveal">
            <h2 className="section-title">{currentQual.code} — {currentQual.name}</h2>
            <UnitsTable units={allUnits} checks={checks} setExclusive={setExclusive} />
        </div>}
        <div className="card reveal" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" onClick={handleSendToWebhook} disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Save to Lead Connector"}</button>
            <button className="btn" onClick={handleDatabaseSave} disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Save to Database"}</button>
        </div>
        <div className="card reveal"><h2 className="section-title">Saved Assessments (Local)</h2><SavedAssessments saved={saved} onLoad={loadSavedIntoForm} onDelete={deleteSaved} /></div>
      </div>
      <Toast toast={toast} />
      <ConfirmationModal modal={modal} />
    </>
  );
}

const Toast = ({ toast }) => !toast ? null : createPortal(<div style={{ position: 'fixed', bottom: '20px', right: '20px', padding: '1rem 1.5rem', backgroundColor: toast.type === 'error' ? '#e74c3c' : '#2ecc71', color: 'white', borderRadius: '8px', zIndex: 9999, animation: 'toast-in 0.5s forwards' }}>{toast.message}</div>, document.body);
const ConfirmationModal = ({ modal }) => !modal ? null : createPortal(<div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9998 }}><div style={{ background: 'white', padding: '2rem', borderRadius: '8px' }}><p>{modal.message}</p><button onClick={() => modal.onConfirm(false)}>Cancel</button><button onClick={() => modal.onConfirm(true)}>Confirm</button></div></div>, document.body);