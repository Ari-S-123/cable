import { cronJobs, makeFunctionReference } from "convex/server";

const crons = cronJobs();
const maintenanceReference =
  makeFunctionReference<"mutation">("maintenance:run");

crons.interval(
  "expire consent and enforce temporary-data retention",
  { minutes: 15 },
  maintenanceReference,
  {},
);

export default crons;
