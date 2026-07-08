# Autopayke — Current Implementation

This doc captures the project's actual current state: what's built, how the
core flows work today, and what changed most recently. It's meant to stay
closer to the real code than the top-level [README.md](../README.md), which
has drifted in a few places (noted below) since it was last updated.

Last verified: 2026-07-08, against `main`.

---

## Corrections to the top-level README

A few things in [README.md](../README.md) describe an earlier plan rather
than what's actually running:

- **Frontend stack**: README says "React 19 + TanStack Start (SSR)" deployed
  to Cloudflare via Nitro. The actual app is a plain Vite SPA —
  `@tanstack/react-router` + `@tanstack/router-plugin/vite`, no TanStack
  Start, no Nitro, no SSR (see `frontend/vite.config.ts`,
  `frontend/package.json`).
- **OTP delivery**: README says WhatsApp via Africa's Talking. The actual
  implementation (`backend/src/routes/auth.ts`) sends OTP by **email**
  (Resend), falling back to **SMS** (Twilio) if email delivery fails, and
  falls back further to logging the OTP server-side if both fail (dev/local
  convenience).
- **Send flow step count**: README describes a 4-step send flow. It's been
  rebuilt (see below) into a 5-step flow with destination country as an
  explicit first step.
- **Admin dashboard**: not mentioned in README at all. A standalone
  Vite + React ops UI lives at `admin/`, served separately (port 3002 in
  dev), with 14 sections backed by `backend/src/routes/ops.ts`.

Everything else in the README (merchant mode, escrow/claim resilience
architecture, contracts, worker/queue design) is still accurate and is the
better reference for those areas — this doc doesn't repeat it.

---

## Repository layout

```
Tuma/
├── frontend/          React 19 + TanStack Router (Vite SPA, PWA) — the consumer app
├── admin/              React + Vite — internal ops dashboard (separate app, port 3002)
├── backend/            Hono + Bun API server, BullMQ workers
├── packages/shared/    Zod schemas + TypeScript types shared by frontend/backend
├── contracts/          Solidity smart contracts (Foundry), TestNet only
└── docs/                This doc, ADRs, runbooks
```

---

## The corrected send flow (current)

Destination country is now the *only* country ever asked for at send time —
sender context (account, KYC jurisdiction) is resolved from the
authenticated user's account, never re-asked. Step order:

```
/send
  1. Country     — searchable, backend-driven list (GET /api/send/corridors),
                    "Recent" row derived from real send history
  2. Recipient   — phone entry (validated against the selected country's
                    dial code + expected digit length) or Contact Picker
                    API, with a fallback confirm prompt if a picked
                    contact's number has no country code
  3. Verify      — GET /api/send/verify-recipient; if a registered name is
                    resolvable, ask "Sending to: NAME — is this correct?"
                    before continuing. Today no rail resolves a name (see
                    Known gaps below), so this step auto-skips.
  4. Amount      — USDC/local-currency toggle, live FX quote via
                    POST /api/fx/quote, "Rate locked · Ns" countdown that
                    auto-refreshes the quote in place on expiry
  5. Review      — recipient, amount, fee, FX rate, explicit "Confirm & send"
                    tap (never auto-submits)
```

Backend additions behind this: `GET /api/send/corridors` (serves
`COUNTRY_CONFIG` from `packages/shared`, the single source of truth for
country/currency/rail — previously the frontend maintained its own
divergent hardcoded copies) and `GET /api/send/verify-recipient`.

---

## Onboarding flow (current)

