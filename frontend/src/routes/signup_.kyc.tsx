import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, ChevronLeft, IdCard, AlertCircle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProgressBar } from "@/components/ProgressBar";
import { TrustBadge } from "@/components/TrustBadge";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { apiClient, ApiError } from "@/lib/api";
import { useSessionStore } from "@/stores/sessionStore";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/signup_/kyc")({
  head: () => ({ meta: [{ title: "AutoPayKe - Verify your identity" }] }),
  component: SignupKyc,
});

const ID_TYPES = [
  { value: "national_id", label: "National ID" },
  { value: "passport", label: "Passport" },
  { value: "drivers_license", label: "Driver's license" },
] as const;

const KycSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full legal name"),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
    .refine((v) => new Date(v).getTime() < Date.now(), "Date of birth can't be in the future"),
  idType: z.enum(["national_id", "passport", "drivers_license"]),
  idNumber: z.string().trim().min(4, "Enter your ID number"),
});

type FormValues = z.infer<typeof KycSchema>;

type KycSubmitResponse = { kycStatus: "verified" | "rejected"; rejectionReason: string | null };

function SignupKyc() {
  const navigate = useNavigate();
  const { isAuthenticated } = useSessionStore();
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      void navigate({ to: "/signup" });
    }
  }, []);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(KycSchema),
    defaultValues: { fullName: "", dateOfBirth: "", idType: "national_id", idNumber: "" },
  });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      const res = await apiClient.post<KycSubmitResponse>("/api/kyc/submit", values);
      if (res.kycStatus === "verified") {
        void navigate({ to: "/signup/pin" });
      } else {
        // Rejected — show the specific reason and let the user fix just
        // the flagged field, rather than restarting the whole flow.
        setServerError(res.rejectionReason ?? "We couldn't verify those details. Please check and try again.");
      }
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-linen relative font-manrope">
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-transparent via-transparent to-paper/40" />

      <div className="relative z-10 px-5 pt-6 pb-8 max-w-97.5 mx-auto min-h-screen flex flex-col">
        <button
          type="button"
          onClick={() => navigate({ to: "/signup/verify" })}
          className="w-9 h-9 rounded-xl bg-paper/70 border border-paper flex items-center justify-center cursor-pointer mb-6 self-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
          aria-label="Go back"
        >
          <ChevronLeft size={16} strokeWidth={2} />
        </button>

        <ProgressBar totalSteps={5} currentStep={3} className="mb-7" />

        <p className="text-[11px] font-semibold tracking-widest text-slate uppercase mb-1.5">
          STEP 3 OF 5
        </p>
        <h1 className="font-display font-extrabold text-[28px] leading-[1.15] text-ink mb-2">
          Verify your identity
        </h1>
        <p className="text-[13px] text-slate leading-relaxed mb-6">
          Required to send and receive money. We use these details to confirm who you are.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col flex-1">
          <div
            className={cn(
              "bg-paper/85 backdrop-blur-sm border rounded-2xl px-4 py-3.5 mb-2.5",
              errors.fullName ? "border-rust" : "border-paper"
            )}
          >
            <span className="text-[10px] font-semibold tracking-widest text-slate uppercase block mb-1">
              FULL LEGAL NAME
            </span>
            <input
              {...register("fullName")}
              type="text"
              placeholder="Jane Wanjiru Njoroge"
              autoComplete="name"
              className="bg-transparent border-none outline-none text-[15px] font-semibold text-ink placeholder-ink/30 w-full"
            />
          </div>
          {errors.fullName && (
            <p className="text-[12px] text-rust mb-2 px-1">{errors.fullName.message}</p>
          )}

          <div
            className={cn(
              "bg-paper/85 backdrop-blur-sm border rounded-2xl px-4 py-3.5 mb-2.5",
              errors.dateOfBirth ? "border-rust" : "border-paper"
            )}
          >
            <span className="text-[10px] font-semibold tracking-widest text-slate uppercase block mb-1">
              DATE OF BIRTH
            </span>
            <input
              {...register("dateOfBirth")}
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              className="bg-transparent border-none outline-none text-[15px] font-semibold text-ink w-full"
            />
          </div>
          {errors.dateOfBirth && (
            <p className="text-[12px] text-rust mb-2 px-1">{errors.dateOfBirth.message}</p>
          )}

          <div className="bg-paper/85 backdrop-blur-sm border border-paper rounded-2xl px-4 py-3.5 mb-2.5">
            <span className="text-[10px] font-semibold tracking-widest text-slate uppercase block mb-1">
              ID TYPE
            </span>
            <Controller
              name="idType"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="bg-transparent border-none shadow-none p-0 h-auto focus:ring-0 focus:ring-offset-0 text-[15px] font-semibold text-ink">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ID_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div
            className={cn(
              "bg-paper/85 backdrop-blur-sm border rounded-2xl px-4 py-3.5 mb-3",
              errors.idNumber ? "border-rust" : "border-paper"
            )}
          >
            <span className="text-[10px] font-semibold tracking-widest text-slate uppercase block mb-1">
              ID NUMBER
            </span>
            <input
              {...register("idNumber")}
              type="text"
              placeholder="12345678"
              autoComplete="off"
              className="bg-transparent border-none outline-none text-[15px] font-semibold text-ink placeholder-ink/30 w-full"
            />
          </div>
          {errors.idNumber && (
            <p className="text-[12px] text-rust mb-2 px-1">{errors.idNumber.message}</p>
          )}

          {serverError && (
            <div className="flex items-start gap-2 bg-rust/10 border border-rust/20 rounded-2xl px-4 py-3 mb-3">
              <AlertCircle size={16} strokeWidth={2} className="text-rust shrink-0 mt-0.5" />
              <p className="text-[12px] text-rust leading-relaxed">{serverError}</p>
            </div>
          )}

          <TrustBadge
            title="Your details stay private"
            body="Used only to confirm your identity for compliance. Never shared or sold."
            icon={<IdCard size={18} strokeWidth={2.5} className="text-forest-light" />}
          />

          <div className="flex-1" />

          <button
            type="submit"
            disabled={isSubmitting}
            className={cn(
              "w-full py-4 rounded-2xl bg-amber text-ink font-display font-bold text-[15px]",
              "shadow-[0_6px_20px_rgba(232,163,61,0.35)] flex items-center justify-center gap-2",
              "disabled:opacity-60 disabled:cursor-not-allowed",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
            )}
          >
            {isSubmitting ? (
              <>
                <LoadingSpinner size={16} color="orange" />
                Verifying
              </>
            ) : (
              <>
                Continue
                <ArrowRight size={16} strokeWidth={2} />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
