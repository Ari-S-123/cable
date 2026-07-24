import { createHash, randomBytes } from "node:crypto";

import { withAuth } from "@workos-inc/authkit-nextjs";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdapters } from "@/lib/adapters/registry";
import { getServerEnvironment } from "@/lib/env/server";
import { FixedWindowRateLimiter } from "@/lib/security/rate-limit";
import { validateOrigin } from "@/lib/security/origin";

const limiter = new FixedWindowRateLimiter({ limit: 6, windowMs: 60_000 });
const requestSchema = z.object({ locale: z.enum(["en-US", "hi-IN"]) }).strict();
const contextSchema = z
  .object({
    careCircleId: z.string().min(1),
    user: z
      .object({ id: z.string().min(1), role: z.literal("elder") })
      .passthrough(),
  })
  .passthrough();
const contextReference = makeFunctionReference<"query">(
  "careCircles:getCurrentCareContext",
);
const reserveVoiceSessionReference = makeFunctionReference<"mutation">(
  "voiceSessions:reserve",
);

/** Creates a short-lived private voice URL only after live elder authorization. */
export async function POST(request: Request): Promise<NextResponse> {
  const environment = getServerEnvironment();
  const origin = validateOrigin(request, environment.NEXT_PUBLIC_APP_URL);
  if (!origin.allowed) {
    return NextResponse.json(
      { code: "FORBIDDEN", message: "Request origin was rejected." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (environment.INTEGRATION_MODE !== "live") {
    return NextResponse.json(
      {
        code: "LIVE_CONFIGURATION_REQUIRED",
        message: "The synthetic demo does not open vendor sessions.",
      },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }
  const session = await withAuth();
  if (
    !session.user ||
    session.accessToken === undefined ||
    session.organizationId === undefined
  ) {
    return NextResponse.json(
      {
        code: "AUTH_REQUIRED",
        message: "An authenticated elder session is required.",
      },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const allowance = limiter.consume(session.user.id);
  if (!allowance.allowed) {
    return NextResponse.json(
      {
        code: "RATE_LIMITED",
        message: "Too many voice sessions were requested.",
      },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(
            Math.ceil((allowance.resetAt - Date.now()) / 1000),
          ),
        },
      },
    );
  }
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    rawBody = undefined;
  }
  const parsedBody = requestSchema.safeParse(rawBody);
  if (!parsedBody.success || environment.NEXT_PUBLIC_CONVEX_URL === undefined) {
    return NextResponse.json(
      {
        code: "INVALID_REQUEST",
        message: "The care-circle request is invalid.",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const convex = new ConvexHttpClient(environment.NEXT_PUBLIC_CONVEX_URL);
  convex.setAuth(session.accessToken);
  const context = contextSchema.safeParse(
    await convex.query(contextReference, {}),
  );
  if (!context.success || context.data.user.role !== "elder") {
    return NextResponse.json(
      { code: "FORBIDDEN", message: "The care-circle request was denied." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  const nonce = randomBytes(24).toString("base64url");
  await convex.mutation(reserveVoiceSessionReference, {
    careCircleId: context.data.careCircleId,
    nonceHash: createHash("sha256").update(nonce).digest("hex"),
    locale: parsedBody.data.locale,
  });
  const result = await (
    await getAdapters()
  ).voice.createSignedSession({
    agentId: environment.ELEVENLABS_AGENT_ID,
    nonce,
  });
  if (!result.ok) {
    return NextResponse.json(
      { code: "TEMPORARILY_UNAVAILABLE", message: result.error.message },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(
    { ...result.value, sessionNonce: nonce },
    {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
