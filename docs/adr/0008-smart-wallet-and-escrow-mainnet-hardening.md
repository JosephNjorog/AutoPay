# ADR 0008: Smart Wallet and Escrow MainNet-Readiness Hardening

## Status

Accepted

## Context

Before any consideration of Avalanche MainNet deployment, the contracts under
`contracts/src/` were audited (read-only, no code changes) against the
threat model already documented in `AutopaySmartWallet.sol`: a compromised
guardian key (the backend relayer) as the realistic single point of failure
in the current "Phase 1" trust model, plus general fund-safety review of
`AutopayEscrow`, which holds user funds directly.

The audit found five concrete gaps, all fixed in this change:

1. `AutopayEscrow` had no pause mechanism at all, despite holding user
   funds — `AutopaySmartWallet` and `AutopayPaymaster` both already had one.
2. `AutopaySmartWallet.updateOwner()` was a single-transaction handoff
   callable by owner **or guardian**, while the equivalent guardian-rotation
   function (`updateGuardian()`) was already timelocked and owner-cancellable.
   A compromised guardian key could seize a wallet's ownership instantly,
   with no window for the real owner to notice and stop it.
3. The guardian's per-token daily spend cap only pattern-matched
   `transfer()`/`approve()` calldata against the exact token address passed
   as `to`. A guardian could route the same value movement through any other
   contract (e.g. calling `AutopayEscrow.deposit()` to pull a pre-existing
   allowance) or a different selector, and the cap would never trigger.
4. `pause()` blocked `execute()`/`executeBatch()`/`transferToken()`/
   `approveToken()`, but not `updateOwner()` or `updateGuardian()` — so a
   compromised guardian could still take over a wallet even while it was
   "paused," defeating the point of pausing.
5. `AutopayEscrow` had no way to recover tokens sent directly to the
   contract via a raw ERC-20 `transfer()` (bypassing `deposit()`) — such
   tokens would be stuck permanently.

## Decision

