'use client';

import { GoogleOAuthProvider } from '@react-oauth/google';

export function ClientProviders({
  clientId,
  children,
}: {
  clientId: string;
  children: React.ReactNode;
}) {
  return <GoogleOAuthProvider clientId={clientId}>{children}</GoogleOAuthProvider>;
}
