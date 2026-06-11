const fs = require('fs');

const API = 'http://localhost:3001/api';
const SUPA = 'https://cracdtuoknwmhcwddyoq.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LOG = '/tmp/devpanel_verify2.log';

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
  const hadRoll = !!res.data?.awaitingRoll;
  res = await resolveRollIfNeeded(token, charId, campaignId, res, who);
  const status = res.data?.status;
  if (status === 'waiting') {
    log(`[${who}] -> waiting for partner (${res.data.submittedCount}/${res.data.neededCount})`);
  } else {
    const narr = (res.data?.narration || res.data?.result?.narration || '').slice(0, 300);
    log(`[${who}] -> resolved (hadRoll=${hadRoll}). narration: ${narr}`);
    log(`[${who}] -> resolvedFutureHookIds:`, JSON.stringify(res.data?.resolvedFutureHookIds || res.data?.result?.resolvedFutureHookIds));
  }
  return res;
}

async function devPatch(token, campaignId, patch) {
  const res = await api(token, 'POST', `/game/dev-patch/${campaignId}`, patch);
  log('dev-patch', JSON.stringify(patch), '-> status', res.status, JSON.stringify(res.data?.error || 'ok'));
  return res;
}

function addDummyLocations(existing, n) {
  const target = existing.length + n;
  const added = [];
  let i = existing.length + 1;
  while (existing.length + added.length < target) {
    const name = `Test Locale ${i}`;
    if (!existing.includes(name) && !added.includes(name)) added.push(name);
    i++;
  }
  return [...existing, ...added];
}

