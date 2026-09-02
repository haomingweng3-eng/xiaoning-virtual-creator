import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const APP_URL = process.env.QA_APP_URL || 'http://localhost:5173/';
const OUTPUT_DIR = new URL('../artifacts/visual-qa/', import.meta.url);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

async function createPage(browser, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.getByTestId('avatar-stage').waitFor({ timeout: 15_000 });
  return { context, page };
}

async function send(page, message) {
  await page.getByPlaceholder('和小柠说点什么…').fill(message);
  const responsePromise = page.waitForResponse((response) => response.url().includes('/api/chat') && response.request().method() === 'POST', { timeout: 65_000 });
  await page.getByRole('button', { name: '发送' }).click();
  const response = await responsePromise;
  const result = await response.json();
  await page.waitForTimeout(result.interaction === 'CURATE' && result.products?.length ? 1100 : 250);
  return result;
}

async function screenshot(page, filename) {
  await page.screenshot({ path: fileURLToPath(new URL(filename, OUTPUT_DIR)), fullPage: true });
}

async function waitForProductImages(page) {
  const images = page.locator('.product-image img');
  if (await images.count() === 0) return;
  await page.waitForFunction(() => [...document.querySelectorAll('.product-image img')]
    .every((image) => image.complete && image.naturalWidth > 0), null, { timeout: 10_000 }).catch(() => {});
}

function metadata(filename, input, result = null, pass = true) {
  return {
    filename,
    input,
    interaction_mode: result?.interaction || null,
    emotion: result?.analysis?.emotion || null,
    currentTopic: result?.currentTopic || null,
    commerceCalled: result?.interaction === 'CURATE',
    provider: result?.products?.[0]?.source || null,
    productsCount: result?.products?.length || 0,
    status: pass ? 'PASS' : 'FAIL',
  };
}

