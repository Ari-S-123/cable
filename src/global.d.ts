import type messages from "../messages/en-US.json";

declare module "next-intl" {
  /** Strict locale-message shape derived from the canonical English catalog. */
  type AppConfig = {
    Messages: typeof messages;
  };
}
