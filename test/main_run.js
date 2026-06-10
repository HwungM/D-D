const { chromium } = require('playwright');
const fs = require('fs');

function log(...a) { console.log(new Date().toISOString().slice(11,19), ...a); }

async function continueStep(page) {
  await page.click('button:has-text("Continue")');
  await page.waitForTimeout(400);
}

async function waitForResponse(page, who, maxMs = 100000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    await page.waitForTimeout(1200);
    if (await page.locator('text=Click to roll').count() > 0) {
      log(`  [${who}] -> dice modal: rolling`);
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
      log(`  [${who}] -> HIGH STAKES! responding yes-and`);
      const hsTextarea = page.locator('textarea[placeholder*="Negotiate"]');
      await hsTextarea.fill("Yes, and! I commit fully to the moment and push it further in our favor.");
      await page.click('button:has-text("Respond")');
      await page.waitForTimeout(1500);
      continue;
    }
    const textarea = page.locator('textarea').first();
    const isDisabled = await textarea.isDisabled().catch(() => true);
    const blocked = await page.locator('div.fixed.inset-0.z-50').count();
    if (!isDisabled && blocked === 0) return true;
  }
  log(`  [${who}] -> timeout waiting for response`);
  return false;
}

async function act(page, who, label, text) {
  log(`[${who}] ACTION [${label}]:`, text);
  await waitForResponse(page, who);
  await page.fill('textarea', text);
  await page.locator('button[type="submit"]:has-text("Act")').click({ timeout: 10000 }).catch(async () => {
    await waitForResponse(page, who);
    await page.locator('button[type="submit"]:has-text("Act")').click({ force: true });
  });
  await waitForResponse(page, who);
  await page.screenshot({ path: `/tmp/m-${who}-${label}.png`, fullPage: true });
}

