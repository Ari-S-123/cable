"use client";

import {
  Activity,
  CheckCircle2,
  CircleAlert,
  Inbox,
  Mail,
  Phone,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useAction,
  useMutation,
  useQuery,
} from "convex/react";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { NavigationItem } from "@/components/app-navigation";
import { AppShell } from "@/components/app-shell";
import {
  CaregiverCopilot,
  type CareWorkspaceState,
} from "@/components/caregiver-copilot";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/lib/contracts";

type PendingOperation = string | undefined;

/** Converts unknown Convex or vendor errors into a bounded user-facing message. */
function publicError(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message.slice(0, 300);
  }
  return "The requested operation could not be completed.";
}

/** Maps durable proposal states into the narrower Copilot-readable contract. */
function copilotProposalStatus(
  status: string,
): CareWorkspaceState["proposals"][number]["status"] {
  if (status === "awaiting_approval") return "awaiting_approval";
  if (status === "approved") return "approved";
  if (status === "queued" || status === "executing") return "queued";
  if (status === "completed") return "completed";
  return "failed";
}

/** Formats one epoch timestamp without placing locale-sensitive dates in Convex. */
function formattedTime(value: number, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

/** Authenticated caregiver dashboard backed by live Convex subscriptions. */
function CaregiverWorkspaceContent({
  locale,
  items,
  globalActionsEnabled,
  twilioEnabled,
}: Readonly<{
  locale: Locale;
  items: readonly NavigationItem[];
  globalActionsEnabled: boolean;
  twilioEnabled: boolean;
}>) {
  const context = useQuery(api.careCircles.getCurrentCareContext);
  const careCircleId = context?.careCircleId;
  const contacts = useQuery(
    api.providerContacts.list,
    careCircleId === undefined ? "skip" : { careCircleId },
  );
  const events = useQuery(
    api.careEvents.listVisible,
    careCircleId === undefined ? "skip" : { careCircleId },
  );
  const proposalResults = useQuery(
    api.actionProposals.listForReview,
    careCircleId === undefined ? "skip" : { careCircleId },
  );
  const notifications = useQuery(
    api.notifications.listVisible,
    careCircleId === undefined ? "skip" : { careCircleId },
  );
  const setCircleActions = useMutation(
    api.careCircles.setExternalActionsEnabled,
  );
  const upsertContact = useMutation(api.providerContacts.upsertAllowListed);
  const disableContact = useMutation(api.providerContacts.disable);
  const decideProposal = useMutation(api.actionProposals.decide);
  const validateProposal = useAction(api.policyValidations.validateApproved);
  const queueProposal = useMutation(api.notifications.queueApproved);

  const [pending, setPending] = useState<PendingOperation>();
  const [contactName, setContactName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const proposals = useMemo(
    () => proposalResults?.filter((proposal) => proposal !== undefined) ?? [],
    [proposalResults],
  );
  const workspace = useMemo<CareWorkspaceState>(() => {
    const latestEvent = events?.[0];
    return {
      careEventId: latestEvent?.id ?? "none",
      eventVersion: latestEvent?.version ?? 0,
      consentCoverage:
        latestEvent?.consent === undefined
          ? { status: "missing", recipientLabels: [], channels: [] }
          : {
              status: "covered",
              recipientLabels: latestEvent.consent.recipientLabels,
              channels: latestEvent.consent.channels.filter(
                (channel): channel is "in_app" | "email" | "sms" =>
                  channel === "in_app" ||
                  channel === "email" ||
                  channel === "sms",
              ),
            },
      proposals: proposals.map((proposal) => ({
        id: proposal.id,
        version: proposal.version,
        title:
          "actionType" in proposal
            ? proposal.actionType.replaceAll("_", " ")
            : "Waiting for elder",
        effect:
          "explanation" in proposal
            ? proposal.explanation
            : "Current consent is unavailable or expired.",
        status: copilotProposalStatus(proposal.status),
      })),
    };
  }, [events, proposals]);

  /** Runs one UI operation with consistent pending state and redacted errors. */
  const runOperation = async (
    key: string,
    operation: () => Promise<unknown>,
    successMessage: string,
  ): Promise<void> => {
    setPending(key);
    try {
      await operation();
      toast.success(successMessage);
    } catch (error: unknown) {
      toast.error(publicError(error));
    } finally {
      setPending(undefined);
    }
  };

  /** Creates an independently confirmed, environment-allow-listed provider contact. */
  const submitContact = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (careCircleId === undefined) return;
    const normalizedEmail = email.trim();
    const normalizedPhone = phone.trim();
    if (normalizedEmail.length === 0 && normalizedPhone.length === 0) {
      toast.error("Enter at least one provider email or phone number.");
      return;
    }
    await runOperation(
      "contact:create",
      async () =>
        upsertContact({
          careCircleId,
          displayName: contactName,
          organizationName,
          ...(normalizedEmail.length === 0 ? {} : { email: normalizedEmail }),
          ...(normalizedPhone.length === 0
            ? {}
            : { phoneE164: normalizedPhone }),
          verificationMethod: "manual_callback",
        }),
      "Provider contact saved.",
    );
    setContactName("");
    setOrganizationName("");
    setEmail("");
    setPhone("");
  };

  if (context === undefined) {
    return (
      <AppShell locale={locale} userRole="caregiver" items={items}>
        <Card>
          <CardContent className="flex min-h-48 items-center justify-center text-muted-foreground">
            Loading the authenticated care circle…
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  return (
    <CaregiverCopilot enabled workspace={workspace}>
      <AppShell locale={locale} userRole="caregiver" items={items}>
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Live caregiver workspace
            </p>
            <h1 className="mt-2 text-4xl sm:text-5xl">{context.displayName}</h1>
            <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
              Signed in as {context.user.displayName}. Every record below is
              filtered by active membership and current consent.
            </p>
          </div>
          <Badge variant="outline" className="border-primary/25 bg-card">
            <ShieldCheck aria-hidden="true" /> Live · consent-filtered
          </Badge>
        </div>

        {!globalActionsEnabled ? (
          <Alert className="mt-6" variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Global sending is disabled</AlertTitle>
            <AlertDescription>
              Set EXTERNAL_ACTIONS_ENABLED=true in both Next.js and Convex
              before attempting policy validation or delivery.
            </AlertDescription>
          </Alert>
        ) : undefined}

        <div className="mt-8 grid gap-5 sm:grid-cols-3">
          {[
            [
              "Needs review",
              proposals.filter((item) => item.status === "awaiting_approval")
                .length,
            ],
            ["Shared updates", events?.length ?? 0],
            [
              "Delivery attention",
              notifications?.filter((item) =>
                ["permanent_failure", "delivery_unknown"].includes(item.status),
              ).length ?? 0,
            ],
          ].map(([label, count]) => (
            <Card key={String(label)}>
              <CardContent className="flex items-center justify-between p-6">
                <div>
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="mt-1 font-display text-4xl">{count}</p>
                </div>
                <Inbox aria-hidden="true" className="size-6 text-primary" />
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>External-action control</CardTitle>
              <CardDescription>
                The global environment switch and this care-circle switch must
                both be enabled before any approved provider message can run.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-4">
              <div>
                <Badge
                  variant={
                    context.externalActionsEnabled ? "default" : "secondary"
                  }
                >
                  {context.externalActionsEnabled ? "Enabled" : "Disabled"}
                </Badge>
                <p className="mt-2 text-sm text-muted-foreground">
                  {twilioEnabled
                    ? "Email and approved SMS channels are available."
                    : "Resend email only; Twilio is disabled."}
                </p>
              </div>
              <Button
                variant={
                  context.externalActionsEnabled ? "destructive" : "default"
                }
                disabled={pending !== undefined}
                onClick={() =>
                  void runOperation(
                    "circle:toggle",
                    async () =>
                      setCircleActions({
                        careCircleId: context.careCircleId,
                        enabled: !context.externalActionsEnabled,
                      }),
                    `External actions ${context.externalActionsEnabled ? "disabled" : "enabled"}.`,
                  )
                }
              >
                {context.externalActionsEnabled ? "Disable" : "Enable"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Add verified provider</CardTitle>
              <CardDescription>
                The destination must already appear in the corresponding
                APPROVED_PROVIDER allow-list in Convex.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(event) => void submitContact(event)}>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="provider-name">
                      Contact name
                    </FieldLabel>
                    <Input
                      id="provider-name"
                      required
                      minLength={2}
                      maxLength={120}
                      value={contactName}
                      onChange={(event) => setContactName(event.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="provider-organization">
                      Organization
                    </FieldLabel>
                    <Input
                      id="provider-organization"
                      required
                      minLength={2}
                      maxLength={160}
                      value={organizationName}
                      onChange={(event) =>
                        setOrganizationName(event.target.value)
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="provider-email">Email</FieldLabel>
                    <Input
                      id="provider-email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="provider@example.com"
                    />
                  </Field>
                  {twilioEnabled ? (
                    <Field>
                      <FieldLabel htmlFor="provider-phone">
                        SMS number
                      </FieldLabel>
                      <Input
                        id="provider-phone"
                        type="tel"
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        placeholder="+14155550123"
                      />
                    </Field>
                  ) : undefined}
                  <Button
                    type="submit"
                    disabled={pending !== undefined}
                    className="w-full"
                  >
                    <Plus aria-hidden="true" /> Save verified provider
                  </Button>
                </FieldGroup>
              </form>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Verified providers</CardTitle>
            <CardDescription>
              Only masked destinations are returned to the browser.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {contacts?.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No verified provider contacts yet.
              </p>
            ) : (
              contacts?.map((contact) => (
                <div
                  key={contact.id}
                  className="flex items-center justify-between gap-4 rounded-2xl border p-4"
                >
                  <div>
                    <p className="font-semibold">{contact.displayName}</p>
                    <p className="text-sm text-muted-foreground">
                      {contact.organizationName}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {contact.emailLabel === undefined ? undefined : (
                        <Badge variant="outline">
                          <Mail aria-hidden="true" /> {contact.emailLabel}
                        </Badge>
                      )}
                      {contact.phoneLabel === undefined ? undefined : (
                        <Badge variant="outline">
                          <Phone aria-hidden="true" /> {contact.phoneLabel}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Disable ${contact.displayName}`}
                    disabled={pending !== undefined}
                    onClick={() =>
                      void runOperation(
                        `contact:${contact.id}`,
                        async () =>
                          disableContact({
                            careCircleId: context.careCircleId,
                            providerContactId:
                              contact.id as Id<"providerContacts">,
                          }),
                        "Provider contact disabled.",
                      )
                    }
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Consent-shared updates</CardTitle>
            <CardDescription>
              Private turns and unconsented summaries are never returned here.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {events?.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No currently consented updates.
              </p>
            ) : (
              events?.map((event) => (
                <div key={event.id} className="rounded-2xl border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Badge variant="secondary">{event.status}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {formattedTime(event.updatedAt, locale)}
                    </span>
                  </div>
                  <p className="mt-3 leading-7">{event.summary}</p>
                  {event.consent === undefined ? undefined : (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Consent: {event.consent.purpose.replaceAll("_", " ")} ·{" "}
                      {event.consent.channels.join(", ")}
                    </p>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Action proposals</CardTitle>
            <CardDescription>
              Approval binds to the exact version and payload hash shown by the
              server. Validation and queuing remain separate explicit steps.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {proposals.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No action proposals are waiting.
              </p>
            ) : (
              proposals.map((proposal) => (
                <div key={proposal.id} className="rounded-2xl border p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Badge>{proposal.status.replaceAll("_", " ")}</Badge>
                      <span className="text-xs text-muted-foreground">
                        Version {proposal.version}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formattedTime(proposal.updatedAt, locale)}
                    </span>
                  </div>
                  {proposal.payload !== undefined &&
                  proposal.actionType !== undefined &&
                  proposal.purpose !== undefined &&
                  proposal.recipient !== undefined &&
                  proposal.channel !== undefined &&
                  proposal.explanation !== undefined ? (
                    <>
                      <h3 className="mt-4 text-xl font-semibold capitalize">
                        {proposal.actionType.replaceAll("_", " ")}
                      </h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {proposal.recipient} · {proposal.channel} ·{" "}
                        {proposal.purpose.replaceAll("_", " ")}
                      </p>
                      {proposal.payload.subject === undefined ? undefined : (
                        <p className="mt-4 font-semibold">
                          {proposal.payload.subject}
                        </p>
                      )}
                      <p className="mt-2 whitespace-pre-wrap rounded-xl bg-muted/50 p-4 leading-7">
                        {proposal.payload.body}
                      </p>
                      <p className="mt-3 text-sm">{proposal.explanation}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {proposal.status === "awaiting_approval" ? (
                          <>
                            <Button
                              disabled={pending !== undefined}
                              onClick={() =>
                                void runOperation(
                                  `approve:${proposal.id}`,
                                  async () =>
                                    decideProposal({
                                      careCircleId: context.careCircleId,
                                      actionProposalId:
                                        proposal.id as Id<"actionProposals">,
                                      expectedVersion: proposal.version,
                                      expectedPayloadHash: proposal.payloadHash,
                                      decision: "approved",
                                    }),
                                  "Exact proposal version approved.",
                                )
                              }
                            >
                              <CheckCircle2 aria-hidden="true" /> Approve
                            </Button>
                            <Button
                              variant="outline"
                              disabled={pending !== undefined}
                              onClick={() =>
                                void runOperation(
                                  `reject:${proposal.id}`,
                                  async () =>
                                    decideProposal({
                                      careCircleId: context.careCircleId,
                                      actionProposalId:
                                        proposal.id as Id<"actionProposals">,
                                      expectedVersion: proposal.version,
                                      expectedPayloadHash: proposal.payloadHash,
                                      decision: "rejected",
                                    }),
                                  "Proposal rejected.",
                                )
                              }
                            >
                              <XCircle aria-hidden="true" /> Reject
                            </Button>
                          </>
                        ) : undefined}
                        {proposal.status === "approved" &&
                        proposal.validation?.decision !== "pass" ? (
                          <Button
                            variant="secondary"
                            disabled={pending !== undefined}
                            onClick={() =>
                              void runOperation(
                                `validate:${proposal.id}`,
                                async () =>
                                  validateProposal({
                                    careCircleId: context.careCircleId,
                                    actionProposalId:
                                      proposal.id as Id<"actionProposals">,
                                    expectedVersion: proposal.version,
                                    expectedPayloadHash: proposal.payloadHash,
                                  }),
                                "Policy validation completed.",
                              )
                            }
                          >
                            <ShieldCheck aria-hidden="true" /> Validate policy
                          </Button>
                        ) : undefined}
                        {proposal.status === "approved" &&
                        proposal.validation?.decision === "pass" ? (
                          <Button
                            disabled={pending !== undefined}
                            onClick={() =>
                              void runOperation(
                                `queue:${proposal.id}`,
                                async () =>
                                  queueProposal({
                                    careCircleId: context.careCircleId,
                                    actionProposalId:
                                      proposal.id as Id<"actionProposals">,
                                    expectedVersion: proposal.version,
                                    expectedPayloadHash: proposal.payloadHash,
                                  }),
                                "Approved message queued for delivery.",
                              )
                            }
                          >
                            <Send aria-hidden="true" /> Queue exact message
                          </Button>
                        ) : undefined}
                      </div>
                    </>
                  ) : (
                    <Alert className="mt-4">
                      <CircleAlert aria-hidden="true" />
                      <AlertTitle>Current elder consent required</AlertTitle>
                      <AlertDescription>
                        This proposal cannot be reviewed or executed until the
                        elder grants current, version-bound consent.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Delivery activity</CardTitle>
            <CardDescription>
              Provider identifiers and destinations remain redacted.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {notifications?.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No deliveries have been queued.
              </p>
            ) : (
              notifications?.map((notification) => (
                <div
                  key={notification.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
                >
                  <div className="flex items-center gap-3">
                    <Activity
                      aria-hidden="true"
                      className="size-5 text-primary"
                    />
                    <div>
                      <p className="font-medium">
                        {notification.recipientLabel}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {notification.channel} · attempt{" "}
                        {notification.attemptCount}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline">
                    {notification.status.replaceAll("_", " ")}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </AppShell>
    </CaregiverCopilot>
  );
}

/** Handles live authentication states before mounting authenticated Convex hooks. */
export function LiveCaregiverWorkspace({
  locale,
  items,
  globalActionsEnabled,
  twilioEnabled,
}: Readonly<{
  locale: Locale;
  items: readonly NavigationItem[];
  globalActionsEnabled: boolean;
  twilioEnabled: boolean;
}>) {
  return (
    <>
      <AuthLoading>
        <AppShell locale={locale} userRole="caregiver" items={items}>
          <Card>
            <CardContent className="flex min-h-48 items-center justify-center text-muted-foreground">
              Verifying the WorkOS and Convex session…
            </CardContent>
          </Card>
        </AppShell>
      </AuthLoading>
      <Unauthenticated>
        <AppShell locale={locale} userRole="caregiver" items={items}>
          <Alert>
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Authentication required</AlertTitle>
            <AlertDescription>
              <Button asChild className="mt-4">
                {/* OAuth initiation requires a document navigation, not Next.js RSC navigation. */}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a href="/login">Sign in with WorkOS</a>
              </Button>
            </AlertDescription>
          </Alert>
        </AppShell>
      </Unauthenticated>
      <Authenticated>
        <CaregiverWorkspaceContent
          locale={locale}
          items={items}
          globalActionsEnabled={globalActionsEnabled}
          twilioEnabled={twilioEnabled}
        />
      </Authenticated>
    </>
  );
}
