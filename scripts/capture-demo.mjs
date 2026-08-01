/**
 * Capture Flow demo screenshots + short video walkthrough.
 * Requires the app running at FLOW_URL (default http://localhost:5173).
 */
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(new URL('.', import.meta.url)));
const base = process.env.FLOW_URL || 'http://localhost:5173';
const outDir = path.join(root, '..', 'demo');
const shotDir = path.join(outDir, 'screenshots');
const artifactsDir = '/opt/cursor/artifacts';

fs.mkdirSync(shotDir, { recursive: true });
fs.mkdirSync(artifactsDir, { recursive: true });

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

  // Development auth auto-provisions; wait for shell or login.
  await page.waitForTimeout(1_200);

  // Open setup from gear or auto-open
  const setupDialog = page.getByRole('dialog', { name: /Get booking-ready/i });
  if (!(await setupDialog.isVisible().catch(() => false))) {
    const setupButton = page.getByRole('button', { name: /Open setup|Setup/i }).first();
    if (await setupButton.isVisible().catch(() => false)) {
      await setupButton.click();
    }
  }
  await setupDialog.waitFor({ timeout: 20_000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(shotDir, '02-setup-wizard.png'), fullPage: false });

  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: 'Windows' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(shotDir, '02b-setup-os.png'), fullPage: false });
  await page.getByRole('button', { name: 'macOS' }).click();
  await page.waitForTimeout(200);

  for (let i = 0; i < 3; i += 1) {
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForTimeout(450);
  }
  await page.screenshot({ path: path.join(shotDir, '02c-setup-accounts.png'), fullPage: false });

  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /Enter Flow/i }).click();
  await page.waitForTimeout(800);

  await page.screenshot({ path: path.join(shotDir, '01-hero.png'), fullPage: false });

  // Flexible flight prompt fills composer; send if possible
  const flightPrompt = page.getByRole('button', { name: /Flexible flight/i });
  if (await flightPrompt.isVisible().catch(() => false)) {
    await flightPrompt.click();
    await page.waitForTimeout(300);
    await page.getByLabel('Send message').click();
    await page.waitForTimeout(2_500);
  }
  await page.screenshot({ path: path.join(shotDir, '03-chat.png'), fullPage: false });

  // Accounts view
  await page
    .getByRole('button', { name: 'Open navigation' })
    .click()
    .catch(() => undefined);
  await page.waitForTimeout(300);
  const accountsNav = page.getByRole('button', { name: /^Accounts$/i });
  if (await accountsNav.isVisible().catch(() => false)) {
    await accountsNav.click();
    await page.waitForTimeout(900);
    await page.screenshot({
      path: path.join(shotDir, '04-accounts-webcmd.png'),
      fullPage: false,
    });
  }

  // Bookings
  await page
    .getByRole('button', { name: 'Open navigation' })
    .click()
    .catch(() => undefined);
  await page.waitForTimeout(200);
  const bookingsNav = page.getByRole('button', { name: /^Bookings$/i }).first();
  if (await bookingsNav.isVisible().catch(() => false)) {
    await bookingsNav.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(shotDir, '05-bookings.png'), fullPage: false });
  }

  const video = page.video();
  await context.close();
  await browser.close();

  if (video) {
    const videoPath = await video.path();
    const mp4Out = path.join(outDir, 'flow-demo.mp4');
    const webmOut = path.join(outDir, 'flow-demo.webm');
    fs.copyFileSync(videoPath, webmOut);
    const ffmpeg = spawnSync(
      'ffmpeg',
      ['-y', '-i', webmOut, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', mp4Out],
      { encoding: 'utf8' },
    );
    if (ffmpeg.status !== 0) {
      console.warn('ffmpeg convert skipped/failed; webm retained');
    }
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
