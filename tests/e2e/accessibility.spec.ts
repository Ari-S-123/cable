import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("@a11y landing and synthetic workflow have no automated critical violations", async ({
  page,
}) => {
  await page.goto("/en-US/demo");
  const initial = await new AxeBuilder({ page }).analyze();
  expect(
    initial.violations.filter((violation) =>
      ["critical", "serious"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);
  await page.getByTestId("begin-demo").click();
  const voice = await new AxeBuilder({ page }).analyze();
  expect(
    voice.violations.filter((violation) =>
      ["critical", "serious"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);
});

test("@a11y keyboard-only path exposes captions and restores focus", async ({
  page,
}) => {
  await page.goto("/en-US/demo");
  await page.keyboard.press("Tab");
  for (let index = 0; index < 20; index += 1) {
    if (
      await page
        .getByTestId("begin-demo")
        .evaluate((element) => element === document.activeElement)
    )
      break;
    await page.keyboard.press("Tab");
  }
  await page.getByTestId("begin-demo").press("Enter");
  await expect(page.getByText("Live caption")).toBeVisible();
  await expect(page.locator("h1")).toBeFocused();
});

test("@a11y 200 percent zoom does not introduce document-level horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 195, height: 422 });
  await page.goto("/en-US/demo");
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth + 2,
  );
  expect(overflow).toBe(false);
});

test("@a11y reduced motion and high contrast preserve labels and 44px controls", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await page.goto("/en-US/demo");
  await expect(page.getByText("Synthetic demonstration")).toBeVisible();
  const undersized = await page
    .locator(
      "button:visible:not([data-nextjs-dev-tools-button]), [role=radio]:visible",
    )
    .evaluateAll(
      (elements) =>
        elements.filter((element) => {
          const rectangle = element.getBoundingClientRect();
          return rectangle.width < 44 || rectangle.height < 44;
        }).length,
    );
  expect(undersized).toBe(0);
});
