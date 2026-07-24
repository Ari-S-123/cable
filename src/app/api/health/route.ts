import { NextResponse } from "next/server";

import { BaseEnvironmentSchema } from "@/lib/env/schema";

/** Returns only redacted build/readiness state and never probes live vendors. */
export function GET(): NextResponse {
  const parsed = BaseEnvironmentSchema.safeParse(process.env);
  return NextResponse.json(
    {
      status: parsed.success ? "ok" : "misconfigured",
      integrationMode: parsed.success
        ? parsed.data.INTEGRATION_MODE
        : "unknown",
      externalActionsEnabled:
        parsed.success && parsed.data.EXTERNAL_ACTIONS_ENABLED,
      syntheticOnly: !parsed.success || parsed.data.DEMO_MODE,
      timestamp: new Date().toISOString(),
    },
    {
      status: parsed.success ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
