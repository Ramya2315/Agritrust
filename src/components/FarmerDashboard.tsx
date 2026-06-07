import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Plus, MapPin, Thermometer, Droplets, Wind, QrCode, FileBadge, Image as ImageIcon, CheckCircle2, Clock, Leaf, AlertTriangle, UserCheck, ShieldCheck, Brain, TrendingUp, UserPen } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { buildCertificatePageUrl } from "@/lib/certificateLinks";
import { useI18n } from "@/lib/i18n";
import GeoTaggedCameraCapture from "@/components/GeoTaggedCameraCapture";
import SpeechToTextButton from "@/components/SpeechToTextButton";

interface FarmerDashboardProps {
  onNavigate?: (page: string) => void;
  onOpenCertificate?: (farm: any) => void;
  qrOnly?: boolean;
}

const defaultFarmFormData = {
  cropType: "",
  soilType: "",
  location: { lat: 0, lng: 0 },
  cropPhoto: "",
  productImage: "",
  plantImage: "",
  geoTaggedImages: [],
  images: [], // Deprecated
  iotData: {
    moisture: 45,
    ph: 6.5,
    temperature: 28
  }
};

const getFarmDraftKey = (user: any) => `agritrustra:farm-registration-draft:${user?._id || user?.id || user?.email || "guest"}`;
const getFarmCacheKey = (user: any) => `agritrustra:registered-farms:${user?._id || user?.id || user?.email || "guest"}`;

const readFarmRegistrationDraft = (user: any) => {
  try {
    const savedDraft = localStorage.getItem(getFarmDraftKey(user));
    if (!savedDraft) return defaultFarmFormData;

    return {
      ...defaultFarmFormData,
      ...JSON.parse(savedDraft)
    };
  } catch {
    return defaultFarmFormData;
  }
};

