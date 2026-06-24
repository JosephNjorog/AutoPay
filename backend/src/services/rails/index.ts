import { dialCodeToCountry, type Rail } from "@tuma/shared";
import { createTransferRecipient, sendTransfer, getTransferStatus } from "./paystack";
import { sendWavePayout, getWavePayoutStatus } from "./wave";
import { RailError } from "../../lib/errors";

export type DisburseParams = {
  recipientPhone: string;
  amountLocal: number;
  localCurrency: string;
  reference: string;
  providerIdempotencyKey: string;
};

export type DisburseResult = {
  rail: Rail;
  railReference: string;
  status: "pending" | "settled";
};

// Paystack bank codes for mobile money by currency.
// Retrieve the full list via GET https://api.paystack.co/bank?type=mobile_money&country=XX
const PAYSTACK_MOBILE_CODES: Record<string, string> = {
  KES: "MPS",   // M-Pesa Kenya
  TZS: "MPS",   // M-Pesa Tanzania
  GHS: "MTN",   // MTN MoMo Ghana
  UGX: "MTN",   // MTN MoMo Uganda
};

/**
 * Auto-selects the correct payment rail from the recipient's phone number
 * and dispatches the disbursement.
 *
 * All mobile money rails (mpesa, momo, paystack) go through Paystack's
 * Transfer API so the same Paystack float that collects inbound payments
 * is used to pay out — no separate Safaricom B2C or MTN MoMo credentials needed.
 */
export async function disburseToRail(params: DisburseParams): Promise<DisburseResult> {
  const country = dialCodeToCountry(params.recipientPhone);
  if (!country) {
    throw new RailError("unknown", `Cannot determine country for ${params.recipientPhone}`);
  }

  const rail = country.primaryRail as Rail;

  switch (rail) {
    case "mpesa":
    case "momo":
    case "paystack": {
      const bankCode = PAYSTACK_MOBILE_CODES[params.localCurrency]
        ?? (params.localCurrency === "NGN" ? "999992" : null);

      if (!bankCode) {
        throw new RailError(rail, `No Paystack mobile money code configured for ${params.localCurrency}`);
      }

      // For Nigeria, Paystack expects the local format (0XXXXXXXXXX); others use E.164.
      const accountNumber = params.localCurrency === "NGN"
        ? params.recipientPhone.replace("+234", "0")
        : params.recipientPhone;

      const recipientCode = await createTransferRecipient(
        "mobile_money",
        "Autopayke Recipient",
        accountNumber,
        bankCode,
        params.localCurrency
      );

      const result = await sendTransfer(
        params.amountLocal,
        recipientCode,
        params.reference,
        params.providerIdempotencyKey
      );
      return { rail, ...result };
    }

    case "wave": {
      const result = await sendWavePayout(
        params.recipientPhone,
        params.amountLocal,
        params.reference,
        params.providerIdempotencyKey
      );
      return { rail, ...result };
    }

    case "orange_money":
      throw new RailError("orange_money", "Orange Money integration pending");

    default:
      throw new RailError(rail, `Rail not implemented`);
  }
}

/** Polls a rail-specific reference for settlement status. */
export async function pollRailStatus(
  rail: Rail,
  railReference: string
): Promise<"pending" | "settled" | "failed"> {
  switch (rail) {
    // All mobile money rails now disburse via Paystack Transfer — poll Paystack.
    case "mpesa":
    case "momo":
    case "paystack":
      return getTransferStatus(railReference);

    case "wave":
      return getWavePayoutStatus(railReference);

    default:
      return "pending";
  }
}
