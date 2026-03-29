/**
 * Contract: BFF Auth API Routes (Next.js App Router)
 *
 * These are the 5 Next.js API route contracts for the Google OAuth2
 * Backend-for-Frontend (BFF) proxy. Each route lives at
 * `apps/studio/src/app/api/auth/<name>/route.ts`.
 *
 * Security invariants enforced across ALL routes:
 * - Refresh tokens MUST only be set/read via `httpOnly`, `Secure`,
 *   `SameSite=Strict` cookies — never returned in response bodies.
 * - Access tokens are returned in JSON bodies for in-memory client storage only.
 * - All routes validate `state` and `code_verifier` to prevent CSRF and
 *   authorization code injection attacks.
 * - No secrets are logged (tokens, client secrets, verifiers).
 *
 * Feature: 002-flexible-storage
 * Date: 2026-03-19
 */

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface AccessTokenResponse {
  accessToken: string;
  /** Unix ms timestamp when the access token expires */
  expiresAt: number;
}

export interface AuthErrorResponse {
  error: string;
  code: 'INVALID_STATE' | 'CODE_EXCHANGE_FAILED' | 'REFRESH_FAILED' | 'NO_SESSION' | 'REVOKE_FAILED';
}

// ---------------------------------------------------------------------------
// Route: GET /api/auth/google
// ---------------------------------------------------------------------------
/**
 * Initiates the OAuth2 authorization code + PKCE flow.
 *
 * Server-side actions:
 * 1. Generate a cryptographically random `state` nonce and PKCE `code_verifier`.
 * 2. Compute `code_challenge` = BASE64URL(SHA256(code_verifier)).
 * 3. Store `state` + `code_verifier` in a short-lived `httpOnly` session cookie
 *    (`arch-atlas-oauth-state`, max-age 600 seconds).
 * 4. Redirect (302) to Google's authorization endpoint with:
 *    - `client_id`, `redirect_uri`, `scope=drive.file`, `response_type=code`,
 *      `code_challenge`, `code_challenge_method=S256`, `access_type=offline`,
 *      `prompt=consent` (required to reliably get refresh token), `state`.
 *
 * Response: 302 redirect to Google
 */
export type GoogleAuthInitRoute = {
  method: 'GET';
  path: '/api/auth/google';
  response: never; // redirect only
};

// ---------------------------------------------------------------------------
// Route: GET /api/auth/callback
// ---------------------------------------------------------------------------
/**
 * Handles the OAuth2 authorization callback from Google.
 *
 * Query params: `code`, `state`, `error` (if auth denied)
 *
 * Server-side actions:
 * 1. Read `arch-atlas-oauth-state` cookie; validate `state` matches.
 * 2. Exchange `code` + `code_verifier` for tokens at Google's token endpoint.
 * 3. Store `refresh_token` in `httpOnly`, `Secure`, `SameSite=Strict` cookie
 *    (`arch-atlas-refresh`, max-age 180 days).
 * 4. Clear the state cookie.
 * 5. Return `access_token` + `expiresAt` in JSON body for client memory storage.
 *
 * On `error` query param (user denied): return 401 with AuthErrorResponse.
 *
 * Success response: 200 AccessTokenResponse
 * Error response: 401 AuthErrorResponse
 */
export type GoogleAuthCallbackRoute = {
  method: 'GET';
  path: '/api/auth/callback';
  queryParams: { code?: string; state?: string; error?: string };
  successResponse: AccessTokenResponse;
  errorResponse: AuthErrorResponse;
};

// ---------------------------------------------------------------------------
// Route: POST /api/auth/refresh
// ---------------------------------------------------------------------------
/**
 * Silently exchanges the stored refresh token for a new access token.
 * Called automatically by the client ~5 minutes before access token expiry,
 * and on every page load via `/api/auth/me`.
 *
 * Server-side actions:
 * 1. Read `arch-atlas-refresh` cookie. If absent, return 401.
 * 2. POST to Google's token endpoint with `grant_type=refresh_token`.
 * 3. On success:
 *    - If Google returns a new refresh token (rotation), overwrite the cookie.
 *    - Return new `access_token` + `expiresAt` in JSON body.
 * 4. On failure (token revoked, expired): clear the cookie, return 401.
 *
 * Success response: 200 AccessTokenResponse
 * Error response: 401 AuthErrorResponse (client must re-authorize)
 */
export type GoogleAuthRefreshRoute = {
  method: 'POST';
  path: '/api/auth/refresh';
  body: never;
  successResponse: AccessTokenResponse;
  errorResponse: AuthErrorResponse;
};

// ---------------------------------------------------------------------------
// Route: GET /api/auth/me
// ---------------------------------------------------------------------------
/**
 * Returns a fresh access token if a valid session exists.
 * Called on every page load to rehydrate the client's in-memory token.
 * Internally delegates to the same logic as /api/auth/refresh.
 *
 * Success response: 200 AccessTokenResponse
 * Error response: 401 AuthErrorResponse { code: 'NO_SESSION' }
 *   → client treats user as unauthenticated; no redirect, no error shown
 */
export type GoogleAuthMeRoute = {
  method: 'GET';
  path: '/api/auth/me';
  successResponse: AccessTokenResponse;
  errorResponse: AuthErrorResponse;
};

// ---------------------------------------------------------------------------
// Route: POST /api/auth/revoke
// ---------------------------------------------------------------------------
/**
 * Revokes the user's Google OAuth session ("Disconnect Google Drive").
 *
 * Server-side actions:
 * 1. Read `arch-atlas-refresh` cookie.
 * 2. POST the token to `https://oauth2.googleapis.com/revoke` (server-to-server;
 *    bypasses browser CORS restrictions on the revoke endpoint).
 * 3. Clear the `arch-atlas-refresh` cookie regardless of revoke outcome.
 * 4. Return 200.
 *
 * Note: Revocation propagation at Google can take ~1 second; the client
 * MUST drop the in-memory access token immediately on success and not make
 * further Drive API calls.
 *
 * Success response: 200 { success: true }
 * Error response: 500 AuthErrorResponse (cookie still cleared; client should
 *   still drop in-memory state)
 */
export type GoogleAuthRevokeRoute = {
  method: 'POST';
  path: '/api/auth/revoke';
  body: never;
  successResponse: { success: true };
  errorResponse: AuthErrorResponse;
};

// ---------------------------------------------------------------------------
// Cookie specifications (for implementation reference)
// ---------------------------------------------------------------------------

export const REFRESH_TOKEN_COOKIE = {
  name: 'arch-atlas-refresh',
  options: {
    httpOnly: true,
    secure: true, // HTTPS only (enforced in production)
    sameSite: 'strict' as const,
    path: '/api/auth', // Scoped to auth routes only
    maxAge: 60 * 60 * 24 * 180, // 180 days
  },
} as const;

export const OAUTH_STATE_COOKIE = {
  name: 'arch-atlas-oauth-state',
  options: {
    httpOnly: true,
    secure: true,
    sameSite: 'strict' as const,
    path: '/api/auth/callback',
    maxAge: 600, // 10 minutes
  },
} as const;
