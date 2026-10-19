const { test: base, expect, chromium } = require('@playwright/test');
const path = require('node:path');

const test = base.extend({
  context: async ({}, use) => {
    const extension = path.resolve(__dirname, '..');
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      viewport: { width: 1600, height: 1000 },
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    await context.route('https://*.test/**', (route) => route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html lang="en" class="theme app-root" style="--brand: purple"><head>
        <title>Fixture</title><style>
          body { margin: 8px; font-family: sans-serif; background: rgb(245, 240, 230); }
          main { min-height: 1400px; }
          .sticky { position: sticky; top: 0; }
          .fixed { position: fixed; top: 10px; right: 10px; }
        </style></head><body class="site-body" style="color: rgb(20, 30, 40)">
        <header class="sticky">Sticky header</header><main><h1>A page, not a reader mode</h1>
        <p>Original text, links, and interactions.</p><input aria-label="Type here" /></main>
        <button class="fixed">Fixed button</button>
        </body></html>`,
    }));
    await use(context);
    await context.close();
  },
  worker: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    await use(worker);
  },
});

async function send(worker, page, action, values = {}) {
  return worker.evaluate(async ({ url, action, values }) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((tab) => tab.url === url);
    return sendToTab(tab.id, action, values);
  }, { url: page.url(), action, values });
}

async function open(context, url = 'https://one.test/article') {
  const page = await context.newPage();
  await page.goto(url);
  return page;
}

async function geometry(page) {
  return page.evaluate(() => {
    const box = document.body.getBoundingClientRect();
    return { width: box.width, left: box.left, right: box.right, viewport: document.documentElement.clientWidth };
  });
}

async function popupFor(context, worker, page) {
  await page.bringToFront();
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
  // In a real action popup, the website stays the active tab. Here the popup is
  // a normal tab, so activate the target before popup.js queries the tabs API.
  await worker.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({});
    await chrome.tabs.update(tabs.find((tab) => tab.url === url).id, { active: true });
  }, page.url());
  await popup.reload();
  await expect(popup.locator('#enableNarrower')).toBeEnabled();
  return popup;
}

test('opt-in, centered, no wrappers or attribute clobbering, and fully reversible', async ({ context, worker }) => {
  const page = await open(context);
  const before = await page.evaluate(() => ({
    root: document.documentElement.getAttribute('class'),
    rootStyle: document.documentElement.getAttribute('style'),
    body: document.body.outerHTML,
    background: getComputedStyle(document.body).backgroundColor,
    fixed: document.querySelector('.fixed').getBoundingClientRect().x,
  }));
  expect((await send(worker, page, 'get-state')).enabled).toBe(false);
  expect(await page.locator('style[data-narrower]').count()).toBe(0);
  await send(worker, page, 'set-width', { width: 60 });
  const result = await send(worker, page, 'set-enabled', { enabled: true });
  expect(result.reason).toBe('active');
  expect(await geometry(page)).toEqual({ width: 960, left: 320, right: 1280, viewport: 1600 });
  expect(await page.locator('html').getAttribute('class')).toBe(before.root);
  expect(await page.locator('html').getAttribute('style')).toBe(before.rootStyle);
  expect(await page.locator('body').evaluate((body) => body.outerHTML)).toBe(before.body);
  expect(await page.locator('body').evaluate((body) => getComputedStyle(body).backgroundColor)).toBe(before.background);
  expect(await page.locator('.fixed').evaluate((el) => el.getBoundingClientRect().x)).toBe(before.fixed);
  await page.getByLabel('Type here').fill('Still interactive');
  await page.evaluate(() => scrollTo(0, 300));
  expect(await page.locator('.sticky').evaluate((el) => el.getBoundingClientRect().top)).toBe(0);
  await send(worker, page, 'toggle-narrower');
  expect(await geometry(page)).toEqual({ width: 1584, left: 8, right: 1592, viewport: 1600 });
  expect(await page.getByLabel('Type here').inputValue()).toBe('Still interactive');
});

test('persists, restores width when toggled, synchronizes same-host tabs, and isolates sites', async ({ context, worker }) => {
  const page = await open(context);
  const sibling = await open(context, 'https://one.test/other');
  const other = await open(context, 'https://two.test/article');
  await send(worker, page, 'set-width', { width: 55 });
  await send(worker, page, 'set-enabled', { enabled: true });
  await expect.poll(async () => (await geometry(sibling)).width).toBe(880);
  expect((await send(worker, other, 'get-state')).enabled).toBe(false);
  await send(worker, page, 'toggle-narrower');
  await expect.poll(async () => (await geometry(sibling)).width).toBe(1584);
  expect((await send(worker, page, 'toggle-narrower')).width).toBe(55);
  await page.reload();
  expect((await send(worker, page, 'get-state')).width).toBe(55);
  expect((await geometry(page)).width).toBe(880);
});

test('keyboard actions have bounded widths and off/on behavior', async ({ context, worker }) => {
  const page = await open(context);
  expect((await send(worker, page, 'increase-width')).enabled).toBe(false);
  expect((await send(worker, page, 'decrease-width')).width).toBe(95);
  await send(worker, page, 'set-width', { width: 30 });
  expect((await send(worker, page, 'decrease-width')).width).toBe(30);
  expect((await geometry(page)).width).toBe(640);
  await send(worker, page, 'set-width', { width: 100 });
  expect((await send(worker, page, 'increase-width')).width).toBe(100);
  expect((await geometry(page)).width).toBe(1584);
});

test('already narrow pages and small windows are left alone', async ({ context, worker }) => {
  const page = await open(context);
  await page.addStyleTag({ content: 'body { max-width: 700px; margin: 12px auto; }' });
  await send(worker, page, 'set-enabled', { enabled: true });
  expect((await send(worker, page, 'get-state')).reason).toBe('already-fits');
  expect((await geometry(page)).width).toBe(700);
  await page.setViewportSize({ width: 600, height: 800 });
  expect((await send(worker, page, 'get-state')).reason).toBe('small-window');
  expect((await geometry(page)).width).toBe(600);
});

test('fixed-width and viewport-width layouts safely decline narrowing', async ({ context, worker }) => {
  const page = await open(context);
  await page.addStyleTag({ content: 'main { min-width: 1400px; }' });
  await send(worker, page, 'set-width', { width: 50 });
  expect((await send(worker, page, 'set-enabled', { enabled: true })).reason).toBe('layout');
  expect((await geometry(page)).width).toBe(1584);
  await page.addStyleTag({ content: 'main { min-width: 0; width: 100vw; }' });
  expect((await send(worker, page, 'get-state')).reason).toBe('layout');
  expect(await page.locator('style[data-narrower]').count()).toBe(0);
});

test('padding and borders are included in the requested width; printing is untouched', async ({ context, worker }) => {
  const page = await open(context);
  await page.addStyleTag({ content: 'body { padding: 0 30px; border: 4px solid; }' });
  await send(worker, page, 'set-width', { width: 60 });
  expect((await send(worker, page, 'set-enabled', { enabled: true })).reason).toBe('active');
  expect((await geometry(page)).width).toBe(960);
  await page.emulateMedia({ media: 'print' });
  expect((await geometry(page)).width).toBe(1584);
  await page.emulateMedia({ media: 'screen' });
  expect((await geometry(page)).width).toBe(960);
  await page.addStyleTag({ content: 'body { box-sizing: border-box; }' });
  expect((await send(worker, page, 'get-state')).reason).toBe('active');
  expect((await geometry(page)).width).toBe(960);
});

test('body replacement and site theme changes keep working', async ({ context, worker }) => {
  const page = await open(context);
  await send(worker, page, 'set-enabled', { enabled: true });
  await page.evaluate(() => {
    const replacement = document.createElement('body');
    replacement.innerHTML = '<main>SPA navigation</main>';
    replacement.className = 'new-site-theme';
    document.body.replaceWith(replacement);
  });
  await expect.poll(async () => (await geometry(page)).width).toBe(1280);
  await page.evaluate(() => { document.documentElement.className = 'theme dark'; });
  expect((await send(worker, page, 'get-state')).reason).toBe('active');
  expect(await page.locator('html').getAttribute('class')).toBe('theme dark');
  expect(await page.locator('body').getAttribute('class')).toBe('new-site-theme');
});

test('repeated injection is idempotent', async ({ context, worker }) => {
  const page = await open(context);
  await send(worker, page, 'set-enabled', { enabled: true });
  await worker.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({});
    const id = tabs.find((tab) => tab.url === url).id;
    for (let i = 0; i < 3; i++) {
      await chrome.scripting.executeScript({ target: { tabId: id }, files: ['settings.js', 'content.js'] });
    }
  }, page.url());
  expect((await send(worker, page, 'toggle-narrower')).enabled).toBe(false);
  expect((await send(worker, page, 'toggle-narrower')).enabled).toBe(true);
  expect(await page.locator('style[data-narrower]').count()).toBe(1);
});

test('popup preview avoids writes, commits once, cancels on close, and reset restores original', async ({ context, worker }) => {
  const page = await open(context);
  const popup = await popupFor(context, worker, page);
  await popup.getByRole('checkbox').check();
  await expect(popup.locator('#status')).toContainText('Centered');
  await popup.locator('body').screenshot({ path: test.info().outputPath('popup.png') });
  await popup.locator('#narrowerRange').evaluate((range) => {
    range.value = '60'; range.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect.poll(async () => (await geometry(page)).width).toBe(960);
  expect(await worker.evaluate(async () => (await chrome.storage.sync.get('narrower.site.one.test'))['narrower.site.one.test'].width)).toBe(80);
  await popup.close();
  await expect.poll(async () => (await geometry(page)).width).toBe(1280);
  const again = await popupFor(context, worker, page);
  await again.locator('#narrowerRange').evaluate((range) => {
    range.value = '65'; range.dispatchEvent(new Event('input', { bubbles: true }));
    range.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect.poll(async () => (await geometry(page)).width).toBe(1040);
  await expect.poll(async () => worker.evaluate(async () => (await chrome.storage.sync.get('narrower.site.one.test'))['narrower.site.one.test'].width)).toBe(65);
  await again.getByRole('button', { name: 'Reset site' }).click();
  await expect(again.getByRole('checkbox')).not.toBeChecked();
  expect((await geometry(page)).width).toBe(1584);
  await page.reload();
  expect((await send(worker, page, 'get-state')).enabled).toBe(false);
});

test('new asynchronous content that overflows restores the original layout', async ({ context, worker }) => {
  const page = await open(context);
  await send(worker, page, 'set-enabled', { enabled: true });
  expect((await geometry(page)).width).toBe(1280);
  await page.evaluate(() => {
    const content = document.createElement('section');
    content.style.width = '1500px';
    content.textContent = 'An asynchronously loaded wide widget';
    document.querySelector('main').appendChild(content);
  });
  await expect.poll(async () => (await geometry(page)).width).toBe(1584);
  expect((await send(worker, page, 'get-state')).reason).toBe('layout');
});

test('fullscreen pauses narrowing and exit restores it', async ({ context, worker }) => {
  const page = await open(context);
  await send(worker, page, 'set-enabled', { enabled: true });
  await page.evaluate(() => {
    document.querySelector('button').addEventListener('click', () => document.querySelector('main').requestFullscreen());
  });
  await page.getByRole('button', { name: 'Fixed button' }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  expect((await send(worker, page, 'get-state')).reason).toBe('fullscreen');
  expect(await page.locator('style[data-narrower]').count()).toBe(0);
  await page.evaluate(() => document.exitFullscreen());
  await expect.poll(async () => (await geometry(page)).width).toBe(1280);
});

test('RTL layouts center, but asymmetric root layouts are left unchanged', async ({ context, worker }) => {
  const page = await open(context);
  await page.evaluate(() => { document.documentElement.dir = 'rtl'; });
  expect((await send(worker, page, 'set-enabled', { enabled: true })).reason).toBe('active');
  expect(await geometry(page)).toEqual({ width: 1280, left: 160, right: 1440, viewport: 1600 });
  await page.addStyleTag({ content: 'html { padding-left: 200px; }' });
  expect((await send(worker, page, 'get-state')).reason).toBe('layout');
  expect(await page.locator('style[data-narrower]').count()).toBe(0);
});

test('strict page CSP cannot cause a false success or destroy the page', async ({ context, worker }) => {
  await context.route('https://csp.test/**', (route) => route.fulfill({
    contentType: 'text/html',
    headers: { 'content-security-policy': "default-src 'none'; style-src 'none'; script-src 'none'" },
    body: '<!doctype html><html><head><title>CSP</title></head><body><h1>Protected page</h1></body></html>',
  }));
  const page = await open(context, 'https://csp.test/article');
  const state = await send(worker, page, 'set-enabled', { enabled: true });
  expect(['active', 'layout']).toContain(state.reason);
  expect((await geometry(page)).width).toBe(state.reason === 'active' ? 1280 : 1584);
  await expect(page.getByRole('heading')).toHaveText('Protected page');
  await send(worker, page, 'set-enabled', { enabled: false });
  expect((await geometry(page)).width).toBe(1584);
});

test('failed persistence rolls a preview back instead of reporting success', async ({ context, worker }) => {
  const page = await open(context);
  await send(worker, page, 'set-enabled', { enabled: true });
  await send(worker, page, 'preview-width', { width: 60 });
  await worker.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({});
    await chrome.scripting.executeScript({
      target: { tabId: tabs.find((tab) => tab.url === url).id },
      func: () => { chrome.storage.sync.set = async () => { throw new Error('Test quota failure'); }; },
    });
  }, page.url());
  const result = await send(worker, page, 'set-width', { width: 60 });
  expect(result.ok).toBe(false);
  expect((await send(worker, page, 'get-state')).width).toBe(80);
  expect((await geometry(page)).width).toBe(1280);
});

test('popup gives an accessible, disabled state on browser pages', async ({ context, worker }) => {
  const page = await context.newPage();
  await page.goto('chrome://version');
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
  // Internal URLs are intentionally hidden without the broad tabs permission.
  await page.bringToFront();
  await popup.reload();
  await expect(popup.locator('#status')).toContainText("isn't available");
  await expect(popup.getByRole('checkbox')).toBeDisabled();
  await expect(popup.locator('#narrowerRange')).toBeDisabled();
});
