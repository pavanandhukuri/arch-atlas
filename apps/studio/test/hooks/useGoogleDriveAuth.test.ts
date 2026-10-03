import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

interface GoogleLoginOptions {
  onSuccess: (response: { access_token: string }) => void;
  onError: (error: { error_description?: string }) => void;
  onNonOAuthError: () => void;
  scope: string;
}

let capturedOptions: GoogleLoginOptions | null = null;
const login = vi.fn();

vi.mock('@react-oauth/google', () => ({
  useGoogleLogin: (options: GoogleLoginOptions) => {
    capturedOptions = options;
    return login;
  },
}));

import { useGoogleDriveAuth } from '../../src/hooks/useGoogleDriveAuth';

describe('useGoogleDriveAuth', () => {
  beforeEach(() => {
    capturedOptions = null;
    login.mockClear();
  });

  it('starts unauthenticated with no token', () => {
    const { result } = renderHook(() => useGoogleDriveAuth());
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.accessToken).toBeNull();
  });

  it('authorize opens the popup (isLoading true) and invokes the login trigger', () => {
    const { result } = renderHook(() => useGoogleDriveAuth());
    act(() => result.current.authorize());
    expect(login).toHaveBeenCalledOnce();
    expect(result.current.isLoading).toBe(true);
  });

  it('requests Drive appdata scope', () => {
    renderHook(() => useGoogleDriveAuth());
    expect(capturedOptions?.scope).toBe('https://www.googleapis.com/auth/drive.appdata');
  });

  it('onSuccess stores the access token and clears loading/error state', () => {
    const { result } = renderHook(() => useGoogleDriveAuth());
    act(() => result.current.authorize());

    act(() => capturedOptions!.onSuccess({ access_token: 'tok-123' }));

    expect(result.current.accessToken).toBe('tok-123');
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.authError).toBeNull();
  });

  it('onError surfaces the error message and clears loading', () => {
    const { result } = renderHook(() => useGoogleDriveAuth());
    act(() => result.current.authorize());

    act(() => capturedOptions!.onError({ error_description: 'popup blocked' }));

    expect(result.current.authError).toBe('popup blocked');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('onError without a description falls back to a generic message', () => {
    const { result } = renderHook(() => useGoogleDriveAuth());
    act(() => capturedOptions!.onError({}));
    expect(result.current.authError).toBe('Sign-in failed');
  });

  it('onNonOAuthError (popup closed/blocked) just clears loading, with no error message', () => {
    const { result } = renderHook(() => useGoogleDriveAuth());
    act(() => result.current.authorize());

    act(() => capturedOptions!.onNonOAuthError());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.authError).toBeNull();
  });

  it('revoke clears the in-memory token', () => {
    const { result } = renderHook(() => useGoogleDriveAuth());
    act(() => capturedOptions!.onSuccess({ access_token: 'tok-123' }));
    expect(result.current.isAuthenticated).toBe(true);

    act(() => result.current.revoke());

    expect(result.current.accessToken).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });
});
