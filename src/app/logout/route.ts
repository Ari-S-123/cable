import { signOut } from "@workos-inc/authkit-nextjs";

/** Ends the sealed WorkOS session and redirects only to the configured app URL. */
export async function POST(): Promise<never> {
  await signOut({
    returnTo: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000/en-US",
  });
  throw new Error("WorkOS sign-out did not redirect");
}
