import { chromium } from "playwright";
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const APP_URL = process.env.DAYSEED_URL ?? "http://localhost:3000/";
const outDir = new URL("../test-results/", import.meta.url);

function intersects(a, b) {
  return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
}

async function analyzeImage(path, viewport) {
  const image = sharp(path);
  const meta = await image.metadata();
  const width = meta.width ?? viewport.width;
  const height = meta.height ?? viewport.height;
  const crop = {
    left: Math.floor(width * 0.22),
    top: Math.floor(height * 0.3),
    width: Math.floor(width * 0.56),
    height: Math.floor(height * 0.48),
  };
  const stats = await image.extract(crop).stats();
  const stdev =
    stats.channels.slice(0, 3).reduce((sum, channel) => sum + channel.stdev, 0) / 3;

  return { stdev: Number(stdev.toFixed(2)), crop };
}

async function verifyViewport(browser, name, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();

  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  await page.getByLabel("Task title").fill(`Focus ${name}`);
  await page.getByRole("button", { name: "Add task" }).click();
  await page.getByRole("button", { name: "Start" }).click();
  await page.waitForTimeout(250);
  const focusVisible = await page.locator(".focus-mode").isVisible();
  if (!focusVisible) {
    throw new Error(`${name}: expected focus mode after starting a task`);
  }
  await page.getByRole("button", { name: "Plant" }).click();
  await page.waitForTimeout(450);

  await page.getByRole("button", { name: "Yard" }).click();
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: "This month" }).click();
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "This week" }).click();
  await page.waitForTimeout(250);

  const stats = await page.locator('section[aria-label="Garden stats"] strong').allTextContents();
  if (stats[0] !== "1") {
    throw new Error(`${name}: expected today stat to be 1, got ${stats[0]}`);
  }

  const path = new URL(`dayseed-${name}.png`, outDir).pathname;
  await page.screenshot({ path, fullPage: false });

  const checks = await page.evaluate(() => {
    const rectFor = (selector) => {
      const element = document.querySelector(selector);
      if (!element) {
        return null;
      }

      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    };
    const canvas = document.querySelector("canvas");
    const canvasRect = canvas?.getBoundingClientRect();
    const textOverflow = [
      ...document.querySelectorAll(
        "button, .wordmark, .session-copy strong, .filter-rail span, .ambient-stats span, .yard-toolbar h2",
      ),
    ]
      .filter((element) => element instanceof HTMLElement)
      .map((element) => ({
        text: element.textContent?.trim() ?? "",
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        tag: element.tagName.toLowerCase(),
      }))
      .filter((item) => item.text && item.scrollWidth > item.clientWidth + 2);

    return {
      canvas:
        canvas && canvasRect
          ? {
              width: canvas.width,
              height: canvas.height,
              cssWidth: canvasRect.width,
              cssHeight: canvasRect.height,
            }
          : null,
      boxes: {
        header: rectFor(".app-header"),
        nav: rectFor(".yard-nav"),
        stage: rectFor(".yard-stage"),
        stats: rectFor(".ambient-stats"),
      },
      textOverflow,
    };
  });
  const boxPairs = [
    ["header", "nav"],
    ["header", "stage"],
    ["header", "stats"],
    ["nav", "stage"],
    ["nav", "stats"],
  ];
  const overlaps = boxPairs.filter(
    ([a, b]) => checks.boxes[a] && checks.boxes[b] && intersects(checks.boxes[a], checks.boxes[b]),
  );

  if (!checks.canvas || checks.canvas.width < 100 || checks.canvas.height < 100) {
    throw new Error(`${name}: canvas missing or too small ${JSON.stringify(checks.canvas)}`);
  }
  if (overlaps.length > 0) {
    throw new Error(`${name}: overlapping UI panels ${JSON.stringify(overlaps)}`);
  }
  if (checks.textOverflow.length > 0) {
    throw new Error(`${name}: overflowing text ${JSON.stringify(checks.textOverflow)}`);
  }

  const imageCheck = await analyzeImage(path, viewport);
  if (imageCheck.stdev < 8) {
    throw new Error(`${name}: screenshot crop appears blank ${JSON.stringify(imageCheck)}`);
  }

  await context.close();
  return { name, path, stats, canvas: checks.canvas, imageCheck };
}

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });

try {
  const results = [
    await verifyViewport(browser, "desktop", { width: 1280, height: 900 }),
    await verifyViewport(browser, "mobile", { width: 390, height: 844 }),
  ];
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
