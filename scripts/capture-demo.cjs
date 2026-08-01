/**
 * Capture Flow demo screenshots + short video walkthrough.
 * Requires the app running at FLOW_URL (default http://localhost:3000).
 */
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");

const base = process.env.FLOW_URL || "http://localhost:3000";
const outDir = path.join(process.cwd(), "demo");
const shotDir = path.join(outDir, "screenshots");
const artifactsDir = "/opt/cursor/artifacts";

fs.mkdirSync(shotDir, { recursive: true });
fs.mkdirSync(artifactsDir, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: {
      dir: path.join(outDir, "video-tmp"),
      size: { width: 1440, height: 900 },
    },
  });
  const page = await context.newPage();

  await page.goto(base, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    localStorage.removeItem("flow_setup_complete");
    localStorage.removeItem("flow_setup_os");
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("dialog", { name: /Get booking-ready/i }).waitFor({
    timeout: 15000,
  });
  await page.waitForTimeout(500);

  await page.screenshot({
    path: path.join(shotDir, "02-setup-wizard.png"),
    fullPage: false,
  });

  // Capture OS picker (macOS / Windows)
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Windows" }).click();
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join(shotDir, "02b-setup-os.png"),
    fullPage: false,
  });
  await page.getByRole("button", { name: "macOS" }).click();
  await page.waitForTimeout(200);

  // Runtime -> Webcmd -> Accounts
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForTimeout(450);
  }

  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.join(shotDir, "02c-setup-accounts.png"),
    fullPage: false,
  });

  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /Enter Flow/i }).click();
  await page.waitForTimeout(700);

  await page.screenshot({
    path: path.join(shotDir, "01-hero.png"),
    fullPage: false,
  });

  await page
    .getByRole("button", { name: /Tokyo flights under \$650/i })
    .first()
    .click();
  await page
    .waitForSelector("text=Searching deals", {
      state: "detached",
      timeout: 45000,
    })
    .catch(() => {});
  await page.waitForTimeout(1200);

  await page.screenshot({
    path: path.join(shotDir, "03-deals.png"),
    fullPage: false,
  });

  await page.getByRole("button", { name: /Run `webcmd list`/i }).click();
  await page.waitForTimeout(2500);

  await page.screenshot({
    path: path.join(shotDir, "04-accounts-webcmd.png"),
    fullPage: true,
  });

  // Re-open setup via header, then close via dialog X
  await page.getByRole("button", { name: /^Setup$/ }).click();
  await page.waitForTimeout(800);
  await page.locator('[aria-labelledby="setup-title"] button').first().click();
  await page.waitForTimeout(600);

  const video = page.video();
  await context.close();
  await browser.close();

  if (video) {
    const videoPath = await video.path();
    const webmDest = path.join(outDir, "flow-demo.webm");
    const mp4Dest = path.join(outDir, "flow-demo.mp4");
    fs.copyFileSync(videoPath, webmDest);
    fs.copyFileSync(webmDest, path.join(artifactsDir, "flow-demo.webm"));

    const ff = spawnSync(
      "ffmpeg",
      ["-y", "-i", webmDest, "-c:v", "libx264", "-pix_fmt", "yuv420p", mp4Dest],
      { encoding: "utf8" },
    );
    if (ff.status === 0 && fs.existsSync(mp4Dest)) {
      fs.copyFileSync(mp4Dest, path.join(artifactsDir, "flow-demo.mp4"));
      console.log("Wrote", mp4Dest);
    } else {
      console.warn(
        "ffmpeg mp4 conversion skipped/failed",
        ff.stderr?.slice(-200),
      );
    }

    try {
      fs.rmSync(path.join(outDir, "video-tmp"), { recursive: true, force: true });
    } catch {}
    console.log("Wrote", webmDest);
  }

  for (const f of fs.readdirSync(shotDir)) {
    fs.copyFileSync(path.join(shotDir, f), path.join(artifactsDir, f));
    console.log("Wrote", path.join(shotDir, f));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
