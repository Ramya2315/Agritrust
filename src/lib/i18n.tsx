import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type LanguageCode = "en" | "kn" | "hi" | "ta" | "te";

export const languages: Array<{ code: LanguageCode; label: string }> = [
  { code: "en", label: "English" },
  { code: "kn", label: "Kannada" },
  { code: "hi", label: "Hindi" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" }
];

const translations: Record<LanguageCode, Record<string, string>> = {
  en: {
    home: "Home",
    about: "About",
    marketPrices: "Market Prices",
    farms: "Farms",
    farmers: "Farmers",
    dashboard: "Dashboard",
    qrCode: "QR Code",
    certificates: "Certificates",
    auditor: "Auditor",
    aiLab: "AI Lab",
    contact: "Contact",
    logout: "Logout",
    getStarted: "Get Started",
    language: "Language",
    farmerDashboard: "Farmer Dashboard",
    manageFarms: "Manage your farms and certifications",
    qrCodesOnly: "Certified Farm QR Codes",
    qrCodesOnlyDesc: "Scan a code to view the full certification process, crop details, photos, AI analysis, and final certificate.",
    noQrCodes: "No certified QR codes yet",
    certificateVerified: "Certificate verified",
    certificationProcess: "Certification Process",
    cropDetails: "Crop Details",
    photos: "Photos",
    aiAnalysis: "AI Analysis",
    finalCertificate: "Final Certificate",
    plantHealth: "Plant Health",
    disease: "Disease",
    organicStatus: "Organic Status",
    confidence: "Confidence",
    crop: "Crop",
    soilType: "Soil Type",
    farmer: "Farmer",
    phone: "Phone",
    address: "Address"
  },
  kn: {
    home: "ಮುಖಪುಟ",
    about: "ಬಗ್ಗೆ",
    marketPrices: "ಮಾರುಕಟ್ಟೆ ಬೆಲೆಗಳು",
    farms: "ಕೃಷಿ ಜಮೀನುಗಳು",
    farmers: "ರೈತರು",
    dashboard: "ಡ್ಯಾಶ್‌ಬೋರ್ಡ್",
    qrCode: "QR ಕೋಡ್",
    certificates: "ಪ್ರಮಾಣಪತ್ರಗಳು",
    auditor: "ಆಡಿಟರ್",
    aiLab: "AI ಪ್ರಯೋಗಾಲಯ",
    contact: "ಸಂಪರ್ಕ",
    logout: "ಲಾಗ್ ಔಟ್",
    getStarted: "ಪ್ರಾರಂಭಿಸಿ",
    language: "ಭಾಷೆ",
    farmerDashboard: "ರೈತ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್",
    manageFarms: "ನಿಮ್ಮ ಜಮೀನುಗಳು ಮತ್ತು ಪ್ರಮಾಣಪತ್ರಗಳನ್ನು ನಿರ್ವಹಿಸಿ",
    qrCodesOnly: "ಪ್ರಮಾಣಿತ ಜಮೀನು QR ಕೋಡ್‌ಗಳು",
    qrCodesOnlyDesc: "ಪೂರ್ಣ ಪ್ರಕ್ರಿಯೆ, ಬೆಳೆ ವಿವರಗಳು, ಫೋಟೋಗಳು, AI ವಿಶ್ಲೇಷಣೆ ಮತ್ತು ಅಂತಿಮ ಪ್ರಮಾಣಪತ್ರ ನೋಡಲು ಸ್ಕ್ಯಾನ್ ಮಾಡಿ.",
    noQrCodes: "ಇನ್ನೂ ಪ್ರಮಾಣಿತ QR ಕೋಡ್‌ಗಳಿಲ್ಲ",
    certificateVerified: "ಪ್ರಮಾಣಪತ್ರ ಪರಿಶೀಲಿಸಲಾಗಿದೆ",
    certificationProcess: "ಪ್ರಮಾಣೀಕರಣ ಪ್ರಕ್ರಿಯೆ",
    cropDetails: "ಬೆಳೆ ವಿವರಗಳು",
    photos: "ಫೋಟೋಗಳು",
    aiAnalysis: "AI ವಿಶ್ಲೇಷಣೆ",
    finalCertificate: "ಅಂತಿಮ ಪ್ರಮಾಣಪತ್ರ",
    plantHealth: "ಸಸ್ಯ ಆರೋಗ್ಯ",
    disease: "ರೋಗ",
    organicStatus: "ಸಾವಯವ ಸ್ಥಿತಿ",
    confidence: "ವಿಶ್ವಾಸಾರ್ಹತೆ",
    crop: "ಬೆಳೆ",
    soilType: "ಮಣ್ಣಿನ ಪ್ರಕಾರ",
    farmer: "ರೈತ",
    phone: "ಫೋನ್",
    address: "ವಿಳಾಸ"
  },
  hi: {
    home: "होम",
    about: "परिचय",
    marketPrices: "बाजार भाव",
    farms: "फार्म",
    farmers: "किसान",
    dashboard: "डैशबोर्ड",
    qrCode: "QR कोड",
    certificates: "प्रमाणपत्र",
    auditor: "ऑडिटर",
    aiLab: "AI लैब",
    contact: "संपर्क",
    logout: "लॉग आउट",
    getStarted: "शुरू करें",
    language: "भाषा",
    farmerDashboard: "किसान डैशबोर्ड",
    manageFarms: "अपने फार्म और प्रमाणपत्र प्रबंधित करें",
    qrCodesOnly: "प्रमाणित फार्म QR कोड",
    qrCodesOnlyDesc: "पूरी प्रक्रिया, फसल विवरण, फोटो, AI विश्लेषण और अंतिम प्रमाणपत्र देखने के लिए स्कैन करें।",
    noQrCodes: "अभी कोई प्रमाणित QR कोड नहीं",
    certificateVerified: "प्रमाणपत्र सत्यापित",
    certificationProcess: "प्रमाणन प्रक्रिया",
    cropDetails: "फसल विवरण",
    photos: "फोटो",
    aiAnalysis: "AI विश्लेषण",
    finalCertificate: "अंतिम प्रमाणपत्र",
    plantHealth: "पौधे का स्वास्थ्य",
    disease: "रोग",
    organicStatus: "जैविक स्थिति",
    confidence: "विश्वास",
    crop: "फसल",
    soilType: "मिट्टी का प्रकार",
    farmer: "किसान",
    phone: "फोन",
    address: "पता"
  },
  ta: {
    home: "முகப்பு",
    about: "பற்றி",
    marketPrices: "சந்தை விலை",
    farms: "பண்ணைகள்",
    farmers: "விவசாயிகள்",
    dashboard: "டாஷ்போர்டு",
    qrCode: "QR குறியீடு",
    certificates: "சான்றிதழ்கள்",
    auditor: "தணிக்கையாளர்",
    aiLab: "AI ஆய்வகம்",
    contact: "தொடர்பு",
    logout: "வெளியேறு",
    getStarted: "தொடங்கவும்",
    language: "மொழி",
    farmerDashboard: "விவசாயி டாஷ்போர்டு",
    manageFarms: "உங்கள் பண்ணைகள் மற்றும் சான்றிதழ்களை நிர்வகிக்கவும்",
    qrCodesOnly: "சான்றளிக்கப்பட்ட பண்ணை QR குறியீடுகள்",
    qrCodesOnlyDesc: "முழு செயல்முறை, பயிர் விவரங்கள், புகைப்படங்கள், AI பகுப்பாய்வு மற்றும் இறுதி சான்றிதழைக் காண ஸ்கேன் செய்யவும்.",
    noQrCodes: "இன்னும் சான்றளிக்கப்பட்ட QR குறியீடுகள் இல்லை",
    certificateVerified: "சான்றிதழ் சரிபார்க்கப்பட்டது",
    certificationProcess: "சான்றிதழ் செயல்முறை",
    cropDetails: "பயிர் விவரங்கள்",
    photos: "புகைப்படங்கள்",
    aiAnalysis: "AI பகுப்பாய்வு",
    finalCertificate: "இறுதி சான்றிதழ்",
    plantHealth: "தாவர ஆரோக்கியம்",
    disease: "நோய்",
    organicStatus: "இயற்கை நிலை",
    confidence: "நம்பிக்கை",
    crop: "பயிர்",
    soilType: "மண் வகை",
    farmer: "விவசாயி",
    phone: "தொலைபேசி",
    address: "முகவரி"
  },
  te: {
    home: "హోమ్",
    about: "గురించి",
    marketPrices: "మార్కెట్ ధరలు",
    farms: "ఫారాలు",
    farmers: "రైతులు",
    dashboard: "డ్యాష్‌బోర్డ్",
    qrCode: "QR కోడ్",
    certificates: "సర్టిఫికెట్లు",
    auditor: "ఆడిటర్",
    aiLab: "AI ల్యాబ్",
    contact: "సంప్రదించండి",
    logout: "లాగ్ అవుట్",
    getStarted: "ప్రారంభించండి",
    language: "భాష",
    farmerDashboard: "రైతు డ్యాష్‌బోర్డ్",
    manageFarms: "మీ ఫారాలు మరియు సర్టిఫికెట్లను నిర్వహించండి",
    qrCodesOnly: "సర్టిఫైడ్ ఫారం QR కోడ్‌లు",
    qrCodesOnlyDesc: "పూర్తి ప్రక్రియ, పంట వివరాలు, ఫోటోలు, AI విశ్లేషణ మరియు చివరి సర్టిఫికేట్ చూడటానికి స్కాన్ చేయండి.",
    noQrCodes: "ఇంకా సర్టిఫైడ్ QR కోడ్‌లు లేవు",
    certificateVerified: "సర్టిఫికేట్ ధృవీకరించబడింది",
    certificationProcess: "సర్టిఫికేషన్ ప్రక్రియ",
    cropDetails: "పంట వివరాలు",
    photos: "ఫోటోలు",
    aiAnalysis: "AI విశ్లేషణ",
    finalCertificate: "చివరి సర్టిఫికేట్",
    plantHealth: "మొక్క ఆరోగ్యం",
    disease: "వ్యాధి",
    organicStatus: "ఆర్గానిక్ స్థితి",
    confidence: "నమ్మకం",
    crop: "పంట",
    soilType: "మట్టి రకం",
    farmer: "రైతు",
    phone: "ఫోన్",
    address: "చిరునామా"
  }
};

const I18nContext = createContext({
  language: "en" as LanguageCode,
  setLanguage: (_language: LanguageCode) => {},
  t: (key: string) => key
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<LanguageCode>(() => {
    const saved = localStorage.getItem("agritrustra-language") as LanguageCode | null;
    return saved && translations[saved] ? saved : "en";
  });

  useEffect(() => {
    localStorage.setItem("agritrustra-language", language);
  }, [language]);

  const value = useMemo(() => ({
    language,
    setLanguage,
    t: (key: string) => translations[language][key] || translations.en[key] || key
  }), [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
