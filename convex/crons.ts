import { cronJobs, makeFunctionReference } from "convex/server";

import { internal } from "./_generated/api";
const crons = cronJobs();
const maintenanceReference =
  makeFunctionReference<"mutation">("maintenance:run");

crons.interval(
  "expire consent and enforce temporary-data retention",
  { minutes: 15 },
  maintenanceReference,
  {},
);

crons.interval(
  "process consent-approved notification outbox",
  { minutes: 1 },
  internal.outboxWorker.processNext,
  {},
);

export default crons;