(async () => {
  const browser = await chromium.launch({ args: ['--ignore-certificate-errors'] });

  // ========== KING: create campaign + character ==========
  const kingCtx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 1000 } });
  const kingPage = await kingCtx.newPage();
  kingPage.on('pageerror', e => log('KING PAGEERROR:', e.message));
  kingPage.on('response', async r => { if (r.url().includes('/api/') && r.status() >= 400) log('KING HTTP', r.status(), r.url(), await r.text().catch(()=>'')); });

  await kingPage.goto('http://localhost:3000/');
  await kingPage.click('text=King');
  await kingPage.waitForURL('**/dashboard', { timeout: 15000 });
  await kingPage.click('button:has-text("Enter the hall")').catch(() => {});
  await kingPage.waitForSelector('button:has-text("New Legend")', { timeout: 60000 });
  await kingPage.click('button:has-text("New Legend")');
  await kingPage.waitForURL('**/create-campaign', { timeout: 15000 });
  log('on campaign wizard');

  await kingPage.click('text=Collaborative Party');
  await kingPage.waitForTimeout(200);
  await continueStep(kingPage);

  await kingPage.click('text=Anything Goes');
  await continueStep(kingPage);

  await kingPage.click('text=One-Shot');
  await continueStep(kingPage);

  await kingPage.click('text=All of it equally');
  await continueStep(kingPage);

  await kingPage.click('text=Start now, invite later');
  await continueStep(kingPage);

  await kingPage.waitForTimeout(500);
  const seedButtons = await kingPage.$$('button:has(h3)');
  const seedTitle = await seedButtons[1].$eval('h3', el => el.textContent);
  log('chosen seed:', seedTitle);
  await seedButtons[1].click();
  await kingPage.waitForTimeout(200);
  await continueStep(kingPage);

  await kingPage.waitForTimeout(300);
  await kingPage.screenshot({ path: '/tmp/m-king-name-step.png', fullPage: true });
  await kingPage.click('button:has-text("Create Campaign")');
  log('creating campaign...');
  await kingPage.waitForURL('**/brief', { timeout: 150000 });
  const campaignId = kingPage.url().match(/campaign\/([^/]+)\/brief/)[1];
  log('campaignId:', campaignId);
  await kingPage.waitForTimeout(2000);
  await kingPage.screenshot({ path: '/tmp/m-king-brief.png', fullPage: true });

  // Add Sun Mi to campaign_members directly (workaround for missing party_invites table)
  const SUPA = 'https://cracdtuoknwmhcwddyoq.supabase.co';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  await fetch(`${SUPA}/rest/v1/campaign_members`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ campaign_id: campaignId, user_id: process.env.SUNMI_USER_ID }),
  }).then(r => r.json()).then(d => log('campaign_members insert:', JSON.stringify(d)));

  await kingPage.click('button:has-text("Create Your Character")');
  await kingPage.waitForURL('**/create-character', { timeout: 15000 });
  log('King on character create');
  await kingPage.waitForTimeout(1000);

  async function createCharacter(page, gender, raceIdx, portraitIdx, classIdx, name) {
    await page.click(`button:has-text("${gender}")`);
    await page.click('button:has-text("Choose Your Race")');
    await page.waitForTimeout(300);
    await page.click(`section button.group >> nth=${raceIdx}`);
    await page.waitForTimeout(300);
    await page.click('button:has-text("Choose Your Look")');
    await page.waitForTimeout(500);
    await page.click(`section button.group >> nth=${portraitIdx}`);
    await page.waitForTimeout(300);
    await page.click('button:has-text("Choose Your Class")');
    await page.waitForTimeout(300);
    await page.click(`section button.group >> nth=${classIdx}`);
    await page.waitForTimeout(300);
    await page.click('button:has-text("Roll Attributes")');
    await page.waitForTimeout(300);
    const selects = await page.$$('select');
    for (const sel of selects) {
      const options = await sel.$$eval('option', opts => opts.map(o => o.value).filter(v => v !== ''));
      if (options.length > 0) await sel.selectOption(options[0]);
    }
    await page.waitForTimeout(300);
    await page.click('button:has-text("Name Your Legend")');
    await page.waitForTimeout(300);
    await page.fill('input[placeholder="What do they call you?"]', name);
    await page.waitForTimeout(300);
    const btns = await page.$$('button');
    for (const b of btns) {
      const txt = (await b.innerText()).trim();
      if (/forge|begin|enter the world|start your story|create/i.test(txt) && !(await b.isDisabled())) { await b.click(); break; }
    }
    await page.waitForURL('**/play/**', { timeout: 90000 });
    return page.url().match(/play\/([^/]+)/)[1];
  }

  const kingCharId = await createCharacter(kingPage, 'Male', 0, 0, 0, 'Kingsley Dawnbreaker');
  log('KING IN GAME, characterId:', kingCharId);
  await kingPage.waitForTimeout(2000);
  fs.writeFileSync('/tmp/main_state.json', JSON.stringify({ campaignId, kingCharId }));

  // ========== SUN MI: join campaign + create character ==========
  const sunCtx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 1000 } });
  const sunPage = await sunCtx.newPage();
  sunPage.on('pageerror', e => log('SUNMI PAGEERROR:', e.message));
  sunPage.on('response', async r => { if (r.url().includes('/api/') && r.status() >= 400) log('SUNMI HTTP', r.status(), r.url(), await r.text().catch(()=>'')); });

  await sunPage.goto('http://localhost:3000/');
  await sunPage.click('text=Sun Mi');
  await sunPage.waitForURL('**/dashboard', { timeout: 15000 });
  log('Sun Mi logged in');
  await sunPage.click('button:has-text("Enter the hall")').catch(() => {});
  await sunPage.waitForTimeout(500);

  await sunPage.goto(`http://localhost:3000/campaign/${campaignId}/create-character`);
  await sunPage.waitForTimeout(2000);
  await sunPage.screenshot({ path: '/tmp/m-sunmi-cc.png', fullPage: true });

  const sunCharId = await createCharacter(sunPage, 'Female', 1, 0, 1, 'Sun Mi Stormblade');
  log('SUNMI IN GAME, characterId:', sunCharId);
  await sunPage.waitForTimeout(2000);

  // ========== Begin story for both ==========
  await kingPage.click('button:has-text("Enter the Story")');
  log('King story started');
  await waitForResponse(kingPage, 'KING');
  await kingPage.screenshot({ path: '/tmp/m-king-opening.png', fullPage: true });

  await sunPage.click('button:has-text("Enter the Story")').catch(() => {});
  await waitForResponse(sunPage, 'SUNMI');
  await sunPage.screenshot({ path: '/tmp/m-sunmi-opening.png', fullPage: true });

  // ========== Alternate playthrough ==========
  await act(kingPage, 'KING', '01-explore', 'I scan the area carefully, taking note of the surroundings, exits, and anything unusual.');
  await act(sunPage, 'SUNMI', '02-greet', 'I wave to my companion and ask what they make of this place, ready to back their play.');
  await act(kingPage, 'KING', '03-talk', 'I approach the nearest person and strike up a conversation, asking about this place and what help they might need.');
  await act(sunPage, 'SUNMI', '04-yesand', 'That sounds incredible! I jump in enthusiastically, building on what they just said and pushing the idea further.');
  await act(kingPage, 'KING', '05-pickpocket', 'While my companion keeps them talking, I quietly try to lift something useful from the nearest person without being noticed.');
  await act(sunPage, 'SUNMI', '06-gift', 'I offer a small token from my pack to the person we are talking to, hoping to earn their trust.');
  await act(kingPage, 'KING', '07-explore2', 'I push further into the area, looking for hidden passages, loot, or anything of value.');
  await act(sunPage, 'SUNMI', '08-combat', 'If anything hostile is near, I draw my weapon and engage it. Otherwise I provoke a nearby creature to start a fight.');
  await act(kingPage, 'KING', '09-assist-combat', 'I jump into the fight alongside my companion, striking at the same target to bring it down faster.');
  await act(sunPage, 'SUNMI', '10-loot', 'After the fight, we search the area and the bodies for loot, treasure, or anything useful.');
  await act(kingPage, 'KING', '11-diversion', 'I create a loud diversion - shouting and knocking something over - to give my companion a chance to slip past unseen.');
  await act(sunPage, 'SUNMI', '12-sneak', 'While the diversion draws attention, I sneak past quietly toward whatever seems important.');
  await act(kingPage, 'KING', '13-investigate', 'I investigate the most mysterious or important-looking object or location nearby, examining it closely.');
  await act(sunPage, 'SUNMI', '14-bond', 'I take a moment to share something personal with my companion about why I am on this journey.');
  await act(kingPage, 'KING', '15-push-forward', 'I rally my companion and push forward toward whatever goal or threat seems most pressing right now.');
  await act(sunPage, 'SUNMI', '16-climax', 'I commit fully to whatever confrontation or challenge is unfolding, giving it everything I have.');

  await kingPage.screenshot({ path: '/tmp/m-king-final.png', fullPage: true });
  await sunPage.screenshot({ path: '/tmp/m-sunmi-final.png', fullPage: true });

  await browser.close();
  log('done main run');
})();
