import fs from "fs";
import os from "os";
import path from "path";
import puppeteer, { Browser } from "puppeteer-core";
import type { GeneratedResume } from "../src/types";

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
      // Containers usually run as root, where Chromium's sandbox refuses to start.
      args: process.getuid?.() === 0 ? ["--no-sandbox", "--disable-setuid-sandbox"] : [],
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

export async function renderResumePdf(
  origin: string,
  input: { resume: GeneratedResume; tagline?: string; template: ResumeTemplateId }
): Promise<Buffer> {
  await acquire();
  let page: Awaited<ReturnType<Browser["newPage"]>> | undefined;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    page.setDefaultTimeout(RENDER_TIMEOUT_MS);

    // The page only ever needs our own origin; refuse everything else so resume
    // content (e.g. a pasted URL) can never make the server fetch third-party hosts.
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const url = req.url();
      if (url.startsWith(origin) || url.startsWith("data:") || url.startsWith("blob:")) req.continue();
      else req.abort();
    });

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
  } finally {
    await page?.close().catch(() => {});
    release();
  }
}
