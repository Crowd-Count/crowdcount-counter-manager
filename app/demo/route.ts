import { NextResponse, type NextRequest } from "next/server";

const COOKIE_NAME = "demo";
const COOKIE_MAX_AGE = 12 * 60 * 60; // seconds

/**
 * GET /demo — start the demo and land on the dashboard.
 *
 * This is a server route on purpose. It used to be a client page that set
 * the flags in an effect and then navigated; if anything stopped that effect
 * from running — a blocked bundle, refused storage inside an embedded frame,
 * a hydration failure — the visitor sat on "Loading demo..." with no way
 * forward. A redirect needs no JavaScript at all.
 *
 * Two signals, because either can be refused where the demo is embedded:
 * the cookie (Partitioned over https, so browsers that block third-party
 * cookies still keep it) and `?demo=1` on the destination. The client latches
 * whichever arrives, and the dashboard seeds its fleet on first read.
 */
export function GET(req: NextRequest) {
  const secure = (req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")) === "https";

  // A RELATIVE Location, resolved by the browser against the address it
  // actually asked for. NextResponse.redirect() needs an absolute URL, and on
  // Netlify req.url carries the internal deploy host, so a visitor to
  // counter.crowdcount.tech/demo gets bounced to
  // <deploy>--crowdcount-counter-manager.netlify.app — a different origin,
  // where the cookie just set does not apply.
  const res = new NextResponse(null, {
    status: 307,
    headers: { Location: "/dashboard?demo=1" },
  });
  res.cookies.set(COOKIE_NAME, "1", {
    path: "/",
    maxAge: COOKIE_MAX_AGE,
    // SameSite=None needs Secure, and Partitioned needs both; on plain http
    // (local `next start`) fall back to Lax and let ?demo=1 carry it.
    sameSite: secure ? "none" : "lax",
    secure,
    partitioned: secure,
  });
  return res;
}
