const { chromium } = require('playwright');
const fs = require('fs');

function log(...a) { console.log(new Date().toISOString().slice(11,19), ...a); }

(async () => {
  const { campaignId } = JSON.parse(fs.readFileSync('/tmp/king_state.json', 'utf-8'));
  const browser = await chromium.launch({ args: ['--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 1000 }, storageState: '/tmp/king_storage.json' });
  const page = await context.newPage();
  page.on('pageerror', e => log('PAGEERROR:', e.message));
  page.on('response', async r => { if (r.url().includes('/api/') && r.status() >= 400) log('HTTP', r.status(), r.url(), await r.text().catch(()=>'')); });

  await page.goto(`http://localhost:3000/campaign/${campaignId}/create-character`);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/c00-start.png', fullPage: true });

  // Step 0: Gender
  await page.click('button:has-text("Male")');
  await page.click('button:has-text("Choose Your Race")');
  await page.waitForTimeout(300);

  // Step 1: Race - pick first race card
  await page.click('section button.group >> nth=0');
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/c01-race.png', fullPage: true });
  await page.click('button:has-text("Choose Your Look")');
  await page.waitForTimeout(500);

  // Step 2: Portrait - pick first portrait
  await page.screenshot({ path: '/tmp/c02-portrait.png', fullPage: true });
  await page.click('section button.group >> nth=0');
  await page.waitForTimeout(300);
  await page.click('button:has-text("Choose Your Class")');
  await page.waitForTimeout(300);

  // Step 3: Class - pick first class card
  await page.screenshot({ path: '/tmp/c03-class.png', fullPage: true });
  await page.click('section button.group >> nth=0');
  await page.waitForTimeout(300);
  await page.click('button:has-text("Roll Attributes")');
  await page.waitForTimeout(300);

  // Step 4: Attributes - assign each select to first non-empty option
  await page.screenshot({ path: '/tmp/c04-attrs.png', fullPage: true });
  const selects = await page.$$('select');
  log('selects found:', selects.length);
  for (const sel of selects) {
    const options = await sel.$$eval('option', opts => opts.map(o => o.value).filter(v => v !== ''));
    // pick the option that is currently selected if none yet -> first available
    if (options.length > 0) {
      await sel.selectOption(options[0]);
    }
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/c04b-attrs-assigned.png', fullPage: true });
  await page.click('button:has-text("Name Your Legend")');
  await page.waitForTimeout(300);

  // Step 5: Name & create
  await page.screenshot({ path: '/tmp/c05-name.png', fullPage: true });
  await page.fill('input[placeholder="What do they call you?"]', 'Kingsley Dawnbreaker');
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/c05b-name-filled.png', fullPage: true });

  await page.click('button:has-text("Forge"), button:has-text("Begin"), button[disabled=false]:has-text("Legend")').catch(async () => {
    // fallback: find the create button by its position (last amber button)
    const btns = await page.$$('button');
    for (const b of btns) {
      const txt = (await b.innerText()).trim();
      if (/forge|begin|enter the world|start your story/i.test(txt)) { await b.click(); return; }
    }
  });

  log('clicked create, waiting for navigation...');
  await page.waitForURL('**/play/**', { timeout: 60000 });
  log('IN GAME, url:', page.url());
  const characterId = page.url().match(/play\/([^/]+)/)[1];
  fs.writeFileSync('/tmp/king_state.json', JSON.stringify({ campaignId, characterId }, null, 2));
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/tmp/c06-game.png', fullPage: true });

  await context.storageState({ path: '/tmp/king_storage.json' });
  await browser.close();
  log('done phase 2');
})();
