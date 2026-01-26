import './globals.css';
import type { Metadata } from 'next';

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
      <body>{children}</body>
    </html>
  );
}
