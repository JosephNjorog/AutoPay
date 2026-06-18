import { createHash } from "node:crypto";
import type { RailDisburseJob } from "../lib/queue";

function deterministicUuid(input: string): string {
  const hash = createHash("sha256").update(input).digest("hex").slice(0, 32);
  const chars = hash.split("");
  chars[12] = "4";
  chars[16] = ((parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const value = chars.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export function railProviderIdempotencyKey(
  transactionId: string,
  failureStage = "rail_disbursement"
): string {
  return deterministicUuid(`tuma:rail:${transactionId}:${failureStage}`);
}

export function railJobWithProviderIdempotency(
  job: RailDisburseJob
): RailDisburseJob {
  const providerIdempotencyKey =
    job.providerIdempotencyKey ??
    railProviderIdempotencyKey(job.transactionId, job.failureStage);

  return {
    ...job,
    providerIdempotencyKey,
    metadata: {
      ...(job.metadata ?? {}),
      providerIdempotencyKey,
    },
  };
}
