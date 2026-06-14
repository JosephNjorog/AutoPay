import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { randomUUID } from "crypto";
import { hashToken } from "./crypto";

const accessSecret = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET!);
const refreshSecret = new TextEncoder().encode(process.env.JWT_REFRESH_SECRET!);

if (!process.env.JWT_ACCESS_SECRET || !process.env.JWT_REFRESH_SECRET) {
  throw new Error("JWT secrets are not set");
}

export type AccessTokenPayload = {
  sub: string;       // user id
  phone: string;
  walletAddress: string | null;
  isMerchant: boolean;
};

export type RefreshTokenPayload = {
  sub: string;
  jti: string;
};

export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(process.env.JWT_ACCESS_EXPIRES_IN ?? "15m")
    .setIssuer("tuma")
    .sign(accessSecret);
}

export async function signRefreshToken(userId: string): Promise<{ token: string; jti: string }> {
  const jti = randomUUID();
  const token = await new SignJWT({ sub: userId, jti })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(process.env.JWT_REFRESH_EXPIRES_IN ?? "30d")
    .setIssuer("tuma")
    .sign(refreshSecret);
  return { token, jti };
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload & JWTPayload> {
  const { payload } = await jwtVerify(token, accessSecret, { issuer: "tuma" });
  return payload as AccessTokenPayload & JWTPayload;
}

export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload & JWTPayload> {
  const { payload } = await jwtVerify(token, refreshSecret, { issuer: "tuma" });
  return payload as RefreshTokenPayload & JWTPayload;
}

export function hashRefreshToken(rawToken: string): string {
  return hashToken(rawToken);
}
