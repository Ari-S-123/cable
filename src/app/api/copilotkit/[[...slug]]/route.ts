import { withAuth } from "@workos-inc/authkit-nextjs";
import {
  BuiltInAgent,
  CopilotRuntime,
  convertMessagesToVercelAISDKMessages,
  convertToolsToVercelAITools,
  createCopilotRuntimeHandler,
} from "@copilotkit/runtime/v2";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

import { getServerEnvironment } from "@/lib/env/server";
import { validateOrigin } from "@/lib/security/origin";

type RuntimeHandler = (request: Request) => Promise<Response>;
let runtimeHandler: RuntimeHandler | undefined;

/** Lazily creates a proposal-only CopilotKit runtime using Fireworks. */
function getRuntimeHandler(apiKey: string, modelId: string): RuntimeHandler {
  if (runtimeHandler !== undefined) return runtimeHandler;
  const fireworks = createOpenAI({
    apiKey,
    baseURL: "https://api.fireworks.ai/inference/v1",
    name: "fireworks",
  });
  const agent = new BuiltInAgent({
    type: "aisdk",
    factory: ({ input, abortSignal }) => {
      const messages = convertMessagesToVercelAISDKMessages(input.messages);
      const tools = convertToolsToVercelAITools(input.tools);
      return streamText({
        model: fireworks.chat(modelId),
        messages,
        tools,
        abortSignal,
        maxOutputTokens: 800,
        temperature: 0.1,
        system:
          "You are C.A.B.L.E's caregiver coordination assistant. Use only the consent-filtered state supplied by the server. You may explain, open, preview, or request an edit to an allow-listed proposal. Never infer consent, add facts or recipients, provide medical advice, expose private transcripts, or call messaging providers. External sends occur only through Convex approval and outbox policy gates.",
      });
    },
  });
  const runtime = new CopilotRuntime({ agents: { default: agent } });
  runtimeHandler = createCopilotRuntimeHandler({
    runtime,
    basePath: "/api/copilotkit",
    cors: false,
  });
  return runtimeHandler;
}

/** Authenticates and origin-checks every CopilotKit request before model access. */
async function handle(request: Request): Promise<Response> {
  const environment = getServerEnvironment();
  if (request.method !== "GET") {
    const origin = validateOrigin(request, environment.NEXT_PUBLIC_APP_URL);
    if (!origin.allowed) {
      return Response.json(
        { code: "FORBIDDEN", message: "Request origin was rejected." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
  }
  if (environment.INTEGRATION_MODE !== "live") {
    return Response.json(
      {
        code: "LIVE_CONFIGURATION_REQUIRED",
        message: "The synthetic demo uses its local typed workspace.",
      },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }
  const session = await withAuth();
  if (!session.user || session.organizationId === undefined) {
    return Response.json(
      {
        code: "AUTH_REQUIRED",
        message: "An authenticated caregiver session is required.",
      },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  return getRuntimeHandler(
    environment.FIREWORKS_API_KEY,
    environment.FIREWORKS_MODEL_ID,
  )(request);
}

export const GET = handle;
export const POST = handle;
export const OPTIONS = handle;
