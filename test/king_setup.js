const { chromium } = require('playwright');
const fs = require('fs');

function log(...a) { console.log(new Date().toISOString().slice(11,19), ...a); }

async function continueStep(page) {
  await page.click('button:has-text("Continue")');
  await page.waitForTimeout(400);
}

(async () => {
  const browser = await chromium.launch({ args: ['--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', e => log('PAGEERROR:', e.message));
  page.on('response', async r => { if (r.url().includes('/api/') && r.status() >= 400) log('HTTP', r.status(), r.url(), await r.text().catch(()=>'')); });

  await page.goto('http://localhost:3000/');
  await page.click('text=King');
  await page.waitForURL('**/dashboard', { timeout: 15000 });
  log('logged in as King');

  await page.click('text=Enter the hall');
  await page.waitForSelector('button:has-text("New Legend")', { timeout: 60000 });
  await page.screenshot({ path: '/tmp/k00-dashboard.png', fullPage: true });
  await page.click('button:has-text("New Legend")');
  await page.waitForURL('**/create-campaign', { timeout: 15000 });
  log('on campaign wizard');

  // Step 0: Party Shape -> Collaborative, start now invite later
  await page.click('text=Collaborative Party');
  await page.waitForTimeout(200);
  await continueStep(page);

  // Step 1: Tone
  await page.click('text=Anything Goes');
  await continueStep(page);

  // Step 2: Scope -> One-Shot for speed
  await page.click('text=One-Shot');
  await continueStep(page);

  // Step 3: Pillars
  await page.click('text=All of it equally');
  await continueStep(page);

  // Step 4: Party Gate -> Start now, invite later
  await page.click('text=Start now, invite later');
  await continueStep(page);

  // Step 5: World Spark - pick first seed
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/k02-seeds.png' });
  const seedButtons = await page.$$('button:has(h3)');
  await seedButtons[0].click();
  await page.waitForTimeout(200);
  await continueStep(page);

  // Step 6: Name -> create
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/k03-name.png' });
  await page.click('button:has-text("Create Campaign and Invite Party")');
  log('creating campaign...');
  await page.waitForURL('**/brief', { timeout: 60000 });
  log('on brief page');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/k04-brief.png', fullPage: true });

  // Generate invite (expected to fail - party_invites table missing from DB)
  await page.click('text=Generate Invite Link');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/k05-invite.png', fullPage: true });

  const inviteText = await page.locator('text=/\\/join\\//').first().innerText().catch(() => null);
  log('invite text:', inviteText);

  const campaignId = page.url().match(/campaign\/([^/]+)\/brief/)[1];
  log('campaignId:', campaignId);

  // Proceed to character creation
  await page.click('button:has-text("Create Your Character")');
  await page.waitForURL('**/create-character', { timeout: 15000 });
  log('on character create');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/k06-charcreate.png', fullPage: true });

  // Step 0: Gender
  await page.click('button:has-text("Male")');
  await page.click('button:has-text("Choose Your Race")');
  await page.waitForTimeout(300);

  // Step 1: Race
  await page.click('section button.group >> nth=0');
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/c01-race.png', fullPage: true });
  await page.click('button:has-text("Choose Your Look")');
  await page.waitForTimeout(500);

  // Step 2: Portrait
  await page.screenshot({ path: '/tmp/c02-portrait.png', fullPage: true });
  await page.click('section button.group >> nth=0');
  await page.waitForTimeout(300);
  await page.click('button:has-text("Choose Your Class")');
  await page.waitForTimeout(300);

  // Step 3: Class
  await page.screenshot({ path: '/tmp/c03-class.png', fullPage: true });
  await page.click('section button.group >> nth=0');
  await page.waitForTimeout(300);
  await page.click('button:has-text("Roll Attributes")');
  await page.waitForTimeout(300);

  // Step 4: Attributes
  await page.screenshot({ path: '/tmp/c04-attrs.png', fullPage: true });
  const selects = await page.$$('select');
  log('selects found:', selects.length);
  for (const sel of selects) {
    const options = await sel.$$eval('option', opts => opts.map(o => o.value).filter(v => v !== ''));
    if (options.length > 0) await sel.selectOption(options[0]);
  }
  await page.waitForTimeout(300);
  await page.click('button:has-text("Name Your Legend")');
  await page.waitForTimeout(300);

  // Step 5: Name & create
  await page.screenshot({ path: '/tmp/c05-name.png', fullPage: true });
  await page.fill('input[placeholder="What do they call you?"]', 'Kingsley Dawnbreaker');
  await page.waitForTimeout(300);
  const btns = await page.$$('button');
  for (const b of btns) {
    const txt = (await b.innerText()).trim();
    if (/forge|begin|enter the world|start your story|create/i.test(txt) && !(await b.isDisabled())) { await b.click(); break; }
  }
  log('clicked create, waiting for game...');
  await page.waitForURL('**/play/**', { timeout: 90000 });
  log('IN GAME, url:', page.url());
  const characterId = page.url().match(/play\/([^/]+)/)[1];
  await page.waitForTimeout(4000);
  await page.screenshot({ path: '/tmp/c06-game.png', fullPage: true });

  fs.writeFileSync('/tmp/king_state.json', JSON.stringify({ campaignId, characterId }, null, 2));

  // Click "Enter the Story" to start
  await page.click('button:has-text("Enter the Story")');
  log('story started');

  async function waitForResponse(maxMs = 90000) {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      await page.waitForTimeout(1200);

      // Dice roll modal
      if (await page.locator('text=Click to roll').count() > 0) {
        log('  -> dice modal: rolling');
        await page.locator('aside button').first().click();
        await page.waitForTimeout(2500);
        continue;
      }
      if (await page.locator('text=/vs DC/').count() > 0) {
        log('  -> dice modal: continuing');
        const contBtn = page.locator('aside button').nth(1);
        if (await contBtn.count() > 0 && await contBtn.isVisible()) {
          await contBtn.click();
        }
        await page.waitForTimeout(1000);
        continue;
      }

      // High stakes improv prompt
      if (await page.locator('text=High Stakes').count() > 0) {
        log('  -> HIGH STAKES moment! Responding with "yes, and" improv.');
        const hsTextarea = page.locator('textarea[placeholder*="Negotiate"]');
        await hsTextarea.fill("Yes, and! I lean into it - I commit fully to the moment, embracing the twist and pushing the situation further in my favor.");
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

  async function act(label, text) {
    log(`ACTION [${label}]:`, text);
    await waitForResponse();
    await page.fill('textarea', text);
    await page.locator('button:has-text("Act")').click({ timeout: 10000 }).catch(async (e) => {
      log('  -> Act click failed, retrying after dismissing modals:', e.message.split('\n')[0]);
      await waitForResponse();
      await page.locator('button:has-text("Act")').click({ force: true });
    });
    await waitForResponse();
    await page.screenshot({ path: `/tmp/g-${label}.png`, fullPage: true });
  }

  await waitForResponse();
  await page.screenshot({ path: '/tmp/g00-opening.png', fullPage: true });

  await act('01-explore', 'I look around carefully, taking in my surroundings and noting any points of interest, paths, or threats.');
  await act('02-talk', 'I approach the nearest person I can see and strike up a friendly conversation, asking them about this place and what they need help with.');
  await act('03-yesand', "That's a fascinating offer! I happily go along with it and build on the idea, eager to see where this leads.");
  await act('04-pickpocket', 'While the conversation continues, I subtly try to pick the pocket of the person nearest to me, attempting to lift a small item or coin purse without being noticed.');
  await act('05-gift', 'I offer a small gift from my pack to the NPC as a gesture of goodwill, hoping to earn their trust and favor.');
  await act('06-explore2', 'I move further into the area, searching for hidden passages, loot, or anything valuable I can pick up along the way.');
  await act('07-combat', 'If anything hostile is nearby, I draw my weapon and attack it. Otherwise, I provoke a nearby creature to start a fight so I can test my combat skills.');
  await act('08-loot', 'After the fight, I search the bodies and the area for loot, weapons, or treasure.');
  await act('09-diversion', 'I create a loud diversion - knocking over something or shouting - to draw attention away so an ally could slip past unseen.');

  await page.screenshot({ path: '/tmp/g99-final.png', fullPage: true });
  await context.storageState({ path: '/tmp/king_storage.json' });

  await browser.close();
  log('done full playthrough');
})();
