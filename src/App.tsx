import React, { useState, useEffect } from "react";
import Header from "./components/Header";
import Footer from "./components/Footer";
import Home from "./components/Home";
import Auth from "./components/Auth";
import FarmerDashboard from "./components/FarmerDashboard";
import AuditorDashboard from "./components/AuditorDashboard";
import Certificate from "./components/Certificate";
import RegisteredFarms from "./components/RegisteredFarms";
import PublicCertificateVerification from "./components/PublicCertificateVerification";
import Help from "./components/Help";
import MarketPrices from "./components/MarketPrices";
import { Toaster } from "@/components/ui/sonner";
import { I18nProvider } from "@/lib/i18n";

function AppShell() {
  const initialCertificateId = (() => {
    const match = window.location.pathname.match(/^\/certificate\/([^/]+)$/);
    return match ? decodeURIComponent(match[1]) : "";
  })();
  const [user, setUser] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(initialCertificateId ? "public-certificate" : "home");
  const [publicCertificateId] = useState(initialCertificateId);
  const [selectedCertificateFarm, setSelectedCertificateFarm] = useState<any>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");
    const storedCertificateFarm = localStorage.getItem("selectedCertificateFarm");

    if (storedCertificateFarm) {
      try {
        setSelectedCertificateFarm(JSON.parse(storedCertificateFarm));
      } catch {
        localStorage.removeItem("selectedCertificateFarm");
      }
    }

    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const parsedStoredUser = storedUser ? JSON.parse(storedUser) : null;
        const userData = parsedStoredUser ?? { id: payload.id, role: payload.role, name: payload.name || "Registered Farmer" };
        setUser(userData);
        if (currentPage === "home" || currentPage === "auth") {
          setCurrentPage(userData.role === "farmer" ? "farmer-dashboard" : "auditor-dashboard");
        }
      } catch (e) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
      }
    }
  }, [currentPage]);

  const handleLogin = (userData: any) => {
    localStorage.setItem("user", JSON.stringify(userData));
    setUser(userData);
    setCurrentPage(userData.role === "farmer" ? "farmer-dashboard" : "auditor-dashboard");
  };

  const handleOpenCertificate = (farm: any) => {
    const certificateFarm = {
      ...farm,
      farmerName: farm?.farmerName || farm?.farmerId?.name || user?.name || ""
    };
    localStorage.setItem("selectedCertificateFarm", JSON.stringify(certificateFarm));
    setSelectedCertificateFarm(certificateFarm);
    setCurrentPage("certificates");
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("selectedCertificateFarm");
    setUser(null);
    setSelectedCertificateFarm(null);
    setCurrentPage("home");
  };

  const renderPage = () => {
    switch (currentPage) {
      case "home":
        return <Home onNavigate={setCurrentPage} />;
      case "auth":
        return <Auth onLogin={handleLogin} />;
      case "farmer-dashboard":
        return user?.role === "farmer"
          ? <FarmerDashboard onNavigate={setCurrentPage} onOpenCertificate={handleOpenCertificate} />
          : <Auth onLogin={handleLogin} />;
      case "qr-codes":
        return user?.role === "farmer"
          ? <FarmerDashboard onNavigate={setCurrentPage} onOpenCertificate={handleOpenCertificate} qrOnly />
          : <Auth onLogin={handleLogin} />;
      case "auditor-dashboard":
        return (user?.role === "auditor1" || user?.role === "auditor2") ? <AuditorDashboard user={user} /> : <Auth onLogin={handleLogin} />;
      case "registered-farms":
        return <RegisteredFarms onNavigate={setCurrentPage} />;
      case "market-prices":
        return <MarketPrices />;
      case "certificates":
        return (
          <div className="pt-32 pb-20 px-4">
            <h1 className="text-3xl font-bold text-center mb-12">Your Digital Certificates</h1>
            {selectedCertificateFarm ? (
              <Certificate farmer={user} farm={selectedCertificateFarm} />
            ) : (
              <div className="max-w-3xl mx-auto rounded-3xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
                <h2 className="text-2xl font-bold text-gray-900">No Certificate Selected</h2>
                <p className="mt-3 text-gray-500">
                  Open a certified farm from the dashboard to view its certificate with the farmer's real details.
                </p>
              </div>
            )}
          </div>
        );
      case "public-certificate":
        return <PublicCertificateVerification certificateId={publicCertificateId} />;
      case "about":
        return <Help />;
      case "contact":
        return (
          <div className="pt-32 pb-20 px-4 max-w-4xl mx-auto text-center">
            <h1 className="text-4xl font-bold mb-6">Contact Us</h1>
            <p className="text-xl text-gray-600 mb-8">Have questions about certification? Our team is here to help.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
              <div className="p-6 bg-white rounded-2xl shadow-sm border">
                <h3 className="font-bold mb-2">Support Email</h3>
                <p className="text-green-600">support@agritrustra.gov.in</p>
              </div>
              <div className="p-6 bg-white rounded-2xl shadow-sm border">
                <h3 className="font-bold mb-2">Helpline</h3>
                <p className="text-green-600">1800-AGRI-TRUST</p>
              </div>
            </div>
          </div>
        );
      default:
        return <Home onNavigate={setCurrentPage} />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col font-sans">
      <Header user={user} onLogout={handleLogout} onNavigate={setCurrentPage} />
      <main className="flex-grow">
        {renderPage()}
      </main>
      <Footer onNavigate={setCurrentPage} />
      <Toaster position="top-center" />
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <AppShell />
    </I18nProvider>
  );
}
