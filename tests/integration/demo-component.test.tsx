import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { DemoExperience } from "../../src/components/demo/demo-experience";
import { getDemoScenarios } from "../../src/lib/demo/scenarios";

describe("isolated synthetic demo boundary", () => {
  it("labels synthetic data and withholds English disclosure before fact confirmation", async () => {
    const user = userEvent.setup();
    render(<DemoExperience locale="en-US" scenarios={getDemoScenarios()} />);
    expect(screen.getByText("Synthetic demonstration")).toBeInTheDocument();
    expect(screen.getByText("Test data only")).toBeInTheDocument();
    expect(
      screen.queryByTestId("exact-english-disclosure"),
    ).not.toBeInTheDocument();
    await user.click(screen.getByTestId("begin-demo"));
    expect(screen.getByText("Simulated listening")).toBeInTheDocument();
    expect(screen.queryByTestId("provider-message")).not.toBeInTheDocument();
  });
});
