import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/legal_/privacy")({
  head: () => ({ meta: [{ title: "Privacy Policy · AutoPayKe" }] }),
  component: PrivacyPolicy,
});

const EFFECTIVE_DATE = "25 June 2026";
const COMPANY = "AutoPayKe Ltd";
const EMAIL = "privacy@autopayke.com";
const APP_URL = "https://autopayke.com";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-[16px] font-bold text-navy mb-3">{title}</h2>
      <div className="space-y-3 text-[13px] text-gray-600 leading-relaxed">{children}</div>
    </section>
  );
}

function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-[#FDF8F2]">
      <div className="max-w-[680px] mx-auto px-5 pt-6 pb-16">
        {/* Back */}
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-[13px] text-gray-500 mb-6 hover:text-navy transition-colors"
        >
          <ArrowLeft size={14} strokeWidth={2} />
          Back
        </Link>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-orange-gradient flex items-center justify-center text-white font-bold text-sm font-display">A</div>
            <span className="font-display font-extrabold text-[16px] text-navy">AutoPayKe</span>
          </div>
          <h1 className="font-display font-black text-[28px] text-navy mb-2">Privacy Policy</h1>
          <p className="text-[13px] text-gray-400">Effective date: {EFFECTIVE_DATE}</p>
        </div>

        <div className="prose prose-sm max-w-none">

          <Section title="1. Introduction">
            <p>
              {COMPANY} ("AutoPayKe", "we", "us", "our") is committed to protecting the privacy of our users.
              This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you
              use the AutoPayKe mobile application, web application, and related services (the "Service").
            </p>
            <p>
              This policy complies with the <strong>Kenya Data Protection Act 2019</strong> (DPA), the EU General Data
              Protection Regulation (GDPR) where applicable, and other applicable privacy laws.
            </p>
            <p>
              By using the Service, you consent to the collection and use of information as described in this
              Privacy Policy. If you do not agree, please do not use the Service.
            </p>
          </Section>

          <Section title="2. Data We Collect">
            <p><strong>2.1 Information you provide directly:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Phone number</strong> — required for account creation and transaction routing;</li>
              <li><strong>Email address</strong> — optional, used for account recovery and communications;</li>
              <li><strong>Identity documents</strong> — collected for KYC/AML compliance when required;</li>
              <li><strong>Transaction details</strong> — recipient phone, amounts, notes, and purpose of transfer.</li>
            </ul>

            <p><strong>2.2 Information collected automatically:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>IP address</strong> — captured at account creation, login, and transaction submission;</li>
              <li><strong>Device information</strong> — browser type, OS, device model, and screen resolution;</li>
              <li><strong>Session data</strong> — login times, session duration, and navigation within the app;</li>
              <li><strong>On-chain data</strong> — all transactions are recorded publicly on the Avalanche blockchain, including wallet addresses and amounts (but not personal identity).</li>
            </ul>

            <p><strong>2.3 Information from third parties:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Transaction status and confirmation data from mobile money operators (Safaricom M-Pesa, MTN MoMo, etc.);</li>
              <li>KYC/identity verification results from regulated compliance partners.</li>
            </ul>
          </Section>

          <Section title="3. How We Use Your Data">
            <p>We use your personal data to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Provide the Service</strong> — process transactions, verify your identity, and maintain your account;</li>
              <li><strong>Comply with legal obligations</strong> — AML/KYC reporting, tax requirements, and responses to lawful regulatory requests;</li>
              <li><strong>Fraud prevention and security</strong> — detect, investigate, and prevent fraudulent transactions and account takeovers;</li>
              <li><strong>Communications</strong> — send transaction confirmations, OTPs, security alerts, and service updates;</li>
              <li><strong>Customer support</strong> — respond to your inquiries and resolve disputes;</li>
              <li><strong>Service improvement</strong> — analyse usage patterns (using anonymised or aggregated data) to improve the Service;</li>
              <li><strong>Legal proceedings</strong> — establish, exercise, or defend legal claims.</li>
            </ul>
            <p>
              We do <strong>not</strong> sell your personal data to third parties for marketing purposes.
            </p>
          </Section>

          <Section title="4. Legal Basis for Processing (GDPR)">
            <p>For users in the European Economic Area or where GDPR applies, we process your data on the following legal bases:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Contract performance</strong> — processing necessary to provide the Service you requested;</li>
              <li><strong>Legal obligation</strong> — compliance with AML, KYC, and reporting requirements;</li>
              <li><strong>Legitimate interests</strong> — fraud prevention, security, and service improvement;</li>
              <li><strong>Consent</strong> — where explicitly requested (e.g., marketing communications).</li>
            </ul>
          </Section>

          <Section title="5. Data Sharing and Third Parties">
            <p>We share your data only as necessary to provide the Service:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Paystack</strong> — payment gateway for local currency funding and settlement;</li>
              <li><strong>Safaricom / M-Pesa, MTN MoMo, Wave, Orange Money</strong> — for mobile money settlement of transfers;</li>
              <li><strong>Twilio</strong> — SMS delivery of OTPs;</li>
              <li><strong>Resend</strong> — email delivery of OTPs and notifications;</li>
              <li><strong>Neon / PostgreSQL</strong> — encrypted database hosting;</li>
              <li><strong>Avalanche Foundation</strong> — the public blockchain on which wallet transactions are recorded;</li>
              <li><strong>Regulatory authorities</strong> — the Financial Reporting Centre (FRC) of Kenya, Central Bank of Kenya, and equivalent bodies where required by law.</li>
            </ul>
            <p>
              All third-party processors are bound by data processing agreements and are required to maintain
              appropriate security standards.
            </p>
          </Section>

          <Section title="6. Data Retention">
            <p>We retain your personal data for as long as your account is active and for a period thereafter as required by law:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Account data</strong> — retained for 7 years after account closure (AML record-keeping requirements);</li>
              <li><strong>Transaction records</strong> — retained for 7 years (POCAMLA requirement);</li>
              <li><strong>Session and access logs</strong> — retained for 12 months;</li>
              <li><strong>OTP / authentication logs</strong> — retained for 90 days.</li>
            </ul>
            <p>
              Data retained solely for legal compliance purposes is restricted to authorised personnel and not
              used for any other purpose.
            </p>
          </Section>

          <Section title="7. Security">
            <p>
              We implement technical and organisational security measures appropriate to the risks involved,
              including:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>End-to-end encryption of data in transit (TLS 1.3);</li>
              <li>Encryption of sensitive fields (phone numbers, wallet keys) at rest;</li>
              <li>Phone number hashing before any on-chain registration;</li>
              <li>Multi-factor authentication (OTP + PIN) for account access;</li>
              <li>Access controls limiting staff access to production data;</li>
              <li>Regular security reviews and penetration testing.</li>
            </ul>
            <p>
              No method of transmission over the Internet is 100% secure. While we strive to protect your data,
              we cannot guarantee its absolute security.
            </p>
          </Section>

          <Section title="8. Your Rights">
            <p>Under the Kenya Data Protection Act 2019 and applicable law, you have the right to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Access</strong> — request a copy of the personal data we hold about you;</li>
              <li><strong>Rectification</strong> — request correction of inaccurate or incomplete data;</li>
              <li><strong>Erasure</strong> — request deletion of your data (subject to legal retention obligations);</li>
              <li><strong>Restriction</strong> — request that we restrict processing of your data in certain circumstances;</li>
              <li><strong>Portability</strong> — receive your data in a structured, machine-readable format;</li>
              <li><strong>Object</strong> — object to processing based on legitimate interests;</li>
              <li><strong>Withdraw consent</strong> — where processing is based on consent, withdraw it at any time without affecting prior processing.</li>
            </ul>
            <p>
              To exercise any of these rights, contact our Data Protection Officer at{" "}
              <a href={`mailto:${EMAIL}`} className="text-orange underline">{EMAIL}</a>. We will respond within
              30 days. We may need to verify your identity before fulfilling the request.
            </p>
          </Section>

          <Section title="9. Blockchain Data">
            <p>
              AutoPayKe uses the Avalanche public blockchain to process transactions. Transaction data recorded
              on-chain (wallet addresses, amounts, timestamps) is public and <strong>cannot be deleted</strong>
              — this is an inherent property of public blockchains.
            </p>
            <p>
              We minimise on-chain personal data: your phone number is never stored on-chain; instead, a
              one-way cryptographic hash (keccak256) of your number is used to link your wallet address to
              your account in the AutoPayKe registry contract.
            </p>
          </Section>

          <Section title="10. Children">
            <p>
              The Service is not directed to children under 18 years of age. We do not knowingly collect personal
              data from children. If you believe a child has provided us with personal information, please
              contact us at {EMAIL} and we will take steps to delete it promptly.
            </p>
          </Section>

          <Section title="11. Cross-Border Transfers">
            <p>
              Your data may be processed in countries outside Kenya, including the United States (Neon, Resend,
              Twilio) and the European Union. We rely on appropriate safeguards (standard contractual clauses,
              adequacy decisions) to ensure such transfers comply with applicable law.
            </p>
          </Section>

          <Section title="12. Changes to This Policy">
            <p>
              We may update this Privacy Policy from time to time. Material changes will be notified via the
              app and/or email. The "Effective date" at the top of this page indicates when the current version
              was last updated. Continued use of the Service after changes constitutes acceptance of the updated policy.
            </p>
          </Section>

          <Section title="13. Contact Our Data Protection Officer">
            <p>If you have any questions, concerns, or complaints about this Privacy Policy or our data practices:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Email: <a href={`mailto:${EMAIL}`} className="text-orange underline">{EMAIL}</a></li>
              <li>Website: <a href={APP_URL} className="text-orange underline">{APP_URL}</a></li>
            </ul>
            <p>
              You also have the right to lodge a complaint with the Office of the Data Protection Commissioner
              of Kenya (ODPC) at <a href="https://www.odpc.go.ke" className="text-orange underline" target="_blank" rel="noreferrer">odpc.go.ke</a>.
            </p>
          </Section>

        </div>

        {/* Footer links */}
        <div className="mt-8 pt-6 border-t border-black/10 flex flex-wrap gap-4 text-[12px] text-gray-400">
          <Link to="/legal/terms" className="hover:text-orange transition-colors">Terms of Service</Link>
          <Link to="/" className="hover:text-orange transition-colors">Back to AutoPayKe</Link>
        </div>
      </div>
    </div>
  );
}
