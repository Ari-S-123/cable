import { handleAuth } from "@workos-inc/authkit-nextjs";

/** Completes AuthKit PKCE/CSRF verification and returns to the application. */
export const GET = handleAuth({ returnPathname: "/en-US" });
