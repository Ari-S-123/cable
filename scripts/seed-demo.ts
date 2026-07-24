import { MultilingualDisclosureSnapshotSchema } from "../src/lib/contracts/care";
import { getDemoScenarios } from "../src/lib/demo/scenarios";

/** Verifies and reports the immutable synthetic fixture catalog. */
function verifySyntheticSeed(): void {
  const scenarios = getDemoScenarios();
  if (scenarios.length !== 3)
    throw new Error(
      "The deterministic demo catalog must contain three scenarios",
    );
  for (const scenario of scenarios) {
    MultilingualDisclosureSnapshotSchema.parse(scenario.disclosure);
    if (
      !scenario.providerMessageEnglish.includes("CABLE-DEMO") &&
      scenario.id !== "missed_checkin"
    ) {
      throw new Error(
        `Synthetic provider reference is missing for ${scenario.id}`,
      );
    }
  }
  console.log(
    `Verified ${scenarios.length} synthetic scenarios. No live database or vendor was contacted.`,
  );
}

verifySyntheticSeed();
