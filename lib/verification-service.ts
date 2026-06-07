/**
 * Client-side verification helpers for phone validation and OTP attempt tracking.
 */

export interface PhoneValidationResult {
  isValid: boolean;
  normalized: string;
  country: string;
  region?: string;
  error?: string;
}

export interface OtpVerificationResult {
  success: boolean;
  attempts: number;
  remainingAttempts: number;
  expiresIn: number;
  message: string;
}

/**
 * Validates Indian phone number format.
 */
export const validateIndianPhoneNumber = (phone: string): PhoneValidationResult => {
  try {
    const sanitized = phone.replace(/[^\d+]/g, "");
    const digits = sanitized.replace(/^\+91/, "").replace(/^0+/, "");

    if (digits.length !== 10) {
      return {
        isValid: false,
        normalized: "",
        country: "IN",
        error: "Phone number must be 10 digits"
      };
    }

    if (!/^[6-9]/.test(digits)) {
      return {
        isValid: false,
        normalized: "",
        country: "IN",
        error: "Invalid Indian mobile number (must start with 6-9)"
      };
    }

    return {
      isValid: true,
      normalized: `+91${digits}`,
      country: "IN",
      region: getTelecomRegion(digits)
    };
  } catch (error: any) {
    return {
      isValid: false,
      normalized: "",
      country: "IN",
      error: error.message
    };
  }
};

const getTelecomRegion = (phoneDigits: string): string => {
  const regionMappings: Record<string, string> = {
    "6": "Jio/Airtel/Vi",
    "7": "Airtel/Vi/Idea",
    "8": "Vodafone/Idea/Airtel",
    "9": "All Carriers"
  };
  return regionMappings[phoneDigits[0]] || "Unknown";
};

export const isPhoneNumberFormatValid = (phone: string): boolean => {
  const result = validateIndianPhoneNumber(phone);
  return result.isValid;
};

/**
 * Verify OTP with rate limiting and attempt tracking.
 */
export const verifyOtpWithAttempts = (
  inputOtp: string,
  storedOtpHash: string,
  attempts: number,
  maxAttempts = 5
): OtpVerificationResult => {
  const remainingAttempts = maxAttempts - attempts;

  if (remainingAttempts <= 0) {
    return {
      success: false,
      attempts,
      remainingAttempts: 0,
      expiresIn: 0,
      message: "Maximum OTP attempts exceeded. Please request a new OTP."
    };
  }

  const isValid = inputOtp === storedOtpHash;
  if (!isValid) {
    return {
      success: false,
      attempts: attempts + 1,
      remainingAttempts: remainingAttempts - 1,
      expiresIn: 300,
      message: `Invalid OTP. ${remainingAttempts - 1} attempts remaining.`
    };
  }

  return {
    success: true,
    attempts: attempts + 1,
    remainingAttempts,
    expiresIn: 0,
    message: "OTP verified successfully"
  };
};

export const generateTransactionId = (): string =>
  `TXN${Date.now()}${Math.random().toString(36).slice(2, 11)}`.toUpperCase();

export const shouldVerifyPhoneNumber = (phone: string): boolean =>
  isPhoneNumberFormatValid(phone);
