import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, computeSessionToken, gateEnabled } from "@/lib/auth";

export default async function proxy(request: NextRequest) {
  // No password configured — this is a local/dev deployment, let it through
  // untouched rather than locking someone out of their own machine.
  if (!gateEnabled()) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const expected = await computeSessionToken(process.env.SITE_PASSWORD as string);

  if (token === expected) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!login|api/health|_next/static|_next/image|favicon.ico).*)"],
};
