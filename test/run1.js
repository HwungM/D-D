const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--ignore-certificate-errors'] });
  const page = await browser.newPage({ ignoreHTTPSErrors: true });
  page.on('console', m => console.log('CONSOLE:', m.type(), m.text()));
  page.on('response', async r => { if (r.url().includes('/api/')) console.log('HTTP', r.status(), r.url().replace('http://localhost:3001/api','')); });
  page.on('pageerror', e => console.log('PAGEERROR:', e.message));
  await page.goto('http://localhost:3000/');
  await page.waitForTimeout(1000);
  await page.click('text=King');
  await page.waitForTimeout(4000);
  console.log('URL:', page.url());
  await page.screenshot({ path: '/tmp/01-after-login.png', fullPage: true });
  await page.waitForTimeout(2000);
  console.log('BODY:', (await page.innerText('body')));
  await page.screenshot({ path: '/tmp/02-dashboard.png', fullPage: true });
  await browser.close();
})();
