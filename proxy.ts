import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { guestRegex, isDevelopmentEnvironment } from "./lib/constants";

const BOTID_PREFIX =
  "/149e9513-01fa-4fb0-aad4-566afd725d1b/2d206a39-8ed7-437e-a3be-862e0f06eea3";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith(BOTID_PREFIX)) {
    const suffix = pathname.slice(BOTID_PREFIX.length);
    if (suffix === "/a-4-a/c.js") {
      return NextResponse.rewrite(
        new URL(
          `https://api.vercel.com/bot-protection/v1/challenge${request.nextUrl.search}`,
        ),
      );
    }
    return NextResponse.rewrite(
      new URL(
        `https://api.vercel.com/bot-protection/v1/proxy${suffix}${request.nextUrl.search}`,
      ),
    );
  }

  if (pathname.startsWith("/ping")) {
    return new Response("pong", { status: 200 });
  }

  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: !isDevelopmentEnvironment,
  });

  if (!token) {
    const redirectUrl = encodeURIComponent(request.url);
    const url = request.nextUrl.clone();
    url.pathname = "/api/auth/guest";
    url.search = `?redirectUrl=${redirectUrl}`;

    return NextResponse.redirect(url);
  }

  const isGuest = guestRegex.test(token?.email ?? "");

  if (token && !isGuest && ["/login", "/register"].includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/chat/:id",
    "/api/:path*",
    "/login",
    "/register",

    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
