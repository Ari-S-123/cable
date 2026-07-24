import {
  applyResponseHeaders,
  authkit,
  handleAuthkitProxy,
  partitionAuthkitHeaders,
} from "@workos-inc/authkit-nextjs";
import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";

import { routing } from "@/i18n/routing";

const routeLocale = createMiddleware(routing);
const protectedRoute = /^\/(?:en-US|hi-IN)\/(?:elder|caregiver)(?:\/|$)/u;
const protectedApiRoute =
  /^\/api\/(?:copilotkit|elevenlabs\/signed-url)(?:\/|$)/u;
const authRoute = /^\/(?:login|callback|logout)(?:\/|$)/u;

/** Combines trusted locale routing with optional live AuthKit session handling. */
export default async function proxy(request: NextRequest) {
  const isApiRoute = request.nextUrl.pathname.startsWith("/api/");
  const isProtectedApiRoute = protectedApiRoute.test(request.nextUrl.pathname);
  const isAuthRoute = authRoute.test(request.nextUrl.pathname);
  const locale = request.nextUrl.pathname.split("/")[1];
  const baseHeaders = new Headers(request.headers);
  if (locale === "en-US" || locale === "hi-IN")
    baseHeaders.set("x-cable-locale", locale);

  if (process.env.INTEGRATION_MODE !== "live") {
    if (isApiRoute) return NextResponse.next();
    if (isAuthRoute) return NextResponse.next();
    return routeLocale(new NextRequest(request, { headers: baseHeaders }));
  }

  const {
    session,
    headers: authkitHeaders,
    authorizationUrl,
  } = await authkit(request);
  if (
    (protectedRoute.test(request.nextUrl.pathname) || isProtectedApiRoute) &&
    !session.user &&
    authorizationUrl
  ) {
    return handleAuthkitProxy(request, authkitHeaders, {
      redirect: authorizationUrl,
    });
  }
  const { requestHeaders, responseHeaders } = partitionAuthkitHeaders(
    request,
    authkitHeaders,
  );
  if (isApiRoute || isAuthRoute) {
    return applyResponseHeaders(
      NextResponse.next({ request: { headers: requestHeaders } }),
      responseHeaders,
    );
  }
  if (locale === "en-US" || locale === "hi-IN")
    requestHeaders.set("x-cable-locale", locale);
  const localizedResponse = routeLocale(
    new NextRequest(request, { headers: requestHeaders }),
  );
  return applyResponseHeaders(localizedResponse, responseHeaders);
}

/** Matches application routes while excluding static assets and metadata files. */
export const config = {
  matcher: [
    "/api/copilotkit/:path*",
    "/api/elevenlabs/signed-url",
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)",
  ],
};
