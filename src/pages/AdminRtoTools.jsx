import RtoAddForm from "../components/RtoAddForm";
import RtoOfferBuilder from "../components/RtoOfferBuilder";
export default function AdminRtoTools() {
  return (
    <div className="grid" style={{ gap: 16 }}>
      <RtoAddForm onCreated={(newRto) => console.log("Added:", newRto)} />
      {/* <RtoFileUpload bucket="rto-files" table="rto_files" /> */}
      <RtoOfferBuilder />
    </div>
  );
}