(async () => {
  log('=== DEV PANEL VERIFICATION 2 START ===');

  const king = await login('king');
  const sunmi = await login('sunmi');
  log('King userId:', king.userId, 'SunMi userId:', sunmi.userId);

  const seedsRes = await api(king.token, 'GET', '/campaigns/seeds');
  const seed = seedsRes.data?.seeds?.campaigns?.[0] || seedsRes.data?.seeds;
  log('Chosen seed:', seed.title);

  const createRes = await api(king.token, 'POST', '/campaigns', {
    name: `Dev Panel Verify2 ${Date.now()}`,
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

  fs.writeFileSync('/tmp/devpanel_state2.json', JSON.stringify({ campaignId, kingCharId, sunmiCharId }, null, 2));

  const kingStart = await api(king.token, 'POST', '/game/start', { characterId: kingCharId, campaignId });
  log('King start status:', kingStart.status);
  const sunmiStart = await api(sunmi.token, 'POST', '/game/start', { characterId: sunmiCharId, campaignId });
  log('SunMi start status:', sunmiStart.status);

  let camp = await getCampaign(campaignId);
  const villainName = camp.world_bible?.primaryAntagonist?.name || 'the villain';
  log('--- primaryAntagonist ---', villainName);
  log('--- initial discoveredLocations ---', JSON.stringify(camp.world_state.discoveredLocations));

  // ===================== CHECK 1: +10 Discovered Locations x2 -> ~20 =====================
  log('\n========== CHECK 1: +10 DISCOVERED LOCATIONS x2 ==========');
  let locs = camp.world_state.discoveredLocations || [];
  locs = addDummyLocations(locs, 10);
  await devPatch(king.token, campaignId, { worldState: { discoveredLocations: locs } });
  camp = await getCampaign(campaignId);
  locs = camp.world_state.discoveredLocations || [];
  log('After first +10, count =', locs.length);
  locs = addDummyLocations(locs, 10);
  await devPatch(king.token, campaignId, { worldState: { discoveredLocations: locs } });
  camp = await getCampaign(campaignId);
  locs = camp.world_state.discoveredLocations || [];
  log('After second +10, count =', locs.length, '(expect ~20)');
  const check1Pass = locs.length >= 19;

  // ===================== CHECK 2: dice-roll action shouldn't drop worldStateChanges =====================
  log('\n========== CHECK 2: DICE ROLL WORLDSTATE PRESERVATION ==========');
  camp = await getCampaign(campaignId);
  const locsBefore = (camp.world_state.discoveredLocations || []).length;
  const npcMemBefore = (camp.world_state.npcMemory || []).length;
  log('Before dice-roll action: discoveredLocations.length =', locsBefore, 'npcMemory.length =', npcMemBefore, 'currentLocation =', camp.world_state.currentLocation);

  await doAction(king.token, 'KING', kingCharId, campaignId, "I try to sneak past the guards, attempting to pick the lock on the nearby door without anyone noticing.");
  await doAction(sunmi.token, 'SUNMI', sunmiCharId, campaignId, "I keep watch and try to distract anyone nearby while Kingsley works on the lock, attempting to roll for stealth.");

  camp = await getCampaign(campaignId);
  const locsAfter = (camp.world_state.discoveredLocations || []).length;
  const npcMemAfter = (camp.world_state.npcMemory || []).length;
  log('After dice-roll action: discoveredLocations.length =', locsAfter, 'npcMemory.length =', npcMemAfter, 'currentLocation =', camp.world_state.currentLocation);
  const check2Pass = locsAfter >= locsBefore;

  // ===================== CHECK 3: Endgame Confrontation -> victory -> endgameResolved/reset =====================
  log('\n========== CHECK 3: ENDGAME CONFRONTATION -> VICTORY ==========');
  await devPatch(king.token, campaignId, { worldState: { endgamePhase: 'confrontation' } });
  camp = await getCampaign(campaignId);
  log('After patch to CONFRONTATION: endgamePhase=', camp.world_state.endgamePhase);

  await doAction(king.token, 'KING', kingCharId, campaignId, `I draw my weapon and charge straight at ${villainName}, attacking with everything I have to bring this final confrontation to its end.`);
  await doAction(sunmi.token, 'SUNMI', sunmiCharId, campaignId, `I strike alongside Kingsley at ${villainName}'s weak point, fighting with everything I've got to finish this battle.`);

  camp = await getCampaign(campaignId);
  log('After action 1: endgamePhase=', camp.world_state.endgamePhase, 'endgameResolved=', camp.world_state.endgameResolved);

  await doAction(king.token, 'KING', kingCharId, campaignId, `With one final, decisive blow, I land the killing strike on ${villainName}, finishing them for good and ending the threat once and for all!`);
  await doAction(sunmi.token, 'SUNMI', sunmiCharId, campaignId, `I deliver the finishing blow alongside Kingsley, defeating ${villainName} for good. We have won!`);

  camp = await getCampaign(campaignId);
  log('After action 2: endgamePhase=', camp.world_state.endgamePhase, 'endgameResolved=', camp.world_state.endgameResolved);

  if (camp.world_state.endgamePhase === 'confrontation' && !camp.world_state.endgameResolved) {
    await doAction(king.token, 'KING', kingCharId, campaignId, `${villainName} is defeated and lies dead before us. The final battle is over - we have triumphed!`);
    await doAction(sunmi.token, 'SUNMI', sunmiCharId, campaignId, `It's over - ${villainName} is finished. Our victory is complete.`);
    camp = await getCampaign(campaignId);
    log('After action 3: endgamePhase=', camp.world_state.endgamePhase, 'endgameResolved=', camp.world_state.endgameResolved);
  }
  const check3Pass = camp.world_state.endgamePhase === 'none' || camp.world_state.endgameResolved === true;

  // ===================== CHECK 4: Seed Future Hook -> resolution =====================
  log('\n========== CHECK 4: SEED FUTURE HOOK -> RESOLUTION ==========');
  // reset endgame so subsequent checks aren't in confrontation
  await devPatch(king.token, campaignId, { worldState: { endgamePhase: 'none' } });
  camp = await getCampaign(campaignId);
  const existingHooks = camp.world_state.futureHooks || [];
  const unresolvedBefore = existingHooks.filter(h => !h.resolved).length;
  log('Future hooks before seeding: total =', existingHooks.length, 'unresolved =', unresolvedBefore);

  const devHook = {
    id: require('crypto').randomUUID(),
    description: '[DEV TEST] A debt comes due: the merchant we helped earlier sends word that they need urgent help repaying a dangerous debt collector who is now after them.',
    source: 'dev-panel',
    createdAt: new Date().toISOString(),
    resolved: false,
  };
  await devPatch(king.token, campaignId, { worldState: { futureHooks: [...existingHooks, devHook] } });
  camp = await getCampaign(campaignId);
  const unresolvedAfterSeed = (camp.world_state.futureHooks || []).filter(h => !h.resolved).length;
  log('Future hooks after seeding: unresolved =', unresolvedAfterSeed, '(expect +1)');

  await doAction(king.token, 'KING', kingCharId, campaignId, "Suddenly I remember - a merchant we helped before is in trouble with a dangerous debt collector and needs our help urgently. I bring this up to my companion right now.");
  await doAction(sunmi.token, 'SUNMI', sunmiCharId, campaignId, "I agree - we should go track down that debt collector immediately and settle the merchant's debt once and for all, resolving this situation completely.");

  camp = await getCampaign(campaignId);
  let unresolvedAfter = (camp.world_state.futureHooks || []).filter(h => !h.resolved).length;
  log('Future hooks after action round 1: unresolved =', unresolvedAfter);

  if (unresolvedAfter >= unresolvedAfterSeed) {
    await doAction(king.token, 'KING', kingCharId, campaignId, "We find the debt collector and pay off the merchant's debt in full, resolving the matter completely and for good.");
    await doAction(sunmi.token, 'SUNMI', sunmiCharId, campaignId, "I confirm with Kingsley that the merchant's debt situation with the debt collector is now fully and permanently resolved.");
    camp = await getCampaign(campaignId);
    unresolvedAfter = (camp.world_state.futureHooks || []).filter(h => !h.resolved).length;
    log('Future hooks after action round 2: unresolved =', unresolvedAfter);
  }
  const check4Pass = unresolvedAfter < unresolvedAfterSeed;

  log('\n=== SUMMARY ===');
  log('Check 1 (+10 locations x2 -> ~20):', check1Pass ? 'PASS' : 'FAIL', `(final count=${locs.length})`);
  log('Check 2 (dice-roll preserves worldStateChanges):', check2Pass ? 'PASS' : 'FAIL', `(before=${locsBefore}, after=${locsAfter})`);
  log('Check 3 (confrontation victory -> endgameResolved/reset):', check3Pass ? 'PASS' : 'FAIL', `(endgamePhase=${camp.world_state.endgamePhase})`);
  log('Check 4 (future hook resolution):', check4Pass ? 'PASS' : 'FAIL', `(unresolved before=${unresolvedAfterSeed}, after=${unresolvedAfter})`);

  log('\n=== DEV PANEL VERIFICATION 2 COMPLETE ===');
  log('campaignId:', campaignId);
  log('kingCharId:', kingCharId);
  log('sunmiCharId:', sunmiCharId);
})().catch(e => { log('FATAL ERROR:', e.message, e.stack); process.exit(1); });
