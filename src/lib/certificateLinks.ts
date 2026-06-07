const CERTIFICATE_API_MARKER = "/api/certificates/";
const CERTIFICATE_PAGE_MARKER = "/certificate/";

const isAbsoluteUrl = (value: string) => /^https?:\/\//i.test(value);
const isLocalhostUrl = (value: string) => /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(value);

export const getCertificateId = (farm: any) => {
  const directId = farm?.blockchain?.certificateId || farm?.certificateHash;
  if (directId) return String(directId);

  const qrValue = Array.isArray(farm?.qrCodes) ? farm.qrCodes[0] : "";
  if (!qrValue) return "";

  const qrText = String(qrValue);
  const marker = qrText.includes(CERTIFICATE_API_MARKER) ? CERTIFICATE_API_MARKER : CERTIFICATE_PAGE_MARKER;
  const markerIndex = qrText.indexOf(marker);
  if (markerIndex >= 0) {
    return qrText.slice(markerIndex + marker.length).split(/[?#/]/)[0];
  }

  return "";
};

export const buildCertificatePageUrl = (farm: any) => {
  const certificateId = getCertificateId(farm);
  if (!certificateId) return "";

  const savedUrl = Array.isArray(farm?.qrCodes) ? String(farm.qrCodes[0] || "") : "";
  if (isAbsoluteUrl(savedUrl) && !isLocalhostUrl(savedUrl)) {
    return savedUrl;
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/certificate/${encodeURIComponent(certificateId)}`;
};
