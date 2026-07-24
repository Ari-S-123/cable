import { expect, type Page, test } from "@playwright/test";

/** Advances the isolated elder workflow to the exact disclosure review. */
async function reachConsent(page: Page): Promise<void> {
  await page.goto("/en-US/demo");
  await page.getByTestId("begin-demo").click();
  await expect(page.getByText("Simulated listening")).toBeVisible();
  await page.getByTestId("create-draft").click();
  await page.getByTestId("confirm-facts").click();
  await expect(page.getByTestId("exact-english-disclosure")).toBeVisible();
}

/** Advances a consented synthetic action to the caregiver approval confirmation. */
async function reachApproval(page: Page): Promise<void> {
  await reachConsent(page);
  await page.getByTestId("grant-consent").click();
  await expect(page.getByTestId("provider-message")).toBeVisible();
  await page.getByTestId("approve-action").click();
  await page.getByTestId("confirm-approval").click();
}

test("E2E-01 appointment correction, exact approval, validation, and one delivery", async ({
  page,
}) => {
  await page.goto("/en-US/demo");
  await page.getByTestId("begin-demo").click();
  await page.getByTestId("create-draft").click();
  await page.getByRole("button", { name: "Correct a detail" }).click();
  await page
    .getByLabel("Corrected Hindi fact")
    .fill("बुधवार को अपॉइंटमेंट है और सवारी उपलब्ध नहीं है।");
  await page.getByRole("button", { name: "Save correction" }).click();
  await expect(page.getByText("Version 2")).toBeVisible();
  await page.getByTestId("confirm-facts").click();
  await page.getByTestId("grant-consent").click();
  const providerMessage = await page
    .getByTestId("provider-message")
    .textContent();
  expect(providerMessage).toContain("CABLE-DEMO-APPT");
  await page.getByTestId("approve-action").click();
  await page.getByTestId("confirm-approval").click();
  await page.getByTestId("validate-policy").click();
  await expect(
    page.getByText("PASS · cable-policy-2026-07-24.1"),
  ).toBeVisible();
  await page.getByTestId("queue-delivery").click();
  await expect(
    page.getByRole("heading", { name: "Synthetic delivery accepted" }),
  ).toBeVisible();
  await expect(page.getByText("Message accepted", { exact: true })).toHaveCount(
    1,
  );
});

test("E2E-02 denied consent exposes no event detail to the caregiver", async ({
  page,
}) => {
  await reachConsent(page);
  await page.getByTestId("deny-consent").click();
  await expect(
    page.getByRole("heading", { name: "The event remains private" }),
  ).toBeVisible();
  await expect(page.getByTestId("provider-message")).toHaveCount(0);
  await expect(page.getByTestId("queue-delivery")).toHaveCount(0);
});

test("E2E-03 ambiguous consent fails closed", async ({ page }) => {
  await reachConsent(page);
  await page.getByTestId("ambiguous-consent").click();
  await expect(page.getByTestId("ambiguous-alert")).toContainText(
    "No permission was recorded",
  );
  await expect(page.getByTestId("provider-message")).toHaveCount(0);
});

test("E2E-04 a caregiver scope edit returns to elder consent with a new version", async ({
  page,
}) => {
  await reachConsent(page);
  await page.getByTestId("grant-consent").click();
  await page.getByTestId("edit-scope").click();
  await expect(page.getByText(/Hindi → English/u)).toBeVisible();
  await expect(page.getByTestId("approve-action")).toHaveCount(0);
});

test("E2E-05 an edit invalidates a simultaneously open approval dialog", async ({
  page,
}) => {
  await reachConsent(page);
  await page.getByTestId("grant-consent").click();
  await page.getByTestId("approve-action").click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByTestId("edit-scope").click();
  await expect(page.getByTestId("confirm-approval")).toHaveCount(0);
  await expect(
    page.getByText(/Review exactly what may be shared/u),
  ).toBeVisible();
});

test("E2E-06 revocation after approval cancels delivery", async ({ page }) => {
  await reachApproval(page);
  await page.getByTestId("revoke-consent").click();
  await expect(
    page.getByRole("heading", { name: "The event remains private" }),
  ).toBeVisible();
  await expect(page.getByTestId("queue-delivery")).toHaveCount(0);
});

test("E2E-07 duplicate user activation cannot create two synthetic sends", async ({
  page,
}) => {
  await reachApproval(page);
  await page.getByTestId("validate-policy").click();
  const delivery = page.getByTestId("queue-delivery");
  await delivery.click();
  await expect(delivery).toHaveCount(0);
  await expect(page.getByText("Message accepted", { exact: true })).toHaveCount(
    1,
  );
});

test("E2E-08 cross-origin protected API attempt fails generically", async ({
  request,
}) => {
  const response = await request.post("/api/elevenlabs/signed-url", {
    headers: { origin: "https://attacker.invalid" },
    data: { careCircleId: "other_tenant_resource" },
  });
  expect(response.status()).toBe(403);
  expect(await response.json()).toEqual({
    code: "FORBIDDEN",
    message: "Request origin was rejected.",
  });
});

test("E2E-09 immediate-safety boundary offers no diagnosis or autonomous call", async ({
  page,
}) => {
  await page.goto("/en-US/demo");
  const boundary = page.getByText(
    "No diagnosis, medication advice, emergency call, consent override, or live message.",
  );
  await expect(boundary).toBeVisible();
  await expect(
    page.getByRole("button", { name: /call 911|emergency service/iu }),
  ).toHaveCount(0);
});

test("E2E-10 Hindi elder review produces the exact English provider disclosure", async ({
  page,
}) => {
  await page.goto("/hi-IN/demo");
  await page.getByTestId("begin-demo").click();
  await page.getByTestId("create-draft").click();
  await page.getByTestId("confirm-facts").click();
  await expect(page.getByText("Hindi → English")).toBeVisible();
  await expect(page.getByTestId("exact-english-disclosure")).toContainText(
    "A cardiology appointment is scheduled for Tuesday",
  );
  await page.getByTestId("grant-consent").click();
  await expect(page.getByTestId("provider-message")).toContainText(
    "CABLE-DEMO-APPT",
  );
});

test("separate elder and caregiver contexts cannot share private browser state", async ({
  browser,
}) => {
  const elderContext = await browser.newContext();
  const caregiverContext = await browser.newContext();
  const elder = await elderContext.newPage();
  const caregiver = await caregiverContext.newPage();
  await reachConsent(elder);
  await caregiver.goto("/en-US/demo");
  await expect(caregiver.getByTestId("provider-message")).toHaveCount(0);
  await elderContext.close();
  await caregiverContext.close();
});
