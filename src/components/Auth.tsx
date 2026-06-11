import React, { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { AlertCircle, Check, Leaf, LocateFixed, Lock, Mail, MapPin, Smartphone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

interface AuthProps {
  onLogin: (user: any) => void;
}

const emptyOtpState = {
  message: "",
  delivery: "",
  devOtp: "",
  resendInSeconds: 0,
  expiresInSeconds: 0
};

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
const buildAddress = (city: string, state: string, country: string, pincode: string) =>
  [city, state, country, pincode].map(value => value.trim()).filter(Boolean).join(", ");

export default function Auth({ onLogin }: AuthProps) {
  const otpInputRef = useRef<HTMLInputElement | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register" | "forgot">("login");
  const [isLoading, setIsLoading] = useState(false);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const [otpState, setOtpState] = useState(emptyOtpState);
  const [formData, setFormData] = useState({
    phone: "",
    email: "",
    password: "",
    confirmPassword: "",
    name: "",
    role: "farmer",
    otp: "",
    city: "",
    state: "",
    country: "",
    pincode: "",
    address: "",
    location: {
      lat: 0,
      lng: 0,
      accuracy: null as number | null
    }
  });

  const emailLooksValid = isValidEmail(formData.email);
  const otpPurpose = authMode === "register" ? "register" : authMode === "login" ? "login" : "reset-password";
  const otpRecipientLabel = formData.email;
  const otpRecipientHint = "email address";

  useEffect(() => {
    if (otpState.resendInSeconds <= 0) return;

    const timer = window.setInterval(() => {
      setOtpState(current => ({
        ...current,
        resendInSeconds: Math.max(0, current.resendInSeconds - 1)
      }));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [otpState.resendInSeconds]);

  useEffect(() => {
    if (!showOtp) return;

    const focusTimer = window.setTimeout(() => {
      otpInputRef.current?.focus();
      otpInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);

    return () => window.clearTimeout(focusTimer);
  }, [showOtp]);



  const resetOtpState = () => {
    setShowOtp(false);
    setOtpState(emptyOtpState);
  };

  const handleEmailChange = (value: string) => {
    if (showOtp) return;
    const email = value.trim();
    setFormData(prev => {
      if (prev.email === email) return prev;
      return { ...prev, email, otp: "" };
    });
  };

  const handlePhoneChange = (value: string) => {
    if (showOtp) return;
    const phone = value.replace(/\D/g, "").slice(0, 10);
    setFormData(prev => {
      if (prev.phone === phone) return prev;
      return { ...prev, phone, otp: "" };
    });
  };

  const resetForMode = (mode: "login" | "register" | "forgot", nextEmail = "") => {
    setAuthMode(mode);
    resetOtpState();
    setFormData({
      phone: "",
      email: nextEmail,
      password: "",
      confirmPassword: "",
      name: "",
      role: "farmer",
      otp: "",
      city: "",
      state: "",
      country: "",
      pincode: "",
      address: "",
      location: {
        lat: 0,
        lng: 0,
        accuracy: null
      }
    });
  };

  const updateAddressField = (field: "city" | "state" | "country" | "pincode", value: string) => {
    if (showOtp) return;
    setFormData(prev => {
      const next = { ...prev, [field]: field === "pincode" ? value.replace(/\D/g, "").slice(0, 10) : value };
      return {
        ...next,
        address: buildAddress(next.city, next.state, next.country, next.pincode)
      };
    });
  };

  const detectLiveLocation = async () => {
    if (showOtp) return;
    if (!navigator.geolocation) {
      toast.error("Location detection is not available in this browser");
      return;
    }

    setIsDetectingLocation(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0
        });
      });

      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`
      );
      const data = response.ok ? await response.json() : {};
      const address = data.address || {};
      const city = address.city || address.town || address.village || address.hamlet || address.county || "";
      const state = address.state || address.region || "";
      const country = address.country || "";
      const pincode = address.postcode || "";
      const formattedAddress = data.display_name || buildAddress(city, state, country, pincode);

      setFormData(prev => ({
        ...prev,
        city: city || prev.city,
        state: state || prev.state,
        country: country || prev.country,
        pincode: pincode || prev.pincode,
        address: formattedAddress || buildAddress(city || prev.city, state || prev.state, country || prev.country, pincode || prev.pincode),
        location: {
          lat,
          lng,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null
        }
      }));
      toast.success("Live location detected");
    } catch (err: any) {
      const message = err?.code === 1
        ? "Please allow location permission to detect your live location"
        : "Could not detect live location. Enter address manually.";
      toast.error(message);
    } finally {
      setIsDetectingLocation(false);
    }
  };

  const requestOtp = async () => {
    const response = await fetch("/api/auth/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: formData.email,
        phone: authMode === "register" ? formData.phone : undefined,
        purpose: otpPurpose
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Failed to send OTP");
    }

    setOtpState({
      message: data.message || `OTP sent to ${otpRecipientLabel}`,
      delivery: data.delivery || "",
      devOtp: data.devOtp || "",
      resendInSeconds: Number(data.retryAfterSeconds || data.resendInSeconds || 0),
      expiresInSeconds: Number(data.expiresInSeconds || 0)
    });
    setFormData(prev => ({ ...prev, otp: "" }));
    setShowOtp(true);
    toast.success(data.message || `OTP sent to ${otpRecipientLabel}`);
    if (data.devOtp) {
      toast.info(`Dev OTP: ${data.devOtp}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (!emailLooksValid) {
        toast.error("Please enter a valid email address");
        setIsLoading(false);
        return;
      }

      if (authMode === "register") {
        if (!formData.city.trim() || !formData.state.trim() || !formData.country.trim() || !formData.pincode.trim()) {
          toast.error("Please enter city, state, country, and pincode");
          setIsLoading(false);
          return;
        }
      }

      if (!showOtp) {
        await requestOtp();
        setIsLoading(false);
        return;
      }

      const endpoint = authMode === "login"
        ? "/api/auth/login"
        : authMode === "register"
          ? "/api/auth/register"
          : "/api/auth/reset-password";

      if (!/^\d{6}$/.test(formData.otp)) {
        toast.error("Enter a valid 6-digit OTP");
        setIsLoading(false);
        return;
      }

      if (authMode !== "login") {
        if (formData.password !== formData.confirmPassword) {
          toast.error("Passwords do not match");
          setIsLoading(false);
          return;
        }
        if (!/^\d{6}$/.test(formData.password)) {
          toast.error("Password must be exactly 6 digits");
          setIsLoading(false);
          return;
        }
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          address: formData.address || buildAddress(formData.city, formData.state, formData.country, formData.pincode)
        })
      });

      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error || data.message || "Something went wrong");
        return;
      }

      if (authMode === "login") {
        localStorage.setItem("token", data.token);
        onLogin(data.user);
        toast.success("Welcome back!");
        return;
      }

      if (authMode === "register") {
        toast.success("Registration successful. Continue with email login.");
        resetForMode("login", formData.email);
        return;
      }

      toast.success("Password reset successful. Continue with email login.");
      resetForMode("login", formData.email);
    } catch (err: any) {
      toast.error(err?.message || "Failed to connect to server");
    } finally {
      setIsLoading(false);
    }
  };

  const primaryButtonLabel = authMode === "login"
    ? showOtp ? "Verify & Login" : "Send Login OTP"
    : authMode === "register"
      ? showOtp ? "Verify & Register" : "Send Registration OTP"
      : showOtp ? "Reset Password" : "Send Reset OTP";

  return (
    <div className="min-h-screen pt-24 pb-12 flex items-center justify-center bg-[url('https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&q=80')] bg-cover bg-fixed">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-lg px-4"
      >
        <Card className="border-none shadow-2xl bg-white/95 backdrop-blur-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-green-100 rounded-full">
                <Leaf className="h-8 w-8 text-green-600" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold text-gray-900">
              {authMode === "login" ? "Welcome to AgriTrustra" : authMode === "register" ? "Join AgriTrustra" : "Reset Password"}
            </CardTitle>
            <CardDescription>
              {authMode === "login"
                ? "Login with your email and a one-time password"
                : authMode === "register"
                ? "Register farmers and auditors with email OTP verification"
                  : "Enter your email address to reset your password"}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {authMode === "register" && (
              <Tabs value={formData.role} onValueChange={(value) => {
                if (showOtp) return;
                setFormData(prev => ({ ...prev, role: value }));
              }}>
                <TabsList className="grid w-full grid-cols-3 mb-6">
                  <TabsTrigger value="farmer" disabled={showOtp}>Farmer</TabsTrigger>
                  <TabsTrigger value="auditor1" disabled={showOtp}>Auditor 1</TabsTrigger>
                  <TabsTrigger value="auditor2" disabled={showOtp}>Auditor 2</TabsTrigger>
                </TabsList>
              </Tabs>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {authMode === "register" && (
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    placeholder="John Doe"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email Address <span className="text-red-500">*</span></Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="email"
                    className="pl-10 pr-10"
                    placeholder="you@example.com"
                    type="email"
                    required
                    disabled={showOtp}
                    value={formData.email}
                    onChange={(e) => handleEmailChange(e.target.value)}
                  />
                  {formData.email && (
                    emailLooksValid
                      ? <Check className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                      : <AlertCircle className="absolute right-3 top-3 h-4 w-4 text-red-500" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">We send OTPs to this email address to verify access.</p>
              </div>

              {authMode === "register" && (
                <>
                  <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number <span className="text-red-500">*</span></Label>
                  <div className="relative">
                    <Smartphone className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="phone"
                      className="pl-10 pr-10"
                      placeholder="9876543210"
                      type="tel"
                      inputMode="numeric"
                      required
                      disabled={showOtp}
                      value={formData.phone}
                      onChange={(e) => handlePhoneChange(e.target.value)}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Enter your phone number for account records; OTP will be delivered to your email.</p>
                </div>

                  <div className="space-y-3 rounded-lg border border-green-100 bg-green-50/60 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <Label className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-green-600" />
                        Address
                      </Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-2"
                        disabled={showOtp || isDetectingLocation}
                        onClick={detectLiveLocation}
                      >
                        <LocateFixed className="h-4 w-4" />
                        {isDetectingLocation ? "Detecting..." : "Detect live location"}
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="city">City <span className="text-red-500">*</span></Label>
                        <Input
                          id="city"
                          required
                          disabled={showOtp}
                          value={formData.city}
                          onChange={(e) => updateAddressField("city", e.target.value)}
                          placeholder="City"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="state">State <span className="text-red-500">*</span></Label>
                        <Input
                          id="state"
                          required
                          disabled={showOtp}
                          value={formData.state}
                          onChange={(e) => updateAddressField("state", e.target.value)}
                          placeholder="State"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="country">Country <span className="text-red-500">*</span></Label>
                        <Input
                          id="country"
                          required
                          disabled={showOtp}
                          value={formData.country}
                          onChange={(e) => updateAddressField("country", e.target.value)}
                          placeholder="Country"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="pincode">Pincode <span className="text-red-500">*</span></Label>
                        <Input
                          id="pincode"
                          required
                          disabled={showOtp}
                          value={formData.pincode}
                          onChange={(e) => updateAddressField("pincode", e.target.value)}
                          placeholder="Pincode"
                          inputMode="numeric"
                        />
                      </div>
                    </div>

                    {(formData.location.lat || formData.location.lng) ? (
                      <p className="text-xs text-green-800">
                        GPS: {formData.location.lat.toFixed(6)}, {formData.location.lng.toFixed(6)}
                        {formData.location.accuracy ? ` (${Math.round(formData.location.accuracy)}m accuracy)` : ""}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Use live detection to auto-fill address and save GPS coordinates.</p>
                    )}
                  </div>

                </>
              )}

              {showOtp && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="otp">Enter OTP</Label>
                    <Input
                      ref={otpInputRef}
                      id="otp"
                      placeholder="6-digit OTP"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]*"
                      maxLength={6}
                      required
                      className="h-11 text-center text-lg tracking-[0.35em]"
                      value={formData.otp}
                      onChange={(e) => setFormData(prev => ({ ...prev, otp: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                    />
                  </div>

                  <div className="rounded-lg bg-green-50 border border-green-100 px-3 py-2 text-xs text-green-800">
                    <p>{otpState.message || `OTP sent to ${otpRecipientLabel}`}</p>
                    <p>
                      {otpState.resendInSeconds > 0
                        ? `Resend available in ${otpState.resendInSeconds}s`
                        : "You can request a new OTP now."}
                    </p>
                    <p>Verify the OTP sent to your {otpRecipientHint} to continue.</p>
                    {otpState.devOtp && (
                      <p className="font-semibold">Local dev OTP: {otpState.devOtp}</p>
                    )}
                  </div>

                  {authMode !== "login" && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="password">Set {authMode === "register" ? "6-Digit Password" : "New 6-Digit Password"}</Label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                          <Input
                            id="password"
                            type="password"
                            className="h-11 pl-10"
                            placeholder="6-digit password"
                            inputMode="numeric"
                            required
                            maxLength={6}
                            value={formData.password}
                            onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="confirmPassword">Confirm Password</Label>
                        <Input
                          id="confirmPassword"
                          type="password"
                          placeholder="Confirm 6-digit password"
                          inputMode="numeric"
                          required
                          maxLength={6}
                          className="h-11"
                          value={formData.confirmPassword}
                          onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                        />
                      </div>
                    </>
                  )}
                </motion.div>
              )}

              {authMode === "login" && (
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => resetForMode("forgot", formData.email)}
                    className="text-xs text-green-600 hover:underline"
                  >
                    Forgot Password?
                  </button>
                </div>
              )}

              <Button
                className="w-full bg-green-600 hover:bg-green-700"
                disabled={isLoading || (!showOtp && !emailLooksValid)}
                type="submit"
              >
                {isLoading ? "Processing..." : primaryButtonLabel}
              </Button>

              {showOtp && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={isLoading || otpState.resendInSeconds > 0}
                  onClick={async () => {
                    setIsLoading(true);
                    try {
                      await requestOtp();
                    } catch (error: any) {
                      toast.error(error.message || "Failed to resend OTP");
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                >
                  {otpState.resendInSeconds > 0 ? `Resend OTP in ${otpState.resendInSeconds}s` : "Resend OTP"}
                </Button>
              )}

              {showOtp && (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  disabled={isLoading}
                  onClick={resetOtpState}
                >
                  Edit registration details
                </Button>
              )}
            </form>

            <div className="mt-6 text-center text-sm">
              {authMode === "forgot" ? (
                <button
                  onClick={() => resetForMode("login", formData.email)}
                  className="text-green-600 hover:underline font-medium"
                >
                  Back to Login
                </button>
              ) : (
                <button
                  onClick={() => resetForMode(authMode === "login" ? "register" : "login")}
                  className="text-green-600 hover:underline font-medium"
                >
                  {authMode === "login" ? "Don't have an account? Register" : "Already have an account? Login"}
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
