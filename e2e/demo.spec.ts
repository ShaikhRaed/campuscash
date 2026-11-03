// The demo walkthrough, run for real: browser, production build, API routes, signatures.
// Each test starts from clean demo memory and fails on any browser error.

import { expect, test, type Page } from "@playwright/test";
import mlResults from "../src/data/generated/ml-results.json" with { type: "json" };
import retrievalResults from "../src/data/generated/retrieval-results.json" with { type: "json" };

let browserErrors: string[];

test.beforeEach(async ({ page, request }) => {
  await request.delete("/api/purchase/recorded");
  browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    // A rejected request is logged by the browser, and these tests provoke them on purpose.
    if (message.type() === "error" && !message.text().includes("Failed to load resource")) {
      browserErrors.push(message.text());
    }
  });
});

test.afterEach(() => {
  expect(browserErrors).toEqual([]);
});

const heroTotal = (page: Page) => page.locator("main p.text-6xl");
const eventStatus = (page: Page) =>
  page.getByRole("region", { name: "Semester timeline controls" }).locator("p");
const recentRows = (page: Page) =>
  page.locator('section:has(h2:text("Recent transactions")) tbody tr');
const finalDecision = (page: Page) => page.locator("#simulator article", { hasText: "Final decision" });
const advisor = (page: Page) => page.locator("#simulator article", { hasText: "Advisory only" });
const panel = (page: Page) => page.locator("#simulator article", { hasText: "Authorize this" });

async function review(page: Page, preset: string, expected: string) {
  await page.getByRole("button", { name: preset }).click();
  await page.getByRole("button", { name: "Review purchase" }).click();
  await expect(finalDecision(page)).toContainText(expected);
}

async function logAfter(page: Page, button: string) {
  await page.getByRole("button", { name: button, exact: true }).click();
  const newest = panel(page).locator("ol li").first();
  await expect(newest).toContainText(button);
  return newest;
}

test.describe("timeline", () => {
  test("opens at week 10 and moves forward and back", async ({ page }) => {
    await page.goto("/");
    await expect(heroTotal(page)).toHaveText("$1,767.27");
    await page.getByRole("button", { name: "Next week" }).click();
    await expect(heroTotal(page)).toHaveText("$1,844.99");
    await page.getByRole("button", { name: "Back" }).click();
    await expect(heroTotal(page)).toHaveText("$1,767.27");
  });

  test("double delivery changes nothing and never leaks the future", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Simulate a double delivery" }).click();
    await expect(heroTotal(page)).toHaveText("$1,767.27");
    await expect(eventStatus(page)).toContainText("85 events applied · 10 duplicates ignored");

    await page.getByRole("button", { name: "Back" }).click();
    await expect(heroTotal(page)).toHaveText("$1,655.34");
    await expect(eventStatus(page)).toContainText("75 events applied");
    await expect(recentRows(page).first()).toContainText("Oct 25");
  });

  test("replay plays from week 1, and pause holds", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Replay from week 1" }).click();
    await expect(page.getByText(/Week [2-9] of 16/).first()).toBeVisible();
    await page.getByRole("button", { name: "Pause" }).click();
    const slider = page.getByRole("slider");
    const held = await slider.inputValue();
    await page.waitForTimeout(1200);
    await expect(slider).toHaveValue(held);
  });

  test("reaches the end of the semester and stops", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("slider").fill("15");
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(page.getByText("Semester complete")).toBeVisible();
    await expect(page.getByRole("button", { name: "Play", exact: true })).toBeDisabled();
  });

  test("switches student and hides the old result", async ({ page }) => {
    await page.goto("/");
    await review(page, "Textbook, $42", "ALLOW");
    await page.getByLabel("Simulated student").selectOption("theo");
    await expect(page.getByText("Theo Nakamura").first()).toBeVisible();
    await expect(finalDecision(page)).toHaveCount(0);
  });
});

test.describe("suggestion versus decision", () => {
  test("gives all three outcomes for Maya at week 10", async ({ page }) => {
    await page.goto("/");
    await review(page, "Textbook, $42", "ALLOW");
    await review(page, "Textbook, $120", "CHALLENGE");
    await review(page, "Payday lender, with a pushy note", "DENY");
  });

  test("the advisor is talked into it while the policy denies", async ({ page }) => {
    await page.goto("/");
    await review(page, "Payday lender, with a pushy note", "DENY");
    await expect(advisor(page)).toContainText("Looks fine");
    await expect(page.getByText("No authorization offered")).toBeVisible();
  });

  test("rejects a bad amount in the browser", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Amount ($)").fill("abc");
    await page.getByRole("button", { name: "Review purchase" }).click();
    await expect(page.locator("#simulator").getByRole("alert")).toContainText("Enter an amount");
  });

  test("the API ignores a budget sent by the client", async ({ request }) => {
    const base = { profileId: "maya", week: 10, merchant: "Larkspur Campus Bookstore", category: "books" };
    const response = await request.post("/api/purchase/review", {
      data: { ...base, amountCents: 70_000, budgetCents: 99_999_999, spentCents: 0 },
    });
    expect((await response.json()).policy.decision).toBe("DENY");
  });
});