const readRegisteredFarmCache = (user: any) => {
  try {
    const savedFarms = localStorage.getItem(getFarmCacheKey(user));
    const parsed = savedFarms ? JSON.parse(savedFarms) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const mergeFarmsById = (primary: any[], backup: any[]) => {
  const farmMap = new Map<string, any>();

  backup.forEach(farm => {
    const id = String(farm?._id || "");
    if (id) farmMap.set(id, farm);
  });

  primary.forEach(farm => {
    const id = String(farm?._id || "");
    if (id) farmMap.set(id, farm);
  });

  return Array.from(farmMap.values()).sort((a, b) =>
    new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );
};

export default function FarmerDashboard({ onNavigate, onOpenCertificate, qrOnly = false }: FarmerDashboardProps) {
  const { language, t } = useI18n();
  const storedUser = (() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      return {};
    }
  })();
  const [farms, setFarms] = useState<any[]>(() => readRegisteredFarmCache(storedUser));
  const [isRegistering, setIsRegistering] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSensorSyncing, setIsSensorSyncing] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [profileData, setProfileData] = useState({
    name: storedUser.name || "",
    phone: storedUser.phone || "",
    email: storedUser.email || "",
    address: storedUser.address || ""
  });

  const isHiddenAiFailureNotification = (notification: any) => {
    if (typeof notification?.message !== "string") return false;

    const message = notification.message.toLowerCase();
    return (
      message.includes("ai analysis could not run") ||
      message.includes("ai analysis failed") ||
      message.includes("ai detected disease") ||
      message.includes("certificate was not issued") ||
      message.includes("ai analysis confirmed non-organic") ||
      message.includes("organic status could not be confirmed")
    );
  };

  const visibleNotifications = farms
    .flatMap(f => f.notifications || [])
    .filter(notif => !isHiddenAiFailureNotification(notif))
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 3);
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'certified':
        return { color: 'bg-green-500', icon: <CheckCircle2 className="h-3 w-3 mr-1" />, label: 'Certified Organic' };
      case 'failed_ai_verification':
        return { color: 'bg-red-500', icon: <AlertTriangle className="h-3 w-3 mr-1" />, label: 'AI Rejected' };
      case 'auditor1_verified':
        return { color: 'bg-blue-500', icon: <UserCheck className="h-3 w-3 mr-1" />, label: 'Auditor 1 Verified' };
      case 'auditor2_verified':
        return { color: 'bg-purple-500', icon: <ShieldCheck className="h-3 w-3 mr-1" />, label: 'Auditor 2 Verified' };
      case 'ai_analyzed':
        return { color: 'bg-indigo-500', icon: <Brain className="h-3 w-3 mr-1" />, label: 'AI Analyzed' };
      case 'pending':
      default:
        return { color: 'bg-yellow-500', icon: <Clock className="h-3 w-3 mr-1" />, label: 'Pending Verification' };
    }
  };

  const formatPercent = (value: any, digits = 2) =>
    typeof value === "number" ? `${(value * 100).toFixed(digits)}%` : "N/A";

  const formatMarketPrice = (price: any) =>
    typeof price === "number" ? `Rs ${price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "N/A";

  const getMarketProductName = (farm: any) => {
    const product = String(farm?.aiReport?.marketPrice?.product || "").trim();
    return product || "N/A";
  };

  const formatDiseaseName = (value: any) =>
    String(value || "").replaceAll("_", " ").trim();

  const getDiseaseDisplayName = (farm: any) => {
    const report = farm?.aiReport || {};
    const diseaseName = formatDiseaseName(report.diseaseName);
    const predictedClass = formatDiseaseName(report.predictedClass);
    const topPrediction = formatDiseaseName(report.topPredictions?.[0]?.label);

    return diseaseName || predictedClass || topPrediction || "N/A";
  };

  const shouldShowAiResult = (farm: any) =>
    Boolean(farm?.aiReport);

  const isAiRejected = (farm: any) =>
    farm?.status === "failed_ai_verification" || farm?.aiReport?.isOrganic === false;

  const getAiRejectionReasons = (farm: any) => {
    const report = farm?.aiReport || {};
    const reasons: string[] = [];

    if (report.diseaseDetected) {
      reasons.push(`Disease detected: ${getDiseaseDisplayName(farm)}`);
    }
    if (report.isHealthy === false || report.plantHealth) {
      reasons.push(`Plant health: ${report.plantHealth || "Not healthy"}`);
    }
    if (report.isAgriculturalLand === false) {
      reasons.push("Uploaded image was not confidently identified as agricultural land or crop evidence");
    }
    if (report.iotAssessment?.isOrganicSafe === false) {
      reasons.push(report.iotAssessment.reason || "IoT moisture, pH, or temperature readings were outside the organic safety range");
    }
    if (typeof report.accuracy === "number" && report.accuracy < 0.65) {
      reasons.push(`AI confidence was below threshold: ${(report.accuracy * 100).toFixed(2)}%`);
    }
    if (report.auditorConsensusRequired && report.isOrganic !== true) {
      reasons.push("AI and auditor evidence did not confirm organic certification requirements");
    }

    return reasons.length > 0 ? reasons : ["AI analysis did not confirm healthy organic status."];
  };

  const certifiedFarms = farms.filter(farm => farm.status === "certified" && buildCertificatePageUrl(farm));
  
  const farmDraftKey = getFarmDraftKey(storedUser);
  const farmCacheKey = getFarmCacheKey(storedUser);
  const [formData, setFormData] = useState(() => readFarmRegistrationDraft(storedUser));

  const appendProfileSpeechText = (field: "name" | "address", text: string) => {
    setProfileData(prev => ({
      ...prev,
      [field]: [prev[field], text].filter(Boolean).join(" ").trim()
    }));
  };

  const saveFarmCache = (nextFarms: any[]) => {
    try {
      localStorage.setItem(farmCacheKey, JSON.stringify(nextFarms));
    } catch {
      // Large image payloads can exceed local storage; backend records remain the source of truth.
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const img = new Image();
        img.src = reader.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const getCurrentGeoTag = (): Promise<{ lat: number; lng: number; accuracy: number | null }> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({
          lat: formData.location.lat,
          lng: formData.location.lng,
          accuracy: null
        });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null
        }),
        () => resolve({
          lat: formData.location.lat,
          lng: formData.location.lng,
          accuracy: null
        }),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'cropPhoto' | 'productImage' | 'plantImage') => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const base64 = await fileToBase64(file);
        const geoTag = await getCurrentGeoTag();
        const label = field.replace(/([A-Z])/g, ' $1').trim();
        setFormData(prev => ({
          ...prev,
          [field]: base64,
          location: prev.location?.lat || prev.location?.lng ? prev.location : { lat: geoTag.lat, lng: geoTag.lng },
          geoTaggedImages: [
            ...(prev.geoTaggedImages || []).filter((image: any) => image.field !== field),
            {
              field,
              label,
              image: base64,
              lat: geoTag.lat,
              lng: geoTag.lng,
              accuracy: geoTag.accuracy,
              capturedAt: new Date().toISOString()
            }
          ]
        }));
        toast.success(`${label} uploaded with geo tag`);
      } catch (err) {
        toast.error("Failed to process image");
      }
    }
  };

  const handleGeoTaggedCapture = (field: 'cropPhoto' | 'productImage' | 'plantImage', geoTag: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: geoTag.image,
      location: { lat: geoTag.lat, lng: geoTag.lng },
      geoTaggedImages: [
        ...(prev.geoTaggedImages || []).filter((image: any) => image.field !== field),
        { ...geoTag, field }
      ]
    }));
    toast.success(`${geoTag.label} captured with camera and GPS`);
  };

  const clearGeoTaggedCapture = (field: 'cropPhoto' | 'productImage' | 'plantImage') => {
    setFormData(prev => ({
      ...prev,
      [field]: "",
      geoTaggedImages: (prev.geoTaggedImages || []).filter((image: any) => image.field !== field)
    }));
  };

  useEffect(() => {
    fetchFarms();
    // Get geolocation
    navigator.geolocation.getCurrentPosition((pos) => {
      setFormData(prev => ({
        ...prev,
        location: prev.location?.lat || prev.location?.lng
          ? prev.location
          : { lat: pos.coords.latitude, lng: pos.coords.longitude }
      }));
    });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(farmDraftKey, JSON.stringify(formData));
    } catch {
      // Browsers can reject large image drafts; farm registration still works normally.
    }
  }, [farmDraftKey, formData]);

  const fetchFarms = async () => {
    try {
      const res = await fetch("/api/farms/my", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      const data = await res.json();

      if (!res.ok || !Array.isArray(data)) {
        throw new Error(data.error || "Failed to load registered farms");
      }

      saveFarmCache(data);
      setFarms(data);
    } catch (err: any) {
      const cachedFarms = readRegisteredFarmCache(storedUser);
      if (cachedFarms.length > 0) {
        setFarms(cachedFarms);
      } else {
        toast.error(err.message || "Failed to load registered farms");
      }
    }
  };

  const handleProfileSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSavingProfile(true);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({
          name: profileData.name,
          phone: profileData.phone,
          address: profileData.address
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update farmer details");
      }

      localStorage.setItem("user", JSON.stringify(data.user));
      setProfileData({
        name: data.user.name || "",
        phone: data.user.phone || "",
        email: data.user.email || "",
        address: data.user.address || ""
      });
      setFarms(previous => {
        const updatedFarms = previous.map(farm => ({ ...farm, farmerName: data.user.name || farm.farmerName }));
        saveFarmCache(updatedFarms);
        return updatedFarms;
      });
      setIsEditingProfile(false);
      toast.success("Farmer details updated");
    } catch (err: any) {
      toast.error(err.message || "Failed to update farmer details");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const missingFields = [];
    if (!formData.cropType) missingFields.push("Crop Type");
    if (!formData.soilType) missingFields.push("Soil Type");
    if (!formData.cropPhoto) missingFields.push("Crop Photo");
    if (!formData.productImage) missingFields.push("Product Image");
    if (!formData.plantImage) missingFields.push("Plant Image");
    if (!Array.isArray(formData.geoTaggedImages) || formData.geoTaggedImages.length < 3) {
      missingFields.push("Geo-tagged Image Data");
    }

    if (missingFields.length > 0) {
      toast.error(`Please complete all fields: ${missingFields.join(", ")}`);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/farms", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({
          ...formData,
          images: [formData.cropPhoto, formData.productImage, formData.plantImage], // Supporting legacy images array
          geoTaggedImages: formData.geoTaggedImages
        })
      });
      if (res.ok) {
        const registeredFarm = await res.json();
        const registeredFarmWithDetails = {
          ...registeredFarm,
          farmerName: registeredFarm.farmerName || profileData.name || storedUser.name || "Registered Farmer"
        };
        toast.success("Farm registered successfully! Waiting for auditor verification.");
        setFarms(previous => {
          const mergedFarms = mergeFarmsById([registeredFarmWithDetails], previous);
          saveFarmCache(mergedFarms);
          return mergedFarms;
        });
        try {
          localStorage.removeItem(farmDraftKey);
        } catch {
          // Ignore storage cleanup issues.
        }
        setFormData(defaultFarmFormData);
        setIsRegistering(false);
        setCurrentStep(1);
        fetchFarms();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to register farm");
      }
    } catch (err) {
      toast.error("An error occurred during registration");
    } finally {
      setIsLoading(false);
    }
  };

  const syncSimulatedSensors = async () => {
    setIsSensorSyncing(true);
    try {
      const res = await fetch("/api/iot/simulate?hours=24&intervalMinutes=30");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Sensor simulation failed");
      }
      setFormData(prev => ({
        ...prev,
        iotData: {
          moisture: Number(data.latest.moisture.toFixed(1)),
          ph: Number(data.latest.ph.toFixed(2)),
          temperature: Number(data.latest.temperature.toFixed(1))
        }
      }));
      toast.success("IoT sensor simulation synced");
    } catch (err: any) {
      toast.error(err.message || "Failed to sync IoT simulation");
    } finally {
      setIsSensorSyncing(false);
    }
  };

  const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, 3));
  const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));

  const runAIAnalysis = async (farmId: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/farms/${farmId}/ai-analyze`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      const data = await res.json();
      if (res.ok) {
        if (data.aiReport.isOrganic) {
          toast.success("AI Analysis Complete: Successfully verified and is organic!");
        } else {
          toast.error("AI Analysis Complete: Organic status could not be confirmed.");
        }
        fetchFarms();
      } else {
        toast.error(data.error || "AI Analysis failed");
      }
    } catch (err) {
      toast.error("AI Analysis failed");
    } finally {
      setIsLoading(false);
    }
  };

  if (qrOnly) {
    return (
      <div className="min-h-screen pt-24 pb-12 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">{t("qrCodesOnly")}</h1>
            <p className="text-gray-500">{t("qrCodesOnlyDesc")}</p>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {certifiedFarms.map(farm => (
              <Card key={farm._id} className="text-center">
                <CardHeader>
                  <CardTitle className="capitalize">{farm.cropType} {t("qrCode")}</CardTitle>
                  <CardDescription>{farm.farmerName || profileData.name || t("farmer")}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-4">
                  <QRCodeSVG value={buildCertificatePageUrl(farm)} size={220} />
                  <p className="max-w-full break-all font-mono text-[11px] text-gray-500">{buildCertificatePageUrl(farm)}</p>
                </CardContent>
              </Card>
            ))}
            {certifiedFarms.length === 0 && (
              <div className="col-span-full rounded-lg border border-dashed bg-white p-12 text-center text-gray-500">
                <QrCode className="mx-auto mb-4 h-12 w-12 text-gray-300" />
                <div className="font-semibold text-gray-800">{t("noQrCodes")}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-12 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Notifications Section */}
        {visibleNotifications.length > 0 && (
          <div className="mb-8 space-y-4">
            {visibleNotifications.map((notif: any, i: number) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className={`p-4 rounded-lg border flex items-center gap-3 ${
                  notif.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 
                  notif.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 
                  'bg-blue-50 border-blue-200 text-blue-700'
                }`}
              >
                {notif.type === 'error' ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                <p className="text-sm font-medium">{notif.message}</p>
              </motion.div>
            ))}
          </div>
        )}

        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{t("farmerDashboard")}</h1>
            <p className="text-gray-500">{t("manageFarms")}</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setIsEditingProfile(value => !value)}>
              <UserPen className="mr-2 h-4 w-4" /> Edit Farmer Details
            </Button>
            <Button onClick={() => { setIsRegistering(true); setCurrentStep(1); }} className="bg-green-600 hover:bg-green-700">
              <Plus className="mr-2 h-4 w-4" /> Register New Farm
            </Button>
          </div>
        </div>

        {isEditingProfile && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <Card>
              <CardHeader>
                <CardTitle>Edit Farmer Details</CardTitle>
                <CardDescription>These details are used on the dashboard and printed certificates.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleProfileSave} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label>Farmer Name</Label>
                      <SpeechToTextButton language={language} onText={(text) => appendProfileSpeechText("name", text)} />
                    </div>
                    <Input
                      value={profileData.name}
                      onChange={event => setProfileData(prev => ({ ...prev, name: event.target.value }))}
                      placeholder="Enter farmer name"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone Number</Label>
                    <Input
                      value={profileData.phone}
                      onChange={event => setProfileData(prev => ({ ...prev, phone: event.target.value.replace(/\D/g, "").slice(0, 10) }))}
                      placeholder="10 digit phone number"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email Address</Label>
                    <Input value={profileData.email} disabled className="bg-gray-50" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label>Address</Label>
                      <SpeechToTextButton language={language} onText={(text) => appendProfileSpeechText("address", text)} />
                    </div>
                    <Input
                      value={profileData.address}
                      onChange={event => setProfileData(prev => ({ ...prev, address: event.target.value }))}
                      placeholder="Village, district, state"
                    />
                  </div>
                  <div className="md:col-span-2 flex justify-end gap-3 pt-2">
                    <Button type="button" variant="ghost" onClick={() => setIsEditingProfile(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" className="bg-green-600 hover:bg-green-700" disabled={isSavingProfile}>
                      {isSavingProfile ? "Saving..." : "Save Details"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {isRegistering && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-12">
            <Card className="max-w-2xl mx-auto">
              <CardHeader>
                <div className="flex justify-between items-center mb-4">
                  <div className="flex gap-2">
                    {[1, 2, 3].map((step) => (
                      <div 
                        key={step} 
                        className={`h-2 w-12 rounded-full transition-colors ${currentStep >= step ? 'bg-green-600' : 'bg-gray-200'}`}
                      />
                    ))}
                  </div>
                  <span className="text-sm font-medium text-gray-500">Step {currentStep} of 3</span>
                </div>
                <CardTitle>Register Farm</CardTitle>
                <CardDescription>
                  {currentStep === 1 && "Basic Information"}
                  {currentStep === 2 && "Location & IoT Sensors"}
                  {currentStep === 3 && "Media Upload"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleRegister} className="space-y-6">
                  {currentStep === 1 && (
                    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                      <div className="space-y-2">
                        <Label>Crop Type</Label>
                        <Select onValueChange={(v) => setFormData({...formData, cropType: v})} value={formData.cropType}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select crop type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="wheat">Wheat</SelectItem>
                            <SelectItem value="rice">Rice</SelectItem>
                            <SelectItem value="tomato">Tomato</SelectItem>
                            <SelectItem value="vegetables">Vegetables</SelectItem>
                            <SelectItem value="mango">Mango</SelectItem>
                            <SelectItem value="banana">Banana</SelectItem>
                            <SelectItem value="apple">Apple</SelectItem>
                            <SelectItem value="water apple">Water Apple</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Soil Type</Label>
                        <Select onValueChange={(v) => setFormData({...formData, soilType: v})} value={formData.soilType}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select soil type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="alluvial">Alluvial</SelectItem>
                            <SelectItem value="black">Black</SelectItem>
                            <SelectItem value="red">Red</SelectItem>
                            <SelectItem value="laterite">Laterite</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </motion.div>
                  )}

                  {currentStep === 2 && (
                    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                      <div className="space-y-2">
                        <Label>Geolocation</Label>
                        <div className="flex items-center gap-2 p-4 bg-green-50 rounded-lg text-sm text-green-700 border border-green-100">
                          <MapPin className="h-5 w-5" />
                          <div className="font-medium">
                            Latitude: {formData.location.lat.toFixed(6)}<br />
                            Longitude: {formData.location.lng.toFixed(6)}
                          </div>
                        </div>
                        <p className="text-[10px] text-gray-400 italic">Automatically detected via GPS</p>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between gap-3">
                          <Label>IoT Sensor Data (Simulated)</Label>
                          <Button type="button" variant="outline" size="sm" onClick={syncSimulatedSensors} disabled={isSensorSyncing}>
                            {isSensorSyncing ? "Syncing..." : "Sync Sensors"}
                          </Button>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div className="p-3 bg-blue-50 rounded-lg text-center border border-blue-100">
                            <Droplets className="h-5 w-5 text-blue-600 mx-auto mb-1" />
                            <div className="text-[10px] text-blue-600 font-bold uppercase">Moisture</div>
                            <div className="text-lg font-bold">{formData.iotData.moisture}%</div>
                          </div>
                          <div className="p-3 bg-orange-50 rounded-lg text-center border border-orange-100">
                            <Thermometer className="h-5 w-5 text-orange-600 mx-auto mb-1" />
                            <div className="text-[10px] text-orange-600 font-bold uppercase">Temp</div>
                            <div className="text-lg font-bold">{formData.iotData.temperature}°C</div>
                          </div>
                          <div className="p-3 bg-green-50 rounded-lg text-center border border-green-100">
                            <Wind className="h-5 w-5 text-green-600 mx-auto mb-1" />
                            <div className="text-[10px] text-green-600 font-bold uppercase">pH</div>
                            <div className="text-lg font-bold">{formData.iotData.ph}</div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {currentStep === 3 && (
                    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                      <div className="grid grid-cols-1 gap-4">
                        <GeoTaggedCameraCapture
                          label="Crop Photo"
                          field="cropPhoto"
                          value={formData.cropPhoto}
                          geoTag={(formData.geoTaggedImages || []).find((image: any) => image.field === "cropPhoto")}
                          onCapture={(geoTag) => handleGeoTaggedCapture("cropPhoto", geoTag)}
                          onClear={() => clearGeoTaggedCapture("cropPhoto")}
                        />
                        <GeoTaggedCameraCapture
                          label="Product Image"
                          field="productImage"
                          value={formData.productImage}
                          geoTag={(formData.geoTaggedImages || []).find((image: any) => image.field === "productImage")}
                          onCapture={(geoTag) => handleGeoTaggedCapture("productImage", geoTag)}
                          onClear={() => clearGeoTaggedCapture("productImage")}
                        />
                        <GeoTaggedCameraCapture
                          label="Plant Image"
                          field="plantImage"
                          value={formData.plantImage}
                          geoTag={(formData.geoTaggedImages || []).find((image: any) => image.field === "plantImage")}
                          onCapture={(geoTag) => handleGeoTaggedCapture("plantImage", geoTag)}
                          onClear={() => clearGeoTaggedCapture("plantImage")}
                        />
                      </div>
                      <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-100 flex gap-3">
                        <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0" />
                        <p className="text-xs text-yellow-700">
                          Capture all three images using camera permission. Each photo is stamped with current GPS coordinates, address, and capture time.
                        </p>
                      </div>
                      {(formData.geoTaggedImages || []).length > 0 && (
                        <div className="rounded-lg border border-green-100 bg-green-50 p-4">
                          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase text-green-700">
                            <MapPin className="h-4 w-4" /> Geo-tagged Uploads
                          </div>
                          <div className="space-y-2">
                            {(formData.geoTaggedImages || []).map((image: any) => (
                              <div key={image.field} className="flex items-center justify-between gap-3 rounded-md bg-white/80 px-3 py-2 text-xs">
                                <span className="font-semibold text-gray-800">{image.label}</span>
                                <span className="text-gray-500">
                                  {Number(image.lat).toFixed(5)}, {Number(image.lng).toFixed(5)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}

                  <div className="flex justify-between pt-4 border-t">
                    <Button 
                      type="button" 
                      variant="ghost" 
                      onClick={currentStep === 1 ? () => setIsRegistering(false) : prevStep}
                    >
                      {currentStep === 1 ? "Cancel" : "Previous"}
                    </Button>
                    
                    {currentStep < 3 ? (
                      <Button 
                        type="button" 
                        onClick={nextStep} 
                        className="bg-green-600 hover:bg-green-700"
                        disabled={currentStep === 1 && !formData.cropType}
                      >
                        Next Step
                      </Button>
                    ) : (
                      <Button 
                        type="submit" 
                        className="bg-green-600 hover:bg-green-700" 
                        disabled={isLoading}
                      >
                        {isLoading ? "Registering..." : "Complete Registration"}
                      </Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {farms.map((farm) => (
            <motion.div key={farm._id} layout>
              <Card className="overflow-hidden hover:shadow-lg transition-shadow">
                <div className="h-48 bg-cover bg-center" style={{ backgroundImage: `url(${farm.cropPhoto || farm.images[0]})` }}>
                  <div className="p-4">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider text-white ${getStatusBadge(farm.status).color}`}>
                      {getStatusBadge(farm.status).icon}
                      {getStatusBadge(farm.status).label}
                    </span>
                  </div>
                </div>
                <CardContent className="pt-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 capitalize">{farm.cropType} Farm</h3>
                      <p className="text-sm text-gray-500 capitalize">{farm.soilType} Soil</p>
                    </div>
                    {farm.status === 'certified' && (
                      <div className="p-2 bg-green-100 rounded-full">
                        <CheckCircle2 className="h-6 w-6 text-green-600" />
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 border-t pt-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Farmer</span>
                      <span className="font-medium">{farm.farmerName || "Farmer name unavailable"}</span>
                    </div>

                    <div className="flex justify-between text-sm mb-4">
                      <span className="text-gray-500 font-medium">Verification Progress</span>
                    </div>
                    
                    <div className="relative flex justify-between items-center px-2">
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-0.5 bg-gray-200 -z-10"></div>
                      
                      {/* Auditor 1 Step */}
                      <div className="flex flex-col items-center gap-1">
                        <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          ['auditor1_verified', 'auditor2_verified', 'ai_analyzed', 'certified'].includes(farm.status) 
                          ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
                        }`}>
                          1
                        </div>
                        <span className="text-[8px] font-bold uppercase text-gray-400">Auditor 1</span>
                      </div>

                      {/* Auditor 2 Step */}
                      <div className="flex flex-col items-center gap-1">
                        <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          ['auditor2_verified', 'ai_analyzed', 'certified'].includes(farm.status) 
                          ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
                        }`}>
                          2
                        </div>
                        <span className="text-[8px] font-bold uppercase text-gray-400">Auditor 2</span>
                      </div>

                      {/* AI Step */}
                      <div className="flex flex-col items-center gap-1">
                        <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          farm.status === 'failed_ai_verification'
                            ? 'bg-red-500 text-white'
                            : ['ai_analyzed', 'certified'].includes(farm.status) 
                              ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
                        }`}>
                          {farm.status === 'failed_ai_verification' ? <AlertTriangle className="h-3 w-3" /> : <Brain className="h-3 w-3" />}
                        </div>
                        <span className={`text-[8px] font-bold uppercase ${farm.status === 'failed_ai_verification' ? 'text-red-500' : 'text-gray-400'}`}>
                          {farm.status === 'failed_ai_verification' ? 'AI Rejected' : 'AI Analysis'}
                        </span>
                      </div>

                      {/* Final Step */}
                      <div className="flex flex-col items-center gap-1">
                        <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          farm.status === 'certified'
                            ? 'bg-green-600 text-white'
                            : farm.status === 'failed_ai_verification'
                              ? 'bg-red-100 text-red-600'
                              : 'bg-gray-200 text-gray-500'
                        }`}>
                          {farm.status === 'failed_ai_verification' ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                        </div>
                        <span className={`text-[8px] font-bold uppercase ${farm.status === 'failed_ai_verification' ? 'text-red-500' : 'text-gray-400'}`}>
                          {farm.status === 'failed_ai_verification' ? 'Not Certified' : 'Certified'}
                        </span>
                      </div>
                    </div>

                    <div className="flex justify-between text-sm mt-6">
                      <span className="text-gray-500">Location</span>
                      <span className="font-medium">{farm.location.lat.toFixed(2)}, {farm.location.lng.toFixed(2)}</span>
                    </div>

                    {farm.status === 'auditor2_verified' && (
                      <div className="mt-4 p-4 bg-purple-50 border border-purple-100 rounded-lg">
                        <div className="flex items-center gap-2 text-purple-700 font-bold mb-3">
                          <Brain className="h-5 w-5" /> AI Analysis Ready
                        </div>
                        <Button 
                          className="w-full bg-purple-600 hover:bg-purple-700 h-10 font-bold" 
                          onClick={() => runAIAnalysis(farm._id)}
                          disabled={isLoading}
                        >
                          {isLoading ? "Running AI..." : "Run AI Organic Analysis"}
                        </Button>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Registered</span>
                      <span className="font-medium">{new Date(farm.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {shouldShowAiResult(farm) && (
                    <div className={`mt-5 rounded-lg border p-4 ${
                      isAiRejected(farm)
                        ? "border-red-100 bg-red-50"
                        : "border-purple-100 bg-purple-50"
                    }`}>
                      <div className={`mb-3 flex items-center gap-2 text-sm font-bold ${
                        isAiRejected(farm) ? "text-red-800" : "text-purple-800"
                      }`}>
                        {isAiRejected(farm) ? <AlertTriangle className="h-4 w-4" /> : <Brain className="h-4 w-4" />}
                        {isAiRejected(farm) ? "AI Rejection Report" : "Detailed AI Report"}
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <div className={`font-bold uppercase ${isAiRejected(farm) ? "text-red-500" : "text-purple-500"}`}>Organic Status</div>
                          <div className="font-semibold text-gray-900">{farm.aiReport.isOrganic ? "Confirmed" : "Rejected"}</div>
                        </div>
                        <div>
                          <div className={`font-bold uppercase ${isAiRejected(farm) ? "text-red-500" : "text-purple-500"}`}>Confidence</div>
                          <div className="font-semibold text-gray-900">{formatPercent(farm.aiReport.accuracy)}</div>
                        </div>
                        <div>
                          <div className={`font-bold uppercase ${isAiRejected(farm) ? "text-red-500" : "text-purple-500"}`}>{t("plantHealth")}</div>
                          <div className="font-semibold text-gray-900">{farm.aiReport.plantHealth || "N/A"}</div>
                        </div>
                        <div>
                          <div className={`font-bold uppercase ${isAiRejected(farm) ? "text-red-500" : "text-purple-500"}`}>{t("disease")}</div>
                          <div className="font-semibold capitalize text-gray-900">{getDiseaseDisplayName(farm)}</div>
                        </div>
                        <div>
                          <div className={`font-bold uppercase ${isAiRejected(farm) ? "text-red-500" : "text-purple-500"}`}>IoT Score</div>
                          <div className="font-semibold text-gray-900">{formatPercent(farm.aiReport.iotAssessment?.score, 0)}</div>
                        </div>
                      </div>
                      {isAiRejected(farm) && (
                        <div className="mt-3 rounded-md border border-red-100 bg-white/80 p-3 text-xs text-red-800">
                          <div className="font-semibold text-red-900">Why AI rejected this farm</div>
                          <ul className="mt-2 list-disc space-y-1 pl-4">
                            {getAiRejectionReasons(farm).map((reason) => (
                              <li key={reason}>{reason}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="mt-3 rounded-md bg-white/80 p-3 text-xs text-gray-700">
                        <div className="font-semibold text-gray-900">AI interpretation</div>
                        <p className="mt-1">{farm.aiReport.soilAnalysis || farm.aiReport.fertilizerUsage || "Analysis completed."}</p>
                      </div>
                      {farm.aiReport.iotAssessment?.reason && (
                        <div className="mt-3 text-xs text-gray-700">
                          <span className="font-semibold">IoT reason:</span>{" "}
                          {farm.aiReport.iotAssessment.reason}
                        </div>
                      )}
                      {farm.aiReport.predictedClass && (
                        <div className="mt-3 text-xs text-gray-700">
                          <span className="font-semibold">Predicted class:</span>{" "}
                          <span className="capitalize">{String(farm.aiReport.predictedClass).replaceAll("_", " ")}</span>
                        </div>
                      )}
                      {farm.aiReport.topPredictions?.length > 0 && (
                        <div className="mt-3 space-y-1 text-xs">
                          {farm.aiReport.topPredictions.slice(0, 3).map((prediction: any) => (
                            <div key={prediction.label} className="flex justify-between gap-3">
                              <span className="capitalize text-gray-600">{String(prediction.label).replaceAll("_", " ")}</span>
                              <span className="font-bold text-gray-900">{formatPercent(Number(prediction.confidence))}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {shouldShowAiResult(farm) && farm.aiReport?.marketPrice && (
                    <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50 p-4">
                      <div className="mb-3 flex items-center gap-2 text-sm font-bold text-emerald-800">
                        <TrendingUp className="h-4 w-4" /> Market Price
                      </div>
                      {farm.aiReport.marketPrice.available ? (
                        <>
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div>
                              <div className="text-emerald-600 font-bold uppercase">Product</div>
                              <div className="font-semibold text-gray-900 capitalize">{getMarketProductName(farm)}</div>
                            </div>
                            <div>
                              <div className="text-emerald-600 font-bold uppercase">Market</div>
                              <div className="font-semibold text-gray-900">{farm.aiReport.marketPrice.market}</div>
                            </div>
                            <div>
                              <div className="text-emerald-600 font-bold uppercase">Modal Price</div>
                              <div className="font-semibold text-gray-900">
                                {formatMarketPrice(farm.aiReport.marketPrice.modalPrice)} {farm.aiReport.marketPrice.unit}
                              </div>
                            </div>
                            <div>
                              <div className="text-emerald-600 font-bold uppercase">Recent Avg.</div>
                              <div className="font-semibold text-gray-900">
                                {formatMarketPrice(farm.aiReport.marketPrice.recentAverageModalPrice)} {farm.aiReport.marketPrice.unit}
                              </div>
                            </div>
                          </div>
                          <div className="mt-2 text-[11px] text-emerald-700">
                            Latest market date: {farm.aiReport.marketPrice.date || "N/A"}
                          </div>
                        </>
                      ) : (
                        <p className="text-xs text-emerald-700">{farm.aiReport.marketPrice.message}</p>
                      )}
                    </div>
                  )}

                  {farm.status === 'certified' && (
                    <div className="mt-6 grid grid-cols-2 gap-4">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full"
                        onClick={() => onOpenCertificate?.(farm)}
                      >
                        <FileBadge className="mr-2 h-4 w-4" /> Certificate
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full"
                        onClick={() => onNavigate?.("qr-codes")}
                      >
                        <QrCode className="mr-2 h-4 w-4" /> QR Code
                      </Button>
                    </div>
                  )}
                  
                  {farm.status === 'certified' && buildCertificatePageUrl(farm) && (
                    <div className="mt-4 p-4 bg-gray-50 rounded-lg flex flex-col items-center">
                      <QRCodeSVG value={buildCertificatePageUrl(farm)} size={128} />
                      <p className="text-[10px] text-gray-400 mt-2 font-mono break-all text-center">{buildCertificatePageUrl(farm)}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
          
          {farms.length === 0 && !isRegistering && (
            <div className="col-span-full text-center py-20 bg-white rounded-xl border-2 border-dashed border-gray-200">
              <Leaf className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No farms registered yet</h3>
              <p className="text-gray-500 mb-6">Start by registering your first farm for organic certification.</p>
              <Button onClick={() => setIsRegistering(true)} className="bg-green-600">Register Now</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
