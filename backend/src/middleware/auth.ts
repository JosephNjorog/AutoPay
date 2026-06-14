import type { Context, Next } from "hono";
import { verifyAccessToken, type AccessTokenPayload } from "../lib/auth";
import { AuthError } from "../lib/errors";

declare module "hono" {
  interface ContextVariableMap {
    user: AccessTokenPayload & { sub: string };
  }
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthError("Missing or invalid Authorization header");
  }

  const token = authHeader.slice(7);
  try {
    const payload = await verifyAccessToken(token);
    c.set("user", payload as AccessTokenPayload & { sub: string });
  } catch {
    throw new AuthError("Token is invalid or expired");
  }

  await next();
}
