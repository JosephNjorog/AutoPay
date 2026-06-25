import { useSessionStore } from "@/stores/sessionStore";
import type { AuthUser } from "./api/client";

/**
 * Bridge hook — reads tokens from sessionStore (the new OTP-based auth store)
 * so all older routes using useAuthStore() automatically get the correct token.
 *
 * The old "autopayke-auth" localStorage key is no longer written.
 * Existing persisted values in that key are simply ignored.
 */
export function useAuthStore() {
  const accessToken = useSessionStore((s) => s.access_token);
  const refreshToken = useSessionStore((s) => s.refresh_token);
  const userId = useSessionStore((s) => s.user_id);
  const phone = useSessionStore((s) => s.phone);
  const walletAddress = useSessionStore((s) => s.wallet_address);
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated);
  const clearSession = useSessionStore((s) => s.clearSession);

  const user: AuthUser | null = userId
    ? { id: userId, phone: phone ?? "", email: null, walletAddress, isMerchant: false }
    : null;

  return {
    accessToken,
    refreshToken,
    user,
    isLoggedIn: isAuthenticated,
    logout: clearSession,
    // No-ops retained for API compatibility with older routes
    setAuth: (_tokens: unknown, _user: unknown) => {},
    setAccessToken: (_token: string) => {},
    updateUser: (_patch: Partial<AuthUser>) => {},
  };
}
