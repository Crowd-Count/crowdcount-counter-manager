import { NextResponse, type NextRequest } from "next/server";

/**
 * Generates a per-request CSP nonce and sets a strict Content-Security-Policy
 * header.  Next.js 14+ reads the nonce from the CSP header and automatically
 * applies it to its own inline <script> tags.
 *
 * `'strict-dynamic'` lets scripts loaded by nonced scripts (e.g. dynamic
 * imports, MapKit JS) execute without explicit host allowlisting in CSP3
 * browsers.  Older browsers fall back to the host allowlist.
 */
export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://cdn.apple-mapkit.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.cdnfonts.com",
    "connect-src 'self' https://api.crowdcount.tech https://api-staging.crowdcount.tech https://cdn.apple-mapkit.com https://*.apple-mapkit.com",
    "worker-src 'self' blob:",
    "img-src 'self' data: blob: https://cdn.apple-mapkit.com https://*.apple-mapkit.com",
    "font-src 'self' https://fonts.cdnfonts.com",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  // Forward the nonce to server components via a request header
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  response.headers.set("Content-Security-Policy", csp);

  return response;
}

export const config = {
  matcher: [
    // Apply to all routes except static assets & images
    "/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.ico$).*)",
  ],
};