**AutopayEscrow**: added `Pausable` (`pause()`/`unpause()`, both
`DEFAULT_ADMIN_ROLE`-gated, matching `AutopayPaymaster`'s existing pattern),
applied to `deposit()`, `claim()`, and `refund()`. Added a `totalHeld[token]`
running counter (incremented on `deposit()`, decremented on `claim()`/
`refund()`) and a `rescueToken(token, to)` function that sweeps only the
excess above `totalHeld[token]` — it can never touch funds legitimately
held against a pending or claimable escrow record, by construction.

**AutopaySmartWallet**:

- Replaced `updateOwner()` with a `proposeOwnerChange()` /
  `finalizeOwnerChange()` / `cancelOwnerChange()` flow, mirroring
  `updateGuardian()`/`finalizeGuardianChange()`/`cancelGuardianChange()`
  exactly: a new owner takes effect only after `OWNER_CHANGE_DELAY` (24h),
  and the current owner can cancel a pending change at any time — including
  one they didn't propose. This applies regardless of whether the owner or
  the guardian initiated the proposal; a legitimate owner-initiated
  ownership migration (e.g. upgrading to a passkey) now also waits out the
  delay, a deliberate tradeoff in favor of consistent protection over
  frictionless self-service migration.
- Extended `whenNotPaused` to `proposeOwnerChange()`, `updateGuardian()`,
  `finalizeOwnerChange()`, and `finalizeGuardianChange()`. `cancelOwnerChange()`
  and `cancelGuardianChange()` deliberately stay unrestricted — they're the
  recovery action itself and must remain available during an active incident.
- Replaced the single selector-matching guardian spend-cap check with two
  complementary mechanisms sharing one daily budget per token:
  - `_checkGuardianApprovalCap()` — unchanged in spirit, still decodes
    `approve()` calldata to cap new allowances a guardian grants (stops
    pre-authorizing an oversized future pull, even one that happens outside
    a guardian-initiated transaction).
  - `_snapshotGuardianBalances()` / `_enforceGuardianBalanceCap()` — new.
    Snapshots the wallet's balance of every token with a configured limit
    before a guardian-initiated `execute()`/`executeBatch()` call, and caps
    the realized decrease after the call completes, regardless of which
    contract or selector caused it. This is what actually closes the
    "route through a different contract" and "use a different selector"
    bypasses — it observes the outcome instead of pattern-matching the
    calldata that produced it.

`transferToken()`/`approveToken()` were left untouched: they take fixed
parameters rather than arbitrary `to`/`data`, so they were never part of the
bypassable surface, and the contract's own comments already note the backend
doesn't call them in production.

## Consequences

Positive:

- A discovered bug in `AutopayEscrow` can now be halted without a redeploy.
- A compromised guardian key can no longer seize wallet ownership in a
  single transaction, nor while the wallet is paused.
- The guardian daily cap now bounds actual guardian-initiated value
  movement comprehensively, not just the two specific calldata shapes the
  original check happened to recognize.
- Stray tokens sent directly to the escrow contract are recoverable instead
  of permanently stuck.

Tradeoffs:

- Every owner change — including a legitimate, owner-initiated one — now
  takes 24h to finalize. This is a deliberate security/UX tradeoff; if
  product wants a faster self-service path for owner-initiated migrations
  specifically, that would need a way to distinguish "owner proposed this
  about themselves" from "guardian proposed this about the owner," which
  this change doesn't attempt.
- The balance-delta guardian cap adds a `balanceOf()` call per tracked
  token before and after every guardian-initiated `execute()`/
  `executeBatch()`, proportional to how many tokens have ever had a limit
  configured (in practice bounded to USDC/USDT per the contract's own
  documented usage).
- The balance-delta cap only observes decreases that happen *within* the
  guardian-initiated call. A pre-existing large allowance granted to a
  third party before this change (or before any cap was configured) is
  still not retroactively bounded — closing that would require ratcheting
  down existing approvals, a separate, larger change not attempted here.
- `rescueToken()` is admin-only and requires the admin to know which token
  to sweep; it doesn't enumerate stray tokens automatically.

## Verification

All 5 contracts still compile (`forge build`). Test suite grew from 80 to
105 passing tests (`forge test`), including new coverage specifically
proving the closed bypasses: an indirect pull routed through a mock
third-party contract is now capped and reverts over the daily limit
(previously would have succeeded uncapped); a direct transfer and a
separate approval in the same day correctly share one budget; pause blocks
new owner/guardian proposals and finalizations but never blocks cancelling
one; and `rescueToken()` sweeps only tokens sent outside `deposit()`,
verified by asserting a simultaneous legitimate escrow deposit is
untouched.

This change is scoped to contract code and tests only. No deployment
scripts, network configuration, or mainnet-readiness checklist items
(multisig admin, KMS-backed relayer key, professional audit, gas/funding
re-validation for Avalanche C-Chain mainnet specifically) were touched —
those remain open per `README.md`'s own "Status" checklist.

## Follow-up Work

- Professional security audit before any mainnet deployment — this pass
  addresses concrete findings from an internal read-only review, not a
  substitute for one.
- Decide whether owner-initiated (vs. guardian-initiated) ownership changes
  should have a faster path, if the 24h delay proves too much UX friction
  in practice.
- Consider whether existing large allowances (granted before a daily limit
  was configured) should be addressed separately, since the new balance-delta
  cap doesn't retroactively bound them.
- Move `ADMIN_ADDRESS` to a multisig and `RELAYER_PRIVATE_KEY` to a KMS/HSM
  before mainnet, per `Deploy.s.sol`'s own acknowledged-but-unenforced
  checklist.
- Add an integration test exercising the full EntryPoint → Paymaster →
  SmartWallet → Escrow path end-to-end; only per-contract unit tests exist
  today.