async function run() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const cases = [];
  try {
    {
      const { context, page } = await createPage(browser, { width: 1440, height: 1000 });
      await screenshot(page, '01-home.png');
      cases.push(metadata('01-home.png', '首次进入产品'));
      await context.close();
    }
    {
      const { context, page } = await createPage(browser, { width: 1440, height: 1000 });
      const result = await send(page, '今天工作被领导说了一顿，挺烦的。');
      await screenshot(page, '02-emotional.png');
      cases.push(metadata('02-emotional.png', '今天工作被领导说了一顿，挺烦的。', result, result.products?.length === 0));
      await context.close();
    }
    {
      const { context, page } = await createPage(browser, { width: 1440, height: 1000 });
      const result = await send(page, '今天终于把项目做完了。');
      await screenshot(page, '03-positive.png');
      cases.push(metadata('03-positive.png', '今天终于把项目做完了。', result, result.products?.length === 0));
      await context.close();
    }
    {
      const { context, page } = await createPage(browser, { width: 1024, height: 900 });
      const result = await send(page, '最近开始跑步。');
      await screenshot(page, '04-normal-chat.png');
      cases.push(metadata('04-normal-chat.png', '最近开始跑步。', result, result.products?.length === 0));
      await context.close();
    }
    let curateResult;
    {
      const { context, page } = await createPage(browser, { width: 1440, height: 1000 });
      await send(page, '最近开始跑步。');
      const result = await send(page, '跑步的时候耳机老掉。');
      await screenshot(page, '05-pre-commerce.png');
      cases.push(metadata('05-pre-commerce.png', '最近开始跑步。 → 跑步的时候耳机老掉。', result, result.products?.length === 0));
      curateResult = await send(page, '那你帮我看看有没有适合跑步的耳机。');
      await waitForProductImages(page);
      await screenshot(page, '06-curate.png');
      cases.push(metadata('06-curate.png', '那你帮我看看有没有适合跑步的耳机。', curateResult, curateResult.interaction === 'CURATE'));
      if (curateResult.products?.length) {
        const details = page.locator('.product-evidence').first();
        await details.evaluate((element) => { element.open = true; });
      }
      await screenshot(page, '09-product-detail.png');
      cases.push(metadata('09-product-detail.png', '商品 evidence 展开', curateResult, curateResult.products?.length === 0 || curateResult.products.every((product) => product.productInsights?.sellingPoints?.every((point) => point.evidence))));
      await context.close();
    }
    {
      const { context, page } = await createPage(browser, { width: 768, height: 900 });
      await send(page, '最近开始跑步。');
      await send(page, '跑步的时候耳机老掉。');
      await send(page, '想看看 iPhone17');
      const work = await send(page, '今天工作有点多。');
      const result = await send(page, '不过跑步的时候我还想听音乐。');
      await screenshot(page, '07-topic-switch.png');
      const noPhoneLeak = !/iPhone|手机/.test(result.reply || '');
      cases.push(metadata('07-topic-switch.png', '跑步 → 耳机 → iPhone → 工作 → 再回跑步', result, /工作/.test(work.currentTopic || '') && noPhoneLeak));
      await context.close();
    }
    {
      const { context, page } = await createPage(browser, { width: 390, height: 844 });
      const result = await send(page, '最近开始跑步。');
      await screenshot(page, '08-mobile.png');
      const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
      cases.push(metadata('08-mobile.png', '390px normal conversation', result, noOverflow));
      await context.close();
    }

    const cards = cases.map((item) => `<article class="case ${item.status.toLowerCase()}"><img src="${escapeHtml(item.filename)}" alt="${escapeHtml(item.input)}"><div><h2>${escapeHtml(item.filename)} · ${item.status}</h2><p>${escapeHtml(item.input)}</p><dl><dt>interaction_mode</dt><dd>${escapeHtml(item.interaction_mode || '-')}</dd><dt>emotion</dt><dd>${escapeHtml(item.emotion || '-')}</dd><dt>currentTopic</dt><dd>${escapeHtml(item.currentTopic || '-')}</dd><dt>commerce called?</dt><dd>${item.commerceCalled ? 'yes' : 'no'}</dd><dt>provider</dt><dd>${escapeHtml(item.provider || '-')}</dd><dt>products count</dt><dd>${item.productsCount}</dd></dl></div></article>`).join('\n');
    const report = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>小柠 Visual QA</title><style>body{margin:0;padding:32px;background:#171a16;color:#eee9df;font:14px system-ui}.summary{max-width:1200px;margin:auto}.case{display:grid;grid-template-columns:minmax(0,2fr) minmax(260px,1fr);gap:22px;margin:24px 0;padding:16px;border:1px solid #3d4238;background:#22271f}.case.fail{border-color:#a65f55}.case img{width:100%;background:#ddd}.case h2{margin-top:0}dl{display:grid;grid-template-columns:140px 1fr;gap:6px}dt{color:#9da38e}dd{margin:0}@media(max-width:700px){body{padding:10px}.case{display:block}.case>div{margin-top:14px}}</style><main class="summary"><h1>小柠 Final Visual QA</h1><p>${escapeHtml(new Date().toISOString())} · ${escapeHtml(APP_URL)}</p>${cards}</main></html>`;
    await writeFile(new URL('report.html', OUTPUT_DIR), report);
    await writeFile(new URL('visual-results.json', OUTPUT_DIR), JSON.stringify({ generatedAt: new Date().toISOString(), appUrl: APP_URL, cases }, null, 2));
    for (const item of cases) console.log(`${item.status} ${item.filename} | ${item.interaction_mode || '-'} | topic=${item.currentTopic || '-'} | products=${item.productsCount}`);
    const failures = cases.filter((item) => item.status === 'FAIL');
    console.log(`Visual summary: ${cases.length - failures.length}/${cases.length} PASS`);
    if (failures.length) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(`Visual QA failed: ${error.stack || error.message}`);
  process.exitCode = 1;
});