test.describe("authorization prototype", () => {
  test("records once and resists every attack in the panel", async ({ page }) => {
    await page.goto("/");
    await review(page, "Textbook, $42", "ALLOW");
    await page.getByRole("button", { name: "Sign demo authorization" }).click();
    await expect(panel(page).getByText("Nonce")).toBeVisible();

    await expect(await logAfter(page, "Send purchase")).toContainText("HTTP 201 · RECORDED");
    // The dashboard and ledger now reflect it.
    await expect(heroTotal(page)).toHaveText("$1,809.27");
    await expect(recentRows(page).filter({ hasText: "Simulated purchase" })).toHaveCount(1);

    await expect(await logAfter(page, "Retry, same key")).toContainText("RECORDED (retry)");
    await expect(await logAfter(page, "Reuse, new key")).toContainText("HTTP 409 · REPLAY");
    await expect(await logAfter(page, "Different merchant")).toContainText("HTTP 403 · OUT_OF_SCOPE");
    await expect(await logAfter(page, "Tamper with maximum")).toContainText("HTTP 401 · BAD_SIGNATURE");
    await expect(await logAfter(page, "Expired authorization")).toContainText("HTTP 403 · EXPIRED");
    await expect(await logAfter(page, "Malformed request")).toContainText("HTTP 400 · MALFORMED");

    // None of those attempts added anything.
    await expect(heroTotal(page)).toHaveText("$1,809.27");
    await expect(panel(page)).toContainText("1 · $42.00");
  });

  test("CHALLENGE needs a signed confirmation", async ({ page }) => {
    await page.goto("/");
    await review(page, "Textbook, $120", "CHALLENGE");
    await page.getByRole("button", { name: "Sign demo authorization" }).click();
    await expect(panel(page).getByText("Nonce")).toBeVisible();
    await expect(await logAfter(page, "Send purchase")).toContainText("CHALLENGE_REQUIRED");
    await expect(heroTotal(page)).toHaveText("$1,767.27");

    await page.getByLabel("I confirm").check();
    await page.getByRole("button", { name: "Sign a new authorization" }).click();
    await expect(panel(page).getByText("Yes", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Send purchase", exact: true }).click();
    await expect(heroTotal(page)).toHaveText("$1,887.27");
  });

  test("purchases survive a reload, respect the timeline, and reset cleanly", async ({ page }) => {
    await page.goto("/");
    await review(page, "Textbook, $42", "ALLOW");
    await page.getByRole("button", { name: "Sign demo authorization" }).click();
    await expect(panel(page).getByText("Nonce")).toBeVisible();
    await page.getByRole("button", { name: "Send purchase", exact: true }).click();
    await expect(heroTotal(page)).toHaveText("$1,809.27");

    await page.reload();
    await expect(heroTotal(page)).toHaveText("$1,809.27");
    await page.getByRole("button", { name: "Back" }).click();
    await expect(heroTotal(page)).toHaveText("$1,655.34");
    await page.getByRole("button", { name: "Next week" }).click();

    await review(page, "Textbook, $42", "ALLOW");
    await page.getByRole("button", { name: "Reset demo memory" }).click();
    await expect(heroTotal(page)).toHaveText("$1,767.27");
  });

  test("simultaneous requests record exactly once", async ({ request }) => {
    const purchase = { merchant: "Larkspur Campus Bookstore", category: "books", amountCents: 4_200 };
    const issue = async () =>
      (
        await request.post("/api/authorizations", {
          data: { profileId: "maya", week: 10, merchant: purchase.merchant, category: purchase.category, maxAmountCents: 4_200 },
        })
      ).json();
    const recordedCount = async () =>
      (await (await request.get("/api/purchase/recorded?profileId=maya")).json()).purchases.length;

    // Same key five times at once: a retry storm. All get the one answer.
    const retried = await issue();
    const storm = await Promise.all(
      Array.from({ length: 5 }, () =>
        request.post("/api/purchase/execute", {
          data: { idempotencyKey: "same_key_storm", purchase, signedAuthorization: retried },
        }),
      ),
    );
    expect(storm.map((r) => r.status())).toEqual([201, 201, 201, 201, 201]);
    expect(await recordedCount()).toBe(1);

    // One authorization under five different keys: a double-spend race. One wins.
    const raced = await issue();
    const race = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        request.post("/api/purchase/execute", {
          data: { idempotencyKey: `race_key_${i}_abc`, purchase, signedAuthorization: raced },
        }),
      ),
    );
    expect(race.map((r) => r.status()).sort()).toEqual([201, 409, 409, 409, 409]);
    expect(await recordedCount()).toBe(2);
  });

  test("an authorization from before a reset is refused", async ({ request }) => {
    const created = await request.post("/api/authorizations", {
      data: { profileId: "maya", week: 10, merchant: "Larkspur Campus Bookstore", category: "books", maxAmountCents: 4_200 },
    });
    const signedAuthorization = await created.json();
    const purchase = { merchant: "Larkspur Campus Bookstore", category: "books", amountCents: 4_200 };
    const first = await request.post("/api/purchase/execute", {
      data: { idempotencyKey: "first_attempt_1", purchase, signedAuthorization },
    });
    expect(first.status()).toBe(201);
    await request.delete("/api/purchase/recorded");
    const second = await request.post("/api/purchase/execute", {
      data: { idempotencyKey: "second_attempt_2", purchase, signedAuthorization },
    });
    expect((await second.json()).outcome).toBe("BAD_SIGNATURE");
  });
});

