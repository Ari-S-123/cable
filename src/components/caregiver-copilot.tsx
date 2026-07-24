"use client";

import "@copilotkit/react-ui/styles.css";

import {
  CopilotKit,
  useCopilotReadable,
  useFrontendTool,
} from "@copilotkit/react-core";
import { CopilotSidebar } from "@copilotkit/react-ui";
import type { ReactNode } from "react";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Consent-filtered workspace state exposed to the caregiver assistant. */
export type CareWorkspaceState = Readonly<{
  careEventId: string;
  eventVersion: number;
  consentCoverage: Readonly<{
    status: "covered" | "missing" | "expired" | "revoked";
    recipientLabels: readonly string[];
    channels: readonly ("in_app" | "email" | "sms")[];
  }>;
  proposals: readonly Readonly<{
    id: string;
    version: number;
    title: string;
    effect: string;
    status:
      "awaiting_approval" | "approved" | "queued" | "completed" | "failed";
  }>[];
}>;

const ActionCardInputSchema = z
  .object({
    title: z.string().min(1).max(120),
    effect: z.string().min(1).max(500),
    recipient: z.string().min(1).max(160),
    channel: z.enum(["in_app", "email", "sms"]),
  })
  .strict();

type ActionCardParameters = [
  { name: "title"; type: "string"; description: string; required: true },
  { name: "effect"; type: "string"; description: string; required: true },
  { name: "recipient"; type: "string"; description: string; required: true },
  {
    name: "channel";
    type: "string";
    description: string;
    required: true;
    enum: ["in_app", "email", "sms"];
  },
];

const actionCardParameters: ActionCardParameters = [
  {
    name: "title",
    type: "string",
    description: "Visible action title",
    required: true,
  },
  {
    name: "effect",
    type: "string",
    description: "What the action would do",
    required: true,
  },
  {
    name: "recipient",
    type: "string",
    description: "Consent-covered recipient",
    required: true,
  },
  {
    name: "channel",
    type: "string",
    description: "Consent-covered delivery channel",
    required: true,
    enum: ["in_app", "email", "sms"],
  },
];

type EditParameters = [
  { name: "proposalId"; type: "string"; description: string; required: true },
  {
    name: "requestedChange";
    type: "string";
    description: string;
    required: true;
  },
];

const editParameters: EditParameters = [
  {
    name: "proposalId",
    type: "string",
    description: "Immutable proposal aggregate ID",
    required: true,
  },
  {
    name: "requestedChange",
    type: "string",
    description: "Requested bounded edit",
    required: true,
  },
];

/** Registers proposal-only tools; none can execute Resend, Twilio, or outbox work. */
function CaregiverTools({
  workspace,
}: Readonly<{ workspace: CareWorkspaceState }>) {
  useCopilotReadable({
    description:
      "Current consent-filtered care workspace. It contains no transcript or unconsented detail.",
    value: workspace,
  });
  useFrontendTool<ActionCardParameters>(
    {
      name: "show_action_option",
      description:
        "Render a typed action option already present in the consent-filtered workspace.",
      parameters: actionCardParameters,
      handler: async (input) => ({
        displayed: true,
        requiresExplicitApproval: true,
        input: ActionCardInputSchema.parse(input),
      }),
      render: ({ args, status }) => (
        <Card className="my-2 border-primary/25">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>{args.title ?? "Action option"}</CardTitle>
              <Badge variant="outline">{status}</Badge>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <p>{args.effect}</p>
            <p className="text-muted-foreground">
              {args.recipient} · {args.channel}
            </p>
            <p className="font-medium text-primary">
              Explicit caregiver approval is still required.
            </p>
          </CardContent>
        </Card>
      ),
    },
    [workspace],
  );
  useFrontendTool<EditParameters>(
    {
      name: "request_proposal_edit",
      description:
        "Request an edit that creates a new immutable proposal version; it never approves or sends.",
      parameters: editParameters,
      handler: async (input) => ({
        ...z
          .object({
            proposalId: z.string().min(1),
            requestedChange: z.string().max(500),
          })
          .strict()
          .parse(input),
        status: "new_version_required",
        approvalInvalidated: true,
      }),
    },
    [workspace],
  );
  return null;
}

/** Adds the live, authenticated CopilotKit sidebar around caregiver content. */
export function CaregiverCopilot({
  enabled,
  workspace,
  children,
}: Readonly<{
  enabled: boolean;
  workspace: CareWorkspaceState;
  children: ReactNode;
}>) {
  if (!enabled) return children;
  return (
    <CopilotKit
      runtimeUrl="/api/copilotkit"
      credentials="include"
      agent="default"
      enableInspector={false}
      showDevConsole={false}
    >
      <CaregiverTools workspace={workspace} />
      <CopilotSidebar
        labels={{
          title: "C.A.B.L.E assistant",
          initial:
            "I can explain the current consent-scoped update, preview an option, or request an edit. I cannot send a message.",
        }}
        clickOutsideToClose
      >
        {children}
      </CopilotSidebar>
    </CopilotKit>
  );
}
