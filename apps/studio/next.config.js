/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV === 'development';

const ContentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' https://accounts.google.com 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "connect-src 'self' https://oauth2.googleapis.com https://www.googleapis.com https://accounts.google.com",
  'frame-src https://accounts.google.com',
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self'",
].join('; ');

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: ContentSecurityPolicy,
  },
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    // Required for @react-oauth/google popup flow:
    // allows the Google OAuth popup to communicate window.closed back to this page.
    key: 'Cross-Origin-Opener-Policy',
    value: 'same-origin-allow-popups',
  },
];

const nextConfig = {
  // `next dev` and `next build` used to share `.next`, so running a production
  // build (e.g. `turbo run build`) while the dev server was up overwrote its
  // output and the page loaded with every stylesheet 404ing. Dev gets its own
  // directory; production (and Vercel) still uses the default `.next`.
  distDir: isDev ? '.next-dev' : '.next',
  reactStrictMode: true,
  transpilePackages: [
    '@archatlas/core-model',
    '@archatlas/layout',
    '@archatlas/renderer',
    '@archatlas/viewer-components',
  ],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
