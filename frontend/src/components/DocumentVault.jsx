import { useState, useEffect, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";

export default function DocumentVault({ leadId, allowUpload = false, currentPhase }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  const backend = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
  const absUrl = (u) => (u && u.startsWith("http") ? u : `${backend}${u}`);

  const loadVault = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/leads/${leadId}/vault`);
      setFiles(data.files || []);
    } catch (err) {
      console.error("Vault error:", err);
      // We don't toast error here because some users might not have a vault or are unauthorized
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    if (leadId) loadVault();
  }, [loadVault, leadId]);

  const handleUpdateFloorPlans = async (newPdfUrls) => {
    setUploading(true);
    try {
      const res = await api.post("/verifications/latest/floor-plan", {
        pdf_urls: newPdfUrls
      });
      if (res.data.reverted_to_briefing) {
        toast.success("Floor plans updated. Package assignment cleared.");
        setTimeout(() => window.location.reload(), 1500);
      } else {
        toast.success("Floor plans updated successfully.");
        loadVault();
      }
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteFloorPlan = (url) => {
    if (!window.confirm("Are you sure you want to delete this floor plan?")) return;
    const allFloorPlans = files.filter(f => f.type === "floor_plan").map(f => f.url);
    const updated = allFloorPlans.filter(u => u !== url);
    handleUpdateFloorPlans(updated);
  };

  const handleReplaceSingle = async (e, oldUrl) => {
    if (currentPhase && !["unpaid", "verification", "briefing"].includes(currentPhase)) {
      if (!window.confirm("Replacing your floor plan means clears the price and our system will give you new pricing based on the floor plan you upload. Continue?")) {
        e.target.value = null;
        return;
      }
    }
    
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", selected[0]);
      const uploadRes = await api.post("/upload", form);
      const newUrl = uploadRes.data.url || uploadRes.data.urls[0];
      
      const allFloorPlans = files.filter(f => f.type === "floor_plan").map(f => f.url);
      const updated = allFloorPlans.map(u => u === oldUrl ? newUrl : u);
      
      await handleUpdateFloorPlans(updated);
    } catch (err) {
      toast.error(formatApiError(err));
      setUploading(false);
    }
    e.target.value = null;
  };

  if (files.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 border-dashed p-6 text-center text-gray-400 text-xs rounded">
        No documents in the vault yet.
      </div>
    );
  }

  const isAssigned = currentPhase && !["unpaid", "verification", "briefing"].includes(currentPhase);

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      {files.map((f, idx) => (
        <div key={idx} className="group relative flex flex-col p-2 bg-white border border-[#EDE5DB] hover:border-[#DA9E3E] hover:shadow-md transition duration-300 rounded cursor-pointer" onClick={() => setSelectedFile(f)}>
          <div className="flex flex-col">
            {f.type === "design_render" || f.type === "floor_plan" ? (
              <div className="w-full h-32 overflow-hidden mb-3 rounded bg-gray-50 flex items-center justify-center relative border border-gray-100">
                <img
                  src={absUrl(f.url)}
                  alt={f.label}
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=300&q=80";
                  }}
                />
                <div className="absolute top-2 right-2 bg-[#0C1D42] text-white p-1 rounded-full text-[10px] leading-none shadow">
                  {f.type === "floor_plan" ? "📏" : "🖼️"}
                </div>
              </div>
            ) : (
              <div className="w-full h-32 flex flex-col items-center justify-center bg-[#F5EDE8] rounded mb-3 border border-gray-100">
                <div className="text-4xl text-[#0C1D42] opacity-70 group-hover:opacity-100 transition duration-300">
                  {f.type === "site_visit" && "📋"}
                </div>
              </div>
            )}
            <span className="text-[10px] uppercase tracking-widest font-bold text-center text-[#0C1D42] px-1 line-clamp-2 leading-tight">
              {f.label}
            </span>
            {f.uploaded_at && (
              <span className="text-[9px] text-gray-400 text-center mt-1 block mb-2">
                {new Date(f.uploaded_at).toLocaleDateString()}
              </span>
            )}
          </div>
          
          {allowUpload && f.type === "floor_plan" && (
            <div className="mt-auto pt-2 flex items-center justify-between border-t border-[#EDE5DB]">
              <label className="text-[9px] uppercase tracking-widest font-bold text-[#DA9E3E] cursor-pointer hover:text-[#0C1D42] transition">
                {uploading ? "..." : "Replace"}
                <input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(e) => handleReplaceSingle(e, f.url)} disabled={uploading} />
              </label>
              {!isAssigned && (
                <button 
                  onClick={() => handleDeleteFloorPlan(f.url)}
                  disabled={uploading}
                  className="text-[9px] uppercase tracking-widest font-bold text-red-500 hover:text-red-700 transition"
                >
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      ))}
      </div>

      {selectedFile && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded overflow-hidden max-w-5xl w-full max-h-screen flex flex-col relative animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center p-4 border-b border-[#EDE5DB]">
              <h3 className="font-display text-lg text-[#0C1D42]">{selectedFile.label}</h3>
              <div className="flex gap-4">
                <a 
                  href={absUrl(selectedFile.url)} 
                  download 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[#0C1D42] text-white px-4 py-2 text-xs uppercase tracking-widest font-bold hover:bg-[#08142D] transition"
                >
                  Download
                </a>
                <button 
                  onClick={() => setSelectedFile(null)}
                  className="text-2xl leading-none text-[#0C1D42] opacity-50 hover:opacity-100"
                >
                  &times;
                </button>
              </div>
            </div>
            <div className="bg-gray-100 p-4 flex-1 overflow-auto flex items-center justify-center min-h-[50vh]">
              {selectedFile.url.toLowerCase().endsWith('.pdf') ? (
                <iframe 
                  src={absUrl(selectedFile.url)} 
                  className="w-full h-[70vh] border-0"
                  title={selectedFile.label}
                />
              ) : (
                <img 
                  src={absUrl(selectedFile.url)} 
                  alt={selectedFile.label} 
                  className="max-w-full max-h-[70vh] object-contain"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
