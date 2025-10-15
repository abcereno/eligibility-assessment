// =============================================================
// File: src/pages/FormPage.jsx
// Container page wiring hooks + components
// =============================================================
import { useMemo, useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

import { useCompany } from "../hooks/useCompany";
import { useNavigate } from "react-router-dom";
import useBranding from "../hooks/useBranding";
import useRevealOnScroll from "../hooks/useRevealOnScroll";
import { useQualificationsDataset } from "../hooks/useQualificationsDataset";
import { useRtos } from "../hooks/useRtos";
import { useChecksExclusive } from "../hooks/useChecksExclusive";
import { useLocalDraft } from "../hooks/useLocalDraft";
import useSavedAssessments from "../hooks/useSavedAssessments";
import MetaPickers from "./MetaPickers";
import PersonalDetails from "./PersonalDetails";
import UnitsTable from "./UnitsTable";
import SavedAssessments from "./SavedAssessments";
import PdfPreviewModal from "./PdfPreviewModal";
import ProgressBar from "./ProgressBar";
import { useRtoQualificationIndex } from "../hooks/useRtoQualificationIndex";

// --- Webhook Configuration ---
const LEAD_CONNECTOR_WEBHOOK_URL = "https://services.leadconnectorhq.com/hooks/gU8WTxeySVWZN6JcUGsl/webhook-trigger/20f49e59-0fe1-4334-91ac-9cf4b82c47c8";

// Helper function to get the current date in the required format
const getTodayString = () => {
 const today = new Date("2025-10-14T18:11:08-08:00"); // Using provided context time
 const year = today.getFullYear();
 const month = String(today.getMonth() + 1).padStart(2, "0");
 const day = String(today.getDate()).padStart(2, "0");
 return `${year}-${month}-${day}`;
};

export default function FormPage() {
 useRevealOnScroll();
 const { company } = useCompany();
 const nav = useNavigate();
 const { assets, pdf: pdfBrand } = useBranding();

 // --- UI State ---
 const [toast, setToast] = useState(null);
 const [modal, setModal] = useState(null);
 const [pdfOpen, setPdfOpen] = useState(false);

 // --- Navigation & Data Fetching ---
 useEffect(() => {
  if (!company) nav("/");
 }, [company, nav]);

 const { dataset } = useQualificationsDataset();
 const { byRto, withoutRto } = useRtoQualificationIndex({ dataset, companyId: company?.id });
 const { rtos } = useRtos();

 // --- Form State ---
 const [date, setDate] = useState(getTodayString());
 const [rtoId, setRtoId] = useState("");
 const [qualificationCode, setQualificationCode] = useState("");
 const [person, setPerson] = useState({ name: "", email: "", phone: "" });
 const [notes, setNotes] = useState("");
 const [workHistory, setWorkHistory] = useState("");
 const [callTranscript, setCallTranscript] = useState("");

 const currentQual = useMemo(() => dataset?.[qualificationCode] || null, [dataset, qualificationCode]);
 const allUnits = currentQual?.units || [];
 const unitCount = allUnits.length;

 useEffect(() => {
  if (!dataset || !qualificationCode) return;
  if (!rtoId) {
   if (!withoutRto.has(qualificationCode)) setQualificationCode("");
  } else {
   const allowed = byRto.get(rtoId);
   if (!allowed?.has(qualificationCode)) setQualificationCode("");
  }
 }, [rtoId, dataset, byRto, withoutRto, qualificationCode]);

 const { checks, setExclusive, resetChecks, evidencePercent, refereePercent, gapPercent } = useChecksExclusive(unitCount);

 useLocalDraft({
  seed: { date, rtoId, qualificationCode, person, notes, workHistory, callTranscript, checks },
  onLoad: (s) => {
   setDate(s.date || getTodayString());
   setRtoId(s.rtoId || "");
   setQualificationCode(s.qualificationCode || "");
   setPerson(s.person || { name: "", email: "", phone: "" });
   setNotes(s.notes || "");
   setWorkHistory(s.workHistory || "");
   setCallTranscript(s.callTranscript || "");
   resetChecks(s.checks);
  },
 });

 const showToast = useCallback((message, type = 'success') => {
  setToast({ message, type });
  setTimeout(() => setToast(null), 3500);
 }, []);

 const confirmAction = useCallback((message) => {
  return new Promise((resolve) => {
   setModal({
    message,
    onConfirm: (confirmed) => {
     setModal(null);
     resolve(confirmed);
    },
   });
  });
 }, []);

 const { saved, saveLocally, deleteSaved, loadSavedIntoForm, saveToDatabase } = useSavedAssessments({
  getPayload: () => ({
   name: person.name, email: person.email || "", phone: person.phone || "", date, notes, workHistory, callTranscript,
   qualification: `${qualificationCode} — ${currentQual?.name || ""}`,
   qualificationCode, evidenceCodes: Array.from(checks.evidence), refereeCodes: Array.from(checks.referee), gapCodes: Array.from(checks.gap),
   unitCount, percentageOfEvidence: `${evidencePercent}%`, percentageOfReferee: `${refereePercent}%`, percentageOfGap: `${gapPercent}%`,
  }),
  onLoad: (item) => {
    setPerson((p) => ({ ...p, name: item.name, email: item.email || "", phone: item.phone || "" }));
    setDate(item.date || getTodayString());
    setNotes(item.notes || "");
    setWorkHistory(item.workHistory || "");
    setCallTranscript(item.callTranscript || "");
    setQualificationCode(item.qualificationCode || "");
    resetChecks({
     evidence: new Set(item.evidenceCodes || []),
     referee: new Set(item.refereeCodes || []),
     gap: new Set(item.gapCodes || []),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
   },
 });

 const evidenceList = useMemo(() => allUnits.filter(u => checks.evidence.has(u.code)).map(u => `${u.code}: ${u.name}`), [allUnits, checks.evidence]);
 const refereeList = useMemo(() => allUnits.filter(u => checks.referee.has(u.code)).map(u => `${u.code}: ${u.name}`), [allUnits, checks.referee]);
 const gapList = useMemo(() => allUnits.filter(u => checks.gap.has(u.code)).map(u => `${u.code}: ${u.name}`), [allUnits, checks.gap]);

 // --- Actions ---
 const handleSendToWebhook = useCallback(async () => {
    const confirmed = await confirmAction("Are you sure you want to save this assessment to the CRM?");
    if (!confirmed) return;
  
    if (!person.name?.trim() || !date || !qualificationCode) {
     return showToast("Name, Date, and Qualification are required to save to CRM.", "error");
    }
  
    const [year, month, day] = date.split('-');
    const formattedDate = `${day}-${month}-${year}`;
  
    const payload = {
     name: person.name, email: person.email, phone: person.phone, date: formattedDate, notes: notes,
     workHistory: workHistory, callTranscript: callTranscript,
     qualification: `${qualificationCode} — ${currentQual?.name || ""}`,
     unitCount: unitCount,
     percentageOfEvidence: `${evidencePercent}%`, percentageOfReferee: `${refereePercent}%`, percentageOfGap: `${gapPercent}%`,
     unitsEvidenceList: evidenceList.join('\n'), unitsRefereeList: refereeList.join('\n'), unitsGapList: gapList.join('\n'),
     evidenceCount: evidencePercent, refereeCount: refereePercent, gapCount: gapPercent,
    };
  
    showToast("Sending to CRM...");
  
    try {
     const response = await fetch(LEAD_CONNECTOR_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
     });
  
     if (response.ok) {
      showToast("Assessment saved to CRM successfully!");
     } else {
      showToast("Error sending data to CRM.", "error");
     }
    } catch (error) {
     console.error("Webhook error:", error);
     showToast("A network error occurred while sending data.", "error");
    }
   }, [
    person, date, qualificationCode, currentQual, notes, workHistory, callTranscript,
    unitCount, evidencePercent, refereePercent, gapPercent,
    evidenceList, refereeList, gapList,
    showToast, confirmAction
   ]);
  
   const handleDatabaseSave = useCallback(async () => {
    const confirmed = await confirmAction("Are you sure you want to save to the database backup?");
    if (!confirmed) return;
  
    if (!person.name?.trim() || !date || !qualificationCode) {
     return showToast("Name, Date, and Qualification are required to save.", "error");
    }
  
    try {
     await saveToDatabase();
     showToast("Assessment saved to database backup.");
    } catch (err) {
     showToast(`Failed to save to database: ${err.message}`, "error");
     console.error(err);
    }
   }, [saveToDatabase, showToast, confirmAction, person.name, date, qualificationCode]);
  
   const onResetForm = useCallback(async () => {
    const confirmed = await confirmAction("Are you sure you want to clear the entire form? This cannot be undone.");
    if (!confirmed) return;
  
    setDate(getTodayString());
    setRtoId("");
    setQualificationCode("");
    setPerson({ name: "", email: "", phone: "" });
    setNotes("");
    setWorkHistory("");
    setCallTranscript("");
    resetChecks();
    localStorage.removeItem("tc.form.v2");
    showToast("Form cleared.");
   }, [resetChecks, showToast, confirmAction]);
  
   const handleOpenPdf = () => {
    if (!person.name?.trim() || !date || !qualificationCode) {
     return showToast("Name, Date and Qualification are required to generate PDF.", "error");
    }
    setPdfOpen(true);
   };
  
   return (
    <>
     <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
      <div className="card reveal">
       <h2 className="section-title">Personal Details</h2>
       <PersonalDetails person={person} setPerson={setPerson} notes={notes} setNotes={setNotes} workHistory={workHistory} setWorkHistory={setWorkHistory} callTranscript={callTranscript} setCallTranscript={setCallTranscript} />
      </div>
     
      <div className="card reveal">
       <h1 className="section-title">Skills & Eligibility Assessment</h1>
       <MetaPickers
        date={date} setDate={setDate} rtoId={rtoId} setRtoId={setRtoId}
        rtos={rtos} dataset={dataset} rtoIndex={{ byRto, withoutRto }}
        qualificationCode={qualificationCode}
        onQualificationChange={(val) => {
         setQualificationCode(val);
         resetChecks();
        }}
        unitCount={unitCount} evidencePercent={evidencePercent} refereePercent={refereePercent} gapPercent={gapPercent}
       />
      </div>
  
      <div className="card reveal">
       {currentQual ? (
        <>
         <h2 className="section-title">{currentQual.code} — {currentQual.name}</h2>
         <div className="stats-grid" style={{ marginBottom: 12 }}>
          <div className="stat-box">
           <div className="stat-label">Total Units</div>
           <div className="stat-value">{unitCount}</div>
          </div>
         </div>
         <ProgressBar label="Evidence Progress" value={evidencePercent} />
         <ProgressBar label="Referee Progress" value={refereePercent} />
         <ProgressBar label="Gap Training Progress" value={gapPercent} />
         <UnitsTable units={allUnits} checks={checks} setExclusive={setExclusive} />
         <div className="grid cols-3" style={{ gap: 12 }}>
          <div className="card">
           <h4>Evidence Units Selected:</h4>
           <pre style={{ whiteSpace: "pre-wrap" }}>{evidenceList.join("\n")}</pre>
          </div>
          <div className="card">
           <h4>Referee Units Selected:</h4>
           <pre style={{ whiteSpace: "pre-wrap" }}>{refereeList.join("\n")}</pre>
          </div>
          <div className="card">
           <h4>Gap Training Units Selected:</h4>
           <pre style={{ whiteSpace: "pre-wrap" }}>{gapList.join("\n")}</pre>
          </div>
         </div>
        </>
       ) : null}
      </div>
  
      <div className="card reveal" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
       <button className="btn" onClick={handleSendToWebhook}>Save to Lead Connector</button>
       <button className="btn" onClick={handleDatabaseSave}>Save to Database</button>
       <button className="btn ghost" onClick={() => {
         if (person.name && date && qualificationCode) {
           saveLocally();
           showToast("Assessment saved locally.");
         } else {
           showToast("Name, Date, and Qualification are required to save.", "error");
         }
       }}>Save to Local Storage</button>
       <button className="btn ghost" onClick={handleOpenPdf}>Preview Assessment PDF</button>
       <button className="btn ghost" onClick={onResetForm}>Clear Form</button>
      </div>
  
      <div className="card reveal">
       <h2 className="section-title">Saved Assessments (Local)</h2>
       <SavedAssessments saved={saved} onLoad={loadSavedIntoForm} onDelete={deleteSaved} />
      </div>
  
      {pdfOpen && (
       <PdfPreviewModal
        person={person}
        date={date}
        qualificationName={`${qualificationCode} — ${currentQual?.name || ""}`}
        progress={{ evidencePercent, refereePercent, gapPercent }}
        lists={{ evidenceList, refereeList, gapList }}
        branding={{ assets, pdfBrand }}
        onClose={() => setPdfOpen(false)}
        showToast={showToast}
       />
      )}
     </div>
    
     <Toast toast={toast} />
     <ConfirmationModal modal={modal} />
    </>
   );
  }
  
  // --- INLINE UI COMPONENTS ---
  
  const Toast = ({ toast }) => {
   if (!toast) return null;
   const toastStyle = {
    position: 'fixed', bottom: '20px', right: '20px',
    padding: '1rem 1.5rem',
    backgroundColor: toast.type === 'error' ? '#e74c3c' : '#2ecc71',
    color: 'white', borderRadius: '8px', boxShadow: '0 5px 15px rgba(0,0,0,0.2)',
    zIndex: 9999, opacity: 0, transform: 'translateY(20px)', animation: 'toast-in 0.5s forwards',
   };
   const keyframes = `@keyframes toast-in { to { opacity: 1; transform: translateY(0); } }`;
   return createPortal(
    <><style>{keyframes}</style><div style={toastStyle}>{toast.message}</div></>,
    document.body
   );
  };
  
  const ConfirmationModal = ({ modal }) => {
   if (!modal) return null;
   return createPortal(
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9998 }}>
     <div style={{ background: 'white', padding: '2rem', borderRadius: '8px', boxShadow: '0 5px 15px rgba(0,0,0,0.3)', textAlign: 'center' }}>
      <p style={{ marginBottom: '1.5rem', fontSize: '1.1rem' }}>{modal.message}</p>
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
       <button className="btn ghost" onClick={() => modal.onConfirm(false)}>Cancel</button>
       <button className="btn" onClick={() => modal.onConfirm(true)}>Confirm</button>
      </div>
     </div>
    </div>,
    document.body
   );
  };