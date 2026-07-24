import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";

/** Initiates WorkOS PKCE sign-in from the configured login endpoint. */
export async function GET(): Promise<never> {
  redirect(await getSignInUrl());
}
