import React, { useEffect, useRef, useState } from "react";
import { Camera, MapPin, RefreshCcw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type GeoTag = {
  field?: string;
  label: string;
  image: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  address: string;
  mapImage: string;
  capturedAt: string;
  capturedWith: "camera";
};

interface GeoTaggedCameraCaptureProps {
  label: string;
  field?: string;
  value?: string;
  geoTag?: Partial<GeoTag>;
  onCapture: (geoTag: GeoTag) => void;
  onClear: () => void;
}

const getTileUrl = (lat: number, lng: number, zoom = 15) => {
  const scale = 2 ** zoom;
  const x = Math.floor(((lng + 180) / 360) * scale);
  const y = Math.floor(
    ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * scale
  );
  return `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
};

const formatCoordinate = (value: number) => Number(value || 0).toFixed(6);

export default function GeoTaggedCameraCapture({
  label,
  field,
  value,
  geoTag,
  onCapture,
  onClear
}: GeoTaggedCameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [position, setPosition] = useState<{ lat: number; lng: number; accuracy: number | null } | null>(null);
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setIsCameraOpen(false);
  };

  useEffect(() => stopCamera, []);

  const resolveCurrentPosition = () =>
    new Promise<{ lat: number; lng: number; accuracy: number | null }>((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Location permission is not available in this browser."));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        pos => resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null
        }),
        () => reject(new Error("Allow location permission to capture geo-tagged photos.")),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
      );
    });

  const resolveAddress = async (lat: number, lng: number) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`
      );
      const data = await response.json();
      return data.display_name || "Current GPS location";
    } catch {
      return "Current GPS location";
    }
  };

  const openCamera = async () => {
    setIsPreparing(true);
    setError("");

    try {
      const nextPosition = await resolveCurrentPosition();
      setPosition(nextPosition);
      setAddress(await resolveAddress(nextPosition.lat, nextPosition.lng));

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera permission is not available in this browser.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false
      });
      streamRef.current = stream;
      setIsCameraOpen(true);

      window.setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      }, 0);
    } catch (err: any) {
      setError(err.message || "Camera and location permission are required.");
    } finally {
      setIsPreparing(false);
    }
  };

  const capturePhoto = async () => {
    const video = videoRef.current;
    if (!video || !position) return;

    const canvas = document.createElement("canvas");
    canvas.width = 960;
    canvas.height = 720;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const mapImage = getTileUrl(position.lat, position.lng);
    const capturedAt = new Date();

    context.fillStyle = "rgba(0, 0, 0, 0.62)";
    context.fillRect(0, canvas.height - 150, canvas.width, 150);
    context.fillStyle = "rgba(255, 255, 255, 0.95)";
    context.fillRect(20, canvas.height - 130, 130, 110);
    context.fillStyle = "#ef4444";
    context.beginPath();
    context.arc(85, canvas.height - 75, 20, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#ffffff";
    context.beginPath();
    context.arc(85, canvas.height - 75, 8, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = "#ffffff";
    context.font = "700 26px Arial";
    context.fillText("GPS Map Camera", 175, canvas.height - 112);
    context.font = "600 18px Arial";
    context.fillText(address.slice(0, 78), 175, canvas.height - 82);
    context.font = "700 17px Arial";
    context.fillText(`Lat ${formatCoordinate(position.lat)}   Long ${formatCoordinate(position.lng)}`, 175, canvas.height - 54);
    context.fillText(capturedAt.toLocaleString(), 175, canvas.height - 26);

    onCapture({
      field,
      label,
      image: canvas.toDataURL("image/jpeg", 0.82),
      lat: position.lat,
      lng: position.lng,
      accuracy: position.accuracy,
      address,
      mapImage,
      capturedAt: capturedAt.toISOString(),
      capturedWith: "camera"
    });
    stopCamera();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-gray-900">{label}</div>
        {value && (
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            <Trash2 className="mr-2 h-4 w-4" /> Remove
          </Button>
        )}
      </div>

      {value ? (
        <div className="overflow-hidden rounded-lg border bg-gray-50">
          <img src={value} alt={label} className="h-56 w-full object-cover" />
          <div className="flex items-start gap-2 p-3 text-xs text-gray-600">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
            <div>
              <div className="font-semibold text-gray-800">{geoTag?.address || "Current GPS location"}</div>
              <div>{formatCoordinate(Number(geoTag?.lat))}, {formatCoordinate(Number(geoTag?.lng))}</div>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={openCamera}
          disabled={isPreparing}
          className="flex h-36 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 text-center transition-colors hover:border-green-400 hover:bg-green-50"
        >
          <Camera className="mb-2 h-7 w-7 text-green-600" />
          <span className="text-sm font-semibold text-gray-700">{isPreparing ? "Requesting camera and GPS..." : "Capture with Camera"}</span>
          <span className="mt-1 text-xs text-gray-500">Camera and location permission required</span>
        </button>
      )}

      {error && <div className="rounded-md bg-red-50 p-2 text-xs text-red-700">{error}</div>}

      {isCameraOpen && (
        <div className="rounded-lg border border-green-100 bg-green-50 p-3">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-green-800">
              <MapPin className="h-4 w-4" /> {position ? `${formatCoordinate(position.lat)}, ${formatCoordinate(position.lng)}` : "GPS ready"}
            </div>
            <button type="button" onClick={stopCamera} className="rounded-md p-1 text-gray-500 hover:bg-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          <video ref={videoRef} autoPlay playsInline muted className="aspect-video w-full rounded-md bg-black object-cover" />
          <div className="mt-3 flex gap-2">
            <Button type="button" className="flex-1 bg-green-600 hover:bg-green-700" onClick={capturePhoto}>
              <Camera className="mr-2 h-4 w-4" /> Capture Geo-tagged Photo
            </Button>
            <Button type="button" variant="outline" onClick={openCamera}>
              <RefreshCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
