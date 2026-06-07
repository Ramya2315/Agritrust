import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Leaf, User, ShieldCheck, QrCode, FileBadge, Menu, X, ChevronDown, Home as HomeIcon, Info, Phone, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { languages, useI18n, type LanguageCode } from "@/lib/i18n";

interface HeaderProps {
  user: any;
  onLogout: () => void;
  onNavigate: (page: string) => void;
}

export default function Header({ user, onLogout, onNavigate }: HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { language, setLanguage, t } = useI18n();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-green-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => onNavigate("home")}>
            <Leaf className="h-8 w-8 text-green-600" />
            <span className="text-2xl font-bold bg-gradient-to-r from-green-700 to-emerald-600 bg-clip-text text-transparent">
              AgriTrustra
            </span>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-5">
            <button onClick={() => onNavigate("home")} className="text-gray-600 hover:text-green-600 font-medium flex items-center gap-1">
              <HomeIcon className="h-4 w-4" /> {t("home")}
            </button>
            <button onClick={() => onNavigate("about")} className="text-gray-600 hover:text-green-600 font-medium flex items-center gap-1">
              <Info className="h-4 w-4" /> {t("about")}
            </button>
            <button onClick={() => onNavigate("market-prices")} className="text-gray-600 hover:text-green-600 font-medium flex items-center gap-1">
              <TrendingUp className="h-4 w-4" /> {t("marketPrices")}
            </button>

            <button onClick={() => onNavigate("registered-farms")} className="text-gray-600 hover:text-green-600 font-medium flex items-center gap-1">
              <Leaf className="h-4 w-4" /> {t("farms")}
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger className="text-gray-600 hover:text-green-600 font-medium flex items-center gap-1 outline-none">
                <User className="h-4 w-4" /> {t("farmers")} <ChevronDown className="h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => onNavigate("farmer-dashboard")}>
                  {t("dashboard")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onNavigate("qr-codes")}>
                  <QrCode className="h-4 w-4 mr-2" /> {t("qrCode")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onNavigate("certificates")}>
                  <FileBadge className="h-4 w-4 mr-2" /> {t("certificates")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <button onClick={() => onNavigate("auditor-dashboard")} className="text-gray-600 hover:text-green-600 font-medium flex items-center gap-1">
              <ShieldCheck className="h-4 w-4" /> {t("auditor")}
            </button>

            <button onClick={() => onNavigate("contact")} className="text-gray-600 hover:text-green-600 font-medium flex items-center gap-1">
              <Phone className="h-4 w-4" /> {t("contact")}
            </button>
            <select
              aria-label={t("language")}
              className="rounded-md border border-green-100 bg-white px-2 py-1 text-sm text-gray-600"
              value={language}
              onChange={(event) => setLanguage(event.target.value as LanguageCode)}
            >
              {languages.map(item => (
                <option key={item.code} value={item.code}>{item.label}</option>
              ))}
            </select>

            {user ? (
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-500">Hi, {user.name}</span>
                <Button variant="outline" size="sm" onClick={onLogout}>{t("logout")}</Button>
              </div>
            ) : (
              <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => onNavigate("auth")}>
                {t("getStarted")}
              </Button>
            )}
          </nav>

          {/* Mobile Menu Toggle */}
          <div className="md:hidden">
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="text-gray-600">
              {isMenuOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Nav */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-white border-b border-green-100 overflow-hidden"
          >
            <div className="px-4 pt-2 pb-6 space-y-2">
              <button onClick={() => { onNavigate("home"); setIsMenuOpen(false); }} className="block w-full text-left px-3 py-2 text-gray-600">{t("home")}</button>
              <button onClick={() => { onNavigate("about"); setIsMenuOpen(false); }} className="block w-full text-left px-3 py-2 text-gray-600">{t("about")}</button>
              <button onClick={() => { onNavigate("market-prices"); setIsMenuOpen(false); }} className="block w-full text-left px-3 py-2 text-gray-600">{t("marketPrices")}</button>
              <button onClick={() => { onNavigate("registered-farms"); setIsMenuOpen(false); }} className="block w-full text-left px-3 py-2 text-gray-600">{t("farms")}</button>
              <button onClick={() => { onNavigate("farmer-dashboard"); setIsMenuOpen(false); }} className="block w-full text-left px-3 py-2 text-gray-600">{t("farmerDashboard")}</button>
              <button onClick={() => { onNavigate("qr-codes"); setIsMenuOpen(false); }} className="block w-full text-left px-3 py-2 text-gray-600">{t("qrCode")}</button>
              <button onClick={() => { onNavigate("certificates"); setIsMenuOpen(false); }} className="block w-full text-left px-3 py-2 text-gray-600">{t("certificates")}</button>
              <button onClick={() => { onNavigate("auditor-dashboard"); setIsMenuOpen(false); }} className="block w-full text-left px-3 py-2 text-gray-600">{t("auditor")}</button>
              <button onClick={() => { onNavigate("contact"); setIsMenuOpen(false); }} className="block w-full text-left px-3 py-2 text-gray-600">{t("contact")}</button>
              <select
                aria-label={t("language")}
                className="mx-3 w-[calc(100%-1.5rem)] rounded-md border px-3 py-2 text-sm"
                value={language}
                onChange={(event) => setLanguage(event.target.value as LanguageCode)}
              >
                {languages.map(item => (
                  <option key={item.code} value={item.code}>{item.label}</option>
                ))}
              </select>
              {user ? (
                <Button variant="outline" className="w-full mt-4" onClick={onLogout}>{t("logout")}</Button>
              ) : (
                <Button className="w-full mt-4 bg-green-600" onClick={() => { onNavigate("auth"); setIsMenuOpen(false); }}>{t("getStarted")}</Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
