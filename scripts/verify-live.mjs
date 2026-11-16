// Live verification for Reflekt against Muhammad's REAL Firebase project
// (buildhybridai-72b2d): checks Anonymous Auth sign-in, Firestore sync,
// and the Firebase AI Logic cloud path (mode forced to "cloud").
// Run: node scripts/verify-live.mjs   (expects `npm run preview` on :4173)
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const EXEC =
  "/home/hatch/workspace/tools-shot/browsers/chrome-headless-shell/linux-157.0.8103.78/chrome-headless-shell-linux64/chrome-headless-shell";
const PAGE_URL = "http://localhost:4173";
const OUT = new URL("../test-output/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

// This sandbox reaches the internet through an authenticated egress proxy.
// chrome-headless-shell cannot answer the proxy's auth challenge, so tests
// run through a local no-auth CONNECT relay (started separately, see
// REFLEKT_PROXY) that injects the credentials upstream. Without
// REFLEKT_PROXY we fall back to the env proxy host + page.authenticate().
const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || "";
let proxyServer = process.env.REFLEKT_PROXY || "";
let proxyAuth = null;
if (!proxyServer && proxyUrl) {
  try {
    const u = new URL(proxyUrl);
    proxyServer = `${u.protocol}//${u.hostname}:${u.port}`;
    if (u.username) {
      proxyAuth = {
        username: decodeURIComponent(u.username),
        password: decodeURIComponent(u.password),
      };
    }
  } catch {
    // ignore malformed proxy env
  }
}

const browser = await puppeteer.launch({
  executablePath: EXEC,
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-gpu",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    `--user-data-dir=/tmp/reflekt-live-${Date.now()}`,
    ...(proxyServer ? [`--proxy-server=${proxyServer}`] : []),
    "--proxy-bypass-list=localhost;127.0.0.1",
    // The sandbox egress proxy TLS-intercepts with its own CA, which the
    // headless shell does not trust (the OS/curl do). Test-harness only.
    "--ignore-certificate-errors",
  ],
});

const logs = [];
try {
  const page = await browser.newPage();
  if (proxyAuth) await page.authenticate(proxyAuth);
  await page.setViewport({ width: 1280, height: 950 });
  page.on("pageerror", (e) => logs.push(`PAGEERROR: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") {
      logs.push(`CONSOLE ${m.type()}: ${m.text().slice(0, 600)}`);
    }
  });
  page.on("requestfailed", (r) => {
    const url = r.url();
    if (/firebase|googleapis|identitytoolkit|securetoken/.test(url)) {
      logs.push(`REQFAILED: ${url.slice(0, 160)} :: ${r.failure()?.errorText}`);
    }
  });
  page.on("response", (res) => {
    const url = res.url();
    if (/firebase|googleapis|identitytoolkit|securetoken/.test(url)) {
      logs.push(`HTTP ${res.status()}: ${url.slice(0, 160)}`);
    }
  });

  // "load", not networkidle0: once Firebase connects, Firestore/Auth keep
  // long-lived connections open and the network never goes idle.
  try {
    await page.goto(PAGE_URL, { waitUntil: "load", timeout: 60_000 });
  } catch (e) {
    console.log("GOTO WARNING:", e.message);
  }

  let engineReady = true;
  try {
    // Generous timeout: if Firestore rules deny the read, the SDK retries
    // the listen stream before the boot promise settles.
    await page.waitForSelector('body[data-engine-ready="true"]', { timeout: 120_000 });
  } catch {
    engineReady = false;
  }
  console.log("ENGINE READY:", engineReady);

  const badge = await page
    .$eval(".topbar .badge", (el) => el.textContent.trim())
    .catch(() => "(no badge)");
  console.log("STORAGE BADGE:", badge);

  const status = await page
    .evaluate(() => (window.__reflekt ? window.__reflekt.getStatus() : null))
    .catch(() => null);
  console.log("ENGINE STATUS:", JSON.stringify(status, null, 2));

  const servicesReady = await page
    .evaluate(() => (window.__reflekt ? window.__reflekt.servicesReady() : null))
    .catch((e) => `eval failed: ${e.message}`);
  console.log("FIREBASE SERVICES READY (auth+init ok):", servicesReady);

  await page.screenshot({ path: `${OUT}live-home.png`, fullPage: true });
  console.log("screenshot: live-home.png");

  if (engineReady) {
    // Force cloud mode so the analysis MUST try Firebase AI Logic first.
    await page.click('[data-mode="cloud"]');
    await new Promise((r) => setTimeout(r, 500));

    let analyseBtn = await page.$(".btn-analyse");
    if (!analyseBtn) {
      console.log("No existing entries — creating one via the form (Firestore write test)...");
      await page.type("#f-title", "Live test entry from headless Chrome");
      await page.type(
        "#f-body",
        "Today I wired my journal app to a real Firebase project and tested whether the cloud AI answers. I felt nervous before starting, but each small step worked and I ended the day proud of the progress. Tomorrow I want to keep the momentum going and write again in the morning.",
      );
      await page.click("#btn-save");
    } else {
      await analyseBtn.click();
    }

    try {
      await page.waitForFunction(
        () => document.querySelector(".entry .analysis") !== null,
        { timeout: 120_000 },
      );
      const badgeText = await page.$eval(".entry .badge", (el) => el.textContent.trim());
      const analysis = await page.$eval(".entry .analysis", (el) =>
        el.textContent.replace(/\s+/g, " ").slice(0, 700),
      );
      console.log("ANALYSIS BADGE:", badgeText);
      console.log("ANALYSIS (excerpt):", analysis);
    } catch {
      console.log("ANALYSIS: timed out waiting for .entry .analysis");
    }

    // Deep reflection is cloud-first — a second, independent cloud probe.
    await page.click("#btn-reflect");
    try {
      await page.waitForFunction(
        () => {
          const out = document.querySelector("#reflection-out");
          return out && out.querySelector(".reflection-text") !== null;
        },
        { timeout: 120_000 },
      );
      const reflection = await page.$eval("#reflection-out", (el) =>
        el.textContent.replace(/\s+/g, " ").slice(0, 900),
      );
      console.log("REFLECTION (excerpt):", reflection);
    } catch {
      console.log("REFLECTION: timed out waiting for .reflection-text");
    }

    await page.screenshot({ path: `${OUT}live-after-ai.png`, fullPage: true });
    console.log("screenshot: live-after-ai.png");
  }
} finally {
  console.log("\n===== CAPTURED LOGS (warn/error/firebase) =====");
  console.log(logs.length ? logs.join("\n") : "(none)");
  await browser.close();
}
