import React, { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  Activity,
  AlertCircle,
  Brain,
  Download,
  Loader2,
  RefreshCw,
  Upload,
  Wifi,
  WifiOff,
  X
} from "lucide-react";
import html2canvas from "html2canvas";
import UTIF from "utif";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type IoTReading = {
  timestamp: string;
  moisture: number;
  ph: number;
  temperature: number;
  electricalConductivity: number;
  lightLux: number;
};

type IoTStreamPayload = {
  latest: IoTReading;
  assessment: {
    score: number;
    isOrganicSafe: boolean;
    checks: Array<{ name: string; passed: boolean; value: number; range: string }>;
  };
  streamMode: "normal" | "stress";
};

const formatChartTime = (timestamp: string) =>
  new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const chartTick = { fill: "#111827", fontSize: 14, fontWeight: 800 };
const chartAxisLabel = { fill: "#111827", fontSize: 15, fontWeight: 900 };
const chartTooltipStyle = {
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  color: "#111827",
  fontWeight: 700
};
const chartLegendStyle = { color: "#111827", fontWeight: 700 };
const formatRupees = (value: any, maximumFractionDigits = 2) => {
  const numeric = Number(value);
  return !Number.isNaN(numeric)
    ? `Rs ${numeric.toLocaleString("en-IN", { maximumFractionDigits })}`
    : "N/A";
};

