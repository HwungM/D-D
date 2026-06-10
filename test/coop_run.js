const { chromium } = require('playwright');
const fs = require('fs');

function log(...a) { console.log(new Date().toISOString().slice(11,19), ...a); }

const { campaignId, characterId: kingCharId } = JSON.parse(fs.readFileSync('/tmp/king_state.json', 'utf-8'));

const SQUIRE_SESSION = JSON.parse(fs.readFileSync('/tmp/squire_session.json', 'utf-8'));

async function waitForResponse(page, maxMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    await page.waitForTimeout(1200);
    if (await page.locator('text=Click to roll').count() > 0) {
      log('  -> dice modal: rolling');
      await page.locator('aside button').first().click();
      await page.waitForTimeout(2500);
      continue;
    }
    if (await page.locator('text=/vs DC/').count() > 0) {
      const contBtn = page.locator('aside button').nth(1);
      if (await contBtn.count() > 0 && await contBtn.isVisible()) await contBtn.click();
      await page.waitForTimeout(1000);
      continue;
    }
    if (await page.locator('text=High Stakes').count() > 0) {
      log('  -> HIGH STAKES! responding yes-and');
      const hsTextarea = page.locator('textarea[placeholder*="Negotiate"]');
      await hsTextarea.fill("Yes, and! I commit fully to the moment and push it further.");
      await page.click('button:has-text("Respond")');
      await page.waitForTimeout(1500);
      continue;
    }
    const textarea = page.locator('textarea').first();
    const isDisabled = await textarea.isDisabled().catch(() => true);
    const blocked = await page.locator('div.fixed.inset-0.z-50').count();
    if (!isDisabled && blocked === 0) return;
  }
  log('  -> timeout waiting for response');
}

async function act(label, page, who, text) {
  log(`[${who}] ACTION [${label}]:`, text);
  await waitForResponse(page);
  await page.fill('textarea', text);
  await page.locator('button[type="submit"]:has-text("Act")').click({ timeout: 10000 }).catch(async () => {
    await waitForResponse(page);
    await page.locator('button[type="submit"]:has-text("Act")').click({ force: true });
  });
  await waitForResponse(page);
  await page.screenshot({ path: `/tmp/coop-${who}-${label}.png`, fullPage: true });
}

