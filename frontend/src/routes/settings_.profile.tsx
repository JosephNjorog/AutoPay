import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Shield,
  Fingerprint,
  LogOut,
  Edit2,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { startRegistration } from "@simplewebauthn/browser";
import { Avatar } from "@/components/Avatar";
import { AvatarPicker } from "@/components/AvatarPicker";
import { useSessionStore } from "@/stores/sessionStore";
import { useProfileStore, type AnimalKey } from "@/stores/profileStore";
import { useWalletStore } from "@/stores/walletStore";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings_/profile")({
  beforeLoad: () => {
    const s = useSessionStore.getState();
    if (!s.isAuthenticated() || !s.is_unlocked) {
      throw redirect({ to: "/login", replace: true });
    }
  },
  head: () => ({ meta: [{ title: "AutoPayKe - Profile" }] }),
  component: ProfileSettings,
});

function ProfileSettings() {
  const navigate = useNavigate();
  const session = useSessionStore();
  const profile = useProfileStore();
  const { clearBalance } = useWalletStore();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(profile.displayName ?? session.getFirstName());
  const [biometricsEnabled, setBiometricsEnabled] = useState(
    () => !!localStorage.getItem("autopayke_credential_id")
  );
  const [biometricsLoading, setBiometricsLoading] = useState(false);
  const [showLogout, setShowLogout] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingName) nameRef.current?.focus();
  }, [editingName]);

  const displayedName =
    profile.displayName ||
    session.getFirstName() ||
    session.phone ||
    "Profile";

  const fallback =
    (profile.displayName ?? session.display_name ?? session.phone ?? "A")[0]?.toUpperCase() ?? "A";

  const handleSaveName = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      toast.error("Name cannot be empty.");
      return;
    }
    profile.setDisplayName(trimmed);
    setEditingName(false);
    toast.success("Name updated.");
  };

  const handleToggleBiometrics = async () => {
    if (biometricsEnabled) {
      localStorage.removeItem("autopayke_credential_id");
      setBiometricsEnabled(false);
      toast("Biometrics disabled.");
      return;
    }

    setBiometricsLoading(true);
    try {
      const userId = session.user_id ?? "user";
      const phone = session.phone ?? "user";
      const rawChallenge = crypto.getRandomValues(new Uint8Array(32));
      const challenge = btoa(String.fromCharCode(...rawChallenge))
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
      const userIdB64 = btoa(userId).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

      const credential = await startRegistration({
        optionsJSON: {
          challenge,
          rp: { name: "AutoPayKe", id: window.location.hostname },
          user: { id: userIdB64, name: phone, displayName: displayedName },
          pubKeyCredParams: [
            { type: "public-key", alg: -7 },
            { type: "public-key", alg: -257 },
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "required",
            residentKey: "preferred",
          },
          timeout: 60000,
          attestation: "none",
        },
      });

      localStorage.setItem("autopayke_credential_id", credential.id);
      setBiometricsEnabled(true);
      toast.success("Biometrics enabled! You can now unlock with your fingerprint.");
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        toast.error("Biometric setup was cancelled.");
      } else if (err instanceof DOMException && err.name === "InvalidStateError") {
        toast.error("This device already has a passkey registered.");
        setBiometricsEnabled(true);
      } else {
        toast.error("Biometrics not supported on this device.");
      }
    } finally {
      setBiometricsLoading(false);
    }
  };

  const handleLogout = () => {
    session.clearSession();
    clearBalance();
    localStorage.removeItem("autopayke_credential_id");
    void navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen bg-auth-gradient relative">
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-transparent via-transparent to-white/30" />

      <div className="relative z-10 px-5 pt-6 pb-10 max-w-97.5 mx-auto min-h-screen flex flex-col">
        {/* Back */}
        <button
          type="button"
          onClick={() => navigate({ to: "/dashboard" })}
          className="w-9 h-9 rounded-xl bg-white/50 border border-white/60 flex items-center justify-center cursor-pointer mb-6 self-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
          aria-label="Go back"
        >
          <ChevronLeft size={16} strokeWidth={2} />
        </button>

        {/* Avatar + name */}
        <div className="flex flex-col items-center mb-8">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="relative mb-4 group focus-visible:outline-none"
            aria-label="Change avatar"
          >
            <Avatar
              avatarKey={profile.avatarKey}
              avatarDataUrl={profile.avatarDataUrl}
              fallbackLetter={fallback}
              size="xl"
            />
            <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-orange flex items-center justify-center border-2 border-white shadow-md group-active:scale-90 transition-transform">
              <Edit2 size={13} strokeWidth={2.5} className="text-white" />
            </div>
          </button>

          {/* Editable name */}
          {editingName ? (
            <div className="flex items-center gap-2 mt-1">
              <input
                ref={nameRef}
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveName();
                  if (e.key === "Escape") setEditingName(false);
                }}
                maxLength={32}
                className="font-display font-bold text-[20px] text-navy bg-transparent border-b-2 border-orange outline-none text-center min-w-0 w-36"
              />
              <button type="button" onClick={handleSaveName} className="text-success focus-visible:outline-none">
                <Check size={18} strokeWidth={2.5} />
              </button>
              <button type="button" onClick={() => setEditingName(false)} className="text-black/30 focus-visible:outline-none">
                <X size={18} strokeWidth={2} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className="flex items-center gap-1.5 group focus-visible:outline-none"
            >
              <span className="font-display font-bold text-[22px] text-navy">{displayedName}</span>
              <Edit2 size={14} strokeWidth={2} className="text-black/30 group-hover:text-orange transition-colors" />
            </button>
          )}

          <p className="text-[13px] text-black/40 mt-0.5">{session.phone}</p>
        </div>

        {/* Account info */}
        <div className="mb-4">
          <p className="text-[10px] font-semibold tracking-widest text-black/40 uppercase mb-2 px-1">Account</p>
          <div className="bg-white/80 backdrop-blur-sm border border-white/90 rounded-2xl overflow-hidden divide-y divide-black/5">
            <InfoRow label="Phone" value={session.phone ?? "—"} />
            <InfoRow label="Email" value={session.display_name?.includes("@") ? session.display_name : "—"} />
            <InfoRow label="Wallet" value={
              session.wallet_address
                ? `${session.wallet_address.slice(0, 8)}…${session.wallet_address.slice(-4)}`
                : "Not assigned"
            } />
          </div>
        </div>

        {/* Security */}
        <div className="mb-4">
          <p className="text-[10px] font-semibold tracking-widest text-black/40 uppercase mb-2 px-1">Security</p>
          <div className="bg-white/80 backdrop-blur-sm border border-white/90 rounded-2xl overflow-hidden divide-y divide-black/5">
            <ActionRow
              icon={<Shield size={16} strokeWidth={1.5} className="text-orange" />}
              label={session.pin_hash ? "Change PIN" : "Set up PIN"}
              onPress={() => navigate({ to: "/settings/pin" })}
            />
            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className="w-8 h-8 rounded-xl bg-orange/10 flex items-center justify-center shrink-0">
                <Fingerprint size={16} strokeWidth={1.5} className="text-orange" />
              </div>
              <div className="flex-1">
                <p className="text-[14px] font-semibold text-navy">Biometric unlock</p>
                <p className="text-[11px] text-black/40">
                  {biometricsEnabled ? "Fingerprint / Face ID enabled" : "Tap to enable fingerprint or Face ID"}
                </p>
              </div>
              {biometricsLoading ? (
                <div className="w-5 h-5 border-2 border-orange/30 border-t-orange rounded-full animate-spin" />
              ) : (
                <button
                  type="button"
                  onClick={handleToggleBiometrics}
                  className={cn(
                    "relative w-11 h-6 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-1",
                    biometricsEnabled ? "bg-orange" : "bg-black/15"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform",
                      biometricsEnabled ? "translate-x-5.5" : "translate-x-0.5"
                    )}
                  />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1" />

        {/* Log out */}
        {showLogout ? (
          <div className="bg-white/80 border border-white/90 rounded-2xl p-4 mb-3">
            <p className="text-[14px] font-semibold text-navy mb-1">Log out of AutoPayKe?</p>
            <p className="text-[12px] text-black/50 leading-relaxed mb-3">
              You will need to verify your phone number to log back in.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowLogout(false)}
                className="flex-1 py-2.5 rounded-xl border border-black/10 text-[13px] text-black/50 font-semibold focus-visible:outline-none"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="flex-1 py-2.5 rounded-xl bg-danger/10 border border-danger/20 text-[13px] text-danger font-semibold focus-visible:outline-none"
              >
                Log out
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowLogout(true)}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-danger/20 bg-danger/8 text-danger text-[14px] font-semibold focus-visible:outline-none"
          >
            <LogOut size={16} strokeWidth={2} />
            Log out
          </button>
        )}
      </div>

      {pickerOpen && (
        <AvatarPicker
          currentKey={profile.avatarKey}
          currentDataUrl={profile.avatarDataUrl}
          onSelectAnimal={(key: AnimalKey) => profile.setAvatarAnimal(key)}
          onSelectPhoto={(dataUrl: string) => profile.setAvatarPhoto(dataUrl)}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5">
      <span className="text-[13px] text-black/50">{label}</span>
      <span className="text-[13px] font-medium text-navy">{value}</span>
    </div>
  );
}

function ActionRow({
  icon,
  label,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-black/3 transition-colors focus-visible:outline-none"
    >
      <div className="w-8 h-8 rounded-xl bg-orange/10 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <span className="flex-1 text-[14px] font-semibold text-navy text-left">{label}</span>
      <ChevronRight size={16} strokeWidth={1.5} className="text-black/30" />
    </button>
  );
}
