const { test, expect } = require("@playwright/test");

test.beforeEach(async ({ page }) => {
  await page.goto("/e2e/delivery-navigation/index.html");
});

test("offers all three services without changing the selected stop", async ({ page }) => {
  await page.getByRole("button", { name: "Directions" }).click();
  await expect(page.getByRole("menuitem")).toHaveText(["Google Maps", "Apple Maps", "Waze"]);
  await expect(page.locator("#selection")).toHaveText("Stop unchanged");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Directions" })).toBeFocused();
});

for (const [name, host, param] of [
  ["Google Maps", "www.google.com", "destination"],
  ["Apple Maps", "maps.apple.com", "daddr"],
  ["Waze", "waze.com", "ll"],
]) {
  test(`opens ${name} with the delivery location through an HTTPS browser-capable link`, async ({ page, context }) => {
    await context.route(`https://${host}/**`, route => route.fulfill({ contentType: "text/html", body: "Navigation destination received" }));
    await page.getByRole("button", { name: "Directions" }).click();
    const link = page.getByRole("menuitem", { name, exact: true });
    const url = new URL(await link.getAttribute("href"));
    expect(url.protocol).toBe("https:");
    expect(url.hostname).toBe(host);
    expect(url.searchParams.get(param)).toBe("53.795,-1.759");
    await expect(link).toHaveAttribute("target", "_blank");
    const originalUrl = page.url();
    const [destination] = await Promise.all([
      page.waitForEvent("popup"),
      link.click(),
    ]);
    await expect(destination).toHaveURL(url.href);
    await expect(destination.locator("body")).toHaveText("Navigation destination received");
    await expect(page).toHaveURL(originalUrl);
    await expect(page.locator("#selection")).toHaveText("Stop unchanged");
    await destination.close();
  });
}

test("supports keyboard selection", async ({ page }) => {
  await page.getByRole("button", { name: "Directions" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Google Maps" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Apple Maps" })).toBeFocused();
});

test("hides directions when a delivery has no destination", async ({ page }) => {
  await page.goto("/e2e/delivery-navigation/index.html?missing");
  await expect(page.getByRole("button", { name: "Directions" })).toHaveCount(0);
});