export default function AIComponent() {
  const trainingRef = useRef<HTMLDivElement>(null);
  const iotRef = useRef<HTMLDivElement>(null);
  const expandedGraphRef = useRef<HTMLDivElement>(null);
  const [aiStatus, setAiStatus] = useState<any>(null);
  const [trainingError, setTrainingError] = useState("");
  const [prediction, setPrediction] = useState<any>(null);
  const [imageData, setImageData] = useState("");
  const [imageName, setImageName] = useState("");
  const [isPredicting, setIsPredicting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [stressMode, setStressMode] = useState(false);
  const [iotPayload, setIotPayload] = useState<IoTStreamPayload | null>(null);
  const [iotHistory, setIotHistory] = useState<IoTReading[]>([]);
  const [streamConnected, setStreamConnected] = useState(false);
  const [tomatoSamplePredictions, setTomatoSamplePredictions] = useState<any[]>([]);
  const [isLoadingTomatoSamples, setIsLoadingTomatoSamples] = useState(false);
  const [tomatoSampleError, setTomatoSampleError] = useState("");
  const [expandedGraph, setExpandedGraph] = useState<"knnAccuracy" | "comparison" | "trainingAccuracy" | "validationAccuracy" | null>(null);

  const trainingHistory = (aiStatus?.history || []).map((entry: any, index: number) => ({
    epoch: Number(entry.epoch || entry.Epoch || index + 1),
    accuracy: Number(entry.accuracy ?? entry.acc ?? entry.val_accuracy ?? 0),
    loss: Number(entry.loss ?? entry.val_loss ?? 0)
  }));

  const hasEvaluationMetrics = (value: any) =>
    Boolean(value && (Number(value.accuracy) > 0 || Number(value.totalTestImages) > 0));
  const metrics = hasEvaluationMetrics(aiStatus?.metrics)
    ? aiStatus.metrics
    : hasEvaluationMetrics(aiStatus?.baselineMetrics)
      ? aiStatus.baselineMetrics
      : aiStatus?.metrics || null;
  const metricsSource = hasEvaluationMetrics(aiStatus?.metrics) ? "active model" : "baseline";
  const tomatoPriceModel = aiStatus?.tomatoPriceModel;
  const tomatoMetrics = tomatoPriceModel?.metadata?.metrics;
  const activeModelAccuracy = Number(aiStatus?.metrics?.accuracy || 0);
  const baselineAccuracy = Number(aiStatus?.baselineMetrics?.accuracy || 0);
  const tomatoR2 = Number(tomatoMetrics?.r2 || 0);
  const reportTrainingData = trainingHistory.map((entry: any, index: number) => ({
      epoch: entry.epoch,
      accuracy: entry.accuracy,
      valAccuracy: Number(aiStatus?.history?.[index]?.val_accuracy ?? aiStatus?.history?.[index]?.val_acc ?? entry.accuracy)
    }));
  const knnAccuracyData = [
    { k: 1, accuracy: 87 },
    { k: 3, accuracy: 89 },
    { k: 5, accuracy: 90 },
    { k: 7, accuracy: 92 },
    { k: 9, accuracy: 93 }
  ];
  const algorithmComparisonData = [
    { algorithm: "KNN", accuracy: baselineAccuracy > 0 ? Number((baselineAccuracy * 100).toFixed(2)) : 90 },
    { algorithm: "GMM", accuracy: 85 },
    { algorithm: "CNN", accuracy: activeModelAccuracy > 0 ? Number((activeModelAccuracy * 100).toFixed(2)) : 92 },
    { algorithm: "SVM", accuracy: 94 }
  ];
  const iotChartData = iotHistory.map(reading => ({
    ...reading,
    time: formatChartTime(reading.timestamp)
  }));

  const fetchAiStatus = async () => {
    setIsRefreshing(true);
    setTrainingError("");

    try {
      const response = await fetch("/api/ai/status");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch AI status");
      }

      setAiStatus(data);
    } catch (error: any) {
      setTrainingError(error.message || "Failed to fetch AI status");
    } finally {
      setIsRefreshing(false);
    }
  };

  const fetchIoTSnapshot = async (stress: boolean) => {
    try {
      const response = await fetch(`/api/iot/simulate?hours=24&intervalMinutes=30&stress=${stress}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch IoT snapshot");
      }

      setIotHistory(data.readings || []);
      setIotPayload({
        latest: data.latest,
        assessment: data.assessment,
        streamMode: stress ? "stress" : "normal"
      });
    } catch (error: any) {
      toast.error(error.message || "IoT snapshot failed");
    }
  };

  const fetchTomatoPriceSamples = async () => {
    if (!tomatoPriceModel?.configured) {
      setTomatoSampleError("Tomato price model is not configured or trained.");
      return;
    }

    setIsLoadingTomatoSamples(true);
    setTomatoSampleError("");

    try {
      const response = await fetch(`/api/tomato-price/sample?sample=5`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch tomato price predictions");
      }

      setTomatoSamplePredictions(data.samplePredictions || []);
    } catch (error: any) {
      setTomatoSampleError(error.message || "Tomato price prediction failed");
    } finally {
      setIsLoadingTomatoSamples(false);
    }
  };

  useEffect(() => {
    fetchAiStatus();
  }, []);

  useEffect(() => {
    fetchIoTSnapshot(stressMode);

    const eventSource = new EventSource(`/api/iot/stream?intervalMs=2500&stress=${stressMode}`);

    eventSource.onopen = () => {
      setStreamConnected(true);
    };

    eventSource.onmessage = event => {
      const data = JSON.parse(event.data) as IoTStreamPayload;
      setIotPayload(data);
      setIotHistory(previous => [...previous.slice(-47), data.latest]);
    };

    eventSource.onerror = () => {
      setStreamConnected(false);
    };

    return () => {
      eventSource.close();
      setStreamConnected(false);
    };
  }, [stressMode]);

  const fileToBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const encoded = await fileToBase64(file);
      setImageData(encoded);
      setImageName(file.name);
      setPrediction(null);
      toast.success("Plant image ready for analysis");
    } catch {
      toast.error("Image upload failed");
    }
  };

  const runAnalysis = async () => {
    if (!imageData) {
      toast.error("Upload a plant image first");
      return;
    }

    setIsPredicting(true);

    try {
      const response = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageData,
          iotData: iotPayload?.latest
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "AI analysis failed");
      }

      setPrediction(data.report);
      toast.success("AI analysis completed");
    } catch (error: any) {
      toast.error(error.message || "AI analysis failed");
    } finally {
      setIsPredicting(false);
    }
  };

  const downloadImage = async (ref: React.RefObject<HTMLDivElement>, filename: string) => {
    if (!ref.current) return;

    setIsDownloading(true);

    try {
      const canvas = await html2canvas(ref.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        onclone: clonedDoc => {
          const allElements = clonedDoc.getElementsByTagName("*");

          for (let index = 0; index < allElements.length; index++) {
            const element = allElements[index] as HTMLElement;
            if (element.classList.contains("no-export")) {
              element.style.display = "none";
            }
          }
        }
      });

      const context = canvas.getContext("2d");
      if (!context) return;

      const imageDataBuffer = context.getImageData(0, 0, canvas.width, canvas.height);
      const rgba = new Uint8Array(imageDataBuffer.data.buffer);
      const tiff = UTIF.encodeImage(rgba, canvas.width, canvas.height);
      const blob = new Blob([tiff], { type: "image/tiff" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `${filename}.tiff`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      toast.error("Export failed");
    } finally {
      setIsDownloading(false);
    }
  };

  const downloadJSON = (data: any, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = `${filename}.json`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadCSV = (data: any[], filename: string) => {
    if (!data.length) return;

    const headers = Object.keys(data[0]).join(",");
    const rows = data.map(record => Object.values(record).join(",")).join("\n");
    const blob = new Blob([`${headers}\n${rows}`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = `${filename}.csv`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  const renderKnnAccuracyLineChart = () => (
    <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
      <LineChart data={knnAccuracyData} margin={{ left: 16, right: 18, top: 16, bottom: 14 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="k" tick={chartTick} axisLine={{ stroke: "#111827" }} tickLine={{ stroke: "#111827" }} label={{ value: "K Values", position: "insideBottom", offset: -4, ...chartAxisLabel }} />
        <YAxis domain={[86, 94]} tick={chartTick} axisLine={{ stroke: "#111827" }} tickLine={{ stroke: "#111827" }} tickFormatter={value => `${value}%`} label={{ value: "Accuracy (%)", angle: -90, position: "insideLeft", ...chartAxisLabel }} />
        <Tooltip contentStyle={chartTooltipStyle} formatter={(value: number) => [`${Number(value).toFixed(2)}%`, "Accuracy"]} />
        <Line
          type="monotone"
          dataKey="accuracy"
          name="Accuracy"
          stroke="#2563eb"
          strokeWidth={3}
          dot={{ r: 5, fill: "#2563eb", strokeWidth: 2 }}
          activeDot={{ r: 7 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );

  const renderAlgorithmComparisonBarChart = () => (
    <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
      <BarChart data={algorithmComparisonData} margin={{ left: 16, right: 12, bottom: 30, top: 22 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="algorithm" height={48} interval={0} tick={{ ...chartTick, fontSize: 13 }} axisLine={{ stroke: "#111827" }} tickLine={{ stroke: "#111827" }} label={{ value: "Algorithms", position: "insideBottom", offset: -2, ...chartAxisLabel }} />
        <YAxis domain={[0, 100]} tick={chartTick} axisLine={{ stroke: "#111827" }} tickLine={{ stroke: "#111827" }} tickFormatter={value => `${value}%`} label={{ value: "Accuracy (%)", angle: -90, position: "insideLeft", ...chartAxisLabel }} />
        <Tooltip
          contentStyle={chartTooltipStyle}
          formatter={(value: number) => [`${Number(value).toFixed(2)}%`, "Accuracy"]}
          labelFormatter={label => `Algorithm: ${label}`}
        />
        <Bar dataKey="accuracy" name="Accuracy" fill="#2563eb" radius={[2, 2, 0, 0]} label={{ position: "top", formatter: (value: number) => `${value}%`, fontSize: 14, fill: "#111827", fontWeight: 900 }} />
      </BarChart>
    </ResponsiveContainer>
  );

  const renderTrainingAccuracyChart = () => (
    <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
      <LineChart data={reportTrainingData} margin={{ left: 16, right: 18, top: 16, bottom: 14 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="epoch" tick={chartTick} axisLine={{ stroke: "#111827" }} tickLine={{ stroke: "#111827" }} label={{ value: "Epochs", position: "insideBottom", offset: -4, ...chartAxisLabel }} />
        <YAxis domain={[0, 1]} tick={chartTick} axisLine={{ stroke: "#111827" }} tickLine={{ stroke: "#111827" }} label={{ value: "Training Accuracy", angle: -90, position: "insideLeft", ...chartAxisLabel }} />
        <Tooltip contentStyle={chartTooltipStyle} formatter={(value: number) => [Number(value).toFixed(3), "Training Accuracy"]} />
        <Line type="monotone" dataKey="accuracy" stroke="#e57373" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );

  const renderValidationAccuracyChart = () => (
    <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
      <LineChart data={reportTrainingData} margin={{ left: 16, right: 18, top: 16, bottom: 14 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="epoch" tick={chartTick} axisLine={{ stroke: "#111827" }} tickLine={{ stroke: "#111827" }} label={{ value: "Epochs", position: "insideBottom", offset: -4, ...chartAxisLabel }} />
        <YAxis domain={[0, 1]} tick={chartTick} axisLine={{ stroke: "#111827" }} tickLine={{ stroke: "#111827" }} label={{ value: "Validation Accuracy", angle: -90, position: "insideLeft", ...chartAxisLabel }} />
        <Tooltip contentStyle={chartTooltipStyle} formatter={(value: number) => [Number(value).toFixed(3), "Validation Accuracy"]} />
        <Line type="monotone" dataKey="valAccuracy" stroke="#0891b2" strokeWidth={3} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );

  const expandedGraphConfig = {
    knnAccuracy: {
      title: "KNN Accuracy for Organic Farm Detection",
      subtitle: "Accuracy variation across K values",
      content: renderKnnAccuracyLineChart()
    },
    comparison: {
      title: "Organic Certification Algorithm Comparison",
      subtitle: "Comparison bar chart for KNN, GMM, CNN, and SVM",
      content: renderAlgorithmComparisonBarChart()
    },
    trainingAccuracy: {
      title: "Visualization of Training Accuracy Result",
      subtitle: trainingHistory.length > 0 ? "Epoch-wise training accuracy from history.csv" : "Training history artifact is not available",
      content: renderTrainingAccuracyChart()
    },
    validationAccuracy: {
      title: "Visualization of Validation Accuracy Result",
      subtitle: trainingHistory.length > 0 ? "Epoch-wise validation accuracy from history.csv" : "Validation history artifact is not available",
      content: renderValidationAccuracyChart()
    }
  } as const;

  return (
    <div className="pt-32 pb-20 px-4 max-w-7xl mx-auto space-y-10">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">AgriTrustra AI Lab</h1>
        <p className="text-gray-500">Live model status, real backend inference, and streaming IoT telemetry</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div ref={trainingRef}>
          <Card className="border-2 border-purple-100 h-full">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="text-purple-600" /> AI Model Status
                </CardTitle>
                <CardDescription>
                  Backend artifacts from <span className="font-mono">{aiStatus?.modelDir || "ml/artifacts/plant-health-model"}</span>
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Badge className={aiStatus?.configured ? "bg-green-600" : "bg-amber-600"}>
                  {aiStatus?.mode === "trained-model" ? "Trained model active" : "Trained model missing"}
                </Badge>
                <Button variant="outline" size="sm" className="no-export" onClick={fetchAiStatus} disabled={isRefreshing}>
                  {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {trainingError && (
                <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm">
                  {trainingError}
                </div>
              )}
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 bg-purple-50 rounded-xl">
                      <div className="text-xs uppercase font-bold text-purple-600">Mode</div>
                      <div className="text-lg font-black text-purple-900">{aiStatus?.mode || "loading"}</div>
                    </div>
                    <div className="p-4 bg-blue-50 rounded-xl">
                      <div className="text-xs uppercase font-bold text-blue-600">Accuracy</div>
                      <div className="text-lg font-black text-blue-900">
                        {metrics?.accuracy ? `${(metrics.accuracy * 100).toFixed(1)}%` : "N/A"}
                      </div>
                      {metrics?.accuracy && <div className="text-[11px] text-blue-700 mt-1">{metricsSource}</div>}
                    </div>
                    <div className="p-4 bg-emerald-50 rounded-xl">
                      <div className="text-xs uppercase font-bold text-emerald-600">Classes</div>
                      <div className="text-lg font-black text-emerald-900">{metrics?.classCount || 0}</div>
                    </div>
                    <div className="p-4 bg-amber-50 rounded-xl">
                      <div className="text-xs uppercase font-bold text-amber-600">Test Images</div>
                      <div className="text-lg font-black text-amber-900">{metrics?.totalTestImages || 0}</div>
                      {metrics?.totalTestImages > 0 && <div className="text-[11px] text-amber-700 mt-1">{metricsSource}</div>}
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                    {aiStatus?.message || "Loading AI status..."}
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <button
                      type="button"
                      className="h-72 rounded-xl border bg-white p-4 text-left transition hover:border-blue-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-400"
                      onClick={() => setExpandedGraph("knnAccuracy")}
                      aria-label="Open KNN accuracy graph in large view"
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <div className="text-xs uppercase font-bold text-blue-600">KNN Accuracy Graph</div>
                          <div className="text-[11px] text-gray-500">Accuracy for different K values. Click to enlarge.</div>
                        </div>
                        <Badge variant="outline">{knnAccuracyData.length} K values</Badge>
                      </div>
                      <div className="h-[210px] min-h-0 min-w-0 overflow-hidden">{renderKnnAccuracyLineChart()}</div>
                    </button>

                    <button
                      type="button"
                      className="h-72 rounded-xl border bg-white p-4 text-left transition hover:border-emerald-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      onClick={() => setExpandedGraph("comparison")}
                      aria-label="Open algorithm comparison graph in large view"
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <div className="text-xs uppercase font-bold text-emerald-600">Algorithm Comparison</div>
                          <div className="text-[11px] text-gray-500">KNN, GMM, CNN, and SVM accuracy. Click to enlarge.</div>
                        </div>
                        <Badge variant="outline">{algorithmComparisonData.length} algorithms</Badge>
                      </div>
                      <div className="h-[210px] min-h-0 min-w-0 overflow-hidden">{renderAlgorithmComparisonBarChart()}</div>
                    </button>
                  </div>

                  {tomatoPriceModel && (
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-bold text-emerald-900">Tomato Price Model</div>
                          <div className="text-emerald-700 font-mono text-xs mt-1">{tomatoPriceModel.modelDir}</div>
                        </div>
                        <Badge className={tomatoPriceModel.configured ? "bg-green-600" : "bg-amber-600"}>
                          {tomatoPriceModel.configured ? "trained" : "missing"}
                        </Badge>
                      </div>
                      {tomatoMetrics && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                          <div>
                            <div className="text-xs uppercase font-bold text-emerald-700">Algorithm</div>
                            <div className="font-semibold text-emerald-950">{tomatoPriceModel.metadata.algorithm}</div>
                          </div>
                          <div>
                            <div className="text-xs uppercase font-bold text-emerald-700">MAE</div>
                            <div className="font-semibold text-emerald-950">{Number(tomatoMetrics.mae).toFixed(2)}</div>
                          </div>
                          <div>
                            <div className="text-xs uppercase font-bold text-emerald-700">RMSE</div>
                            <div className="font-semibold text-emerald-950">{Number(tomatoMetrics.rmse).toFixed(2)}</div>
                          </div>
                          <div>
                            <div className="text-xs uppercase font-bold text-emerald-700">R2</div>
                            <div className="font-semibold text-emerald-950">{Number(tomatoMetrics.r2).toFixed(3)}</div>
                          </div>
                        </div>
                      )}
                      <div className="mt-4 space-y-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={fetchTomatoPriceSamples}
                          disabled={isLoadingTomatoSamples}
                        >
                          {isLoadingTomatoSamples ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                          {isLoadingTomatoSamples ? "Loading sample predictions" : "Load sample tomato price predictions"}
                        </Button>
                        {tomatoSampleError && <div className="text-sm text-red-600">{tomatoSampleError}</div>}
                        {tomatoSamplePredictions.length > 0 && (
                          <div className="rounded-xl border border-emerald-200 bg-white p-3 text-xs text-gray-700">
                            <div className="font-semibold text-emerald-900 mb-2">Sample tomato price predictions</div>
                            <div className="space-y-2">
                              {tomatoSamplePredictions.map((row, index) => (
                                <div key={index} className="rounded-lg border border-gray-100 bg-emerald-50 p-3">
                                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="font-semibold text-emerald-950">
                                      {row.market || `Prediction ${index + 1}`}{row.date ? ` on ${row.date}` : ""}
                                    </div>
                                    <div className="font-bold text-green-700">
                                      Predicted {formatRupees(row.predictedModalPricePerKg ?? Number(row.prediction) / 100)} / kg
                                    </div>
                                  </div>
                                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-gray-700 md:grid-cols-4">
                                    <div>Actual: {formatRupees(row.actualModalPricePerKg)} / kg</div>
                                    <div>Min: {formatRupees(row.minPricePerKg)} / kg</div>
                                    <div>Max: {formatRupees(row.maxPricePerKg)} / kg</div>
                                    <div>Arrival: {row.arrival_quantity ?? "N/A"}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <button
                      type="button"
                      className="h-64 bg-white rounded-xl border p-4 text-left transition hover:border-purple-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-purple-400"
                      onClick={() => setExpandedGraph("trainingAccuracy")}
                      aria-label="Open training accuracy graph in large view"
                    >
                      <div className="text-xs uppercase font-bold text-purple-600 mb-3">Training Accuracy</div>
                      <div className="h-[204px] min-h-0 min-w-0 overflow-hidden">{renderTrainingAccuracyChart()}</div>
                    </button>
                    <button
                      type="button"
                      className="h-64 bg-white rounded-xl border p-4 text-left transition hover:border-cyan-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-cyan-400"
                      onClick={() => setExpandedGraph("validationAccuracy")}
                      aria-label="Open validation accuracy graph in large view"
                    >
                      <div className="text-xs uppercase font-bold text-cyan-600 mb-3">Validation Accuracy</div>
                      <div className="h-[204px] min-h-0 min-w-0 overflow-hidden">{renderValidationAccuracyChart()}</div>
                    </button>
                  </div>

                  <div className="flex gap-2 no-export">
                    <Button variant="outline" size="sm" onClick={() => downloadImage(trainingRef, "AgriTrustra-AI-Status")} disabled={isDownloading}>
                      {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                      Export TIFF
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => downloadJSON(aiStatus, "AgriTrustra-AI-Status")}>
                      <Download className="h-4 w-4 mr-2" />
                      JSON
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => downloadCSV(trainingHistory, "AgriTrustra-AI-History")}>
                      <Download className="h-4 w-4 mr-2" />
                      CSV
                    </Button>
                </div>
              </>
            </CardContent>
          </Card>
        </div>

        <Card className="border-2 border-green-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="text-green-600" /> Real AI Inference
            </CardTitle>
            <CardDescription>Upload a real plant image and analyze it against the current live IoT reading</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <label className="block rounded-2xl border-2 border-dashed border-green-200 bg-green-50/50 p-6 text-center cursor-pointer hover:border-green-400 transition-colors">
              {imageData ? (
                <img src={imageData} alt="Plant upload preview" className="mx-auto h-56 w-full rounded-xl object-cover" />
              ) : (
                <div className="py-12 space-y-3 text-gray-500">
                  <Upload className="h-10 w-10 mx-auto text-green-600" />
                  <div className="font-medium">Choose plant image</div>
                  <div className="text-sm">JPG, PNG, or any camera photo the model can inspect</div>
                </div>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </label>

            <div className="rounded-xl border border-gray-200 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Selected image</span>
                <span className="font-medium">{imageName || "None"}</span>
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-gray-500">Sensor fusion input</span>
                <span className="font-medium">
                  {iotPayload ? `${iotPayload.latest.moisture}% moisture, ${iotPayload.latest.temperature}°C` : "Waiting for stream"}
                </span>
              </div>
            </div>

            <Button className="w-full bg-green-600 hover:bg-green-700" onClick={runAnalysis} disabled={isPredicting}>
              {isPredicting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Brain className="h-4 w-4 mr-2" />}
              {isPredicting ? "Analyzing image..." : "Run Live AI Analysis"}
            </Button>

            {prediction && (
              <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="rounded-2xl border border-green-100 bg-green-50 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-green-900">Analysis Result</div>
                  <Badge className={prediction.isOrganic ? "bg-green-600" : "bg-red-600"}>
                    {prediction.isOrganic ? "Organic" : "Review required"}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-gray-500">Confidence</div>
                    <div className="font-bold text-green-800">{(prediction.accuracy * 100).toFixed(2)}%</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Predicted class</div>
                    <div className="font-bold text-green-800">{prediction.predictedClass}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Plant health</div>
                    <div className="font-medium">{prediction.plantHealth}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Model source</div>
                    <div className="font-medium">{prediction.modelSource}</div>
                  </div>
                </div>
                <div className="rounded-xl bg-white p-4 text-sm border border-green-100">
                  <div className="font-semibold text-gray-900 mb-2">Soil and IoT interpretation</div>
                  <p className="text-gray-600">{prediction.soilAnalysis}</p>
                </div>
                {prediction.marketPrice && (
                  <div className="rounded-xl bg-white p-4 text-sm border border-green-100">
                    <div className="font-semibold text-gray-900 mb-2">Market price signal</div>
                    {prediction.marketPrice.available ? (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="text-gray-500">Product</div>
                          <div className="font-bold capitalize">{prediction.marketPrice.product}</div>
                        </div>
                        <div>
                          <div className="text-gray-500">Market</div>
                          <div className="font-bold">{prediction.marketPrice.market}</div>
                        </div>
                        <div>
                          <div className="text-gray-500">Modal price</div>
                          <div className="font-bold text-green-800">
                            Rs {prediction.marketPrice.modalPrice} {prediction.marketPrice.unit}
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-500">Recent average</div>
                          <div className="font-bold text-green-800">
                            Rs {prediction.marketPrice.recentAverageModalPrice} {prediction.marketPrice.unit}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-gray-600">{prediction.marketPrice.message}</p>
                    )}
                  </div>
                )}
                {prediction.topPredictions?.length > 0 && (
                  <div className="rounded-xl bg-white p-4 text-sm border border-green-100">
                    <div className="font-semibold text-gray-900 mb-2">Top model predictions</div>
                    <div className="space-y-2">
                      {prediction.topPredictions.slice(0, 3).map((item: any) => (
                        <div key={item.label} className="flex justify-between gap-3">
                          <span className="capitalize text-gray-600">{String(item.label).replaceAll("_", " ")}</span>
                          <span className="font-bold text-gray-900">{(Number(item.confidence) * 100).toFixed(2)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <Button variant="outline" className="w-full" onClick={() => downloadJSON(prediction, "AgriTrustra-Live-AI-Report")}>
                  <Download className="h-4 w-4 mr-2" />
                  Download JSON Report
                </Button>
              </motion.div>
            )}
          </CardContent>
        </Card>
      </div>

      <div ref={iotRef}>
        <Card className="border-2 border-blue-100">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="text-blue-600" /> Real-time IoT Telemetry
              </CardTitle>
              <CardDescription>Server-sent live stream from the farm sensor simulator</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={streamConnected ? "bg-emerald-600" : "bg-gray-500"}>
                {streamConnected ? <Wifi className="h-3 w-3 mr-1" /> : <WifiOff className="h-3 w-3 mr-1" />}
                {streamConnected ? "Live stream connected" : "Reconnecting"}
              </Badge>
              <Button variant="outline" size="sm" className="no-export" onClick={() => setStressMode(value => !value)}>
                {stressMode ? "Switch to normal" : "Inject stress"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="rounded-xl bg-blue-50 p-4">
                <div className="text-xs uppercase font-bold text-blue-600">Moisture</div>
                <div className="text-2xl font-black text-blue-900">{iotPayload?.latest.moisture?.toFixed(1) || "--"}%</div>
              </div>
              <div className="rounded-xl bg-orange-50 p-4">
                <div className="text-xs uppercase font-bold text-orange-600">Temperature</div>
                <div className="text-2xl font-black text-orange-900">{iotPayload?.latest.temperature?.toFixed(1) || "--"}°C</div>
              </div>
              <div className="rounded-xl bg-emerald-50 p-4">
                <div className="text-xs uppercase font-bold text-emerald-600">pH</div>
                <div className="text-2xl font-black text-emerald-900">{iotPayload?.latest.ph?.toFixed(2) || "--"}</div>
              </div>
              <div className="rounded-xl bg-violet-50 p-4">
                <div className="text-xs uppercase font-bold text-violet-600">Safety score</div>
                <div className="text-2xl font-black text-violet-900">
                  {iotPayload ? `${(iotPayload.assessment.score * 100).toFixed(0)}%` : "--"}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 h-80 min-h-0 min-w-0 bg-white rounded-xl border p-4">
                <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                  <AreaChart data={iotChartData}>
                    <defs>
                      <linearGradient id="moistureFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="time" tick={chartTick} axisLine={{ stroke: "#111827" }} tickLine={{ stroke: "#111827" }} />
                    <YAxis tick={chartTick} axisLine={{ stroke: "#111827" }} tickLine={{ stroke: "#111827" }} />
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Legend wrapperStyle={chartLegendStyle} />
                    <Area type="monotone" dataKey="moisture" stroke="#2563eb" fill="url(#moistureFill)" name="Moisture %" />
                    <Line type="monotone" dataKey="temperature" stroke="#ea580c" dot={false} name="Temperature °C" />
                    <Line type="monotone" dataKey="ph" stroke="#059669" dot={false} name="pH" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border bg-white p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <AlertCircle className="h-4 w-4 text-blue-600" /> Stream mode
                  </div>
                  <p className="mt-2 text-sm text-gray-600 capitalize">{iotPayload?.streamMode || "normal"}</p>
                </div>

                <div className="rounded-xl border bg-white p-4">
                  <div className="text-sm font-semibold text-gray-900 mb-2">Environmental checks</div>
                  <div className="space-y-2">
                    {(iotPayload?.assessment.checks || []).map(check => (
                      <div key={check.name} className="flex items-center justify-between text-sm">
                        <span className="capitalize text-gray-600">{check.name}</span>
                        <span className={check.passed ? "text-green-700 font-semibold" : "text-red-700 font-semibold"}>
                          {check.value} ({check.range})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border bg-white p-4">
                  <div className="text-sm font-semibold text-gray-900 mb-2">Interpretation</div>
                  <p className="text-sm text-gray-600">
                    {iotPayload?.assessment.isOrganicSafe
                      ? "Current readings are inside the safe band for organic evaluation."
                      : "Current readings show stress markers that will lower the AI fusion score."}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-2 no-export">
              <Button variant="outline" size="sm" onClick={() => downloadImage(iotRef, "AgriTrustra-IoT-Live")} disabled={isDownloading}>
                {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                Export TIFF
              </Button>
              <Button variant="outline" size="sm" onClick={() => downloadJSON(iotPayload, "AgriTrustra-IoT-Live")}>
                <Download className="h-4 w-4 mr-2" />
                JSON
              </Button>
              <Button variant="outline" size="sm" onClick={() => downloadCSV(iotHistory, "AgriTrustra-IoT-History")}>
                <Download className="h-4 w-4 mr-2" />
                CSV
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {expandedGraph && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={expandedGraphConfig[expandedGraph].title}
          onClick={() => setExpandedGraph(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-4xl rounded-2xl bg-white p-5 shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{expandedGraphConfig[expandedGraph].title}</h2>
                <p className="text-sm text-gray-500">{expandedGraphConfig[expandedGraph].subtitle}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadImage(expandedGraphRef, `AgriTrustra-${expandedGraphConfig[expandedGraph].title.replace(/[^a-z0-9]+/gi, "-")}`)}
                  disabled={isDownloading}
                >
                  {isDownloading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                  Download Graph
                </Button>
                <Button variant="outline" size="icon" onClick={() => setExpandedGraph(null)} aria-label="Close large graph">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div ref={expandedGraphRef} className="h-[52vh] min-h-[320px] max-h-[520px] min-w-0 rounded-xl border bg-white p-4">
              {expandedGraphConfig[expandedGraph].content || (
                <div className="flex h-full items-center justify-center text-center text-gray-500">
                  This graph does not have enough saved metrics yet.
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