(async () => {
  const browser = await chromium.launch({ args: ['--ignore-certificate-errors'] });

  // ---- King context: login fresh and go to existing campaign play page ----
  const kingCtx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
  const kingPage = await kingCtx.newPage();
  kingPage.on('response', async r => { if (r.url().includes('/api/') && r.status() >= 400) log('KING HTTP', r.status(), r.url(), await r.text().catch(()=>'')); });
  await kingPage.goto('http://localhost:3000/');
  await kingPage.click('text=King');
  await kingPage.waitForURL('**/dashboard', { timeout: 15000 });
  await kingPage.click('button:has-text("Enter the hall")').catch(() => {});
  await kingPage.waitForTimeout(500);
  await kingPage.goto(`http://localhost:3000/campaign/${campaignId}/play/${kingCharId}`);
  await kingPage.waitForTimeout(3000);
  await kingPage.screenshot({ path: '/tmp/coop-king-start.png', fullPage: true });
  log('King ready in game');

  // ---- Squire context: inject session, create character, join game ----
  const squireCtx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
  await squireCtx.addInitScript((session) => {
    const state = { state: { session, user: { id: session.user.id, email: session.user.email, username: 'squire' } }, version: 0 };
    localStorage.setItem('dnd-auth', JSON.stringify(state));
    localStorage.setItem('sb-cracdtuoknwmhcwddyoq-auth-token', JSON.stringify(session));
  }, SQUIRE_SESSION);
  const squirePage = await squireCtx.newPage();
  squirePage.on('response', async r => { if (r.url().includes('/api/') && r.status() >= 400) log('SQUIRE HTTP', r.status(), r.url(), await r.text().catch(()=>'')); });
  squirePage.on('pageerror', e => log('SQUIRE PAGEERROR:', e.message));

  await squirePage.goto('http://localhost:3000/');
  await squirePage.waitForTimeout(1500);
  await squirePage.evaluate((url) => { window.history.pushState({}, '', url); window.dispatchEvent(new PopStateEvent('popstate')); }, `/campaign/${campaignId}/create-character`);
  await squirePage.waitForTimeout(2000);
  await squirePage.screenshot({ path: '/tmp/coop-squire-cc.png', fullPage: true });

  // Step 0: Gender
  await squirePage.click('button:has-text("Female")');
  await squirePage.click('button:has-text("Choose Your Race")');
  await squirePage.waitForTimeout(300);

  // Step 1: Race
  await squirePage.click('section button.group >> nth=1');
  await squirePage.waitForTimeout(300);
  await squirePage.click('button:has-text("Choose Your Look")');
  await squirePage.waitForTimeout(500);

  // Step 2: Portrait
  await squirePage.click('section button.group >> nth=0');
  await squirePage.waitForTimeout(300);
  await squirePage.click('button:has-text("Choose Your Class")');
  await squirePage.waitForTimeout(300);

  // Step 3: Class
  await squirePage.click('section button.group >> nth=1');
  await squirePage.waitForTimeout(300);
  await squirePage.click('button:has-text("Roll Attributes")');
  await squirePage.waitForTimeout(300);

  // Step 4: Attributes
  const selects = await squirePage.$$('select');
  log('squire selects found:', selects.length);
  for (const sel of selects) {
    const options = await sel.$$eval('option', opts => opts.map(o => o.value).filter(v => v !== ''));
    if (options.length > 0) await sel.selectOption(options[0]);
  }
  await squirePage.waitForTimeout(300);
  await squirePage.click('button:has-text("Name Your Legend")');
  await squirePage.waitForTimeout(300);

  // Step 5: Name & create
  await squirePage.fill('input[placeholder="What do they call you?"]', 'Squire Dawnbreaker');
  await squirePage.waitForTimeout(300);
  const btns = await squirePage.$$('button');
  for (const b of btns) {
    const txt = (await b.innerText()).trim();
    if (/forge|begin|enter the world|start your story|create/i.test(txt) && !(await b.isDisabled())) { await b.click(); break; }
  }
  log('squire clicked create, waiting for game...');
  await squirePage.waitForURL('**/play/**', { timeout: 90000 });
  const squireCharId = squirePage.url().match(/play\/([^/]+)/)[1];
  log('SQUIRE IN GAME, characterId:', squireCharId);
  await squirePage.waitForTimeout(2000);
  await squirePage.screenshot({ path: '/tmp/coop-squire-game.png', fullPage: true });

  // Both should now see each other in party. Reload King's page to pick up party member.
  await kingPage.reload();
  await kingPage.waitForTimeout(3000);
  await kingPage.screenshot({ path: '/tmp/coop-king-after-squire-join.png', fullPage: true });

  // King continues exploring
  await act('coop1-king-explore', kingPage, 'KING', 'I look around for my companion and call out to see if she has caught up with me.');

  // Squire enters story
  await squirePage.click('button:has-text("Enter the Story")').catch(() => {});
  await waitForResponse(squirePage);
  await squirePage.screenshot({ path: '/tmp/coop-squire-opening.png', fullPage: true });

  // Squire creates a diversion
  await act('coop2-squire-diversion', squirePage, 'SQUIRE', 'I spot trouble brewing for my ally and create a loud diversion - knocking over a stack of crates and shouting - to draw everyone\'s attention away from them.');

  // King reacts
  await kingPage.reload();
  await waitForResponse(kingPage);
  await act('coop3-king-react', kingPage, 'KING', 'Hearing the commotion, I use the distraction to slip away and continue investigating unnoticed.');

  await kingCtx.storageState({ path: '/tmp/king_storage.json' });
  await browser.close();
  log('done coop run');
})();
