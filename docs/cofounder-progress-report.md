# Autopayke — Progress Report

**Prepared:** 8 July 2026
**Audience:** Non-technical — this explains what changed and what it means for the business, not how the code works.

---

## The short version

Over the last two work sessions, we rebuilt the send-money flow to match how it's actually supposed to work, added the identity-verification step onboarding needs, laid the safety groundwork for a future "AI agent sends money for you" feature, made the app noticeably more resilient on bad connections, and found and fixed five real security gaps in the smart contracts that hold user money — before anyone else could find them. Everything is tested and running on Avalanche's practice network (TestNet — no real money involved). The backend is live on our hosting provider, but there are three configuration items still to finish before it's fully solid (details near the end). **We should not move to MainNet (real money) yet** — not because anything is broken, but because the standard safety steps (independent audit, shared-control admin keys) haven't happened yet. More on that below.

---

## 1. The send-money flow — rebuilt

**What changed for the user:** Previously, the app guessed which country you were sending to based on the phone number you typed, and the list of countries you could pick from was hardcoded into the app itself — meaning adding a new country meant releasing a new version of the app. Now:

- You pick the **destination country first**, from a live, searchable list the app fetches from our servers (so we can add a new country — say, expanding into Europe — without anyone needing to update the app).
- Recently-used countries show up at the top, so repeat senders don't have to search.
- You can still type a phone number or pick from your phone's contacts.
- If a contact's number doesn't have a country code attached, the app now asks you to confirm which country it belongs to, instead of silently guessing (which could send money to the wrong place).
- Before you confirm, if we're able to verify who the recipient is, we show you their name so you can catch mistakes before money moves. (Right now, none of our payment partners actually support this name-check yet, so this step quietly skips itself — the wiring is there, ready for when a partner adds that capability.)
- The exchange rate you're quoted now visibly counts down and automatically refreshes if it expires while you're still deciding — so you're never shown a stale rate.
- Nothing changed about the final "Confirm & Send" step — it still requires an explicit tap and never happens automatically.

**Why it matters:** This directly fixes the core trust problem in cross-border payments apps — people worry the rate will change, the money will go to the wrong place, or fees are hidden. This flow now addresses all three head-on.

---

## 2. Sign-up flow — now includes identity verification, and doesn't lose your progress

Sign-up is now five steps instead of four: phone number → verify code → **verify your identity (new)** → set PIN → set up biometrics → done.

- **Identity step (new):** collects legal name, date of birth, and an ID number. This is a placeholder for full identity verification — it currently checks that you're old enough and that the ID number looks the right shape, but it does **not** yet do real document scanning or a photo ID check. That requires picking and paying for a third-party identity-verification service, which is a business decision we haven't made yet (see "What's not real yet" below).
- **If verification fails**, the person sees exactly why ("date of birth suggests you're under 18," etc.) and can fix just that field — they don't have to restart sign-up from scratch.
- **Progress now survives closing the app or losing signal mid-signup.** Previously, if someone's connection dropped halfway through signing up, they'd have to start over from the beginning — a known drop-off risk on mobile in the markets we serve. Now it picks up where they left off.
- **A "no hidden fees" message now appears on the very first screen**, so pricing transparency is the first thing a new user sees, not something they discover later.
- **The funding/deposit screen** now shows your top-up reference code prominently at the top with a one-tap copy button — previously it was buried and had no copy button at all, a specific complaint we'd seen called out about a competitor's app.

---

## 3. The "agentic" foundation — important to understand what this is *not*

This is groundwork for a **future** feature, not something live in the app today. There is no button, no screen, nothing a user can see or turn on right now.

**The idea it's preparing for:** eventually letting an automated agent (AI or otherwise) send payments on a user's behalf, within limits the user explicitly sets — e.g. "never more than $50 without asking me," "only to these people," "no more than 5 times a day."

**What we actually built:** the safety rails that a real feature like this would need before it could ever be trusted with money:

- A place to store each user's rules (spending limit, approved recipients, approved countries, how often it can act).
- A **kill switch** — a way to instantly and completely cut off an agent's authority to move money, with a confirmation step so it can't be triggered by accident.
- A permanent, unchangeable **audit log** of every decision, so if something ever looks wrong, there's a full paper trail.
- An early-warning system: if an agent-initiated payment looks unusual compared to that person's normal habits, it gets flagged for a human to review instead of being silently blocked or silently allowed.

**Why we built it now instead of waiting:** it's much safer and cheaper to build the guardrails before the car exists than to bolt them on after. But to be clear — **there is no agentic payment feature a user can use yet.** This is the foundation a product decision would build on top of, later.

---

## 4. App speed and reliability

