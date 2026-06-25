import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { ChevronLeft, Key, Phone } from "lucide-react";
import { toast } from "sonner";
import { startAuthentication } from "@simplewebauthn/browser";
import { BiometricRing } from "@/components/BiometricRing";
import { PinKeypad } from "@/components/PinKeypad";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { apiClient, ApiError } from "@/lib/api";
import { useSessionStore } from "@/stores/sessionStore";
import { hashPin, getGreeting } from "@/lib/utils";
import { MAX_PIN_ATTEMPTS } from "@/lib/constants";
import type { UserSession } from "@/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "AutoPayKe - Sign in" }] }),
  component: LoginPage,
});

type LoginView = "biometric" | "pin";
type PinStatus = "idle" | "error" | "success";

type PasskeyChallengeResponse = {
  optionsJSON: Parameters<typeof startAuthentication>[0]["optionsJSON"];
};

function LoginPage() {
  const navigate = useNavigate();
  const sessionStore = useSessionStore();

  const credentialId =
    typeof window !== "undefined"
      ? localStorage.getItem("autopayke_credential_id")
      : null;

  const [view, setView] = useState<LoginView>(credentialId ? "biometric" : "pin");
  const [isLoading, setIsLoading] = useState(false);
  const [bioError, setBioError] = useState<string | null>(null);
  const [pinStatus, setPinStatus] = useState<PinStatus>("idle");
  const [pinStatusMessage, setPinStatusMessage] = useState<string | undefined>();
  const [pinAttempts, setPinAttempts] = useState(0);
  const [accountLocked, setAccountLocked] = useState(false);
  const autoTriggered = useRef(false);

  const phone = sessionStore.phone;
  const displayName = sessionStore.display_name;
  const greeting = getGreeting();

  const avatarLetter = displayName
    ? displayName[0]!.toUpperCase()
    : phone
    ? phone[0] ?? "?"
    : "?";

  const nameDisplay = displayName
    ? displayName.split(" ")[0] ?? displayName
    : phone
    ? phone
    : "Welcome back";

  const navigateAfterLogin = () => {
    const redirect = sessionStorage.getItem("autopayke_redirect_to");
    if (redirect) {
      sessionStorage.removeItem("autopayke_redirect_to");
      void navigate({ to: redirect as "/" });
    } else {
      void navigate({ to: "/dashboard" });
    }
  };

  const handleBiometricLogin = async () => {
    setIsLoading(true);
    setBioError(null);
    try {
      const data = await apiClient.get<PasskeyChallengeResponse>(
        "/api/auth/passkey-challenge"
      );
      const assertion = await startAuthentication({ optionsJSON: data.optionsJSON });
      const res = await apiClient.post<UserSession>("/api/auth/verify-passkey", {
        assertion,
      });
      sessionStore.setSession(res);
      navigateAfterLogin();
    } catch (err) {
      if (err instanceof DOMException) {
        if (err.name === "NotAllowedError") {
          setBioError("Authentication was cancelled. Tap to try again.");
        } else if (err.name === "InvalidStateError") {
          setView("pin");
          toast("Please use your PIN instead.");
        } else {
          toast.error("Connection failed. Check your internet and try again.");
        }
      } else if (err instanceof ApiError) {
        toast.error("Authentication failed. Please try again.");
      } else {
        toast.error("Connection failed. Check your internet and try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (view === "biometric" && !autoTriggered.current) {
      autoTriggered.current = true;
      const t = setTimeout(() => void handleBiometricLogin(), 300);
      return () => clearTimeout(t);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePinLogin = async (pin: string) => {
    if (!phone) {
      toast.error("Phone number not found. Please log in with your phone number.");
      void navigate({ to: "/login/phone" });
      return;
    }
    setIsLoading(true);
    try {
      const pin_hash = await hashPin(pin);
      const res = await apiClient.post<UserSession>("/api/auth/verify-pin", {
        phone,
        pin_hash,
      });
      setPinStatus("success");
      sessionStore.setSession(res);
      setTimeout(() => navigateAfterLogin(), 400);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 401) {
          const next = pinAttempts + 1;
          setPinAttempts(next);
          setPinStatus("error");
          const remaining = MAX_PIN_ATTEMPTS - next;
          setPinStatusMessage(
            remaining > 0
              ? `Incorrect PIN. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining before account lock.`
              : "Incorrect PIN."
          );
        } else if (err.code === 429) {
          setAccountLocked(true);
          setPinStatus("error");
          setPinStatusMessage("Account locked. Verify with your phone number.");
        } else {
          toast.error("Connection failed. Check your internet and try again.");
        }
      } else {
        toast.error("Connection failed. Check your internet and try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwitchAccount = () => {
    sessionStore.clearSession();
    localStorage.removeItem("autopayke_credential_id");
    void navigate({ to: "/signup" });
  };

  return (
    <div className="min-h-screen bg-auth-gradient relative">
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-transparent via-transparent to-white/30" />

      <div className="relative z-10 px-5 pt-6 pb-8 max-w-97.5 mx-auto min-h-screen flex flex-col">
        <button
          type="button"
          onClick={() => navigate({ to: "/" })}
          className="w-9 h-9 rounded-xl bg-white/50 border border-white/60 flex items-center justify-center cursor-pointer mb-8 self-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
          aria-label="Go back"
        >
          <ChevronLeft size={16} strokeWidth={2} />
        </button>

        {view === "biometric" ? (
          <BiometricView
            greeting={greeting}
            nameDisplay={nameDisplay}
            phone={phone}
            avatarLetter={avatarLetter}
            isLoading={isLoading}
            bioError={bioError}
            credentialId={credentialId}
            onBiometricPress={handleBiometricLogin}
            onUsePin={() => { setView("pin"); setBioError(null); }}
            onUsePhone={() => navigate({ to: "/login/phone" })}
            onSwitchAccount={handleSwitchAccount}
          />
        ) : (
          <PinView
            avatarLetter={avatarLetter}
            phone={phone}
            pinStatus={pinStatus}
            pinStatusMessage={pinStatusMessage}
            pinAttempts={pinAttempts}
            accountLocked={accountLocked}
            isLoading={isLoading}
            credentialId={credentialId}
            onComplete={handlePinLogin}
            onForgotPin={() => navigate({ to: "/login/phone" })}
            onUseBiometric={() => { setView("biometric"); void handleBiometricLogin(); }}
          />
        )}
      </div>
    </div>
  );
}

interface BiometricViewProps {
  greeting: string;
  nameDisplay: string;
  phone: string | null;
  avatarLetter: string;
  isLoading: boolean;
  bioError: string | null;
  credentialId: string | null;
  onBiometricPress: () => void;
  onUsePin: () => void;
  onUsePhone: () => void;
  onSwitchAccount: () => void;
}

function BiometricView({
  greeting,
  nameDisplay,
  phone,
  avatarLetter,
  isLoading,
  bioError,
  onBiometricPress,
  onUsePin,
  onUsePhone,
  onSwitchAccount,
}: BiometricViewProps) {
  return (
    <div className="flex flex-col items-center flex-1">
      <p className="text-[11px] text-black/40 font-medium text-center mb-1">{greeting}</p>
      <p className="font-display font-extrabold text-[26px] text-navy text-center mb-1">
        {nameDisplay}
      </p>
      {phone && nameDisplay !== phone && (
        <p className="text-[13px] text-black/40 text-center mb-6">{phone}</p>
      )}

      <div className="w-15 h-15 rounded-4xl bg-orange-gradient flex items-center justify-center font-display text-[22px] font-extrabold text-white shadow-[0_8px_24px_rgba(249,115,22,0.35)] mb-8 mt-3">
        {avatarLetter}
      </div>

      <BiometricRing
        type="face"
        size="md"
        onPress={isLoading ? undefined : onBiometricPress}
        animating={!isLoading}
      />

      <div className="min-h-8 mt-4 mb-6 flex items-center justify-center">
        {isLoading ? (
          <LoadingSpinner size={16} color="orange" label="Authenticating…" />
        ) : bioError ? (
          <p className="text-[13px] text-danger/80 text-center">{bioError}</p>
        ) : (
          <p className="text-[13px] text-black/40 text-center">Tap to unlock with Face ID</p>
        )}
      </div>

      <div className="flex gap-3 justify-center mb-8">
        <button
          type="button"
          onClick={onUsePin}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/70 rounded-full border border-white/90 text-[12px] font-semibold text-navy cursor-pointer active:bg-white/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-1"
        >
          <Key size={14} strokeWidth={1.5} />
          Use PIN
        </button>
        <button
          type="button"
          onClick={onUsePhone}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/70 rounded-full border border-white/90 text-[12px] font-semibold text-navy cursor-pointer active:bg-white/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-1"
        >
          <Phone size={14} strokeWidth={1.5} />
          Use phone number
        </button>
      </div>

      <div className="flex-1" />

      <p className="text-center text-[12px] text-black/30">
        Not you?{" "}
        <button
          type="button"
          onClick={onSwitchAccount}
          className="text-orange font-semibold focus-visible:outline-none"
        >
          Switch account
        </button>
      </p>
    </div>
  );
}

interface PinViewProps {
  avatarLetter: string;
  phone: string | null;
  pinStatus: PinStatus;
  pinStatusMessage: string | undefined;
  pinAttempts: number;
  accountLocked: boolean;
  isLoading: boolean;
  credentialId: string | null;
  onComplete: (pin: string) => void;
  onForgotPin: () => void;
  onUseBiometric: () => void;
}

function PinView({
  avatarLetter,
  phone,
  pinStatus,
  pinStatusMessage,
  pinAttempts,
  accountLocked,
  isLoading,
  credentialId,
  onComplete,
  onForgotPin,
  onUseBiometric,
}: PinViewProps) {
  const remaining = MAX_PIN_ATTEMPTS - pinAttempts;

  return (
    <div className="flex flex-col flex-1">
      <div className="flex flex-col items-center mb-4">
        <div className="w-15 h-15 rounded-4xl bg-orange-gradient flex items-center justify-center font-display text-[22px] font-extrabold text-white shadow-[0_8px_24px_rgba(249,115,22,0.35)] mb-3">
          {avatarLetter}
        </div>
        {phone && (
          <p className="text-[13px] text-black/40 text-center mb-1">{phone}</p>
        )}
        <h1 className="font-display font-bold text-[22px] text-navy text-center">
          Enter your PIN
        </h1>
      </div>

      <PinKeypad
        key={accountLocked ? "locked" : "active"}
        onComplete={onComplete}
        theme="light"
        status={pinStatus}
        statusMessage={pinStatusMessage}
        disabled={isLoading || accountLocked}
      />

      {pinAttempts > 0 && !accountLocked && (
        <p className="text-center text-[12px] text-danger mt-1">
          {remaining} attempt{remaining === 1 ? "" : "s"} remaining before your account is locked
        </p>
      )}

      <div className="flex-1" />

      <p className={cn("text-center text-[12px] text-black/35 mt-4")}>
        Forgot PIN?{" "}
        <button
          type="button"
          onClick={onForgotPin}
          className="text-orange font-semibold focus-visible:outline-none"
        >
          Verify with phone number
        </button>
      </p>

      {credentialId && !accountLocked && (
        <p className="text-center text-[12px] text-orange font-semibold mt-3 cursor-pointer">
          <button
            type="button"
            onClick={onUseBiometric}
            className="focus-visible:outline-none"
          >
            Use Face ID instead
          </button>
        </p>
      )}
    </div>
  );
}
