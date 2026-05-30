const { chromium } = require("playwright");

async function run() {
  const baseUrl = process.env.BASE_URL || "http://localhost:3000";
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  const consoleEvents = [];
  const requestFailed = [];
  const badResponses = [];

  page.on("console", (msg) => {
    const type = msg.type();
    if (type === "error" || type === "warning") {
      consoleEvents.push({ type, text: msg.text(), location: msg.location() });
    }
  });
  page.on("requestfailed", (req) => {
    requestFailed.push({ url: req.url(), method: req.method(), failure: req.failure() });
  });
  page.on("response", (res) => {
    const status = res.status();
    if (status >= 400) badResponses.push({ url: res.url(), status });
  });

  await page.goto(`${baseUrl}/new`, { waitUntil: "networkidle" });

  await page.locator('label:has-text("Title") input').fill("QA Wizard Test");
  await page.locator('label:has-text("Goal statement") textarea').fill("Menguji alur wizard end-to-end.");
  await page.getByRole("button", { name: /^(Next|Lanjut)$/ }).click();

  const metricCards = page.locator('label:has(input[type="checkbox"])');
  const metricCardCount = await metricCards.count();
  for (let i = 0; i < Math.min(3, metricCardCount); i++) {
    await metricCards.nth(i).locator('input[type="checkbox"]').check();
  }
  await page.getByRole("button", { name: /^(Next|Lanjut)$/ }).click();

  const baselineCards = page.locator("div.rounded-md.border.border-zinc-200.p-4");
  const baselineCount = await baselineCards.count();
  for (let i = 0; i < baselineCount; i++) {
    const card = baselineCards.nth(i);
    await card.locator("select").last().selectOption("Observed");
    const unitValue = await card.locator('label:has-text("Unit") input').inputValue();
    const nextValue = unitValue.trim() === "%" ? "10" : String(100 + i);
    await card.locator('label:has-text("Value") input').fill(nextValue);
  }
  await page.getByRole("button", { name: /^(Next|Lanjut)$/ }).click();

  await page.waitForTimeout(200);

  await page.getByRole("button", { name: "Add manual source" }).click();
  const urlInvalidBannerFound = (await page.locator("text=URL tidak valid.").count()) > 0;

  await page.locator('input[placeholder="https://..."]').fill("https://example.com/bench");
  await page.getByRole("button", { name: "Add manual source" }).click();
  await page.waitForTimeout(200);

  await page
    .locator("text=Excerpt (1–3 kalimat)")
    .locator("..")
    .locator("textarea")
    .fill("Benchmark contoh untuk QA.");
  await page.getByRole("button", { name: "Add manual source" }).click();
  await page.waitForTimeout(200);

  const metricSelect = page.locator('label:has-text("Metric") select');
  await metricSelect.selectOption({ index: 1 });
  await page.getByRole("button", { name: "Add manual source" }).click();
  await page.waitForTimeout(400);

  const removeBtn = page.getByRole("button", { name: "Remove" }).first();
  const manualAdded = (await removeBtn.count()) > 0;
  if (manualAdded) await removeBtn.click();

  await page.getByRole("button", { name: /^(Next|Lanjut)$/ }).click();

  await page.getByRole("button", { name: "Generate" }).click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /^(Next|Lanjut)$/ }).click();

  await page.locator('label:has-text("Narrative") textarea').fill("Narasi QA: semua step berhasil.");

  const downloads = [];
  page.on("download", (d) => downloads.push(d.suggestedFilename()));
  await page.getByRole("button", { name: /Export|Ekspor/ }).click();
  await page.waitForTimeout(1200);

  await page.reload({ waitUntil: "networkidle" });
  const persistedTitleVisible = (await page.locator("text=QA Wizard Test").count()) > 0;
  const persistedStepPreviewVisible = (await page.locator('text=Preview & edit').count()) > 0;

  console.log(
    JSON.stringify(
      {
        ok: true,
        metricCardCount,
        baselineCount,
        downloads,
        urlInvalidBannerFound,
        manualAdded,
        persistedTitleVisible,
        persistedStepPreviewVisible,
        consoleEvents,
        requestFailed,
        badResponses,
      },
      null,
      2,
    ),
  );

  await browser.close();
}

run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