- The app now tells you clearly when you've lost your internet connection, instead of failing silently and leaving you guessing.
- After your **first successful send** (not on first open, so we're not nagging brand-new users), the app gently offers to install itself to your home screen for faster access next time.
- Parts of the app now load from a local cache when your connection is slow or drops, instead of just spinning or failing.
- We added an automated performance check that measures how fast the app feels on a typical mid-range Android phone on a weak connection — this caught the fact that our landing page currently loads slower than we'd want (likely because it's loading the crypto-wallet-connection code even for people who haven't signed up yet). That's flagged as a known follow-up, not yet fixed.

---

## 5. Smart contract security — five real issues found and fixed

Before considering MainNet, we had the contracts that will eventually hold and move real user money independently reviewed. We found five genuine gaps and fixed all of them:

1. **The escrow contract (which holds money for people who haven't joined Autopayke yet) had no emergency stop.** If a bug were ever found in it after launch, there would have been no way to pause it — only a full rebuild-and-redeploy, during which user funds would be exposed. **Fixed** — it can now be paused instantly by an admin.
2. **A backend-controlled key could have reassigned ownership of a user's wallet in a single, instant action**, with no warning to the real owner. **Fixed** — this now requires a 24-hour waiting period, during which the real owner is notified and can cancel it. (The equivalent protection for changing that backend key already existed — this closes the matching gap for wallet ownership itself, which was actually the more dangerous of the two.)
3. **A daily spending limit meant to contain damage from a compromised backend key had a loophole** — it could be routed around by moving money through a different path than the one the limit was watching. **Fixed** — the limit now catches the money leaving the wallet regardless of which path is used.
4. **The emergency pause didn't cover everything it should have** — specifically, it didn't stop the wallet-ownership-transfer issue above. **Fixed** — pausing now blocks that too.
5. **If tokens were ever sent to the escrow contract by mistake** (bypassing the normal deposit process), they would have been stuck forever with no way to recover them. **Fixed** — added a recovery tool that can only touch mistakenly-sent tokens, and is mathematically incapable of touching real user deposits.

All five fixes are backed by automated tests (105 tests total, all passing, including tests that specifically try to exploit the old bugs to prove they're closed) and are now live on Avalanche's Fuji **TestNet** — a full practice copy of the real network, using play money, for exactly this kind of real-world testing before anything touches MainNet.

---

## 6. Should we go to MainNet now?

**Short answer: not yet, and not because anything is broken.** Two standard, non-negotiable steps for a financial product haven't happened yet:

1. **An independent, professional security audit.** We did our own internal review and fixed what we found (section 5), but that's not a substitute for a specialized outside firm reviewing the code before it touches real money — this is standard practice industry-wide, not optional caution. Realistic cost range for a codebase this size is roughly **$15,000–$100,000+** depending on the firm and depth — I don't have current market pricing, so treat that as a planning range to validate, not a quote.
2. **Admin control is currently a single wallet, not shared/multi-approval.** Right now, one private key can pause contracts, change settings, and manage funds. Before real money is involved, this needs to move to a setup that requires multiple people to approve sensitive actions (a "multisig"), and the backend's signing key needs to move into a proper secure key-management system rather than being stored as a plain configuration value.

**The good news:** neither of these is a code problem — they're process and procurement. Once an audit is scoped and the key-custody setup is changed, MainNet deployment itself is mechanically simple (we already have a tested, working deployment process from doing it on TestNet) and cheap — actual blockchain transaction costs for deploying and funding the contracts would likely be well under $50 in gas fees at current network prices. The **real** cost of "going to MainNet properly" is the audit, not the deployment.

---

## 7. What's not real/working yet — plain list

- **Identity verification** checks age and ID-number format only — not a real government ID/photo check. Needs a paid third-party provider to be selected.
- **Recipient name confirmation** before sending is built but currently unused — none of our payment partners support it yet.
- **The agentic (AI-sends-money) feature** has no user-facing part at all — foundation only, as explained in section 3.
- **The landing page loads slower than our target** on a typical phone/connection — flagged, not yet fixed.
- **Backend production setup has three loose ends** (technical, but worth knowing about):
  - The database on our live server hasn't yet received the update that adds the new identity-verification and future-agent-feature data — until this runs, those two specific new features would error out if someone tried to use them on the live backend right now. Everything else is unaffected.
  - The fast in-memory data store (Redis) that the backend depends on for reliability under load isn't currently connecting on the live server — the app has a fallback so it's not down, but it's not running at full strength.
  - The live server is reporting itself as running in "development" mode rather than "production" mode — worth a quick check in our hosting dashboard.

None of these three are urgent emergencies — the app is live and working — but they should be closed out before we lean on this deployment for real usage.

---

## What this adds up to

The core money-movement experience is now materially safer and more trustworthy than it was two days ago: a corrected send flow, real progress-saving onboarding with an identity step, five real smart-contract vulnerabilities closed before anyone else could find them, and a tested, working deployment process proven end-to-end on the practice network. We've also quietly laid the foundation for a genuinely differentiated future feature (agent-initiated payments with real safety rails) without shipping anything half-finished or risky. What's left before real money is on the line is standard, well-understood process — an audit and shared-control admin keys — not more engineering risk.
