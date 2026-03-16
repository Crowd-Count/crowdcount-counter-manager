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
              "connect-src 'self' https://api.crowdcount.tech https://api-staging.crowdcount.tech https://cdn.apple-mapkit.com",
              "img-src 'self' data: blob: https://cdn.apple-mapkit.com https://*.apple-mapkit.com",
              "font-src 'self' https://fonts.cdnfonts.com",
              "frame-ancestors 'none'",
              "upgrade-insecure-requests",
            ].join('; '),
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
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
