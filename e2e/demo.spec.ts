import { expect, test, type Page } from "@playwright/test";

// The demo script as a test: build the bundle, approve, ship with a wrong variant then repack,
// cancel a part the store can't supply, ship the rest, and finish. Mock PayPal and mock AI.

async function shipWith(console_: Page, part: RegExp, sample: string, tracking: string) {
  await console_.getByLabel("Part").selectOption({ label: (await optionLabel(console_, part))! });
  await console_.getByRole("button", { name: sample }).click();
  await expect(console_.getByAltText("Box label to be checked")).toBeVisible();
  await console_.getByLabel("Tracking number").fill(tracking);
  await console_.locator("form button[type=submit]").click();
}

async function optionLabel(page: Page, part: RegExp) {
  const option = page.getByLabel("Part").locator("option").filter({ hasText: part });
  await expect(option).toHaveCount(1); // waits for the order to load
  return option.textContent();
}

test("demo flow: one approval, per-part charges, repack, can't fulfil, finish", async ({ page, context }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Build my bundle" }).click();
  await expect(page.getByText("How these parts were picked")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".ag-row").filter({ hasText: "Yeti Orb" })).toContainText("Not in bundle");

  await page.getByRole("button", { name: /Approve with PayPal/ }).click();
  await expect(page.getByRole("heading", { name: "Waiting for parts to ship" })).toBeVisible();
  const consolePromise = context.waitForEvent("page");
  await page.getByRole("link", { name: "Open merchant console" }).click();
  const merchant = await consolePromise;
  await merchant.setViewportSize({ width: 1280, height: 720 });

  // Wrong variant: blocked, not charged, one recheck offered.
  await shipWith(merchant, /SM58-LC/, "SM58S (switch)", "DEMO1");
  await expect(merchant.locator(".verdict-panel .big")).toHaveText("Not charged");
  await expect(merchant.locator(".verdict-panel")).toContainText("recheck it once");
  await expect(merchant.getByRole("heading", { name: "Recheck a repacked part" })).toBeVisible();

  // A blurry repack photo is not counted (D3).
  await merchant.getByRole("button", { name: "Blurry label" }).click();
  await merchant.getByLabel("Tracking number").fill("DEMO1");
  await merchant.getByRole("button", { name: "Recheck" }).click();
  await expect(merchant.locator(".verdict-panel .big")).toHaveText("Label unreadable");
  await expect(merchant.locator(".verdict-panel")).toContainText("not counted");

  // Repack with the verified variant: charged. Both earlier photos are kept (D5).
  await shipWith(merchant, /SM58-LC/, "SM58-LC (verified)", "DEMO1");
  await expect(merchant.locator(".verdict-panel .big")).toHaveText(/^Charged \$/);
  const micRow = merchant.locator(".order-lines li").filter({ hasText: "SM58-LC" });
  await expect(micRow.getByRole("link")).toHaveText(["wrong part ↗", "unreadable ↗", "matched ↗"]);

  // The store can't supply the stand.
  await merchant.getByLabel("Part").selectOption({ label: (await optionLabel(merchant, /Compass/))! });
  await merchant.getByRole("button", { name: "Can't fulfil this part" }).click();
  await merchant.getByLabel(/Reason/).fill("Out of stock");
  await merchant.getByRole("button", { name: "Don't charge this part" }).click();
  await expect(merchant.locator(".order-lines li").filter({ hasText: "Compass" })).toContainText("Store can't supply");

  for (const [part, sample] of [
    [/Scarlett/, "Scarlett 2i2"],
    [/HMIC/, "HMIC-010"],
    [/MDR-7506/, "MDR-7506"],
  ] as const) {
    await shipWith(merchant, part, sample, "DEMO2");
    await expect(merchant.locator(".verdict-panel .big")).toHaveText(/^Charged \$/);
  }
  await expect(merchant.getByText("Every part on this order has been processed")).toBeVisible();

  // Shopper side: the cancelled part is explained in shopper words, then Finish releases the rest.
  await expect(page.locator(".ag-row").filter({ hasText: "Compass" })).toContainText("Out of stock", { timeout: 10_000 });
  await page.getByRole("button", { name: "Finish order" }).click();
  await expect(page.getByRole("heading", { name: "Order finished" })).toBeVisible();
  await expect(page.locator(".ledger")).toContainText("Released to you");
});

test("finish shows the server's reason and stays retryable", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Build my bundle" }).click();
  await page.getByRole("button", { name: /Approve with PayPal/ }).click();
  await expect(page.getByRole("heading", { name: "Waiting for parts to ship" })).toBeVisible();
  await page.route("**/close", (r) =>
    r.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({ error: "release_failed", message: "PayPal did not confirm that the held money was released." }),
    }),
  );
  await page.getByRole("button", { name: "Finish order" }).click();
  await expect(page.locator(".notice.error")).toContainText("PayPal did not confirm");
  await page.unroute("**/close");
  await page.getByRole("button", { name: "Try Finish again" }).click();
  await expect(page.getByRole("heading", { name: "Order finished" })).toBeVisible();
});

test("a refresh keeps the bundle and the order; Start over forgets them", async ({ page }) => {
  // The restored page must hydrate cleanly: React reports a mismatch as a console error.
  const consoleErrors: string[] = [];
  page.on("console", (m) => void (m.type() === "error" && consoleErrors.push(m.text())));
  page.on("pageerror", (e) => void consoleErrors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Build my bundle" }).click();
  await expect(page.getByText("How these parts were picked")).toBeVisible({ timeout: 30_000 });

  // Before approval: the bundle comes back without building it again.
  await page.reload();
  await expect(page.locator(".ag-row").filter({ hasText: "Compass" })).toBeVisible();
  await expect(page.locator(".ag-row").filter({ hasText: "Yeti Orb" })).toContainText("Not in bundle");

  // After approval: the same order comes back, still open.
  await page.getByRole("button", { name: /Approve with PayPal/ }).click();
  await expect(page.getByRole("heading", { name: "Waiting for parts to ship" })).toBeVisible();
  const orderLine = await page.getByText(/^Order \S+$/).textContent();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Waiting for parts to ship" })).toBeVisible();
  await expect(page.getByText(orderLine!)).toBeVisible();
  await expect(page.locator(".ag-row").filter({ hasText: "Compass" })).toContainText("Held");
  await expect(page.getByRole("link", { name: "Open merchant console" })).toBeVisible();

  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page.locator(".ag-row")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Build my bundle" })).toBeEnabled();
  await expect(page.locator(".ag-row")).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});
