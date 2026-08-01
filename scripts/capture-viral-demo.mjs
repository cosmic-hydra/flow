/**
 * Viral Flow demo via screenshot beats + ffmpeg zoom/pan + cursor overlays.
 * More reliable than CSS-transform screencast for "zoom into feature" edits.
 *
 *   npm run demo:viral
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
const tmpDir = path.join(outDir, 'viral-tmp');
const beatDir = path.join(tmpDir, 'beats');
const artifactsDir = '/opt/cursor/artifacts';
const W = 1440;
const H = 900;

fs.rmSync(tmpDir, { recursive: true, force: true });
fs.mkdirSync(beatDir, { recursive: true });
fs.mkdirSync(artifactsDir, { recursive: true });

function runFfmpeg(args) {
  const result = spawnSync('ffmpeg', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  if (result.status !== 0) {
    console.error(result.stderr?.slice(-2000));
    throw new Error(`ffmpeg failed (${result.status})`);
  }
}

async function injectChrome(page) {
  await page.addStyleTag({
    content: `
      #demo-cursor {
        position: fixed; z-index: 2147483646; width: 26px; height: 26px;
        margin: 0; border-radius: 50%; pointer-events: none;
        background: radial-gradient(circle at 32% 28%, #fff 0 16%, transparent 17%),
          linear-gradient(145deg, #1d1d1f, #0071e3);
        box-shadow: 0 0 0 2px #fff, 0 10px 28px rgb(0 0 0 / 30%);
        transform: translate(-50%, -50%);
      }
      #demo-caption {
        position: fixed; z-index: 2147483645; left: 50%; bottom: 34px;
        transform: translateX(-50%); max-width: min(680px, 88vw);
        padding: 12px 22px; border-radius: 999px; color: #fff;
        background: rgb(29 29 31 / 84%); backdrop-filter: blur(14px);
        font: 600 15px/1.35 Outfit, Manrope, system-ui, sans-serif;
        letter-spacing: -0.02em; text-align: center; opacity: 0;
        pointer-events: none; transition: opacity 220ms ease;
      }
      #demo-caption.is-on { opacity: 1; }
      #demo-spotlight {
        position: fixed; z-index: 2147483644; border-radius: 20px; pointer-events: none;
        box-shadow: 0 0 0 2px rgb(0 113 227 / 65%), 0 0 0 9999px rgb(0 0 0 / 32%);
        opacity: 0; transition: opacity 220ms ease;
      }
      #demo-spotlight.is-on { opacity: 1; }
    `,
  });
  await page.evaluate(() => {
    if (document.getElementById('demo-cursor')) return;
    for (const id of ['demo-cursor', 'demo-caption', 'demo-spotlight']) {
      const el = document.createElement('div');
      el.id = id;
      document.documentElement.append(el);
    }
    const c = document.getElementById('demo-cursor');
    c.style.left = '50%';
    c.style.top = '40%';
  });
}

async function setCaption(page, text) {
  await page.evaluate((value) => {
    const el = document.getElementById('demo-caption');
    if (!el) return;
    el.textContent = value;
    el.classList.toggle('is-on', Boolean(value));
  }, text);
}

async function setCursor(page, x, y) {
  await page.evaluate(
    ({ x, y }) => {
      const c = document.getElementById('demo-cursor');
      if (!c) return;
      c.style.left = `${x}px`;
      c.style.top = `${y}px`;
    },
    { x, y },
  );
}

async function setSpotlight(page, locator, pad = 14) {
  const box = await locator.boundingBox();
  if (!box) {
    await page.evaluate(() => document.getElementById('demo-spotlight')?.classList.remove('is-on'));
    return null;
  }
  await page.evaluate(
    ({ box, pad }) => {
      const s = document.getElementById('demo-spotlight');
      if (!s) return;
      s.style.left = `${box.x - pad}px`;
      s.style.top = `${box.y - pad}px`;
      s.style.width = `${box.width + pad * 2}px`;
      s.style.height = `${box.height + pad * 2}px`;
      s.classList.add('is-on');
    },
    { box, pad },
  );
  return box;
}

async function clearSpotlight(page) {
  await page.evaluate(() => document.getElementById('demo-spotlight')?.classList.remove('is-on'));
}

async function clickCenter(page, locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('missing box');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await setCursor(page, x, y);
  await page.waitForTimeout(180);
  await page.mouse.click(x, y);
  return { x, y, box };
}

/** @type {{ file: string, duration: number, zoom?: { x: number, y: number, s: number }, label: string }[]} */
const beats = [];

