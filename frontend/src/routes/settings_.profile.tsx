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
    <div className="min-h-screen bg-linen relative font-manrope">
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-transparent via-transparent to-paper/40" />

      <div className="relative z-10 px-5 pt-6 pb-10 max-w-97.5 mx-auto min-h-screen flex flex-col">
        {/* Back */}
        <button
          type="button"
          onClick={() => navigate({ to: "/dashboard" })}
          className="w-9 h-9 rounded-xl bg-paper/70 border border-paper flex items-center justify-center cursor-pointer mb-6 self-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
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
            <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-amber flex items-center justify-center border-2 border-paper shadow-md group-active:scale-90 transition-transform">
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
                className="font-display font-bold text-[20px] text-ink bg-transparent border-b-2 border-amber outline-none text-center min-w-0 w-36"
              />
              <button type="button" onClick={handleSaveName} className="text-forest-light focus-visible:outline-none">
                <Check size={18} strokeWidth={2.5} />
              </button>
              <button type="button" onClick={() => setEditingName(false)} className="text-ink/30 focus-visible:outline-none">
                <X size={18} strokeWidth={2} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className="flex items-center gap-1.5 group focus-visible:outline-none"
            >
              <span className="font-display font-bold text-[22px] text-ink">{displayedName}</span>
              <Edit2 size={14} strokeWidth={2} className="text-ink/30 group-hover:text-amber-deep transition-colors" />
            </button>
          )}

          <p className="text-[13px] text-slate mt-0.5">{session.phone}</p>
        </div>

        {/* Account info */}
        <div className="mb-4">
          <p className="text-[10px] font-semibold tracking-widest text-slate uppercase mb-2 px-1">Account</p>
          <div className="bg-paper/80 backdrop-blur-sm border border-paper rounded-2xl overflow-hidden divide-y divide-ink/5">
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
          <p className="text-[10px] font-semibold tracking-widest text-slate uppercase mb-2 px-1">Security</p>
          <div className="bg-paper/80 backdrop-blur-sm border border-paper rounded-2xl overflow-hidden divide-y divide-ink/5">
            <ActionRow
              icon={<Shield size={16} strokeWidth={1.5} className="text-amber-deep" />}
              label={session.pin_hash ? "Change PIN" : "Set up PIN"}
              onPress={() => navigate({ to: "/settings/pin" })}
            />
            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className="w-8 h-8 rounded-xl bg-amber/12 flex items-center justify-center shrink-0">
                <Fingerprint size={16} strokeWidth={1.5} className="text-amber-deep" />
              </div>
              <div className="flex-1">
                <p className="text-[14px] font-semibold text-ink">Biometric unlock</p>
                <p className="text-[11px] text-slate">
                  {biometricsEnabled ? "Fingerprint / Face ID enabled" : "Tap to enable fingerprint or Face ID"}
                </p>
              </div>
              {biometricsLoading ? (
                <div className="w-5 h-5 border-2 border-amber/50 border-t-amber rounded-full animate-spin" />
              ) : (
                <button
                  type="button"
                  onClick={handleToggleBiometrics}
                  className={cn(
                    "relative w-11 h-6 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-1",
                    biometricsEnabled ? "bg-amber" : "bg-ink/15"
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
          <div className="bg-paper/80 border border-paper rounded-2xl p-4 mb-3">
            <p className="text-[14px] font-semibold text-ink mb-1">Log out of AutoPayKe?</p>
            <p className="text-[12px] text-slate leading-relaxed mb-3">
              You will need to verify your phone number to log back in.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowLogout(false)}
                className="flex-1 py-2.5 rounded-xl border border-ink/10 text-[13px] text-slate font-semibold focus-visible:outline-none"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="flex-1 py-2.5 rounded-xl bg-rust/10 border border-rust/20 text-[13px] text-rust font-semibold focus-visible:outline-none"
              >
                Log out
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowLogout(true)}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-rust/20 bg-rust/8 text-rust text-[14px] font-semibold focus-visible:outline-none"
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
      <span className="text-[13px] text-slate">{label}</span>
      <span className="text-[13px] font-medium text-ink">{value}</span>
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
      className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-ink/3 transition-colors focus-visible:outline-none"
    >
      <div className="w-8 h-8 rounded-xl bg-amber/12 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <span className="flex-1 text-[14px] font-semibold text-ink text-left">{label}</span>
      <ChevronRight size={16} strokeWidth={1.5} className="text-ink/30" />
    </button>
  );
}
