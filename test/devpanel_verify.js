const fs = require('fs');

const API = 'http://localhost:3001/api';
const SUPA = 'https://cracdtuoknwmhcwddyoq.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LOG = '/tmp/devpanel_verify.log';

function log(...a) {
  const line = `${new Date().toISOString()} ${a.map(x => typeof x === 'string' ? x : JSON.stringify(x, null, 2)).join(' ')}`;
  console.log(line);
  fs.appendFileSync(LOG, line + '\n');
}

async function api(token, method, path, body) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try { data = await r.json(); } catch { data = null; }
  return { status: r.status, data };
}

async function login(username) {
  const { status, data } = await api(null, 'POST', '/auth/login', { username, password: 'tavern2024' });
  if (status !== 200) throw new Error(`login ${username} failed: ${status} ${JSON.stringify(data)}`);
  return { token: data.session.access_token, userId: data.user.id, username };
}

async function getCampaign(campaignId) {
  const r = await fetch(`${SUPA}/rest/v1/campaigns?id=eq.${campaignId}&select=world_state,act,campaign_type,world_bible`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  const d = await r.json();
  return d?.[0];
}

async function resolveRollIfNeeded(token, characterId, campaignId, res, who) {
  let r = res;
  let rolls = 0;
  while (r?.data?.awaitingRoll && r.data.rollContext && rolls < 3) {
    rolls++;
    log(`[${who}] awaitingRoll, resolving...`, JSON.stringify(r.data.rollContext));
    r = await api(token, 'POST', '/game/resolve-roll', { characterId, campaignId, rollContext: r.data.rollContext });
    log(`[${who}] roll-resolve status=${r.status}`);
  }
  return r;
}

async function doAction(token, who, charId, campaignId, text) {
  log(`[${who}] ACTION: ${text}`);
  let res = await api(token, 'POST', '/game/action', { characterId: charId, campaignId, action: text });
  if (res.status >= 400) {
    log(`[${who}] ERROR status=${res.status}`, JSON.stringify(res.data));
    return res;
  }
  res = await resolveRollIfNeeded(token, charId, campaignId, res, who);
  const status = res.data?.status;
  if (status === 'waiting') {
    log(`[${who}] -> waiting for partner (${res.data.submittedCount}/${res.data.neededCount})`);
  } else {
    const narr = (res.data?.narration || res.data?.result?.narration || '').slice(0, 400);
    log(`[${who}] -> resolved. narration: ${narr}`);
    log(`[${who}] -> raw result keys:`, Object.keys(res.data || {}));
    if (res.data?.endgameResolved || res.data?.result?.endgameResolved) log(`[${who}] -> endgameResolved flag in response!`);
  }
  return res;
}

async function devPatch(token, campaignId, patch) {
  const res = await api(token, 'POST', `/game/dev-patch/${campaignId}`, patch);
  log('dev-patch', JSON.stringify(patch), '-> status', res.status, JSON.stringify(res.data?.error || 'ok'));
  return res;
}

(async () => {
  log('=== DEV PANEL VERIFICATION START ===');

  const king = await login('king');
  const sunmi = await login('sunmi');
  log('King userId:', king.userId, 'SunMi userId:', sunmi.userId);

  const seedsRes = await api(king.token, 'GET', '/campaigns/seeds');
  const seed = seedsRes.data?.seeds?.campaigns?.[0] || seedsRes.data?.seeds;
  log('Chosen seed:', seed.title);

  const createRes = await api(king.token, 'POST', '/campaigns', {
    name: `Dev Panel Verify ${Date.now()}`,
    storySeed: seed.premise || seed.title,
    campaignType: 'testing',
    playerPreferences: {
      playMode: 'collaborative',
      partyIntent: 'longtime friends',
      campaignLength: 'medium',
      tone: 'balanced',
      artStyle: 'fantasy',
      favoritePillars: ['combat', 'exploration', 'social'],
      playerCount: 2,
      targetPlayerCount: 2,
      waitForParty: true,
    },
  });
  if (createRes.status >= 400) { log('Campaign creation failed:', createRes.status, JSON.stringify(createRes.data)); process.exit(1); }
  const campaignId = createRes.data.id || createRes.data.campaign?.id;
  log('campaignId:', campaignId);

  const memberRes = await fetch(`${SUPA}/rest/v1/campaign_members`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ campaign_id: campaignId, user_id: sunmi.userId }),
  });
  log('campaign_members insert status:', memberRes.status);

  const kingCharRes = await api(king.token, 'POST', '/characters', {
    campaignId, name: 'Kingsley Dawnbreaker', race: 'Human', class: 'Fighter', generatePortrait: false,
    backstory: "Kingsley swore vengeance against the warlord who killed his brother Aldric.",
  });
  if (kingCharRes.status >= 400) { log('King char create failed:', kingCharRes.status, JSON.stringify(kingCharRes.data)); process.exit(1); }
  const kingCharId = kingCharRes.data.id || kingCharRes.data.character?.id;
  log('kingCharId:', kingCharId);

  const sunmiCharRes = await api(sunmi.token, 'POST', '/characters', {
    campaignId, name: 'Sun Mi Stormblade', race: 'Elf', class: 'Rogue', generatePortrait: false,
    backstory: "Sun Mi is the last survivor of a destroyed monastery, seeking remnants of her order.",
  });
  if (sunmiCharRes.status >= 400) { log('SunMi char create failed:', sunmiCharRes.status, JSON.stringify(sunmiCharRes.data)); process.exit(1); }
  const sunmiCharId = sunmiCharRes.data.id || sunmiCharRes.data.character?.id;
  log('sunmiCharId:', sunmiCharId);

  fs.writeFileSync('/tmp/devpanel_state.json', JSON.stringify({ campaignId, kingCharId, sunmiCharId }, null, 2));

  const kingStart = await api(king.token, 'POST', '/game/start', { characterId: kingCharId, campaignId });
  log('King start status:', kingStart.status);
  const sunmiStart = await api(sunmi.token, 'POST', '/game/start', { characterId: sunmiCharId, campaignId });
  log('SunMi start status:', sunmiStart.status);

  let camp = await getCampaign(campaignId);
  log('--- INITIAL world_bible antagonistRoster ---', JSON.stringify(camp.world_bible?.antagonistRoster?.map(a => ({ name: a.name, isRevealed: a.isRevealed, planSteps: a.planSteps?.length }))));
  log('--- INITIAL primaryAntagonist ---', JSON.stringify(camp.world_bible?.primaryAntagonist ? { name: camp.world_bible.primaryAntagonist.name, isRevealed: camp.world_bible.primaryAntagonist.isRevealed } : null));

  // ===================== CHECK 2: Endgame pacing =====================
  log('\n========== CHECK 2: ENDGAME PACING ==========');
  await devPatch(king.token, campaignId, { worldState: { actionCount: (camp.world_state.actionCount || 0) + 20, actionsInCurrentAct: (camp.world_state.actionsInCurrentAct || 0) + 20 } });
  await devPatch(king.token, campaignId, { worldState: { actionCount: (camp.world_state.actionCount || 0) + 40, actionsInCurrentAct: (camp.world_state.actionsInCurrentAct || 0) + 40 } });
  await devPatch(king.token, campaignId, { worldState: { endgamePhase: 'approaching' } });
  camp = await getCampaign(campaignId);
  log('After patches: actionCount=', camp.world_state.actionCount, 'endgamePhase=', camp.world_state.endgamePhase);

  await doAction(king.token, 'KING', kingCharId, campaignId, "I look around at the state of things and ask my companion what we should do next.");
  await doAction(sunmi.token, 'SUNMI', sunmiCharId, campaignId, "I share my thoughts on our situation and what we should focus on next.");

  camp = await getCampaign(campaignId);
  log('After APPROACHING action: endgamePhase=', camp.world_state.endgamePhase, 'endgameResolved=', camp.world_state.endgameResolved);

  await devPatch(king.token, campaignId, { worldState: { endgamePhase: 'confrontation' } });
  camp = await getCampaign(campaignId);
  log('After patch to CONFRONTATION: endgamePhase=', camp.world_state.endgamePhase);

  await doAction(king.token, 'KING', kingCharId, campaignId, "I draw my weapon and charge straight at the heart of the threat, giving everything I have to end this once and for all.");
  await doAction(sunmi.token, 'SUNMI', sunmiCharId, campaignId, "I strike at our enemy's weak point with everything I've got, fighting alongside Kingsley to finish this.");

  camp = await getCampaign(campaignId);
  log('After CONFRONTATION actions: endgamePhase=', camp.world_state.endgamePhase, 'endgameResolved=', camp.world_state.endgameResolved);

  // Try to push to victory
  await doAction(king.token, 'KING', kingCharId, campaignId, "With one final, decisive blow, I land the killing strike on our enemy, claiming victory!");
  await doAction(sunmi.token, 'SUNMI', sunmiCharId, campaignId, "I land a finishing blow alongside Kingsley to seal our victory over our enemy!");

  camp = await getCampaign(campaignId);
  log('After victory push: endgamePhase=', camp.world_state.endgamePhase, 'endgameResolved=', camp.world_state.endgameResolved);

  // ===================== CHECK 3: [UNKNOWN] antagonist =====================
  log('\n========== CHECK 3: [UNKNOWN] ANTAGONIST RESOLUTION ==========');
  // reset endgame so subsequent checks aren't in confrontation
  await devPatch(king.token, campaignId, { worldState: { endgamePhase: 'none' } });
  camp = await getCampaign(campaignId);
  const unrevealed = camp.world_bible?.antagonistRoster?.find(a => !a.isRevealed);
  log('Unrevealed antagonist in roster:', unrevealed ? unrevealed.name : 'none found');

  await doAction(king.token, 'KING', kingCharId, campaignId, "I investigate any clues about who or what has been secretly orchestrating events behind the scenes, trying to learn more about this hidden threat.");
  await doAction(sunmi.token, 'SUNMI', sunmiCharId, campaignId, "I help Kingsley dig for information about the mysterious force working against us from the shadows.");

  camp = await getCampaign(campaignId);
  log('antagonistProgress after investigation:', JSON.stringify(camp.world_state.antagonistProgress));

  // ===================== CHECK 4: futureHooks resolution =====================
  log('\n========== CHECK 4: FUTURE HOOKS RESOLUTION ==========');
  const devHook = {
    id: require('crypto').randomUUID(),
    description: '[DEV TEST] A debt comes due: the merchant we helped earlier sends word that they need urgent help repaying a dangerous debt collector who is now after them.',
    source: 'dev-panel',
    createdAt: new Date().toISOString(),
    resolved: false,
  };
  camp = await getCampaign(campaignId);
  const existingHooks = camp.world_state.futureHooks || [];
  await devPatch(king.token, campaignId, { worldState: { futureHooks: [...existingHooks, devHook] } });
  log('Seeded dev future hook id:', devHook.id);

  const r1 = await doAction(king.token, 'KING', kingCharId, campaignId, "Suddenly I remember something important - a merchant we helped before might be in trouble now and could need our help with a debt collector. I bring this up to my companion urgently.");
  const r2 = await doAction(sunmi.token, 'SUNMI', sunmiCharId, campaignId, "I agree we should go help that merchant with their debt collector problem right away, and we head off to confront the debt collector and resolve this once and for all.");

  log('resolvedFutureHookIds in r1:', JSON.stringify(r1.data?.resolvedFutureHookIds || r1.data?.result?.resolvedFutureHookIds));
  log('resolvedFutureHookIds in r2:', JSON.stringify(r2.data?.resolvedFutureHookIds || r2.data?.result?.resolvedFutureHookIds));

  camp = await getCampaign(campaignId);
  const hookAfter = (camp.world_state.futureHooks || []).find(h => h.id === devHook.id);
  log('Dev hook state after actions:', JSON.stringify(hookAfter));

  // One more push if not resolved yet
  if (hookAfter && !hookAfter.resolved) {
    const r3 = await doAction(king.token, 'KING', kingCharId, campaignId, "We track down the debt collector and confront them directly, paying off or settling the merchant's debt to resolve this issue for good.");
    const r4 = await doAction(sunmi.token, 'SUNMI', sunmiCharId, campaignId, "I back up Kingsley as we settle the debt collector situation for the merchant once and for all.");
    log('resolvedFutureHookIds in r3:', JSON.stringify(r3.data?.resolvedFutureHookIds || r3.data?.result?.resolvedFutureHookIds));
    log('resolvedFutureHookIds in r4:', JSON.stringify(r4.data?.resolvedFutureHookIds || r4.data?.result?.resolvedFutureHookIds));
    camp = await getCampaign(campaignId);
    const hookAfter2 = (camp.world_state.futureHooks || []).find(h => h.id === devHook.id);
    log('Dev hook state after second push:', JSON.stringify(hookAfter2));
  }

  // ===================== CHECK 5: World map guidance (35+ locations) =====================
  log('\n========== CHECK 5: WORLD MAP GUIDANCE (35+ LOCATIONS) ==========');
  camp = await getCampaign(campaignId);
  const existingLocs = camp.world_state.discoveredLocations || [];
  const startN = existingLocs.length + 1;
  const added1 = Array.from({ length: 10 }, (_, i) => `Test Locale ${startN + i}`);
  await devPatch(king.token, campaignId, { worldState: { discoveredLocations: [...existingLocs, ...added1] } });
  camp = await getCampaign(campaignId);
  const existingLocs2 = camp.world_state.discoveredLocations || [];
  const startN2 = existingLocs2.length + 1;
  const added2 = Array.from({ length: 10 }, (_, i) => `Test Locale ${startN2 + i}`);
  await devPatch(king.token, campaignId, { worldState: { discoveredLocations: [...existingLocs2, ...added2] } });
  camp = await getCampaign(campaignId);
  log('discoveredLocations count after +20:', (camp.world_state.discoveredLocations || []).length);

  const r5 = await doAction(king.token, 'KING', kingCharId, campaignId, "I suggest we explore somewhere completely new that we haven't been to yet, somewhere far from here.");
  const r6 = await doAction(sunmi.token, 'SUNMI', sunmiCharId, campaignId, "I agree, let's strike out toward unfamiliar territory and see what's out there.");

  camp = await getCampaign(campaignId);
  log('discoveredLocations count after actions:', (camp.world_state.discoveredLocations || []).length);
  log('discoveredLocations (last 5):', JSON.stringify((camp.world_state.discoveredLocations || []).slice(-5)));
  log('currentLocation:', camp.world_state.currentLocation);

  // ===================== CHECK 6: Advance to Act N =====================
  log('\n========== CHECK 6: ADVANCE ACT ==========');
  camp = await getCampaign(campaignId);
  const actBefore = camp.act;
  log('act before:', actBefore, 'actionsInCurrentAct before:', camp.world_state.actionsInCurrentAct);
  await devPatch(king.token, campaignId, { act: actBefore + 1, worldState: { actionsInCurrentAct: 0 } });
  camp = await getCampaign(campaignId);
  log('act after patch:', camp.act, 'actionsInCurrentAct after patch:', camp.world_state.actionsInCurrentAct);

  const r7 = await doAction(king.token, 'KING', kingCharId, campaignId, "I take a moment to reflect on how far we've come and what challenges might lie ahead in this new chapter of our journey.");
  const r8 = await doAction(sunmi.token, 'SUNMI', sunmiCharId, campaignId, "I share my own thoughts on what's next for us as we move forward into this new phase.");

  camp = await getCampaign(campaignId);
  log('act after actions:', camp.act, 'actionsInCurrentAct after actions:', camp.world_state.actionsInCurrentAct);

  // ===================== CHECK 7: dev-patch on non-testing campaign should 403 =====================
  log('\n========== CHECK 7: DEV-PATCH ON NON-TESTING CAMPAIGN (should 403) ==========');
  const advCreateRes = await api(king.token, 'POST', '/campaigns', {
    name: `Adventure Campaign ${Date.now()}`,
    storySeed: seed.premise || seed.title,
    campaignType: 'adventure',
    playerPreferences: { playMode: 'solo', campaignLength: 'short' },
  });
  const advCampaignId = advCreateRes.data.id || advCreateRes.data.campaign?.id;
  log('adventure campaignId:', advCampaignId);
  const patchOnAdv = await devPatch(king.token, advCampaignId, { worldState: { endgamePhase: 'approaching' } });
  log('dev-patch on adventure campaign status:', patchOnAdv.status);

  log('\n=== DEV PANEL VERIFICATION COMPLETE ===');
  log('campaignId:', campaignId);
  log('kingCharId:', kingCharId);
  log('sunmiCharId:', sunmiCharId);
})().catch(e => { log('FATAL ERROR:', e.message, e.stack); process.exit(1); });
