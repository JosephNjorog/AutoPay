import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
});

// ── Queue names ───────────────────────────────────────────────────────────────

export const QUEUE_NAMES = {
  SETTLEMENT_POLL: "settlement_poll",
  ESCROW_EXPIRE: "escrow_expire",
  RAIL_DISBURSE: "rail_disburse",
  WHATSAPP_NOTIFY: "whatsapp_notify",
} as const;

// ── Job payload types ─────────────────────────────────────────────────────────

export type SettlementPollJob = {
  transactionId: string;
  rail: string;
  railReference: string;
  attempt: number;
};

export type EscrowExpireJob = {
  escrowRef: string;
  transactionId: string;
  senderWallet: string;
  amountUsdc: string;
  onchainRef: string;
};

export type RailDisburseJob = {
  transactionId: string;
  rail: string;
  recipientPhone: string;
  amountLocal: number;
  localCurrency: string;
  reference: string;
};

export type WhatsAppNotifyJob = {
  to: string;
  templateName: string;
  params: string[];
};

// ── Queue instances ───────────────────────────────────────────────────────────

export const settlementQueue = new Queue<SettlementPollJob>(
  QUEUE_NAMES.SETTLEMENT_POLL,
  { connection }
);

export const escrowQueue = new Queue<EscrowExpireJob>(
  QUEUE_NAMES.ESCROW_EXPIRE,
  { connection }
);

export const railQueue = new Queue<RailDisburseJob>(
  QUEUE_NAMES.RAIL_DISBURSE,
  { connection }
);

export const notifyQueue = new Queue<WhatsAppNotifyJob>(
  QUEUE_NAMES.WHATSAPP_NOTIFY,
  { connection }
);

// ── Scheduling helpers ────────────────────────────────────────────────────────

export async function scheduleSettlementPoll(
  transactionId: string,
  rail: string,
  railReference: string,
  delayMs = 10_000
) {
  await settlementQueue.add(
    "poll",
    { transactionId, rail, railReference, attempt: 0 },
    { delay: delayMs, attempts: 20, backoff: { type: "exponential", delay: 10_000 } }
  );
}

export async function scheduleEscrowExpiry(
  job: EscrowExpireJob,
  expiresAt: Date
) {
  const delay = expiresAt.getTime() - Date.now();
  await escrowQueue.add("expire", job, { delay: Math.max(delay, 0) });
}

export async function enqueueRailDisburse(job: RailDisburseJob) {
  await railQueue.add("disburse", job, {
    attempts: 3,
    backoff: { type: "fixed", delay: 30_000 },
  });
}

export async function enqueueWhatsAppNotify(job: WhatsAppNotifyJob) {
  await notifyQueue.add("notify", job, {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
  });
}

export { connection as queueConnection };
