import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Key, Phone } from "lucide-react";
import { toast } from "sonner";
import { startAuthentication } from "@simplewebauthn/browser";
import { BiometricRing } from "@/components/BiometricRing";
import { PinKeypad } from "@/components/PinKeypad";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useSessionStore } from "@/stores/sessionStore";
import { useProfileStore } from "@/stores/profileStore";
import { Avatar } from "@/components/Avatar";
import { hashPin, getGreeting } from "@/lib/utils";
import { MAX_PIN_ATTEMPTS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "AutoPayKe - Unlock" }] }),
  component: LoginPage,
});

type LockView = "biometric" | "pin";
type PinStatus = "idle" | "error" | "success";


function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sessionStore = useSessionStore();
  const profile = useProfileStore();

  const credentialId =
    typeof window !== "undefined"
      ? localStorage.getItem("autopayke_credential_id")
      : null;

  const isAuthenticated = sessionStore.isAuthenticated();
  const is_unlocked = sessionStore.is_unlocked;
  const pin_hash = sessionStore.pin_hash;

  const [view, setView] = useState<LockView>(credentialId ? "biometric" : "pin");
  const [isLoading, setIsLoading] = useState(false);
  const [bioError, setBioError] = useState<string | null>(null);
  const [pinStatus, setPinStatus] = useState<PinStatus>("idle");
  const [pinStatusMessage, setPinStatusMessage] = useState<string | undefined>();
  const [pinAttempts, setPinAttempts] = useState(0);
  const [accountLocked, setAccountLocked] = useState(false);
  const autoTriggered = useRef(false);
  const redirectChecked = useRef(false);

  const phone = sessionStore.phone;
  const displayName = profile.displayName ?? sessionStore.display_name;
  const greeting = getGreeting();

  const avatarFallback = (displayName ?? phone ?? "A")[0]?.toUpperCase() ?? "A";

  const nameDisplay = displayName
    ? displayName.split(" ")[0] ?? displayName
    : phone ?? "Welcome back";

  const navigateAfterUnlock = () => {
    const redirect = sessionStorage.getItem("autopayke_redirect_to");
    if (redirect) {
      sessionStorage.removeItem("autopayke_redirect_to");
      void navigate({ to: redirect as "/", replace: true });
    } else {
      void navigate({ to: "/dashboard", replace: true });
    }
  };

  // Redirect: if no session → phone OTP; if already unlocked → dashboard
  useEffect(() => {
    if (redirectChecked.current) return;
    redirectChecked.current = true;

    if (!isAuthenticated) {
      void navigate({ to: "/login/phone", replace: true });
    } else if (is_unlocked) {
      navigateAfterUnlock();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBiometricUnlock = async () => {
    const credId = localStorage.getItem("autopayke_credential_id");
    if (!credId) { setView("pin"); return; }

    setIsLoading(true);
    setBioError(null);
    try {
      const rawChallenge = crypto.getRandomValues(new Uint8Array(32));
      const challenge = btoa(String.fromCharCode(...rawChallenge))
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

      await startAuthentication({
        optionsJSON: {
          challenge,
          rpId: window.location.hostname,
          allowCredentials: [{ id: credId, type: "public-key" }],
          userVerification: "required",
          timeout: 60000,
        },
      });

      // Biometric verified locally — no server round-trip needed for the lock screen
      sessionStore.setUnlocked(true);
      // Force a refetch so the dashboard doesn't show data left over from before locking
      void queryClient.invalidateQueries();
      navigateAfterUnlock();
    } catch (err) {
      if (err instanceof DOMException) {
        if (err.name === "NotAllowedError") {
          setBioError("Authentication was cancelled. Tap to try again.");
        } else {
          setView("pin");
          toast("Please use your PIN instead.");
        }
      } else {
        setBioError("Biometric failed. Use your PIN.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-trigger biometric on mount for returning users
  useEffect(() => {
    if (!isAuthenticated || is_unlocked) return;
    if (view === "biometric" && !autoTriggered.current) {
      autoTriggered.current = true;
      const t = setTimeout(() => void handleBiometricUnlock(), 300);
      return () => clearTimeout(t);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePinUnlock = async (pin: string) => {
    if (!pin_hash) {
      // No PIN stored — redirect to phone OTP flow to re-authenticate
      toast("Please verify with your phone number to unlock.");
      void navigate({ to: "/login/phone" });
      return;
    }

    const inputHash = await hashPin(pin);
    if (inputHash === pin_hash) {
      setPinStatus("success");
      sessionStore.setUnlocked(true);
      // Force a refetch so the dashboard doesn't show data left over from before locking
      void queryClient.invalidateQueries();
      setTimeout(() => navigateAfterUnlock(), 300);
    } else {
      const next = pinAttempts + 1;
      setPinAttempts(next);
      setPinStatus("error");
      const remaining = MAX_PIN_ATTEMPTS - next;
      if (remaining <= 0) {
        setAccountLocked(true);
        setPinStatusMessage("Too many incorrect attempts. Verify with phone.");
      } else {
        setPinStatusMessage(
          `Incorrect PIN. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
        );
      }
    }
  };

  const handleSwitchAccount = () => {
    sessionStore.clearSession();
    localStorage.removeItem("autopayke_credential_id");
    void navigate({ to: "/signup" });
  };

  // Render nothing while redirect check fires
  if (!isAuthenticated || is_unlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-linen">
        <LoadingSpinner size={24} color="orange" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linen relative font-manrope">
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-transparent via-transparent to-paper/40" />

      <div className="relative z-10 px-5 pt-12 pb-8 max-w-97.5 mx-auto min-h-screen flex flex-col">
        {view === "biometric" ? (
          <BiometricView
            greeting={greeting}
            nameDisplay={nameDisplay}
            phone={phone}
            avatarFallback={avatarFallback}
            avatarKey={profile.avatarKey}
            avatarDataUrl={profile.avatarDataUrl}
            isLoading={isLoading}
            bioError={bioError}
            credentialId={credentialId}
            onBiometricPress={handleBiometricUnlock}
            onUsePin={() => { setView("pin"); setBioError(null); }}
            onUsePhone={() => navigate({ to: "/login/phone" })}
            onSwitchAccount={handleSwitchAccount}
          />
        ) : (
          <PinView
            avatarFallback={avatarFallback}
            avatarKey={profile.avatarKey}
            avatarDataUrl={profile.avatarDataUrl}
            phone={phone}
            hasPinHash={!!pin_hash}
            pinStatus={pinStatus}
            pinStatusMessage={pinStatusMessage}
            pinAttempts={pinAttempts}
            accountLocked={accountLocked}
            isLoading={isLoading}
            credentialId={credentialId}
            onComplete={handlePinUnlock}
            onForgotPin={() => navigate({ to: "/login/phone" })}
            onUseBiometric={() => { setView("biometric"); void handleBiometricUnlock(); }}
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
  avatarFallback: string;
  avatarKey: string | null;
  avatarDataUrl: string | null;
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
  avatarFallback,
  avatarKey,
  avatarDataUrl,
  isLoading,
  bioError,
  onBiometricPress,
  onUsePin,
  onUsePhone,
  onSwitchAccount,
}: BiometricViewProps) {
  return (
    <div className="flex flex-col items-center flex-1">
      <p className="text-[11px] text-slate font-medium text-center mb-1">{greeting}</p>
      <p className="font-display font-extrabold text-[26px] text-ink text-center mb-1">
        {nameDisplay}
      </p>
      {phone && nameDisplay !== phone && (
        <p className="text-[13px] text-slate text-center mb-6">{phone}</p>
      )}

      <div className="mb-8 mt-3 shadow-[0_8px_24px_rgba(232,163,61,0.25)]">
        <Avatar avatarKey={avatarKey} avatarDataUrl={avatarDataUrl} fallbackLetter={avatarFallback} size="lg" />
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
          <p className="text-[13px] text-rust/80 text-center">{bioError}</p>
        ) : (
          <p className="text-[13px] text-slate text-center">Tap to unlock with Face ID</p>
        )}
      </div>

      <div className="flex gap-3 justify-center mb-8">
        <button
          type="button"
          onClick={onUsePin}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-paper/70 rounded-full border border-paper text-[12px] font-semibold text-ink cursor-pointer active:bg-paper transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-1"
        >
          <Key size={14} strokeWidth={1.5} />
          Use PIN
        </button>
        <button
          type="button"
          onClick={onUsePhone}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-paper/70 rounded-full border border-paper text-[12px] font-semibold text-ink cursor-pointer active:bg-paper transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-1"
        >
          <Phone size={14} strokeWidth={1.5} />
          Use phone number
        </button>
      </div>

      <div className="flex-1" />

      <p className="text-center text-[12px] text-ink/30">
        Not you?{" "}
        <button
          type="button"
          onClick={onSwitchAccount}
          className="text-amber-deep font-semibold focus-visible:outline-none"
        >
          Switch account
        </button>
      </p>
    </div>
  );
}

interface PinViewProps {
  avatarFallback: string;
  avatarKey: string | null;
  avatarDataUrl: string | null;
  phone: string | null;
  hasPinHash: boolean;
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
  avatarFallback,
  avatarKey,
  avatarDataUrl,
  phone,
  hasPinHash,
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
        <div className="mb-3 shadow-[0_8px_24px_rgba(232,163,61,0.25)]">
          <Avatar avatarKey={avatarKey} avatarDataUrl={avatarDataUrl} fallbackLetter={avatarFallback} size="lg" />
        </div>
        {phone && (
          <p className="text-[13px] text-slate text-center mb-1">{phone}</p>
        )}
        <h1 className="font-display font-bold text-[22px] text-ink text-center">
          {hasPinHash ? "Enter your PIN" : "Unlock your account"}
        </h1>
        {!hasPinHash && (
          <p className="text-[13px] text-slate text-center mt-1 max-w-60 leading-relaxed">
            No PIN found. Verify with your phone number to re-access your account.
          </p>
        )}
      </div>

      {hasPinHash ? (
        <PinKeypad
          key={accountLocked ? "locked" : "active"}
          onComplete={onComplete}
          theme="light"
          status={pinStatus}
          statusMessage={pinStatusMessage}
          disabled={isLoading || accountLocked}
        />
      ) : (
        <div className="flex justify-center mt-4 mb-4">
          <button
            type="button"
            onClick={onForgotPin}
            className={cn(
              "px-6 py-3.5 rounded-2xl bg-amber text-ink font-display font-bold text-[15px]",
              "shadow-[0_6px_20px_rgba(232,163,61,0.35)] flex items-center justify-center gap-2",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
            )}
          >
            <Phone size={16} strokeWidth={2} />
            Verify with phone number
          </button>
        </div>
      )}

      {hasPinHash && pinAttempts > 0 && !accountLocked && (
        <p className="text-center text-[12px] text-rust mt-1">
          {remaining} attempt{remaining === 1 ? "" : "s"} remaining before account lock
        </p>
      )}

      <div className="flex-1" />

      {hasPinHash && (
        <p className={cn("text-center text-[12px] text-slate mt-4")}>
          Forgot PIN?{" "}
          <button
            type="button"
            onClick={onForgotPin}
            className="text-amber-deep font-semibold focus-visible:outline-none"
          >
            Verify with phone number
          </button>
        </p>
      )}

      {credentialId && !accountLocked && hasPinHash && (
        <p className="text-center text-[12px] text-amber-deep font-semibold mt-3 cursor-pointer">
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
