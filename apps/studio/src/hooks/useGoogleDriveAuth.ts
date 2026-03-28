'use client';

/**
 * useGoogleDriveAuth — Google Drive auth via popup OAuth (no page redirect).
 *
 * Uses @react-oauth/google's useGoogleLogin hook which opens a popup window
 * and returns an access token directly — no server-side routes needed.
 * Token is held in memory only; user re-authenticates each session.
 *
 * Feature: 002-flexible-storage
 */

import { useState, useCallback } from 'react';
import { useGoogleLogin } from '@react-oauth/google';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

export interface GoogleDriveAuthState {
  accessToken: string | null;
  isAuthenticated: boolean;
  /** Opens the Google sign-in popup */
  authorize: () => void;
  /** Clears the in-memory token */
  revoke: () => Promise<void>;
  /** True while the OAuth popup is in progress */
  isLoading: boolean;
  /** Error message if sign-in failed */
  authError: string | null;
}

export function useGoogleDriveAuth(): GoogleDriveAuthState {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const login = useGoogleLogin({
    onSuccess: (tokenResponse) => {
      setAccessToken(tokenResponse.access_token);
      setIsLoading(false);
      setAuthError(null);
    },
    onError: (error) => {
      setAuthError(error.error_description ?? 'Sign-in failed');
      setIsLoading(false);
    },
    onNonOAuthError: () => {
      // User closed the popup or blocked it
      setIsLoading(false);
    },
    scope: DRIVE_SCOPE,
  });

  const authorize = useCallback(() => {
    setIsLoading(true);
    setAuthError(null);
    login();
  }, [login]);

  const revoke = useCallback(() => {
    setAccessToken(null);
  }, []);

  return {
    accessToken,
    isAuthenticated: accessToken !== null,
    authorize,
    revoke,
    isLoading,
    authError,
  };
}
