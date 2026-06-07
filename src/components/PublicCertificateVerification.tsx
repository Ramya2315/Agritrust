import React, { useEffect, useState } from "react";
import { CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import Certificate from "./Certificate";
import { useI18n } from "@/lib/i18n";

interface PublicCertificateVerificationProps {
  certificateId: string;
}

export default function PublicCertificateVerification({ certificateId }: PublicCertificateVerificationProps) {
  const { t } = useI18n();
  const [certificate, setCertificate] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadCertificate = async () => {
      setLoading(true);
      setError("");

      try {
        const res = await fetch(`/api/certificates/${encodeURIComponent(certificateId)}`);
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Certificate could not be verified");
        }

        setCertificate(data);
      } catch (err: any) {
        setError(err.message || "Certificate could not be verified");
      } finally {
        setLoading(false);
      }
    };

    if (certificateId) {
      loadCertificate();
    } else {
      setError("Certificate ID is missing");
      setLoading(false);
    }
  }, [certificateId]);

  if (loading) {
    return (
      <div className="pt-32 pb-20 px-4 min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-green-800 font-semibold">
          <Loader2 className="h-5 w-5 animate-spin" />
          Verifying certificate...
        </div>
      </div>
    );
  }

  if (error || !certificate?.farm) {
    return (
      <div className="pt-32 pb-20 px-4 min-h-screen bg-gray-50">
        <div className="max-w-2xl mx-auto rounded-lg border border-red-100 bg-white p-8 text-center shadow-sm">
          <ShieldAlert className="mx-auto mb-4 h-12 w-12 text-red-500" />
          <h1 className="text-2xl font-bold text-gray-900">Certificate Not Found</h1>
          <p className="mt-3 text-gray-500">{error || "This QR code does not match an issued AgriTrustra certificate."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-28 pb-20 px-4 bg-gray-50">
      <div className="mx-auto mb-6 max-w-4xl rounded-lg border border-green-100 bg-green-50 p-4 text-green-900">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <div>
            <div className="font-bold">{t("certificateVerified")}</div>
            <div className="text-sm text-green-700">
              Certificate ID: <span className="font-mono">{certificate.certificateId}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto mb-6 grid max-w-4xl grid-cols-1 gap-4 md:grid-cols-2">
        <section className="rounded-lg border bg-white p-4">
          <h2 className="mb-3 font-bold text-gray-900">{t("certificationProcess")}</h2>
          <ol className="space-y-2 text-sm text-gray-700">
            <li>1. Auditor 1: {certificate.farm.auditor1Data?.isOrganicCertified ? "Approved" : "N/A"}</li>
            <li>2. Auditor 2: {certificate.farm.auditor2Data?.isOrganicCertified ? "Approved" : "N/A"}</li>
            <li>3. AI: {certificate.farm.aiReport?.isOrganic ? "Healthy and organic" : "Review required"}</li>
            <li>4. Certificate: {certificate.farm.certificateHash || certificate.certificateId}</li>
          </ol>
        </section>
        <section className="rounded-lg border bg-white p-4">
          <h2 className="mb-3 font-bold text-gray-900">{t("cropDetails")}</h2>
          <div className="space-y-1 text-sm text-gray-700">
            <p><span className="font-semibold">{t("crop")}:</span> {certificate.farm.cropType || "N/A"}</p>
            <p><span className="font-semibold">{t("soilType")}:</span> {certificate.farm.soilType || "N/A"}</p>
            <p><span className="font-semibold">{t("farmer")}:</span> {certificate.farm.farmerName || certificate.farm.farmerId?.name || "N/A"}</p>
            <p><span className="font-semibold">{t("phone")}:</span> {certificate.farm.farmerPhone || certificate.farm.farmerId?.phone || "N/A"}</p>
            <p><span className="font-semibold">{t("address")}:</span> {certificate.farm.farmerAddress || certificate.farm.farmerId?.address || "N/A"}</p>
          </div>
        </section>
        <section className="rounded-lg border bg-white p-4 md:col-span-2">
          <h2 className="mb-3 font-bold text-gray-900">{t("photos")}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[certificate.farm.cropPhoto, certificate.farm.productImage, certificate.farm.plantImage].filter(Boolean).map((src: string, index: number) => (
              <img key={index} src={src} alt={`Certification photo ${index + 1}`} className="h-40 w-full rounded-md object-cover" />
            ))}
          </div>
        </section>
        <section className="rounded-lg border bg-white p-4 md:col-span-2">
          <h2 className="mb-3 font-bold text-gray-900">{t("aiAnalysis")}</h2>
          <div className="grid grid-cols-1 gap-3 text-sm text-gray-700 sm:grid-cols-4">
            <p><span className="font-semibold">{t("plantHealth")}:</span> {certificate.farm.aiReport?.plantHealth || "N/A"}</p>
            <p><span className="font-semibold">{t("disease")}:</span> {certificate.farm.aiReport?.diseaseName || "N/A"}</p>
            <p><span className="font-semibold">{t("organicStatus")}:</span> {certificate.farm.aiReport?.isOrganic ? "Confirmed" : "Review"}</p>
            <p><span className="font-semibold">{t("confidence")}:</span> {typeof certificate.farm.aiReport?.accuracy === "number" ? `${(certificate.farm.aiReport.accuracy * 100).toFixed(1)}%` : "N/A"}</p>
          </div>
        </section>
      </div>
      <div className="mx-auto mb-4 max-w-4xl">
        <h2 className="mb-3 text-xl font-bold text-gray-900">{t("finalCertificate")}</h2>
      </div>
      <Certificate farmer={null} farm={certificate.farm} />
    </div>
  );
}
