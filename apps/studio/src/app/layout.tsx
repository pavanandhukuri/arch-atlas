import './globals.css';
import type { Metadata } from 'next';
import { ClientProviders } from '../components/ClientProviders';

export const metadata: Metadata = {
  title: 'Arch Atlas Studio',
  description: 'Interactive architecture modeling platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ClientProviders clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ''}>
          {children}
        </ClientProviders>
      </body>
    </html>
  );
}