Five steps, each its own routed screen, progress **persisted across
reloads** (`signupStore` now uses zustand `persist` + localStorage — it
didn't before, so a reload used to bounce the user back to step 1):

```
/signup            Step 1 of 5 — phone + country + email, fee-transparency card
/signup/verify      Step 2 of 5 — 6-digit OTP (email, SMS fallback)
/signup/kyc          Step 3 of 5 — identity step (see below)
/signup/pin           Step 4 of 5 — 4-digit PIN (hashed locally)
/signup/biometrics     Step 5 of 5 — passkey registration (optional/skippable)
/signup/complete         Wallet ready → /dashboard
```

### Identity step (`/signup/kyc`)

Collects full legal name, date of birth, ID type (national ID / passport /
driver's license), and ID number. **This is explicitly not real
document or liveness verification** — no KYC vendor (Smile Identity,
Onfido, Persona, etc.) is integrated anywhere in the codebase. Picking one
is a business decision that hasn't been made.

What it does instead, so the step isn't a no-op: `POST /api/kyc/submit`
runs real (if simple) checks — age ≥ 18 from date of birth, and an
ID-number format check per ID type — and returns a specific rejection
reason on failure (e.g. "Date of birth indicates you're under 18") that the
user can act on without restarting the flow. Result is stored on
`users.kycStatus` / `kycRejectionReason`.

### Funding reference

`/fund`'s bank-transfer view now shows the routing reference prominently
at the top with a copy-to-clipboard button (it previously had no copy
control at all, buried as one row in a details list).

---

## Agentic permission/audit foundation (backend-only, no live consumer)

Application-layer scaffolding for a future "let an agent send money on my
behalf, with limits" feature. **Nothing in the product creates
agent-initiated transactions yet** — there's no agent UI, no agent
identity, nothing that calls the evaluation logic below. This is
deliberately foundation-only, matching the spec's own framing.

- **Schema**: `agent_permissions` (per-payer grant: max transaction size,
  approved recipients/corridors, daily frequency cap, versioned,
  `revokedAt` kill-switch — same nullable-timestamp pattern as
  `users.suspendedAt`), `agent_audit_log` (append-only, modeled on the
  existing `settlement_events` table), `agent_review_events` (landing
  table for anomaly-flagged activity).
- **API** (`/api/agent/*`, all authenticated):
  - `GET /PUT /api/agent/permissions` — read/upsert the caller's grant
  - `POST /api/agent/kill-switch` — requires `{ confirm: true }` as an
    explicit safety gate; revokes the grant, drains any queued review
    jobs for that user, writes an audit event
  - `GET /api/agent/audit-log?from=&to=` — date-range filterable
- **Queue/worker**: `AGENT_REVIEW` BullMQ queue +
  `agent-review.worker.ts`, following the same conventions as the
  existing settlement/escrow/rail/notify workers.
- **`evaluateAgentTransaction()`** (`backend/src/services/agent-permissions.ts`):
  the intended entry point for a future agent-send endpoint. Hard
  violations (no grant, revoked, over the size/corridor/recipient/
  frequency limits) block outright; amount more than 3x the payer's
  recent sending average is *flagged* to the review queue rather than
  blocked, per spec — an agent shouldn't be auto-blocked just for
  looking unusual, only for breaking an explicit rule.

No consumer-facing "agent settings" UI exists yet — building one now
would be a screen with nothing real behind it for a user to reason about.

---

## PWA hardening (current)

- **Service worker caching** (`frontend/vite.config.ts`, `workbox.runtimeCaching`):
  cache-first for static assets, stale-while-revalidate for
  `/api/send/corridors`, network-first (4s timeout, short TTL) for
  `/api/fx/rates` / `/api/track/*` / `/api/history*`.
- **Install prompt**: surfaced non-intrusively on the send flow's
  post-success screen (reuses a previously-built-but-unused
  `usePwaInstall` hook), in addition to the landing page's existing
  pre-auth "Get the app" button.
- **Offline banner**: global, shown via `navigator.onLine` +
  online/offline events when the connection drops.
- **Optimistic UI**: wallet connect/disconnect (the only real mutations
  in the frontend today) update immediately with rollback on failure. No
  favoriting/bookmarking feature exists to apply this to elsewhere.
- **Lighthouse CI**: `frontend/lighthouserc.json` asserts LCP < 2.5s and
  Interactive < 3.5s on simulated mobile/4G, wired into
  `.github/workflows/ci.yml` as **advisory** (`continue-on-error: true`).
  It currently fails both budgets by a wide margin (LCP ~4.6s, TTI ~9s) on
  the public landing page — see Known gaps below.

---

## Known gaps / next work

- **Real recipient name verification** — no rail (M-Pesa, MTN MoMo,
  Paystack, Wave) currently calls a provider name-resolution endpoint.
  The plumbing (endpoint, UI confirm step) exists and skips gracefully;
  wiring up a real per-rail lookup is separate work.
- **Real KYC vendor** — the identity step validates format/age only. No
  document capture, no liveness check, no third-party verification.
- **Landing page performance** — Lighthouse CI currently fails both
  budgets. Most likely cause: `frontend/src/routes/__root.tsx` eagerly
  imports `lib/web3.ts` (wagmi/Reown AppKit) for every route, including
  the pre-auth landing page that never touches a wallet connector. Not
  yet fixed; the CI check is advisory specifically because of this.
- **Agent feature has no UI or live consumer** — see above.
- **Contracts** — TestNet only. Fund-safety/access-control hardening is
  done (see below); the process items from `Deploy.s.sol`'s own checklist
  (multisig admin, KMS-backed relayer key, professional audit, mainnet
  gas/funding re-validation) are still open.

---

## Smart contracts — MainNet-readiness hardening

A read-only security audit of `contracts/src/` (see
[ADR 0008](adr/0008-smart-wallet-and-escrow-mainnet-hardening.md) for full
detail) found and fixed five concrete fund-safety/access-control gaps,
all TestNet-only — no deployment scripts, network config, or the
process checklist below were touched:

1. `AutopayEscrow` now has a pause switch (it had none, despite holding
   user funds).
2. `AutopaySmartWallet.updateOwner()` (single-transaction, guardian could
   call it) is now `proposeOwnerChange()` → `finalizeOwnerChange()`, timelocked
   24h with owner-cancellable, mirroring the existing guardian-rotation flow.
3. The guardian daily spend cap now catches value leaving the wallet by
   any mechanism (balance-delta check), not just direct `transfer()`/
   `approve()` calls against the exact capped token address — closing a
   real bypass where a guardian could route a pull through another
   contract (e.g. `AutopayEscrow.deposit()`) to dodge the cap entirely.
4. `pause()` now also blocks proposing/finalizing an owner or guardian
   change (never cancelling one) — previously a compromised guardian could
   still seize ownership while the wallet was "paused."
5. `AutopayEscrow.rescueToken()` recovers tokens sent directly to the
   contract outside `deposit()`, without ever touching funds legitimately
   held against a pending/claimable escrow (tracked via a `totalHeld`
   counter).

Test suite grew from 80 to 105 passing tests (`forge test`), including new
coverage that specifically proves the closed bypasses.

Deployed to Fuji TestNet with these fixes included — see the Contract
addresses table in [README.md](../README.md#contract-addresses). The
Paymaster is funded and staked; gas sponsorship is live. Running
`PostDeploy.s.sol` for real surfaced one more bug in the script itself
(not the contracts): `deposit()` is `RELAYER_ROLE`-gated while
`addStake()` is `DEFAULT_ADMIN_ROLE`-gated, but the script only ever ran
as the admin/deployer key — fixed by having admin briefly self-grant
`RELAYER_ROLE` around the `deposit()` call and revoke it immediately
after, verified via `EntryPoint.getDepositInfo()` and confirming the
deployer no longer holds the role.

**Still open before MainNet** (acknowledged in `Deploy.s.sol`'s own
comments but not enforced by anything): move the admin address to a
multisig, move the relayer private key to a KMS/HSM, verify the ERC-4337
EntryPoint's canonical address actually holds on Avalanche C-Chain mainnet
specifically, re-validate gas/funding amounts (currently testnet-scale),
get a professional security audit, and add integration/fuzz tests
exercising the full EntryPoint → Paymaster → SmartWallet → Escrow path
(only per-contract unit tests exist today).

---

## Verification notes

This implementation was verified this session against a local throwaway
Postgres/Redis (via the repo's own `docker-compose.yml`) rather than the
project's real Neon database, since the sandbox this work was done in has
no network egress to it. Specifically checked:

- Full send flow (country → recipient → verify-skip → amount with live FX
  quote and ticking countdown → review → confirm) in a headless browser.
- Full signup flow including a mid-flow reload (confirms persistence) and
  a rejected-then-fixed KYC submission (confirms the retry UX).
- `/api/agent/*` endpoints via direct calls with a self-signed JWT:
  permission create/update (version bumps correctly), kill-switch's
  confirm-flag gate, and audit log ordering.
- `evaluateAgentTransaction()` decision paths (block on over-limit,
  disapproved corridor, disapproved recipient, no/revoked grant).
- Service worker runtime caching rules present in the built `dist/sw.js`.
- Lighthouse CI config runs and produces real data (see the performance
  gap noted above).
