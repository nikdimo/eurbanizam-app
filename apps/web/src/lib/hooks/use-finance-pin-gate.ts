import * as React from "react";

import { apiClient } from "@/lib/api/client";
import { PinStatusSchema, PinVerifyResult } from "@/lib/schemas";

const STORAGE_KEY = "eurbanizam.finance_pin.unlocked";

export function useFinancePinGate() {
  const [pinRequired, setPinRequired] = React.useState<boolean | null>(null);
  const [unlocked, setUnlocked] = React.useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.sessionStorage?.getItem(STORAGE_KEY) === "true";
  });
  const [statusError, setStatusError] = React.useState<string | null>(null);
  const [verifying, setVerifying] = React.useState(false);
  const [verifyError, setVerifyError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;

    void (async () => {
      const response = await apiClient.getParsed("/api/settings/pin", PinStatusSchema);
      if (!active) {
        return;
      }

      if (response.error || !response.data) {
        setStatusError(
          response.error ?? "Unable to determine whether a finance PIN is configured.",
        );
        setPinRequired(false);
        return;
      }

      setStatusError(null);
      setPinRequired(response.data.has_pin);

      if (!response.data.has_pin) {
        setUnlocked(true);
        if (typeof window !== "undefined") {
          window.sessionStorage?.removeItem(STORAGE_KEY);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const verifyPin = React.useCallback(async (pin: string) => {
    setVerifying(true);
    setVerifyError(null);

    const trimmed = pin.trim();
    if (!trimmed) {
      setVerifyError("Enter the finance PIN.");
      setVerifying(false);
      return false;
    }

    const response = await apiClient.post<PinVerifyResult>("/api/settings/pin/verify", {
      pin: trimmed,
    });

    setVerifying(false);

    if (response.error || !response.data) {
      setVerifyError(response.error ?? "Unable to verify the PIN.");
      return false;
    }

    if (response.data.verified) {
      if (typeof window !== "undefined") {
        window.sessionStorage?.setItem(STORAGE_KEY, "true");
      }
      setUnlocked(true);
      return true;
    }

    setVerifyError("Invalid PIN.");
    return false;
  }, []);

  const resetPin = React.useCallback(() => {
    setUnlocked(false);
    if (typeof window !== "undefined") {
      window.sessionStorage?.removeItem(STORAGE_KEY);
    }
  }, []);

  return {
    pinRequired,
    unlocked,
    statusError,
    verifying,
    verifyError,
    verifyPin,
    resetPin,
  };
}
