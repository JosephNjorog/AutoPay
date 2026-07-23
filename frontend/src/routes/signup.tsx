import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, ChevronLeft, ShieldCheck, CheckSquare, Square, BadgePercent } from "lucide-react";
import { toast } from "sonner";
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
import { useSignupStore } from "@/stores/signupStore";
import { TERMS_VERSION } from "@/lib/constants";
import { SUPPORTED_COUNTRIES } from "@/lib/constants";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "AutoPayKe - Sign up" }] }),
  component: SignupStep1,
});

const SignupStep1Schema = z
  .object({
    country_code: z.string().min(2).max(2),
    phone: z
      .string()
      .min(9, "Phone number too short")
      .max(10, "Phone number too long")
      .regex(/^[0-9]+$/, "Digits only"),
    email: z.string().email("Enter a valid email address"),
  })
  .refine(
    (data) => {
      const country = SUPPORTED_COUNTRIES.find((c) => c.code === data.country_code);
      if (!country) return true;
      // strip leading zero to accept both local (0738...) and international (738...) formats
      return data.phone.replace(/^0/, "").length === country.phoneLength;
    },
    { message: "Phone number length is incorrect for the selected country", path: ["phone"] }
  );

type FormValues = z.infer<typeof SignupStep1Schema>;

function SignupStep1() {
  const navigate = useNavigate();
  const { setPhone, setTermsAccepted } = useSignupStore();
  const [termsChecked, setTermsChecked] = useState(false);

  useEffect(() => {
    document.title = "AutoPayKe - Sign up";
  }, []);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(SignupStep1Schema),
    defaultValues: { country_code: "KE", phone: "", email: "" },
  });

  const selectedCode = watch("country_code");
  const selectedCountry = SUPPORTED_COUNTRIES.find((c) => c.code === selectedCode);

  const onSubmit = async (values: FormValues) => {
    const normalised = values.phone.replace(/^0/, "");
    const fullPhone = `${selectedCountry?.dial ?? ""}${normalised}`;
    try {
      await apiClient.post<{ message: string }>(
        "/api/auth/send-otp",
        { phone: fullPhone, email: values.email, channel: "email" }
      );
      setPhone(values.country_code, fullPhone, values.email);
      setTermsAccepted(termsChecked);
      void navigate({ to: "/signup/verify" });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 409) {
          setError("phone", { message: "This number is already registered." });
        } else if (err.code === 422) {
          setError("phone", { message: "Invalid phone number for the selected country." });
        } else if (err.code === 429) {
          toast.error("Too many attempts. Please wait before trying again.");
        } else {
          toast.error("Something went wrong. Please try again.");
        }
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    }
  };

  return (
    <div className="min-h-screen bg-linen relative font-manrope">
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-transparent via-transparent to-paper/40" />

      <div className="relative z-10 px-5 pt-6 pb-8 max-w-97.5 mx-auto min-h-screen flex flex-col">
        <button
          type="button"
          onClick={() => navigate({ to: "/" })}
          className="w-9 h-9 rounded-xl bg-paper/70 border border-paper flex items-center justify-center cursor-pointer mb-6 self-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
          aria-label="Go back"
        >
          <ChevronLeft size={16} strokeWidth={2} />
        </button>

        <ProgressBar totalSteps={5} currentStep={1} className="mb-7" />

        <p className="text-[11px] font-semibold tracking-widest text-slate uppercase mb-1.5">
          STEP 1 OF 5
        </p>
        <h1 className="font-display font-extrabold text-[28px] leading-[1.15] text-ink mb-2">
          What is your number?
        </h1>
        <p className="text-[13px] text-slate leading-relaxed mb-6">
          It becomes your global wallet ID. No account number, no email login required.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col flex-1">
          {/* Country */}
          <div className="bg-paper/85 backdrop-blur-sm border border-paper rounded-2xl px-4 py-3.5 mb-2.5">
            <span className="text-[10px] font-semibold tracking-widest text-slate uppercase block mb-1">
              COUNTRY
            </span>
            <Controller
              name="country_code"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="bg-transparent border-none shadow-none p-0 h-auto focus:ring-0 focus:ring-offset-0 text-[15px] font-semibold text-ink">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_COUNTRIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        <span className="flex items-center gap-2">
                          <span className="inline-flex items-center justify-center w-6 h-4 rounded-sm bg-ink/10 text-[9px] font-bold text-ink/60 tracking-wider">
                            {c.code}
                          </span>
                          {c.name} ({c.dial})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {/* Phone */}
          <div
            className={cn(
              "bg-paper/85 backdrop-blur-sm border rounded-2xl px-4 py-3.5 mb-2.5 flex items-center gap-2",
              errors.phone ? "border-rust" : "border-paper"
            )}
          >
            <span className="text-[16px] font-bold text-ink shrink-0 select-none">
              {selectedCountry?.dial ?? "+254"}
            </span>
            <input
              {...register("phone")}
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="706848263"
              autoComplete="tel-national"
              className="bg-transparent border-none outline-none text-[16px] font-semibold text-ink placeholder-ink/30 flex-1 w-full"
            />
          </div>
          {errors.phone && (
            <p className="text-[12px] text-rust mb-2 px-1">
              {errors.phone.message}
              {errors.phone.message?.includes("already registered") && (
                <>
                  {" "}
                  <Link to="/login" className="underline font-semibold">
                    Sign in instead.
                  </Link>
                </>
              )}
            </p>
          )}

          {/* Email */}
          <div
            className={cn(
              "bg-paper/85 backdrop-blur-sm border rounded-2xl px-4 py-3.5 mb-3",
              errors.email ? "border-rust" : "border-paper"
            )}
          >
            <span className="text-[10px] font-semibold tracking-widest text-slate uppercase block mb-1">
              EMAIL
            </span>
            <input
              {...register("email")}
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              className="bg-transparent border-none outline-none text-[14px] font-medium text-ink placeholder-ink/30 w-full"
            />
            <p className="text-[11px] text-slate mt-1.5 leading-relaxed">
              We will send your 6-digit code here. This is not your login credential.
            </p>
          </div>
          {errors.email && (
            <p className="text-[12px] text-rust mb-2 px-1">{errors.email.message}</p>
          )}

          <TrustBadge
            title="No seed phrase. Ever."
            body="Your wallet is derived from your number. Recover by re-verifying your SIM. Nothing to write down."
            icon={<ShieldCheck size={18} strokeWidth={2.5} className="text-forest-light" />}
          />

          <TrustBadge
            className="mt-2.5"
            variant="orange"
            title="No hidden fees, ever"
            body="Every send shows the real exchange rate and fee upfront — before you confirm, not after."
            icon={<BadgePercent size={18} strokeWidth={2.5} className="text-amber-deep" />}
          />

          <div className="flex-1" />

          {/* T&C checkbox */}
          <button
            type="button"
            onClick={() => setTermsChecked((v) => !v)}
            className="flex items-start gap-3 text-left mb-4 focus-visible:outline-none group"
            aria-checked={termsChecked}
            role="checkbox"
          >
            <span className="mt-0.5 shrink-0 text-amber-deep">
              {termsChecked
                ? <CheckSquare size={18} strokeWidth={2} />
                : <Square size={18} strokeWidth={2} className="text-ink/30 group-hover:text-amber-deep transition-colors" />}
            </span>
            <span className="text-[12px] text-slate leading-relaxed">
              I have read and agree to the{" "}
              <Link
                to="/legal/terms"
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-amber-deep underline font-semibold"
              >
                Terms of Service
              </Link>
              {" "}and{" "}
              <Link
                to="/legal/privacy"
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-amber-deep underline font-semibold"
              >
                Privacy Policy
              </Link>
              . I confirm I am 18 years of age or older.
            </span>
          </button>

          <button
            type="submit"
            disabled={isSubmitting || !termsChecked}
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
                Sending code
              </>
            ) : (
              <>
                Send verification code
                <ArrowRight size={16} strokeWidth={2} />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
