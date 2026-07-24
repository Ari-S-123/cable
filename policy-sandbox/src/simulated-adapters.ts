import type { PolicyEnvelope } from "../../src/lib/contracts/policy";

/** Result of a network-free provider simulation. */
export type SimulatedAdapterResult = Readonly<{
  accepted: boolean;
  code: "SIMULATED_ACCEPTED" | "SIMULATED_UNSUPPORTED";
}>;

/** Proves that the validated action maps only to a known credential-free simulator. */
export function simulateAdapter(
  envelope: PolicyEnvelope,
): SimulatedAdapterResult {
  const accepted = new Set([
    "send_provider_email",
    "send_provider_sms",
    "request_caregiver_call",
    "retry_checkin",
    "mark_resolved",
  ]).has(envelope.actionType);
  return {
    accepted,
    code: accepted ? "SIMULATED_ACCEPTED" : "SIMULATED_UNSUPPORTED",
  };
}
