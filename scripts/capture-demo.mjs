/**
 * Capture Flow demo screenshots + short video walkthrough.
 * Requires the app running at FLOW_URL (default http://127.0.0.1:5173).
 */
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptsDir, '..');
const base = process.env.FLOW_URL || 'http://127.0.0.1:5173';
const outDir = path.join(root, 'demo');
const shotDir = path.join(outDir, 'screenshots');
const artifactsDir = '/opt/cursor/artifacts';

fs.mkdirSync(shotDir, { recursive: true });
fs.mkdirSync(artifactsDir, { recursive: true });

async function dismissSetup(page) {
  for (let i = 0; i < 10; i += 1) {
    const enter = page.getByRole('button', { name: /Enter Flow/i });
    if (await enter.isVisible().catch(() => false)) {
      await enter.click();
      await page.waitForTimeout(500);
      return;
    }
    const cont = page.getByRole('button', { name: 'Continue' });
    if (await cont.isVisible().catch(() => false)) {
      await cont.click();
      await page.waitForTimeout(350);
      continue;
    }
    break;
  }
}

async function openSidebar(page) {
  const menu = page.getByRole('button', { name: 'Open navigation' });
  if (await menu.isVisible().catch(() => false)) {
    await menu.click();
    await page.waitForTimeout(350);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: {
      dir: path.join(outDir, 'video-tmp'),
      size: { width: 1440, height: 900 },
    },
  });
  const page = await context.newPage();

  await page.goto(base, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.removeItem('flow_setup_complete');
    localStorage.removeItem('flow_setup_os');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1_000);

  const setupDialog = page.getByRole('dialog', { name: /Get booking-ready/i });
  if (!(await setupDialog.isVisible().catch(() => false))) {
    await openSidebar(page);
    const setupButton = page.getByRole('button', { name: /^Setup$/i }).first();
    if (await setupButton.isVisible().catch(() => false)) await setupButton.click();
  }
  await setupDialog.waitFor({ timeout: 20_000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(shotDir, '02-setup-wizard.png'), fullPage: false });

  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Windows' }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(shotDir, '02b-setup-os.png'), fullPage: false });
  await page.getByRole('button', { name: 'macOS' }).click();
  await page.waitForTimeout(200);

  for (let i = 0; i < 3; i += 1) {
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: path.join(shotDir, '02c-setup-accounts.png'), fullPage: false });

  await dismissSetup(page);
  await page.waitForTimeout(1_200);

  // Setup completion creates a fresh conversation → plan-your-trip stage
  await page.getByRole('heading', { name: /Plan your trip/i }).waitFor({ timeout: 12_000 });
  await page.screenshot({ path: path.join(shotDir, '01-hero.png'), fullPage: false });

  await page.getByRole('button', { name: /Search flights/i }).click();
  await page.waitForTimeout(3_500);
  await page.screenshot({ path: path.join(shotDir, '03-chat.png'), fullPage: false });

  await openSidebar(page);
  await page
    .locator('.sidebar')
    .getByRole('button', { name: /^Accounts$/i })
    .click({ force: true });
  await page.waitForTimeout(1_100);
  await page.screenshot({ path: path.join(shotDir, '04-accounts-webcmd.png'), fullPage: false });

  // Close any open overlay, then open bookings via top nav or sidebar
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const topFlights = page.locator('.top-nav').getByRole('button', { name: /^Flights$/i });
  if (await topFlights.isVisible().catch(() => false)) {
    await topFlights.click();
  } else {
    await openSidebar(page);
    await page
      .locator('.sidebar')
      .getByRole('button', { name: /^Bookings$/i })
      .click({ force: true });
  }
  await page.waitForTimeout(1_400);
  await page.screenshot({ path: path.join(shotDir, '05-bookings.png'), fullPage: false });

  // Ticket-style offers if the search produced a booking with options
  const selectFlight = page
    .getByRole('button', { name: /Select flight|Select stay|Select offer/i })
    .first();
  if (await selectFlight.isVisible().catch(() => false)) {
    await page.screenshot({ path: path.join(shotDir, '06-tickets.png'), fullPage: false });
  }
  const video = page.video();
  await context.close();
  await browser.close();

  if (video) {
    const videoPath = await video.path();
    const mp4Out = path.join(outDir, 'flow-demo.mp4');
    const webmOut = path.join(outDir, 'flow-demo.webm');
    fs.copyFileSync(videoPath, webmOut);
    spawnSync('ffmpeg', ['-y', '-i', webmOut, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', mp4Out], {
      encoding: 'utf8',
    });
    for (const file of fs.readdirSync(shotDir)) {
      fs.copyFileSync(path.join(shotDir, file), path.join(artifactsDir, file));
    }
    if (fs.existsSync(webmOut)) fs.copyFileSync(webmOut, path.join(artifactsDir, 'flow-demo.webm'));
    if (fs.existsSync(mp4Out)) fs.copyFileSync(mp4Out, path.join(artifactsDir, 'flow-demo.mp4'));
    fs.rmSync(path.join(outDir, 'video-tmp'), { recursive: true, force: true });
  }

  console.log('Demo assets written to', outDir);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
