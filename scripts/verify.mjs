// Headless verification for Reflekt: renders the built app, checks the
// hybrid engine detection, exercises the demo fallback end-to-end
// (analyse + reflect), and takes screenshots.
// Run: node scripts/verify.mjs   (expects `npm run preview` on :4173)
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const EXEC =
  "/home/hatch/workspace/tools-shot/browsers/chrome-headless-shell/linux-157.0.8103.78/chrome-headless-shell-linux64/chrome-headless-shell";
const PAGE_URL = "http://localhost:4173";
const OUT = new URL("../test-output/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EXEC,
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-gpu",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    `--user-data-dir=/tmp/reflekt-verify-${Date.now()}`,
  ],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 950 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });

  await page.goto(PAGE_URL, { waitUntil: "networkidle0", timeout: 60_000 });
  await page.waitForSelector('body[data-engine-ready="true"]', { timeout: 30_000 });

  const status = await page.evaluate(() =>
    window.__reflekt ? window.__reflekt.getStatus() : null,
  );
  console.log("ENGINE STATUS:", JSON.stringify(status, null, 2));

  const panelText = await page.$eval("#engine-panel", (el) => el.textContent);
  console.log("ENGINE PANEL (excerpt):", panelText.replace(/\s+/g, " ").slice(0, 300));

  const storageBadge = await page.$eval(".topbar .badge", (el) => el.textContent.trim());
  console.log("STORAGE BADGE:", storageBadge);

  await page.screenshot({ path: `${OUT}home.png`, fullPage: true });
  console.log("screenshot: home.png");

  // Exercise the analyse flow on the first entry (demo fallback expected).
  const analyseBtn = await page.$(".btn-analyse");
  if (analyseBtn) {
    await analyseBtn.click();
    await page.waitForFunction(
      () => document.querySelector(".entry .analysis") !== null,
      { timeout: 20_000 },
    );
    const analysis = await page.$eval(".entry .analysis", (el) =>
      el.textContent.replace(/\s+/g, " ").slice(0, 300),
    );
    const badge = await page.$eval(".entry .badge", (el) => el.textContent.trim());
    console.log("ANALYSIS BADGE:", badge);
    console.log("ANALYSIS (excerpt):", analysis);
  } else {
    console.log("ANALYSIS: no .btn-analyse found (entries may already be analysed)");
  }

  // Exercise the deep-reflection flow (demo fallback expected).
  await page.click("#btn-reflect");
  await page.waitForFunction(
    () => {
      const out = document.querySelector("#reflection-out");
      return out && out.querySelector(".reflection-text") !== null;
    },
    { timeout: 20_000 },
  );
  const reflection = await page.$eval("#reflection-out", (el) =>
    el.textContent.replace(/\s+/g, " ").slice(0, 400),
  );
  console.log("REFLECTION (excerpt):", reflection);

  await page.screenshot({ path: `${OUT}after-ai.png`, fullPage: true });
  console.log("screenshot: after-ai.png");

  console.log("PAGE ERRORS:", errors.length ? errors : "none");
} finally {
  await browser.close();
}
