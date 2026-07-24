import type { AuthConfig } from "convex/server";

/**
 * WorkOS AuthKit JWT validation configuration.
 *
 * Convex injects `WORKOS_CLIENT_ID` for provisioned WorkOS integrations. A
 * missing value intentionally prevents live authenticated deployment while the
 * local deterministic web build remains secret-free.
 */
export default {
  providers: [
    {
      type: "customJwt",
      issuer: "https://api.workos.com/",
      algorithm: "RS256",
      jwks: `https://api.workos.com/sso/jwks/${process.env.WORKOS_CLIENT_ID ?? "workos-not-configured"}`,
      applicationID: process.env.WORKOS_CLIENT_ID ?? "workos-not-configured",
    },
    {
      type: "customJwt",
      issuer: `https://api.workos.com/user_management/${process.env.WORKOS_CLIENT_ID ?? "workos-not-configured"}`,
      algorithm: "RS256",
      jwks: `https://api.workos.com/sso/jwks/${process.env.WORKOS_CLIENT_ID ?? "workos-not-configured"}`,
    },
  ],
} satisfies AuthConfig;
