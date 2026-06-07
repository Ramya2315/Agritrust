import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { AlertTriangle, Eye, FileText, Mail, MapPin, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import GeoTaggedCameraCapture from "@/components/GeoTaggedCameraCapture";
import SpeechToTextButton from "@/components/SpeechToTextButton";
import { useI18n } from "@/lib/i18n";

interface AuditorDashboardProps {
  user: any;
}

const initialVerificationData = {
  inspectionDate: "",
  referenceNumber: "",
  farmAreaAcres: "",
  soilCondition: "",
  irrigationMethod: "",
  fertilizerUsed: "",
  pesticideUsed: "",
  waterSource: "",
  seedSource: "",
  bufferZoneWidth: "",
  inputPurchaseRecords: "",
  contaminationRisks: "",
  recommendations: "",
  auditorNotes: "",
  isOrganicCertified: true,
  geoTaggedPhotos: [],
  technicalReviewMemo: "",
  complianceChecklist: "",
  followUpNotes: ""
};

const inputClassName = "w-full rounded-md border px-3 py-2 text-sm";
const labelClassName = "text-[10px] uppercase font-bold tracking-wide text-gray-400";

export default function AuditorDashboard({ user }: AuditorDashboardProps) {
  const { language } = useI18n();
  const [pendingFarms, setPendingFarms] = useState<any[]>([]);
  const [selectedFarm, setSelectedFarm] = useState<any>(null);
  const [verificationData, setVerificationData] = useState<any>(initialVerificationData);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchPendingFarms();
  }, []);

  const fetchPendingFarms = async () => {
    const res = await fetch("/api/farms/pending", {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    const data = await res.json();
    setPendingFarms(Array.isArray(data) ? data : []);
  };

  const resetVerificationData = () => {
    setVerificationData(initialVerificationData);
  };

  const getFarmerDisplayName = (farm: any) =>
    farm?.farmerName ||
    farm?.farmerId?.name ||
    `Farmer ID: ${String(farm?.farmerId?._id || farm?.farmerId || "").slice(-4)}`;

  const handleAuditorCameraCapture = (geoTag: any) => {
    setVerificationData((previous: any) => ({
      ...previous,
      geoTaggedPhotos: [...(previous.geoTaggedPhotos || []), { ...geoTag, uploadedByRole: user.role }]
    }));
    toast.success("Geo-tagged auditor photo attached");
  };

  const appendSpeechText = (field: string, text: string) => {
    setVerificationData((previous: any) => ({
      ...previous,
      [field]: [previous[field], text].filter(Boolean).join(" ").trim()
    }));
  };

  const selectFarm = (farm: any) => {
    setSelectedFarm(farm);
    setVerificationData({
      ...initialVerificationData,
      referenceNumber: farm?.auditor1Data?.referenceNumber || "",
      isOrganicCertified: true
    });
  };

  const getAuditor1MissingFields = () => {
    const required: Array<[string, string]> = [
      ["inspectionDate", "Inspection date"],
      ["farmAreaAcres", "Farm area"],
      ["soilCondition", "Soil condition"],
      ["irrigationMethod", "Irrigation method"],
      ["fertilizerUsed", "Fertilizer used"],
      ["pesticideUsed", "Pesticide used"],
      ["waterSource", "Water source"],
      ["seedSource", "Seed source"],
      ["bufferZoneWidth", "Buffer zone width"],
      ["inputPurchaseRecords", "Input purchase records"],
      ["contaminationRisks", "Contamination risks"],
      ["recommendations", "Recommendations"],
      ["auditorNotes", "Auditor notes"]
    ];

    const missing = required
      .filter(([field]) => !String(verificationData[field] || "").trim())
      .map(([, label]) => label);

    if (!Array.isArray(verificationData.geoTaggedPhotos) || verificationData.geoTaggedPhotos.length === 0) {
      missing.push("Geo-tagged field photos");
    }

    return missing;
  };

  const getAuditor2MissingFields = () => {
    const required: Array<[string, string]> = [
      ["technicalReviewMemo", "Technical review memo"],
      ["complianceChecklist", "Compliance checklist"],
      ["followUpNotes", "Follow-up notes"]
    ];

    return required
      .filter(([field]) => !String(verificationData[field] || "").trim())
      .map(([, label]) => label);
  };

  const handleVerify = async (farmId: string) => {
    const missingFields = user.role === "auditor1" ? getAuditor1MissingFields() : getAuditor2MissingFields();
    if (missingFields.length > 0) {
      toast.error(`Please complete: ${missingFields.join(", ")}`);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload =
        user.role === "auditor1"
          ? {
              inspectionDate: verificationData.inspectionDate,
              referenceNumber: verificationData.referenceNumber,
              farmAreaAcres: verificationData.farmAreaAcres,
              soilCondition: verificationData.soilCondition,
              irrigationMethod: verificationData.irrigationMethod,
              fertilizerUsed: verificationData.fertilizerUsed,
              pesticideUsed: verificationData.pesticideUsed,
              waterSource: verificationData.waterSource,
              seedSource: verificationData.seedSource,
              bufferZoneWidth: verificationData.bufferZoneWidth,
              inputPurchaseRecords: verificationData.inputPurchaseRecords,
              contaminationRisks: verificationData.contaminationRisks,
              recommendations: verificationData.recommendations,
              auditorNotes: verificationData.auditorNotes,
              isOrganicCertified: verificationData.isOrganicCertified,
              farmPhotos: verificationData.geoTaggedPhotos.map((photo: any) => photo.image),
              geoTaggedPhotos: verificationData.geoTaggedPhotos
            }
          : {
              referenceNumber: selectedFarm?.auditor1Data?.referenceNumber || verificationData.referenceNumber,
              technicalReviewMemo: verificationData.technicalReviewMemo,
              complianceChecklist: verificationData.complianceChecklist,
              followUpNotes: verificationData.followUpNotes,
              auditorNotes: verificationData.auditorNotes,
              isOrganicCertified: verificationData.isOrganicCertified,
              farmPhotos: verificationData.geoTaggedPhotos.map((photo: any) => photo.image),
              geoTaggedPhotos: verificationData.geoTaggedPhotos
            };

      const res = await fetch(`/api/farms/${farmId}/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Verification failed");
        return;
      }

      toast.success(
        user.role === "auditor1"
          ? "Auditor 1 approval saved and forwarded to Auditor 2"
          : "Auditor 2 review submitted"
      );

      if (Array.isArray(data.warnings) && data.warnings.length > 0) {
        toast("Approval saved with email warnings", {
          description: data.warnings.join(" | ")
        });
      }

      await fetchPendingFarms();
      setSelectedFarm(null);
      resetVerificationData();
    } catch (err) {
      toast.error("Verification failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-24 pb-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Auditor Control Center</h1>
            <p className="text-gray-500">Multi-stage verification and email-based approval routing</p>
          </div>
          <Badge className={`px-4 py-1.5 text-sm uppercase ${user.role === "auditor1" ? "bg-blue-600" : "bg-purple-600"}`}>
            Logged in as: {user.role.replace("auditor", "Auditor ")}
          </Badge>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>{user.role === "auditor1" ? "Initial Verification Queue" : "Final Verification Queue"}</CardTitle>
                <CardDescription>
                  {user.role === "auditor1"
                    ? "Farms awaiting first inspection or re-verification"
                    : "Farms verified by Auditor 1 and waiting for final review"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Farmer</TableHead>
                      <TableHead>Crop</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingFarms.map((farm) => (
                      <TableRow key={farm._id}>
                        <TableCell className="font-medium">{getFarmerDisplayName(farm)}</TableCell>
                        <TableCell className="capitalize">{farm.cropType || "N/A"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {String(farm.status || "").replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>{farm.auditor1Data?.referenceNumber || "Pending"}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" onClick={() => selectFarm(farm)}>
                            <Eye className="mr-2 h-4 w-4" />
                            {user.role === "auditor1" ? "Inspect" : "Final Review"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {pendingFarms.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-gray-500">
                          No pending {user.role === "auditor1" ? "Auditor 1" : "Auditor 2"} tasks
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1">
            {selectedFarm ? (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                <Card className="sticky top-24 border-t-4 border-t-green-600 shadow-xl">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between capitalize">
                      {selectedFarm.cropType || "Farm"} Details
                      <Badge variant="outline">{String(selectedFarm.status || "").replace(/_/g, " ")}</Badge>
                    </CardTitle>
                    <CardDescription>
                      {user.role === "auditor1" ? "Phase 1: Field inspection and record capture" : "Phase 2: Final technical review"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <img
                      src={selectedFarm.cropPhoto || selectedFarm.images?.[0]}
                      className="h-40 w-full rounded-xl object-cover"
                      alt="Farm"
                    />

                    <div className="rounded-lg border bg-gray-50 p-4 text-sm">
                      <p><span className="font-semibold text-gray-700">Farmer:</span> {getFarmerDisplayName(selectedFarm)}</p>
                      <p><span className="font-semibold text-gray-700">Phone:</span> {selectedFarm.farmerPhone || selectedFarm.farmerId?.phone || "N/A"}</p>
                      <p><span className="font-semibold text-gray-700">Address:</span> {selectedFarm.farmerAddress || selectedFarm.farmerId?.address || "N/A"}</p>
                      <p><span className="font-semibold text-gray-700">Crop:</span> {selectedFarm.cropType || "N/A"}</p>
                      <p><span className="font-semibold text-gray-700">Soil Type:</span> {selectedFarm.soilType || "N/A"}</p>
                    </div>

                    {Array.isArray(selectedFarm.geoTaggedImages) && selectedFarm.geoTaggedImages.length > 0 && (
                      <div className="rounded-lg border border-green-100 bg-green-50 p-4">
                        <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase text-green-700">
                          <MapPin className="h-4 w-4" /> Farmer Geo-tagged Images
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                          {selectedFarm.geoTaggedImages.map((photo: any) => (
                            <div key={photo.field || photo.capturedAt} className="flex items-center gap-3 rounded-md bg-white/80 p-2">
                              <img src={photo.image} alt={photo.label || "Geo-tagged farm upload"} className="h-14 w-16 rounded object-cover" />
                              <div className="min-w-0 text-xs">
                                <div className="font-semibold text-gray-800">{photo.label || "Farm photo"}</div>
                                <div className="text-gray-500">{Number(photo.lat).toFixed(5)}, {Number(photo.lng).toFixed(5)}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="rounded-lg border border-dashed border-gray-200 bg-white p-4">
                      <div className="mb-3">
                        <div>
                          <div className="text-sm font-bold text-gray-900">Attach Geo-tagged Photos</div>
                          <div className="text-xs text-gray-500">Capture field evidence with camera and current GPS permission.</div>
                        </div>
                      </div>
                      <GeoTaggedCameraCapture
                        label="Auditor Field Photo"
                        field="auditorFieldPhoto"
                        onCapture={handleAuditorCameraCapture}
                        onClear={() => {}}
                      />
                      {(verificationData.geoTaggedPhotos || []).length > 0 ? (
                        <div className="mt-3 grid grid-cols-2 gap-3">
                          {verificationData.geoTaggedPhotos.map((photo: any, index: number) => (
                            <div key={`${photo.capturedAt}-${index}`} className="overflow-hidden rounded-md border bg-gray-50">
                              <img src={photo.image} alt={`Auditor upload ${index + 1}`} className="h-20 w-full object-cover" />
                              <div className="p-2 text-[10px] text-gray-500">
                                <div className="truncate font-semibold text-gray-700">{photo.label || `Photo ${index + 1}`}</div>
                                <div>{Number(photo.lat).toFixed(5)}, {Number(photo.lng).toFixed(5)}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-md bg-gray-50 p-3 text-xs text-gray-500">
                          No auditor photos attached yet.
                        </div>
                      )}
                    </div>

                    {user.role === "auditor1" ? (
                      <div className="space-y-4">
                        <div className="rounded-lg border border-green-100 bg-green-50 p-3 text-xs text-green-800">
                          The completed inspection record will be saved and emailed to the farmer. Auditor 2 will receive the generated reference number immediately after approval.
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className={labelClassName}>Inspection Date</label>
                            <input
                              type="date"
                              className={inputClassName}
                              value={verificationData.inspectionDate}
                              onChange={(e) => setVerificationData({ ...verificationData, inspectionDate: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className={labelClassName}>Reference Number</label>
                            <input
                              className={inputClassName}
                              placeholder="Auto-generated if left blank"
                              value={verificationData.referenceNumber}
                              onChange={(e) => setVerificationData({ ...verificationData, referenceNumber: e.target.value })}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className={labelClassName}>Farm Area</label>
                            <input
                              className={inputClassName}
                              placeholder="e.g. 3.5 acres"
                              value={verificationData.farmAreaAcres}
                              onChange={(e) => setVerificationData({ ...verificationData, farmAreaAcres: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className={labelClassName}>Soil Condition</label>
                            <input
                              className={inputClassName}
                              placeholder="e.g. loamy and moist"
                              value={verificationData.soilCondition}
                              onChange={(e) => setVerificationData({ ...verificationData, soilCondition: e.target.value })}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className={labelClassName}>Irrigation Method</label>
                            <input
                              className={inputClassName}
                              placeholder="e.g. drip irrigation"
                              value={verificationData.irrigationMethod}
                              onChange={(e) => setVerificationData({ ...verificationData, irrigationMethod: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className={labelClassName}>Water Source</label>
                            <input
                              className={inputClassName}
                              placeholder="e.g. borewell"
                              value={verificationData.waterSource}
                              onChange={(e) => setVerificationData({ ...verificationData, waterSource: e.target.value })}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className={labelClassName}>Seed Source</label>
                            <input
                              className={inputClassName}
                              placeholder="e.g. certified local nursery"
                              value={verificationData.seedSource}
                              onChange={(e) => setVerificationData({ ...verificationData, seedSource: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className={labelClassName}>Buffer Zone Width</label>
                            <input
                              className={inputClassName}
                              placeholder="e.g. 10 meters"
                              value={verificationData.bufferZoneWidth}
                              onChange={(e) => setVerificationData({ ...verificationData, bufferZoneWidth: e.target.value })}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className={labelClassName}>Fertilizer Used</label>
                            <input
                              className={inputClassName}
                              placeholder="e.g. vermicompost"
                              value={verificationData.fertilizerUsed}
                              onChange={(e) => setVerificationData({ ...verificationData, fertilizerUsed: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className={labelClassName}>Pesticide Used</label>
                            <input
                              className={inputClassName}
                              placeholder="e.g. neem oil"
                              value={verificationData.pesticideUsed}
                              onChange={(e) => setVerificationData({ ...verificationData, pesticideUsed: e.target.value })}
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <label className={labelClassName}>Input Purchase Records</label>
                            <SpeechToTextButton language={language} onText={(text) => appendSpeechText("inputPurchaseRecords", text)} />
                          </div>
                          <textarea
                            className={inputClassName}
                            rows={2}
                            placeholder="Mention bills, supplier names, and organic input proofs"
                            value={verificationData.inputPurchaseRecords}
                            onChange={(e) => setVerificationData({ ...verificationData, inputPurchaseRecords: e.target.value })}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <label className={labelClassName}>Contamination Risks</label>
                            <SpeechToTextButton language={language} onText={(text) => appendSpeechText("contaminationRisks", text)} />
                          </div>
                          <textarea
                            className={inputClassName}
                            rows={2}
                            placeholder="Nearby chemical farms, runoff, storage contamination, etc."
                            value={verificationData.contaminationRisks}
                            onChange={(e) => setVerificationData({ ...verificationData, contaminationRisks: e.target.value })}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <label className={labelClassName}>Recommendations</label>
                            <SpeechToTextButton language={language} onText={(text) => appendSpeechText("recommendations", text)} />
                          </div>
                          <textarea
                            className={inputClassName}
                            rows={2}
                            placeholder="Recommended corrective actions or monitoring notes"
                            value={verificationData.recommendations}
                            onChange={(e) => setVerificationData({ ...verificationData, recommendations: e.target.value })}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <label className={labelClassName}>Auditor Notes</label>
                            <SpeechToTextButton language={language} onText={(text) => appendSpeechText("auditorNotes", text)} />
                          </div>
                          <textarea
                            className={inputClassName}
                            rows={3}
                            placeholder="Detailed field observations"
                            value={verificationData.auditorNotes}
                            onChange={(e) => setVerificationData({ ...verificationData, auditorNotes: e.target.value })}
                          />
                        </div>

                        <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3">
                          <input
                            type="checkbox"
                            id="organic"
                            className="h-4 w-4 rounded text-green-600"
                            checked={verificationData.isOrganicCertified}
                            onChange={(e) => setVerificationData({ ...verificationData, isOrganicCertified: e.target.checked })}
                          />
                          <label htmlFor="organic" className="text-sm font-bold text-green-700">Approve for Auditor 2 review</label>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
                          <div className="mb-2 flex items-center gap-2 text-blue-700">
                            <FileText className="h-4 w-4" />
                            <h4 className="text-xs font-bold uppercase">Auditor 1 Inspection Record</h4>
                          </div>
                          <div className="space-y-1 text-sm text-gray-700">
                            <p><span className="text-gray-500">Reference Number:</span> {selectedFarm.auditor1Data?.referenceNumber || "Not assigned"}</p>
                            <p><span className="text-gray-500">Inspection Date:</span> {selectedFarm.auditor1Data?.inspectionDate || "N/A"}</p>
                            <p><span className="text-gray-500">Farm Area:</span> {selectedFarm.auditor1Data?.farmAreaAcres || "N/A"}</p>
                            <p><span className="text-gray-500">Soil Condition:</span> {selectedFarm.auditor1Data?.soilCondition || "N/A"}</p>
                            <p><span className="text-gray-500">Irrigation:</span> {selectedFarm.auditor1Data?.irrigationMethod || "N/A"}</p>
                            <p><span className="text-gray-500">Water Source:</span> {selectedFarm.auditor1Data?.waterSource || "N/A"}</p>
                            <p><span className="text-gray-500">Seed Source:</span> {selectedFarm.auditor1Data?.seedSource || "N/A"}</p>
                            <p><span className="text-gray-500">Fertilizer:</span> {selectedFarm.auditor1Data?.fertilizerUsed || "N/A"}</p>
                            <p><span className="text-gray-500">Pesticide:</span> {selectedFarm.auditor1Data?.pesticideUsed || "N/A"}</p>
                            <p><span className="text-gray-500">Contamination Risks:</span> {selectedFarm.auditor1Data?.contaminationRisks || "N/A"}</p>
                            <p className="mt-2 italic text-gray-600">"{selectedFarm.auditor1Data?.auditorNotes || "No notes"}"</p>
                          </div>
                        </div>

                        <div className="rounded-lg border border-purple-100 bg-purple-50 p-3 text-xs text-purple-800">
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            Auditor 2 was notified by email when Auditor 1 approved this farm.
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className={labelClassName}>Reference Number</label>
                          <input
                            className={`${inputClassName} bg-gray-100`}
                            value={selectedFarm.auditor1Data?.referenceNumber || verificationData.referenceNumber}
                            readOnly
                          />
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <label className={labelClassName}>Technical Review Memo</label>
                            <SpeechToTextButton language={language} onText={(text) => appendSpeechText("technicalReviewMemo", text)} />
                          </div>
                          <textarea
                            className={inputClassName}
                            rows={3}
                            placeholder="Final technical compliance summary"
                            value={verificationData.technicalReviewMemo}
                            onChange={(e) => setVerificationData({ ...verificationData, technicalReviewMemo: e.target.value })}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <label className={labelClassName}>Compliance Checklist</label>
                            <SpeechToTextButton language={language} onText={(text) => appendSpeechText("complianceChecklist", text)} />
                          </div>
                          <textarea
                            className={inputClassName}
                            rows={2}
                            placeholder="Checklist results and standards reviewed"
                            value={verificationData.complianceChecklist}
                            onChange={(e) => setVerificationData({ ...verificationData, complianceChecklist: e.target.value })}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <label className={labelClassName}>Follow-up Notes</label>
                            <SpeechToTextButton language={language} onText={(text) => appendSpeechText("followUpNotes", text)} />
                          </div>
                          <textarea
                            className={inputClassName}
                            rows={2}
                            placeholder="Any final follow-up actions"
                            value={verificationData.followUpNotes}
                            onChange={(e) => setVerificationData({ ...verificationData, followUpNotes: e.target.value })}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <label className={labelClassName}>Auditor Notes</label>
                            <SpeechToTextButton language={language} onText={(text) => appendSpeechText("auditorNotes", text)} />
                          </div>
                          <textarea
                            className={inputClassName}
                            rows={2}
                            placeholder="Additional Auditor 2 notes"
                            value={verificationData.auditorNotes}
                            onChange={(e) => setVerificationData({ ...verificationData, auditorNotes: e.target.value })}
                          />
                        </div>

                        <div className="flex items-center gap-2 rounded-lg bg-blue-50 p-3">
                          <input
                            type="checkbox"
                            id="organic2"
                            className="h-4 w-4 rounded text-blue-600"
                            checked={verificationData.isOrganicCertified}
                            onChange={(e) => setVerificationData({ ...verificationData, isOrganicCertified: e.target.checked })}
                          />
                          <label htmlFor="organic2" className="text-sm font-bold text-blue-700">Final Organic Certification</label>
                        </div>
                      </div>
                    )}

                    <Button
                      className={`h-12 w-full font-bold shadow-lg ${user.role === "auditor1" ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"}`}
                      onClick={() => handleVerify(selectedFarm._id)}
                      disabled={isSubmitting}
                    >
                      {isSubmitting
                        ? "Submitting..."
                        : user.role === "auditor1"
                          ? "Approve and Email Auditor 2"
                          : "Finalize Certification"}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ) : (
              <div className="flex min-h-[400px] h-full items-center justify-center rounded-xl border-2 border-dashed border-gray-200 p-8 text-center text-gray-400">
                <div className="space-y-4">
                  <ShieldCheck className="mx-auto h-12 w-12 opacity-20" />
                  <p>Select a farm from the queue to perform {user.role === "auditor1" ? "Phase 1 verification" : "Phase 2 technical review"}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5" />
            <div>
              Email notifications depend on your SMTP settings in `.env.local`. If Gmail app-password setup is incomplete, approvals will still save, but the notification content will only be logged on the server.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
