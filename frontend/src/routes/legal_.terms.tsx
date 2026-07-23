import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/legal_/terms")({
  head: () => ({ meta: [{ title: "Terms of Service · AutoPayKe" }] }),
  component: TermsOfService,
});

const EFFECTIVE_DATE = "25 June 2026";
const COMPANY = "AutoPayKe Ltd";
const EMAIL = "legal@autopayke.com";
const APP_URL = "https://www.autopayke.com";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-[16px] font-bold text-ink mb-3">{title}</h2>
      <div className="space-y-3 text-[13px] text-charcoal leading-relaxed">{children}</div>
    </section>
  );
}

function TermsOfService() {
  return (
    <div className="min-h-screen bg-linen font-manrope">
      <div className="max-w-[680px] mx-auto px-5 pt-6 pb-16">
        {/* Back */}
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-[13px] text-slate mb-6 hover:text-ink transition-colors"
        >
          <ArrowLeft size={14} strokeWidth={2} />
          Back
        </Link>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-amber flex items-center justify-center text-ink font-bold text-sm font-display">A</div>
            <span className="font-display font-extrabold text-[16px] text-ink">AutoPayKe</span>
          </div>
          <h1 className="font-display font-black text-[28px] text-ink mb-2">Terms of Service</h1>
          <p className="text-[13px] text-slate">Effective date: {EFFECTIVE_DATE}</p>
        </div>

        <div className="prose prose-sm max-w-none">

          <Section title="1. Agreement">
            <p>
              These Terms of Service ("Terms") constitute a legally binding agreement between you ("User", "you") and
              {" "}{COMPANY} ("AutoPayKe", "we", "us", "our"), a company incorporated under the laws of Kenya, governing
              your access to and use of the AutoPayKe mobile application, web application, and related services
              (collectively, the "Service").
            </p>
            <p>
              <strong>By creating an account, verifying your phone number, or using any part of the Service, you
              acknowledge that you have read, understood, and agree to be bound by these Terms and our{" "}
              <Link to="/legal/privacy" className="text-amber-deep underline">Privacy Policy</Link>.</strong>
            </p>
            <p>
              If you do not agree to these Terms, you must not access or use the Service. We reserve the right
              to modify these Terms at any time. Continued use of the Service after changes constitutes acceptance
              of the revised Terms.
            </p>
          </Section>

          <Section title="2. Eligibility">
            <p>To use the Service you must:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Be at least 18 years of age (or the age of majority in your jurisdiction, whichever is higher);</li>
              <li>Have the legal capacity to enter into a binding contract;</li>
              <li>Be a resident or citizen of a country in which the Service is offered;</li>
              <li>Not be prohibited from receiving the Service under applicable law;</li>
              <li>Not have had a previous AutoPayKe account terminated for cause.</li>
            </ul>
            <p>
              By using the Service, you represent and warrant that you meet all of the foregoing eligibility
              requirements. We may require additional verification at any time.
            </p>
          </Section>

          <Section title="3. Account Registration and Security">
            <p>
              Access to the Service requires verification of a valid mobile phone number. You are solely responsible
              for all activity that occurs under your account, including any activity by authorised or unauthorised users.
            </p>
            <p>You agree to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Provide accurate, current, and complete information during registration;</li>
              <li>Maintain and promptly update your account information;</li>
              <li>Keep your access credentials (PIN, biometric data, OTP codes) strictly confidential;</li>
              <li>Notify us immediately at {EMAIL} of any unauthorised access to your account;</li>
              <li>Never share your one-time passwords (OTPs) with any person, including AutoPayKe staff.</li>
            </ul>
            <p>
              AutoPayKe will never ask you to share your OTP, PIN, or private keys via phone, email, or any other channel.
            </p>
          </Section>

          <Section title="4. The Service — Cross-Border Money Transfer">
            <p>
              AutoPayKe enables users to transfer value across borders using blockchain-based stablecoins (USDC/USDT on
              the Avalanche network) that settle to local mobile money rails (M-Pesa, MoMo, Wave, Orange Money) or bank
              accounts. The Service operates in Kenya, Ghana, Nigeria, Senegal, Côte d'Ivoire, Tanzania, and Uganda
              (coverage may vary).
            </p>
            <p>
              AutoPayKe is <strong>non-custodial</strong>: your funds are held in a smart-contract wallet deployed on the
              Avalanche blockchain. We do not have the ability to reverse, freeze, or recover funds from your on-chain
              wallet except as required by court order or applicable law. Protecting your account credentials is
              entirely your responsibility.
            </p>
          </Section>

          <Section title="5. Fees and Exchange Rates">
            <p>
              AutoPayKe charges a transaction fee displayed clearly before you confirm each transfer. We also apply
              a foreign-exchange spread on currency conversions. The applicable fees and rates are shown on the
              confirmation screen before any funds are moved.
            </p>
            <p>
              Exchange rates are locked at the time of transaction initiation and are valid for the duration shown
              on screen (typically 30 seconds). We are not liable for rate fluctuations after a transaction is submitted.
            </p>
          </Section>

          <Section title="6. Prohibited Activities">
            <p>You agree not to use the Service to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Violate any applicable law or regulation, including anti-money laundering (AML) or know-your-customer (KYC) requirements;</li>
              <li>Fund, support, or facilitate terrorism, money laundering, human trafficking, drug trafficking, or any other criminal activity;</li>
              <li>Process transactions on behalf of sanctioned individuals, entities, or jurisdictions listed by OFAC, UN, or the Kenya Sanctions List;</li>
              <li>Submit false, misleading, or fraudulent information;</li>
              <li>Circumvent or attempt to circumvent transaction limits, fraud controls, or security measures;</li>
              <li>Engage in market manipulation, wash trading, or artificially inflate transaction volumes;</li>
              <li>Use the Service for gambling or unlicensed financial services;</li>
              <li>Conduct transactions with persons or entities you know to be involved in fraudulent activity.</li>
            </ul>
            <p>
              We monitor transactions for suspicious activity and are obligated to report certain transactions to
              the Financial Reporting Centre (FRC) of Kenya and equivalent bodies in other jurisdictions.
            </p>
          </Section>

          <Section title="7. Transaction Finality and Refunds">
            <p>
              <strong>Blockchain transactions are irreversible.</strong> Once a transfer has been submitted to the
              Avalanche network and confirmed, it cannot be reversed or recalled by AutoPayKe.
            </p>
            <p>
              AutoPayKe will attempt to recover funds in limited circumstances (e.g., a settlement rail failure
              before final payout) but makes no guarantee of recovery. You are solely responsible for ensuring the
              accuracy of recipient details before confirming a transaction.
            </p>
            <p>
              If a settlement fails after funds have left your wallet, AutoPayKe will contact you within 48 hours
              with options for remedy (re-attempt, credit, or partial refund where technically feasible). Fees are
              non-refundable on completed transactions.
            </p>
          </Section>

          <Section title="8. Know Your Customer (KYC) and Anti-Money Laundering (AML)">
            <p>
              AutoPayKe is required to comply with the Proceeds of Crime and Anti-Money Laundering Act (POCAMLA) of
              Kenya and equivalent regulations in other operating jurisdictions. We may, at any time, require you to:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Provide government-issued identity documents;</li>
              <li>Submit proof of address or source of funds;</li>
              <li>Undergo enhanced due diligence for high-value or unusual transactions.</li>
            </ul>
            <p>
              Failure to provide requested documentation may result in suspension of your account, transaction holds,
              or reporting to relevant authorities.
            </p>
          </Section>

          <Section title="9. Intellectual Property">
            <p>
              The Service, including its software, design, trademarks, and content, is owned by {COMPANY} and
              protected by Kenyan and international intellectual property laws. You are granted a limited,
              non-exclusive, non-transferable licence to use the Service for personal, non-commercial purposes
              in accordance with these Terms.
            </p>
            <p>
              You may not copy, modify, distribute, sell, or reverse-engineer any part of the Service without our
              prior written consent.
            </p>
          </Section>

          <Section title="10. Limitation of Liability">
            <p>
              To the maximum extent permitted by applicable law, {COMPANY}, its directors, officers, employees,
              agents, and partners shall not be liable for:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Any indirect, incidental, special, consequential, or punitive damages;</li>
              <li>Loss of profits, revenue, data, or business opportunities;</li>
              <li>Losses arising from unauthorised access to your account where you failed to maintain the security of your credentials;</li>
              <li>Delays or failures caused by third-party payment rails (M-Pesa, MoMo, etc.) or blockchain network congestion;</li>
              <li>Exchange-rate fluctuations between transaction initiation and settlement.</li>
            </ul>
            <p>
              In no event shall our total aggregate liability to you exceed the greater of (a) the amount of fees
              you paid us in the 90 days preceding the claim or (b) KES 10,000.
            </p>
          </Section>

          <Section title="11. Indemnification">
            <p>
              You agree to indemnify, defend, and hold harmless {COMPANY} and its officers, directors, employees,
              and agents from and against any claims, liabilities, damages, losses, and expenses (including legal fees)
              arising out of or in any way connected with your access to or use of the Service, your violation of
              these Terms, or your violation of any third-party rights.
            </p>
          </Section>

          <Section title="12. Suspension and Termination">
            <p>
              We may suspend or terminate your account at any time, with or without notice, if we believe you have
              violated these Terms, engaged in fraudulent or illegal activity, or pose a risk to the security of
              the Service or other users.
            </p>
            <p>
              You may close your account at any time by contacting us at {EMAIL}. Closing your account does not
              affect your obligation to settle any outstanding transactions.
            </p>
          </Section>

          <Section title="13. Governing Law and Dispute Resolution">
            <p>
              These Terms are governed by the laws of the Republic of Kenya. Any dispute arising under or in
              connection with these Terms shall be resolved by binding arbitration administered by the Nairobi
              Centre for International Arbitration (NCIA) under its arbitration rules, with arbitration conducted
              in Nairobi, Kenya in the English language.
            </p>
            <p>
              Nothing in this section prevents either party from seeking urgent injunctive or declaratory relief
              from a court of competent jurisdiction.
            </p>
          </Section>

          <Section title="14. Entire Agreement">
            <p>
              These Terms, together with the <Link to="/legal/privacy" className="text-amber-deep underline">Privacy Policy</Link>,
              constitute the entire agreement between you and {COMPANY} with respect to the Service and supersede
              all prior or contemporaneous agreements.
            </p>
          </Section>

          <Section title="15. Contact Us">
            <p>If you have any questions about these Terms, please contact us:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Email: <a href={`mailto:${EMAIL}`} className="text-amber-deep underline">{EMAIL}</a></li>
              <li>Website: <a href={APP_URL} className="text-amber-deep underline">{APP_URL}</a></li>
            </ul>
          </Section>

        </div>

        {/* Footer links */}
        <div className="mt-8 pt-6 border-t border-ink/10 flex flex-wrap gap-4 text-[12px] text-slate">
          <Link to="/legal/privacy" className="hover:text-amber-deep transition-colors">Privacy Policy</Link>
          <Link to="/" className="hover:text-amber-deep transition-colors">Back to AutoPayKe</Link>
        </div>
      </div>
    </div>
  );
}