async function snap(page, label, duration, zoomTarget) {
  const file = path.join(beatDir, `${String(beats.length).padStart(2, '0')}-${label}.png`);
  let zoom;
  if (zoomTarget) {
    const box = await zoomTarget.boundingBox();
    if (box) {
      zoom = {
        x: (box.x + box.width / 2) / W,
        y: (box.y + box.height / 2) / H,
        s: 1.55,
      };
    }
  }
  await page.screenshot({ path: file, type: 'png' });
  beats.push({ file, duration, zoom, label });
  console.log('beat', label, duration);
}

function renderBeatClip(beat, index) {
  const out = path.join(tmpDir, `clip-${String(index).padStart(2, '0')}.mp4`);
  const frames = Math.max(1, Math.round(beat.duration * 30));
  if (beat.zoom) {
    // zoom from 1.0 → s over the clip, centered on feature
    const { x, y, s } = beat.zoom;
    // zoompan uses expressions; z goes 1 → s
    const zExpr = `min(1+${(s - 1).toFixed(4)}*on/${frames}, ${s.toFixed(4)})`;
    const xExpr = `${(x * W).toFixed(1)}-(${(x * W).toFixed(1)})/zoom`;
    const yExpr = `${(y * H).toFixed(1)}-(${(y * H).toFixed(1)})/zoom`;
    runFfmpeg([
      '-y',
      '-loop',
      '1',
      '-i',
      beat.file,
      '-vf',
      `scale=${W * 2}:${H * 2},zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=${frames}:s=${W}x${H}:fps=30,format=yuv420p`,
      '-t',
      String(beat.duration),
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      out,
    ]);
  } else {
    runFfmpeg([
      '-y',
      '-loop',
      '1',
      '-i',
      beat.file,
      '-vf',
      `scale=${W}:${H},format=yuv420p`,
      '-t',
      String(beat.duration),
      '-r',
      '30',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      out,
    ]);
  }
  return out;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(25_000);

  await page.goto(base, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.setItem('flow_setup_complete', '1'));
  await page.reload({ waitUntil: 'networkidle' });
  await injectChrome(page);

  if (await page.locator('#access-token').isVisible().catch(() => false)) {
    const token = process.env.FLOW_DEMO_TOKEN || 'flow_pat_demo';
    await page.fill('#access-token', token);
    await page.getByRole('button', { name: /Continue/i }).click();
    await page.waitForTimeout(1000);
    await injectChrome(page);
  }

  // Fresh conversation → hero
  const menu = page.getByRole('button', { name: 'Open navigation' });
  if (await menu.isVisible().catch(() => false)) {
    await menu.click();
    await page.waitForTimeout(350);
  }
  const newChat = page.locator('.sidebar').getByRole('button', { name: /New conversation/i });
  if (await newChat.isVisible().catch(() => false)) {
    await newChat.click();
    await page.waitForTimeout(900);
  } else {
    // Fallback: open chat view
    await page.locator('.sidebar').getByRole('button', { name: /^Chat$/i }).click().catch(() => undefined);
    await page.waitForTimeout(400);
  }
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.waitForTimeout(300);
  await injectChrome(page);

  // If hero isn't up (existing thread), force a new conversation via API-less UI retry
  if (!(await page.getByRole('heading', { name: /Travel, clarified/i }).isVisible().catch(() => false))) {
    if (await menu.isVisible().catch(() => false)) await menu.click();
    await page.waitForTimeout(300);
    await page.locator('.sidebar').getByRole('button', { name: /New conversation/i }).click();
    await page.waitForTimeout(900);
    await page.keyboard.press('Escape').catch(() => undefined);
  }

  await page.getByRole('heading', { name: /Travel, clarified/i }).waitFor({ timeout: 15_000 });
  await page.locator('.search-submit').waitFor({ state: 'visible', timeout: 10_000 });
  await injectChrome(page);

  // Beat 1 — wide hero
  await setCaption(page, 'Flow — travel, clarified');
  await setCursor(page, W * 0.52, H * 0.28);
  await clearSpotlight(page);
  await snap(page, 'hero', 2.2);

  // Beat 2 — zoom headline
  const headline = page.locator('.apple-headline');
  await setSpotlight(page, headline, 18);
  await setCursor(page, W * 0.5, H * 0.32);
  await setCaption(page, 'Apple-clean booking, not AI chrome');
  await snap(page, 'headline', 2.4, headline);

  // Beat 3 — search panel
  const searchPanel = page.locator('.search-panel');
  await setSpotlight(page, searchPanel, 14);
  await setCaption(page, 'Search without an AI key');
  await snap(page, 'search', 2.2, searchPanel);

  // Beat 4 — fill Tokyo
  const fromInput = page.getByRole('textbox', { name: 'From' });
  await clearSpotlight(page);
  await clickCenter(page, fromInput);
  await fromInput.fill('Tokyo (HND)');
  await setCaption(page, 'Tokyo (HND)');
  await setSpotlight(page, fromInput, 10);
  await snap(page, 'from', 1.6, fromInput);

  // Beat 5 — fill Seoul
  const toInput = page.getByRole('textbox', { name: 'To' });
  await clickCenter(page, toInput);
  await toInput.fill('Seoul (ICN)');
  await setCaption(page, '→ Seoul (ICN)');
  await setSpotlight(page, toInput, 10);
  await snap(page, 'to', 1.6, toInput);

  // Beat 6 — CTA
  const searchBtn = page.locator('.search-submit');
  await searchBtn.waitFor({ state: 'visible' });
  await setCaption(page, 'One tap. Local planner ranks offers.');
  await setSpotlight(page, searchBtn, 8);
  await snap(page, 'cta', 1.6, searchBtn);
  await clickCenter(page, searchBtn);
  await clearSpotlight(page);
  await setCaption(page, 'Ranking demo offers…');
  await snap(page, 'waiting', 1.2);
  await page.locator('.ticket-card').first().waitFor({ timeout: 20_000 });
  await injectChrome(page);
  await page.waitForTimeout(400);

  // Beat 7 — tickets wide
  await setCaption(page, 'Ticket results — compare real totals');
  await setCursor(page, W * 0.62, H * 0.45);
  await clearSpotlight(page);
  await snap(page, 'tickets-wide', 2.0);

  // Beat 8 — zoom first ticket
  const ticket = page.locator('.ticket-card').first();
  await setSpotlight(page, ticket, 12);
  await setCaption(page, 'Route · duration · price');
  await snap(page, 'ticket-zoom', 2.6, ticket);

  // Beat 9 — select
  const selectBtn = page.getByRole('button', { name: /Select flight/i }).first();
  if (await selectBtn.isVisible().catch(() => false)) {
    await setSpotlight(page, selectBtn, 8);
    await setCaption(page, 'Select flight');
    await clickCenter(page, selectBtn);
    await page.waitForTimeout(900);
    await snap(page, 'selected', 2.0, selectBtn);
  }

  // Beat 10 — sort
  const sortPill = page.locator('.filter-pill').first();
  if (await sortPill.isVisible().catch(() => false)) {
    await setCaption(page, 'Sort live — lowest first');
    await setSpotlight(page, page.locator('.filter-pills'), 8);
    await snap(page, 'sort', 2.0, page.locator('.filter-pills'));
  }

  // Beat 11 — approve bar
  const approve = page.getByRole('button', { name: /Review and approve|Approve/i }).first();
  if (await approve.isVisible().catch(() => false)) {
    await setCaption(page, 'Checkout always needs your approval');
    await setSpotlight(page, approve, 10);
    await snap(page, 'approve', 2.4, approve);
  }

  // Beat 12 — final
  await clearSpotlight(page);
  await setCaption(page, 'Book with clarity — no AI required');
  await setCursor(page, W * 0.5, H * 0.5);
  await snap(page, 'finale', 2.2);

  await browser.close();

  // Title / end cards
  const titlePng = path.join(tmpDir, 'title.png');
  const endPng = path.join(tmpDir, 'end.png');
  runFfmpeg([
    '-y',
    '-f',
    'lavfi',
    '-i',
    `color=c=0xf5f5f7:s=${W}x${H}:d=1`,
    '-vf',
    `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='Flow':fontsize=78:fontcolor=0x1d1d1f:x=(w-text_w)/2:y=(h-text_h)/2-48,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='Travel\\, clarified.':fontsize=34:fontcolor=0x6e6e73:x=(w-text_w)/2:y=(h-text_h)/2+36`,
    '-frames:v',
    '1',
    titlePng,
  ]);
  runFfmpeg([
    '-y',
    '-f',
    'lavfi',
    '-i',
    `color=c=0x1d1d1f:s=${W}x${H}:d=1`,
    '-vf',
    `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='Search. Compare. Approve.':fontsize=40:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-24,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='Works without an AI key':fontsize=26:fontcolor=0xa1a1a6:x=(w-text_w)/2:y=(h-text_h)/2+36`,
    '-frames:v',
    '1',
    endPng,
  ]);

  const clips = [];
  clips.push(
    (() => {
      const out = path.join(tmpDir, 'clip-title.mp4');
      runFfmpeg([
        '-y',
        '-loop',
        '1',
        '-i',
        titlePng,
        '-t',
        '1.5',
        '-r',
        '30',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        out,
      ]);
      return out;
    })(),
  );

  for (let i = 0; i < beats.length; i += 1) {
    clips.push(renderBeatClip(beats[i], i));
  }

  clips.push(
    (() => {
      const out = path.join(tmpDir, 'clip-end.mp4');
      runFfmpeg([
        '-y',
        '-loop',
        '1',
        '-i',
        endPng,
        '-t',
        '2.0',
        '-r',
        '30',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        out,
      ]);
      return out;
    })(),
  );

  const listFile = path.join(tmpDir, 'concat.txt');
  fs.writeFileSync(listFile, clips.map((c) => `file '${c}'`).join('\n'));

  const mp4Out = path.join(outDir, 'flow-viral-demo.mp4');
  const webmOut = path.join(outDir, 'flow-viral-demo.webm');
  runFfmpeg([
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listFile,
    '-vf',
    'fade=t=in:st=0:d=0.25',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    mp4Out,
  ]);
  runFfmpeg(['-y', '-i', mp4Out, '-c:v', 'libvpx-vp9', '-b:v', '3M', webmOut]);

  fs.copyFileSync(mp4Out, path.join(artifactsDir, 'flow-viral-demo.mp4'));
  fs.copyFileSync(webmOut, path.join(artifactsDir, 'flow-viral-demo.webm'));
  fs.copyFileSync(mp4Out, path.join(outDir, 'flow-demo.mp4'));
  fs.copyFileSync(webmOut, path.join(outDir, 'flow-demo.webm'));
  fs.copyFileSync(mp4Out, path.join(artifactsDir, 'flow-demo.mp4'));

  // Keep a couple of beat stills as artifacts
  for (const name of ['02-headline.png', '07-tickets-wide.png', '08-ticket-zoom.png']) {
    const match = fs.readdirSync(beatDir).find((f) => f.includes(name.split('-').slice(1).join('-').replace('.png', '')) || f.includes(name.replace(/^\d+-/, '').replace('.png', '')));
    void match;
  }
  const heroBeat = fs.readdirSync(beatDir).find((f) => f.includes('headline'));
  const ticketBeat = fs.readdirSync(beatDir).find((f) => f.includes('ticket-zoom'));
  if (heroBeat) fs.copyFileSync(path.join(beatDir, heroBeat), path.join(artifactsDir, 'viral-beat-headline.png'));
  if (ticketBeat)
    fs.copyFileSync(path.join(beatDir, ticketBeat), path.join(artifactsDir, 'viral-beat-ticket.png'));

  // Preserve beats for debugging (small)
  const keepBeats = path.join(outDir, 'viral-beats');
  fs.rmSync(keepBeats, { recursive: true, force: true });
  fs.renameSync(beatDir, keepBeats);
  fs.rmSync(tmpDir, { recursive: true, force: true });

  const probe = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration,size', '-of', 'default=noprint_wrappers=1', mp4Out],
    { encoding: 'utf8' },
  );
  console.log(probe.stdout);
  console.log('Viral demo written to', mp4Out);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
