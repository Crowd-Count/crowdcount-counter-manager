// `upgrade-insecure-requests` rewrites every http:// subresource to https://.
// Chrome exempts localhost from that; Safari does not, so a production build
// served over plain http there upgrades its own bundles, each one fails TLS,
// and the page renders unstyled and never finishes booting. Set LOCAL_HTTP=1
// when running `next start` over http locally to drop the directive — never on
// a deployment, where serving everything over TLS is the point of it.
const localHttp = process.env.LOCAL_HTTP === '1';

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://cdn.apple-mapkit.com",
              "style-src 'self' 'unsafe-inline' https://fonts.cdnfonts.com",
              "connect-src 'self' https://api.crowdcount.tech https://api-staging.crowdcount.tech https://cdn.apple-mapkit.com https://*.apple-mapkit.com",
              "worker-src 'self' blob:",
              "img-src 'self' data: blob: https://cdn.apple-mapkit.com https://*.apple-mapkit.com",
              "font-src 'self' https://fonts.cdnfonts.com",
              // Allow embedding (e.g. the /demo route) only from these origins.
              // X-Frame-Options is intentionally omitted: it cannot express an allowlist.
              "frame-ancestors 'self' https://elkanbruha.com http://localhost:5173",
              ...(localHttp ? [] : ['upgrade-insecure-requests']),
            ].join('; '),
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
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
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), payment=(), usb=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
