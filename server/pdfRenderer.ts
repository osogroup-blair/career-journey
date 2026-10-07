import fs from "fs";
import os from "os";
import path from "path";
import puppeteer, { Browser } from "puppeteer-core";
import type { GeneratedResume } from "../src/types";
import type { SpotlightSnapshot } from "../src/types/spotlight";

/**
 * Renders the resume PDF by loading the app's own /print.html (which mounts the
 * same React templates the Tailored Application page shows) in headless
 * Chromium and printing it — so the PDF is what the user sees on screen, with
 * real selectable text for ATS parsers.
 *
 * Needs a Chrome/Chromium binary: set CHROME_PATH, or have one in the puppeteer
 * cache (`npx puppeteer browsers install chrome`) or on PATH. Callers fall back
 * to pdfBuilder.ts when none is available.
 */

export type ResumeTemplateId = "classic" | "modern" | "executive";
export const RESUME_TEMPLATES: readonly ResumeTemplateId[] = ["classic", "modern", "executive"];

const MAX_CONCURRENT_RENDERS = 2;
const RENDER_TIMEOUT_MS = 30_000;

function findChrome(): string | null {
  const candidates: string[] = [];
  if (process.env.CHROME_PATH) candidates.push(process.env.CHROME_PATH);

  // puppeteer's cache: <cache>/chrome/<platform>-<version>/chrome-<platform>/chrome
  const cacheRoot = path.join(process.env.PUPPETEER_CACHE_DIR || path.join(os.homedir(), ".cache", "puppeteer"), "chrome");
  try {
    for (const version of fs.readdirSync(cacheRoot).sort().reverse()) {
      for (const sub of ["chrome-linux64/chrome", "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing", "chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing", "chrome-win64/chrome.exe"]) {
        candidates.push(path.join(cacheRoot, version, sub));
      }
    }
  } catch {
    /* no puppeteer cache */
  }

  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    for (const bin of ["google-chrome-stable", "google-chrome", "chromium", "chromium-browser"]) candidates.push(path.join(dir, bin));
  }
  candidates.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");

  return candidates.find((c) => c && fs.existsSync(c)) || null;
}

let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  if (browserPromise) return browserPromise;
  const executablePath = findChrome();
  if (!executablePath) {
    return Promise.reject(new Error("No Chrome/Chromium found (set CHROME_PATH)"));
  }
  const launching = puppeteer
    .launch({
      executablePath,
      headless: true,
      // Chromium's sandbox refuses to start as root, and as non-root under Docker's default
      // seccomp profile (no user namespaces) — the Dockerfile sets CHROME_NO_SANDBOX for the latter.
      args: process.getuid?.() === 0 || process.env.CHROME_NO_SANDBOX === "true" ? ["--no-sandbox", "--disable-setuid-sandbox"] : [],
    })
    .then((browser) => {
      browser.on("disconnected", () => {
        if (browserPromise === launching) browserPromise = null;
      });
      return browser;
    });
  browserPromise = launching;
  launching.catch(() => {
    if (browserPromise === launching) browserPromise = null;
  });
  return launching;
}

export async function closePdfBrowser(): Promise<void> {
  const pending = browserPromise;
  browserPromise = null;
  if (pending) await pending.then((b) => b.close()).catch(() => {});
}

// Small semaphore so a burst of exports can't spawn unbounded Chromium pages.
let active = 0;
const waiters: (() => void)[] = [];
async function acquire(): Promise<void> {
  if (active >= MAX_CONCURRENT_RENDERS) await new Promise<void>((resolve) => waiters.push(resolve));
  active++;
}
function release(): void {
  active--;
  waiters.shift()?.();
}

type RenderPage = Awaited<ReturnType<Browser["newPage"]>>;

/**
 * A fresh Chromium page for one render, within the concurrency limit, that may only load
 * our own origin — so page content (e.g. a pasted URL) can never make the server fetch
 * third-party hosts. Always closed afterwards.
 */
async function withPage<T>(origin: string, render: (page: RenderPage) => Promise<T>): Promise<T> {
  await acquire();
  let page: RenderPage | undefined;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    page.setDefaultTimeout(RENDER_TIMEOUT_MS);
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const url = req.url();
      if (url.startsWith(origin) || url.startsWith("data:") || url.startsWith("blob:")) req.continue();
      else req.abort();
    });
    return await render(page);
  } finally {
    await page?.close().catch(() => {});
    release();
  }
}

export async function renderResumePdf(
  origin: string,
  input: { resume: GeneratedResume; tagline?: string; template: ResumeTemplateId }
): Promise<Buffer> {
  return withPage(origin, async (page) => {
    // 1000px keeps the md: breakpoints the Modern/Executive templates rely on active, as on desktop.
    await page.setViewport({ width: 1000, height: 1200 });
    await page.evaluateOnNewDocument((payload) => {
      (window as any).__PRINT__ = payload;
    }, input as any);

    await page.goto(`${origin}/print.html`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.body.dataset.ready === "true");
    await page.evaluate(() => (document as any).fonts.ready);

    const pdf = await page.pdf({
      format: "letter",
      printBackground: true,
      margin: { top: "0.5in", bottom: "0.5in", left: "0.5in", right: "0.5in" },
    });
    return Buffer.from(pdf);
  });
}

/**
 * Career Spotlight renders load /spotlight.html with the snapshot injected as
 * window.__SPOTLIGHT_RENDER__ (src/spotlight/main.tsx), the same components the public
 * page uses, and wait for it to mark the body ready.
 */
async function loadSpotlight(page: RenderPage, origin: string, payload: { mode: "card" | "print"; snapshot: SpotlightSnapshot; address?: string }) {
  await page.evaluateOnNewDocument((p) => {
    (window as any).__SPOTLIGHT_RENDER__ = p;
  }, payload as any);
  await page.goto(`${origin}/spotlight.html`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.dataset.ready === "true");
  await page.evaluate(() => (document as any).fonts.ready);
}

/** The 1200×630 link-preview image (Open Graph) for a published Spotlight, as JPEG. */
export async function renderSpotlightImage(origin: string, snapshot: SpotlightSnapshot, address: string): Promise<Buffer> {
  return withPage(origin, async (page) => {
    await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
    await loadSpotlight(page, origin, { mode: "card", snapshot, address });
    const image = await page.screenshot({ type: "jpeg", quality: 88, clip: { x: 0, y: 0, width: 1200, height: 630 } });
    return Buffer.from(image);
  });
}

/** The Spotlight's print view as a PDF, for the public page's download button. */
export async function renderSpotlightPdf(origin: string, snapshot: SpotlightSnapshot): Promise<Buffer> {
  return withPage(origin, async (page) => {
    // Wide enough for the desktop layout; print styles then expand every role.
    await page.setViewport({ width: 1100, height: 1400 });
    await loadSpotlight(page, origin, { mode: "print", snapshot });
    const pdf = await page.pdf({
      format: "letter",
      printBackground: true,
      margin: { top: "0.5in", bottom: "0.5in", left: "0.4in", right: "0.4in" },
    });
    return Buffer.from(pdf);
  });
}
