import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";

export const kycRouter = new Hono();
kycRouter.use("*", authMiddleware);

// Digit-count per ID type, used as a stand-in "verification" check. This is
// NOT real document/liveness verification — no KYC vendor is integrated.
// Picking one (Smile Identity, Onfido, Persona, ...) is a business decision
// outside this endpoint's scope; this only validates that the submitted
// identity details are internally plausible, so the retry UX (2.4) has a
// real, specific reason to show rather than a fabricated one.
const ID_NUMBER_PATTERNS: Record<string, RegExp> = {
  national_id: /^\d{7,8}$/,
  passport: /^[A-Z0-9]{6,9}$/i,
  drivers_license: /^[A-Z0-9]{5,12}$/i,
};

const KycSubmitSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateOfBirth must be YYYY-MM-DD"),
  idType: z.enum(["national_id", "passport", "drivers_license"]),
  idNumber: z.string().trim().min(4).max(20),
});

function ageFromDob(dob: string): number {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

// POST /api/kyc/submit
kycRouter.post("/submit", zValidator("json", KycSubmitSchema), async (c) => {
  const { sub: userId } = c.get("user");
  const { fullName, dateOfBirth, idType, idNumber } = c.req.valid("json");

  let rejectionReason: string | null = null;
  if (ageFromDob(dateOfBirth) < 18) {
    rejectionReason = "Date of birth indicates you're under 18 — Autopayke requires account holders to be 18 or older.";
  } else if (!ID_NUMBER_PATTERNS[idType].test(idNumber)) {
    rejectionReason = `That ID number doesn't match the expected format for ${idType.replace("_", " ")}.`;
  }

  const kycStatus = rejectionReason ? "rejected" : "verified";

  await db
    .update(users)
    .set({
      fullName,
      dateOfBirth,
      idType,
      idNumber,
      kycStatus,
      kycRejectionReason: rejectionReason,
      kycSubmittedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  return c.json({ ok: true, data: { kycStatus, rejectionReason } });
});

// GET /api/kyc/status
kycRouter.get("/status", async (c) => {
  const { sub: userId } = c.get("user");

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { kycStatus: true, kycRejectionReason: true, fullName: true },
  });

  return c.json({
    ok: true,
    data: {
      kycStatus: user?.kycStatus ?? null,
      rejectionReason: user?.kycRejectionReason ?? null,
      fullName: user?.fullName ?? null,
    },
  });
});
