/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actionProposals from "../actionProposals.js";
import type * as audit from "../audit.js";
import type * as careCircles from "../careCircles.js";
import type * as careEvents from "../careEvents.js";
import type * as checkins from "../checkins.js";
import type * as consents from "../consents.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as maintenance from "../maintenance.js";
import type * as notifications from "../notifications.js";
import type * as outbox from "../outbox.js";
import type * as outboxWorker from "../outboxWorker.js";
import type * as policy_authorization from "../policy/authorization.js";
import type * as policy_canonicalize from "../policy/canonicalize.js";
import type * as policyValidationState from "../policyValidationState.js";
import type * as policyValidations from "../policyValidations.js";
import type * as providerContacts from "../providerContacts.js";
import type * as users from "../users.js";
import type * as voiceSessions from "../voiceSessions.js";
import type * as webhooks from "../webhooks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  actionProposals: typeof actionProposals;
  audit: typeof audit;
  careCircles: typeof careCircles;
  careEvents: typeof careEvents;
  checkins: typeof checkins;
  consents: typeof consents;
  crons: typeof crons;
  http: typeof http;
  maintenance: typeof maintenance;
  notifications: typeof notifications;
  outbox: typeof outbox;
  outboxWorker: typeof outboxWorker;
  "policy/authorization": typeof policy_authorization;
  "policy/canonicalize": typeof policy_canonicalize;
  policyValidationState: typeof policyValidationState;
  policyValidations: typeof policyValidations;
  providerContacts: typeof providerContacts;
  users: typeof users;
  voiceSessions: typeof voiceSessions;
  webhooks: typeof webhooks;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
