import { redirect } from "next/navigation";

/** Redirects the unlocalized root to the configured default locale. */
export default function IndexPage(): never {
  redirect("/en-US");
}
