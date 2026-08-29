import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mockApi, planningWorkbook, plugins, workbooks } from "./fixtures";

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

async function expectA11y(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations).toEqual([]);
}

function isTouchProject(testInfo: TestInfo): boolean {
  return testInfo.project.name === "mobile" || testInfo.project.name === "tablet";
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test("workbook catalog supports search, profile filtering, keyboard navigation, and persistent themes", async ({ page }, testInfo) => {
  await page.goto("/#/");
  await expect(page.getByRole("heading", { name: "Workbooks" })).toBeVisible();
  await expect(page.getByText(`${workbooks.length} workbooks`, { exact: false })).toBeVisible();

  await page.getByLabel("Search workbooks").fill("architecture");
  await expect(page.getByRole("button", { name: /FDPM Architecture Analysis/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Customer-support chatbot/ })).toBeHidden();

  await page.getByLabel("Search workbooks").fill("");
  await page.getByLabel("Filter by profile").selectOption("profile:planning:0.1");
  await expect(page.getByRole("button", { name: /Customer-support chatbot/ })).toBeVisible();
  await expect(page.getByText("1 of 4 workbooks", { exact: false })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Workbooks" })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();

  const themeToggle = page.getByRole("button", { name: /Switch to dark theme/ });
  await themeToggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  if (isTouchProject(testInfo)) {
    const targets = await page.locator(".topnav a, .theme-toggle").evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { width: rect.width, height: rect.height, label: node.getAttribute("aria-label") ?? node.textContent };
      }),
    );
    expect(targets.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true);
  }

  await expectNoHorizontalOverflow(page);
  await expectA11y(page);
});

test("catalog exposes recoverable error, loading, empty-filter, and empty-store states", async ({ page }) => {
  let calls = 0;
  await page.unroute("**/api/**");
  await page.route("**/api/workbooks", async (route) => {
    calls += 1;
    if (calls === 1) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "bridge_unavailable" }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ workbooks }) });
  });

  await page.goto("/#/");
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("Workbooks could not be loaded");
  await alert.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("button", { name: /Customer-support chatbot/ })).toBeVisible();

  await page.getByLabel("Search workbooks").fill("no matching workbook");
  await expect(page.getByText("No workbooks match these filters.")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByRole("button", { name: /Customer-support chatbot/ })).toBeVisible();

  await page.unroute("**/api/workbooks");
  await page.route("**/api/workbooks", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ workbooks: [] }) }));
  await page.reload();
  await expect(page.getByText("No workbooks yet")).toBeVisible();
  await expectA11y(page);
});

test("plugin catalog and detail remain usable in both themes", async ({ page }) => {
  await page.goto("/#/plugins");
  await expect(page.getByRole("heading", { name: "Plugins" })).toBeVisible();
  await page.getByLabel("Search plugins").fill("planning");
  await expect(page.getByRole("link", { name: /Planning/ })).toBeVisible();
  await expect(page.getByText(`1 of ${plugins.length} plugins`, { exact: false })).toBeVisible();

  await page.getByRole("link", { name: /Planning/ }).click();
  await expect(page.getByRole("heading", { name: "Planning", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Capabilities/ })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectA11y(page);

  await page.getByRole("button", { name: /Switch to dark theme/ }).click();
  await expectA11y(page);
});

test("workbook detail has stable loading, retry, keyboard menu, and dialog focus behavior", async ({ page }) => {
  let detailCalls = 0;
  await page.route("**/api/workbooks/plan-chatbot-mvp", async (route) => {
    detailCalls += 1;
    if (detailCalls === 1) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "temporary_failure" }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(planningWorkbook) });
  });
  await page.goto("/#/wb/plan-chatbot-mvp");
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("Workbook could not be loaded");
  await alert.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Plan — Customer-support chatbot MVP" })).toBeVisible();

  const trigger = page.getByRole("button", { name: "Task actions" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const firstItem = page.getByRole("menuitem", { name: "Mark In Progress" });
  await expect(firstItem).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByRole("menuitem", { name: "Cancel task" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.getByRole("menuitem", { name: "Cancel task" }).click();
  const dialog = page.getByRole("dialog", { name: "Cancel task" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await expectNoHorizontalOverflow(page);
  await expectA11y(page);
});

test("workbook detail exposes a stable busy state until partial data resolves", async ({ page }) => {
  let releaseResponse: (() => void) | undefined;
  const responseGate = new Promise<void>((resolve) => { releaseResponse = resolve; });
  await page.route("**/api/workbooks/plan-chatbot-mvp", async (route) => {
    await responseGate;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(planningWorkbook) });
  });

  await page.goto("/#/wb/plan-chatbot-mvp");
  const loading = page.locator('[aria-busy="true"][aria-label*="Loading workbook"]');
  await expect(loading).toBeVisible();
  const before = await loading.boundingBox();
  expect(before?.height ?? 0).toBeGreaterThanOrEqual(500);
  releaseResponse?.();
  await expect(page.getByRole("heading", { name: "Plan — Customer-support chatbot MVP" })).toBeVisible();
  await expect(loading).toBeHidden();
});

test("layout remains operable at 200 percent zoom", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Desktop emulates the 200% zoom acceptance gate.");
  await page.goto("/#/plugins");
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  await expect(page.getByRole("heading", { name: "Plugins" })).toBeVisible();
  await expect(page.getByLabel("Search plugins")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("representative catalogs match reviewed visual baselines", async ({ page }) => {
  await page.goto("/#/");
  await expect(page.getByRole("heading", { name: "Workbooks" })).toBeVisible();
  await expect(page).toHaveScreenshot("workbooks-light.png", { fullPage: true });

  await page.goto("/#/plugins");
  await page.getByRole("button", { name: /Switch to dark theme/ }).click();
  await expect(page.getByRole("heading", { name: "Plugins" })).toBeVisible();
  await expect(page).toHaveScreenshot("plugins-dark.png", { fullPage: true });
});

test("critical routes emit no relevant browser errors or warnings", async ({ page }) => {
  const messages: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") messages.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => messages.push(`pageerror: ${error.message}`));

  for (const path of ["/#/", "/#/plugins", "/#/plugin/fdpm.planning", "/#/profile/profile%3Aplanning%3A0.1", "/#/wb/plan-chatbot-mvp"]) {
    await page.goto(path);
    await expect(page.locator("main h1, main .page-title").first()).toBeVisible();
  }
  expect(messages).toEqual([]);
});