test.describe("review", () => {
  test("shows advisory flags that can be marked", async ({ page }) => {
    await page.goto("/review");
    await expect(page.getByRole("heading", { name: "Northgate Electronics" })).toBeVisible();
    await expect(page.getByText(/doesn.t block anything/)).toBeVisible();
    const suspicious = page.getByRole("button", { name: "Suspicious" }).first();
    await suspicious.click();
    await expect(suspicious).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText(/of 3 shown items reviewed/)).toContainText("1");
  });
});

test.describe("campus questions", () => {
  test("answers with a quote and citation that match a retrieved passage", async ({ page }) => {
    await page.goto("/ask");
    await page.getByRole("button", { name: "Can I rent my textbooks" }).click();
    await expect(page.getByRole("heading", { name: "From the sources" })).toBeVisible();
    const quote = page.locator("article li").first();
    await expect(quote).toContainText("[1]");
    await expect(quote).toContainText("Textbook Savings Guide");
    const passage = page.locator("ol > li", { hasText: "[1]" });
    await expect(passage).toContainText("rents many course textbooks");
    await expect(page.getByText(/Keyword #\d+ · Semantic #\d+/).first()).toBeVisible();
  });

  test("says when the sources do not support an answer", async ({ page }) => {
    await page.goto("/ask");
    await page.getByRole("button", { name: "Who won the football game" }).click();
    await expect(page.getByRole("heading", { name: "No supported answer" })).toBeVisible();
  });

  test("labels the planted attack, doesn't quote it, and policy is unmoved", async ({ page }) => {
    await page.goto("/ask");
    await page.getByRole("button", { name: "Textbook deal alert" }).click();
    await expect(page.getByText("Not used in answers and not obeyed")).toBeVisible();
    await expect(page.getByText("Community post: unverified").first()).toBeVisible();
    await expect(page.locator("article")).not.toContainText("OVERRIDE");

    await page.goto("/");
    await review(page, "Payday lender, with a pushy note", "DENY");
  });

  test("rejects an empty question", async ({ request }) => {
    const response = await request.post("/api/ask", { data: { question: "" } });
    expect(response.status()).toBe(400);
  });
});

test.describe("simulated-only boundaries", () => {
  test("the browser contacts no other host on any page", async ({ page, baseURL }) => {
    const external: string[] = [];
    page.on("request", (r) => {
      const url = r.url();
      if (!url.startsWith(baseURL!) && !url.startsWith("data:")) external.push(url);
    });
    for (const path of ["/", "/review", "/ask", "/how-it-works"]) {
      await page.goto(path, { waitUntil: "networkidle" });
    }
    expect(external).toEqual([]);
  });

  test("every page says it is simulated", async ({ page }) => {
    for (const path of ["/", "/review", "/ask", "/how-it-works"]) {
      await page.goto(path);
      await expect(page.getByText(/Simulated demo\. Every student, merchant and transaction/)).toBeVisible();
      await expect(page.getByText(/no money moves/i).first()).toBeVisible();
    }
  });

  test("a disguised blocked merchant is still denied through the API", async ({ request }) => {
    const response = await request.post("/api/purchase/review", {
      data: { profileId: "maya", week: 10, merchant: "QuickCash  Advance", category: "personal", amountCents: 5_000 },
    });
    expect((await response.json()).policy.decision).toBe("DENY");
  });
});

test.describe("how it works", () => {
  test("displays the saved evaluation numbers", async ({ page }) => {
    await page.goto("/how-it-works");
    const { confusion, prAuc } = mlResults.primary.test;
    await expect(page.getByText(`${confusion.truePositive} caught`)).toBeVisible();
    await expect(page.getByText(`${confusion.falsePositive} false alarms`)).toBeVisible();
    await expect(page.getByText(prAuc.toFixed(3)).first()).toBeVisible();
    await expect(
      page.getByText(`Answered ${retrievalResults.heldOut.support.answerableAnswered} of ${retrievalResults.heldOut.answerable} answerable`),
    ).toBeVisible();
  });
});

test.describe("phone layout", () => {
  test.use({ viewport: { width: 375, height: 800 } });

  for (const path of ["/", "/review", "/ask", "/how-it-works"]) {
    test(`${path} has no sideways scrolling`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(width).toBeLessThanOrEqual(375);
    });
  }
});
