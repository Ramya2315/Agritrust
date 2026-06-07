import React, { useRef } from "react";
import { ShieldCheck, Leaf, Download, Printer, Award, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { buildCertificatePageUrl } from "@/lib/certificateLinks";

interface CertificateProps {
  farm: any;
  farmer: any;
}

export default function Certificate({ farm, farmer }: CertificateProps) {
  const certificateRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = React.useState(false);
  const isEmailLike = (value: any) => typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  const isPlaceholderName = (value: any) =>
    typeof value === "string" && value.trim().toLowerCase() === "registered farmer";
  const farmerDisplayName = [farm?.farmerName, farm?.farmerId?.name, farmer?.name]
    .find(value => typeof value === "string" && value.trim() && !isEmailLike(value) && !isPlaceholderName(value)) || "Farmer name unavailable";
  const aiConfidence = typeof farm.aiReport?.accuracy === "number" ? `${(farm.aiReport.accuracy * 100).toFixed(2)}%` : "Pending";
  const iotScore = typeof farm.aiReport?.iotAssessment?.score === "number"
    ? `${(farm.aiReport.iotAssessment.score * 100).toFixed(0)}%`
    : "N/A";
  const certificateUrl = buildCertificatePageUrl(farm) || farm.qrCodes?.[0] || "verified";

  const downloadPDF = async () => {
    if (!certificateRef.current) return;
    
    setIsDownloading(true);
    const toastId = toast.loading("Preparing your secure organic certificate...");
    try {
      // Small delay to ensure any pending renders are settled
      await new Promise(resolve => setTimeout(resolve, 100));

      const element = certificateRef.current;
      
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: true, // Enable for debugging
        backgroundColor: "#ffffff",
        allowTaint: true,
        onclone: (clonedDoc) => {
          // Hide UI elements in clone
          const noPrintElements = clonedDoc.querySelectorAll('.no-print');
          noPrintElements.forEach(el => (el as HTMLElement).style.display = 'none');

          // Deep sanitize all elements to replace oklch/oklab with RGB
          // html2canvas fails on modern color functions
          const canvas = clonedDoc.createElement('canvas');
          canvas.width = 1; canvas.height = 1;
          const ctx = canvas.getContext('2d');
          
          if (ctx) {
            const allElements = clonedDoc.getElementsByTagName("*");
            for (let i = 0; i < allElements.length; i++) {
              const el = allElements[i] as HTMLElement;
              const style = window.getComputedStyle(el);
              
              // We check properties that might have oklch/oklab
              const props = ['color', 'backgroundColor', 'borderColor', 'fill', 'stroke'];
              
              props.forEach(prop => {
                const value = style.getPropertyValue(prop);
                if (value && (value.includes('oklch') || value.includes('oklab'))) {
                  try {
                    ctx.clearRect(0,0,1,1);
                    ctx.fillStyle = value;
                    ctx.fillRect(0,0,1,1);
                    const [r, g, b, a] = ctx.getImageData(0,0,1,1).data;
                    const rgb = a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a / 255})`;
                    el.style.setProperty(prop, rgb, 'important');
                  } catch (e) {
                    // Fallback to simple replacements for known classes if canvas fails
                    if (el.classList.contains('bg-green-900')) el.style.backgroundColor = '#14532d';
                    if (el.classList.contains('text-green-700')) el.style.color = '#15803d';
                  }
                }
              });
            }
          }
        }
      });

      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
      });

      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

      pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, pdfHeight);
      
      const filename = `AgriTrustra-Cert-${farm.certificateHash?.slice(0, 8)}.pdf`;
      pdf.save(filename);
      
      toast.success("Certificate downloaded successfully!", { id: toastId });
    } catch (error) {
      console.error("Critical error during PDF generation:", error);
      toast.error("Generation failed. Please try printing to PDF instead.", { id: toastId });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div ref={certificateRef} className="max-w-4xl mx-auto p-4 md:p-8 bg-white shadow-2xl rounded-sm border-[16px] border-green-900/10 relative overflow-hidden">
      {/* Watermark */}
      <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none rotate-12">
        <Leaf className="w-[500px] h-[500px]" />
      </div>

      <div className="relative z-10 border-2 border-green-900/20 p-8 md:p-12">
        <div className="flex justify-between items-start mb-12">
          <div className="flex items-center gap-3">
            <Leaf className="h-12 w-12 text-green-700" />
            <div>
              <h1 className="text-3xl font-black text-green-900 tracking-tighter">AgriTrustra</h1>
              <p className="text-[10px] uppercase tracking-widest text-green-700 font-bold">Organic Certification Authority</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400 uppercase font-bold">Certificate ID</div>
            <div className="font-mono text-sm font-bold text-gray-900">{farm.certificateHash?.slice(0, 16).toUpperCase()}</div>
          </div>
        </div>

        <div className="text-center mb-12">
          <Award className="h-20 w-20 text-yellow-600 mx-auto mb-6" />
          <h2 className="text-4xl font-serif italic text-gray-900 mb-4">Certificate of Organic Compliance</h2>
          <p className="text-gray-600 max-w-2xl mx-auto leading-relaxed">
            This is to certify that the agricultural products listed below have been verified through 
            AgriTrustra's multi-layered audit system, including dual auditor inspection and 
            live AI analysis with IoT sensor fusion, and are found to be in full compliance with 
            National Standards for Organic Production.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-12">
          <div className="space-y-4">
            <div>
              <label className="text-[10px] uppercase font-bold text-gray-400">Certified Farmer</label>
              <div className="text-xl font-bold text-gray-900">{farmerDisplayName}</div>
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-gray-400">Farm Location</label>
              <div className="text-sm font-medium text-gray-700">
                Lat: {farm.location.lat.toFixed(4)}, Lng: {farm.location.lng.toFixed(4)}
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-gray-400">Crop Category</label>
              <div className="text-lg font-bold text-green-800 capitalize">{farm.cropType}</div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[10px] uppercase font-bold text-gray-400">AI Analysis Report</label>
              <div className="p-4 bg-green-50 rounded-lg border border-green-100">
                <div className="flex justify-between text-xs mb-1">
                  <span>Confidence Score:</span>
                  <span className="font-bold">{aiConfidence}</span>
                </div>
                <div className="flex justify-between text-xs mb-1">
                  <span>IoT Safety Score:</span>
                  <span className="font-bold">{iotScore}</span>
                </div>
              </div>
            </div>
            <div className="flex justify-center md:justify-end">
              <div className="p-2 bg-white border-2 border-gray-100 rounded-lg">
                <QRCodeSVG value={certificateUrl} size={100} />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-8 pt-12 border-t border-gray-100">
          <div className="text-center">
            <div className="h-12 flex items-end justify-center mb-2">
              <img src="https://upload.wikimedia.org/wikipedia/commons/e/ef/Signature_of_Narendra_Modi.svg" className="h-8 opacity-60 grayscale" alt="Signature" />
            </div>
            <div className="text-[10px] font-bold uppercase text-gray-900">Agriculture Minister</div>
            <div className="text-[8px] text-gray-400">Digital ID: 0x8829...F2E</div>
          </div>
          <div className="text-center">
            <div className="h-12 flex items-end justify-center mb-2">
              <ShieldCheck className="h-10 w-10 text-green-800 opacity-20" />
            </div>
            <div className="text-[10px] font-bold uppercase text-gray-900">AgriTrustra AI Node</div>
            <div className="text-[8px] text-gray-400">Block Hash: {farm.certificateHash?.slice(0, 10)}...</div>
          </div>
          <div className="text-center hidden md:block">
            <div className="h-12 flex items-end justify-center mb-2 font-serif italic text-gray-400">
              Authorized Official
            </div>
            <div className="text-[10px] font-bold uppercase text-gray-900">Govt. of India</div>
            <div className="text-[8px] text-gray-400">Verification Date: {new Date().toLocaleDateString()}</div>
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-center gap-4 no-print">
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" /> Print Hardcopy
        </Button>
        <Button 
          className="bg-green-800" 
          onClick={downloadPDF}
          disabled={isDownloading}
        >
          {isDownloading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          {isDownloading ? "Generating..." : "Download PDF"}
        </Button>
      </div>
    </div>
  );
}
