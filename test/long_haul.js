const fs = require('fs');

const API = 'http://localhost:3001/api';
const SUPA = 'https://cracdtuoknwmhcwddyoq.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LOG = '/tmp/longhaul.log';
const SNAP_DIR = '/tmp/longhaul_snapshots';
fs.mkdirSync(SNAP_DIR, { recursive: true });

function log(...a) {
  const line = `${new Date().toISOString()} ${a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')}`;
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
  return { token: data.session.access_token, userId: data.user.id };
}

async function snapshot(campaignId, label) {
  const r = await fetch(`${SUPA}/rest/v1/campaigns?id=eq.${campaignId}&select=world_state,act,campaign_type`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  const data = await r.json();
  const ws = data?.[0]?.world_state || {};
  const summary = {
    label,
    timestamp: new Date().toISOString(),
    act: data?.[0]?.act,
    endgamePhase: ws.endgamePhase,
    endgameResolved: ws.endgameResolved,
    actionCount: ws.actionCount,
    actionsInCurrentAct: ws.actionsInCurrentAct,
    discoveredLocationsCount: (ws.discoveredLocations || []).length,
    keyNPCsCount: (ws.keyNPCs || []).length,
    spotlightBalance: ws.spotlightBalance,
    antagonistProgress: ws.antagonistProgress,
    foreshadowingLedgerCount: (ws.campaignJournal?.foreshadowingLedger || ws.foreshadowingLedger || []).length,
    backstoryHooksCount: (ws.backstoryHooks || []).length,
    futureHooksCount: (ws.futureHooks || []).length,
    journalLength: JSON.stringify(ws.campaignJournal || {}).length,
    npcMemoryLength: JSON.stringify(ws.npcMemory || {}).length,
    knownRecipes: ws.knownRecipes,
    companion: ws.companion ? { name: ws.companion.name, hp: ws.companion.hp } : null,
    fallenHeroesCount: (ws.fallenHeroes || []).length,
  };
  fs.writeFileSync(`${SNAP_DIR}/${label}.json`, JSON.stringify({ summary, world_state: ws }, null, 2));
  log('SNAPSHOT', label, JSON.stringify(summary));
  return summary;
}

const EDGE_CASES = [
  "I tell my companion I need to rest here for a bit and try to settle in for a long rest, regardless of what's going on around us.",
  "I turn and attack my own companion without warning, just to see what happens.",
  "I head back to the very first place we visited at the start of this journey, to see if anything has changed.",
  "I bring up an old friend who died a while back, wondering aloud if we'll ever see them again.",
  "Even though I'm badly hurt and barely standing, I push forward recklessly into danger anyway.",
  "I try to pickpocket the friendly merchant or ally standing near us, just to see if I can get away with it.",
  "I ask my companion if they remember that NPC we met way back when, and whether we should go find them again.",
  "I try to sell my own weapon to a random stranger on the street.",
  "I attempt to walk through what looks like a solid wall, just to test if it's actually an illusion.",
  "I loudly accuse my companion of being a spy for the enemy, right in front of everyone.",
];

let edgeIdx = 0;
const FALLBACK_ACTIONS = [
  "I press onward, looking for whatever comes next on our path.",
  "I take a moment to study my surroundings for clues or threats.",
  "I check in with my companion about our next move.",
  "I ready my weapon and stay alert for danger.",
  "I search for anything useful nearby before we move on.",
];

async function resolveRollIfNeeded(token, characterId, campaignId, result, who) {
  let r = result;
  let rolls = 0;
  while (r?.data?.awaitingRoll && r.data.rollContext && rolls < 3) {
    rolls++;
    log(`[${who}] awaitingRoll, resolving...`, JSON.stringify(r.data.rollContext));
    r = await api(token, 'POST', '/game/resolve-roll', { characterId, campaignId, rollContext: r.data.rollContext });
    log(`[${who}] roll-resolve status=${r.status}`);
  }
  return r;
}

(async () => {
  log('=== LONG HAUL TEST START ===');

  const king = await login('king');
  const sunmi = await login('sunmi');
  log('Logged in. King userId:', king.userId, 'SunMi userId:', sunmi.userId);

  // Get story seeds
  const seedsRes = await api(king.token, 'GET', '/campaigns/seeds');
  const seed = seedsRes.data.seeds.campaigns[0];
  log('Chosen seed:', seed.title);

  // Create campaign
  const createRes = await api(king.token, 'POST', '/campaigns', {
    name: `Long Haul Test ${Date.now()}`,
    storySeed: seed.premise || seed.title,
    campaignType: 'adventure',
    playerPreferences: {
      playMode: 'collaborative',
      partyIntent: 'longtime friends',
      campaignLength: 'short',
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

  // Add SunMi to campaign_members
  const memberRes = await fetch(`${SUPA}/rest/v1/campaign_members`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ campaign_id: campaignId, user_id: sunmi.userId }),
  });
  log('campaign_members insert status:', memberRes.status);

  // Create characters
  const kingCharRes = await api(king.token, 'POST', '/characters', {
    campaignId, name: 'Kingsley Dawnbreaker', race: 'Human', class: 'Fighter', generatePortrait: false,
  });
  if (kingCharRes.status >= 400) { log('King char create failed:', kingCharRes.status, JSON.stringify(kingCharRes.data)); process.exit(1); }
  const kingCharId = kingCharRes.data.id || kingCharRes.data.character?.id;
  log('kingCharId:', kingCharId);

  const sunmiCharRes = await api(sunmi.token, 'POST', '/characters', {
    campaignId, name: 'Sun Mi Stormblade', race: 'Elf', class: 'Rogue', generatePortrait: false,
  });
  if (sunmiCharRes.status >= 400) { log('SunMi char create failed:', sunmiCharRes.status, JSON.stringify(sunmiCharRes.data)); process.exit(1); }
  const sunmiCharId = sunmiCharRes.data.id || sunmiCharRes.data.character?.id;
  log('sunmiCharId:', sunmiCharId);

  fs.writeFileSync('/tmp/longhaul_state.json', JSON.stringify({ campaignId, kingCharId, sunmiCharId }, null, 2));

  // Start
  const kingStart = await api(king.token, 'POST', '/game/start', { characterId: kingCharId, campaignId });
  log('King start status:', kingStart.status);
  const sunmiStart = await api(sunmi.token, 'POST', '/game/start', { characterId: sunmiCharId, campaignId });
  log('SunMi start status:', sunmiStart.status);

  let kingAlive = true, sunmiAlive = true;
  let kingActions = 0, sunmiActions = 0;
  const TARGET = 180; // per character total target ~180, ceiling 200
  const MAX_PER_CHAR = 200;
  let kingSuggested = (kingStart.data?.suggestedActions) || [];
  let sunmiSuggested = (sunmiStart.data?.suggestedActions) || [];
  let round = 0;

  function pickAction(suggested, count) {
    if (count > 0 && count % 12 === 0) {
      const a = EDGE_CASES[edgeIdx % EDGE_CASES.length];
      edgeIdx++;
      return { text: a, edge: true };
    }
    if (Array.isArray(suggested) && suggested.length > 0) {
      const opt = suggested[Math.floor(Math.random() * suggested.length)];
      return { text: typeof opt === 'string' ? opt : (opt.text || opt.action || FALLBACK_ACTIONS[count % FALLBACK_ACTIONS.length]), edge: false };
    }
    return { text: FALLBACK_ACTIONS[count % FALLBACK_ACTIONS.length], edge: false };
  }

  async function doTurn(who, token, charId, count, suggested) {
    const { text, edge } = pickAction(suggested, count);
    log(`[${who}] ACTION #${count + 1}${edge ? ' [EDGE CASE]' : ''}: ${text}`);
    let res = await api(token, 'POST', '/game/action', { characterId: charId, campaignId, action: text });
    if (res.status === 400 && /perished|can no longer act/i.test(res.data?.error || '')) {
      log(`[${who}] -> character cannot act (likely dead): ${res.data.error}`);
      return { dead: true, suggested };
    }
    if (res.status >= 400) {
      log(`[${who}] ERROR status=${res.status}`, JSON.stringify(res.data));
      return { error: true, suggested };
    }
    res = await resolveRollIfNeeded(token, charId, campaignId, res, who);
    const status = res.data?.status;
    let newSuggested = suggested;
    if (status === 'waiting') {
      log(`[${who}] -> waiting for partner (${res.data.submittedCount}/${res.data.neededCount})`);
    } else {
      newSuggested = res.data?.suggestedActions || res.data?.result?.suggestedActions || suggested;
      const narr = (res.data?.narration || res.data?.result?.narration || '').slice(0, 150);
      log(`[${who}] -> resolved. narration: ${narr}`);
      if (res.data?.deathOccurred || res.data?.characterDied) {
        log(`[${who}] -> DEATH FLAG in response`);
      }
    }
    return { newSuggested };
  }

  while ((kingActions < MAX_PER_CHAR || sunmiActions < MAX_PER_CHAR) && (kingAlive || sunmiAlive)) {
    if (kingActions >= TARGET && sunmiActions >= TARGET) break;

    if (kingAlive && kingActions < MAX_PER_CHAR) {
      const r = await doTurn('KING', king.token, kingCharId, kingActions, kingSuggested);
      if (r.dead) kingAlive = false;
      else { kingActions++; if (r.newSuggested) kingSuggested = r.newSuggested; }
    }
    if (sunmiAlive && sunmiActions < MAX_PER_CHAR) {
      const r = await doTurn('SUNMI', sunmi.token, sunmiCharId, sunmiActions, sunmiSuggested);
      if (r.dead) sunmiAlive = false;
      else { sunmiActions++; if (r.newSuggested) sunmiSuggested = r.newSuggested; }
    }

    round++;
    if (round % 20 === 0) {
      await snapshot(campaignId, `round-${round}`);
    }
    if (!kingAlive && !sunmiAlive) {
      log('Both characters dead, ending run.');
      break;
    }
    if (kingActions >= MAX_PER_CHAR && sunmiActions >= MAX_PER_CHAR) break;

    // safety check: stop early if endgame resolved
    if (round % 20 === 0) {
      const r = await fetch(`${SUPA}/rest/v1/campaigns?id=eq.${campaignId}&select=world_state`, {
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      });
      const d = await r.json();
      if (d?.[0]?.world_state?.endgameResolved) {
        log('Endgame resolved! Ending run early.');
        break;
      }
    }
  }

  await snapshot(campaignId, 'final');
  log('=== LONG HAUL TEST COMPLETE ===');
  log('campaignId:', campaignId);
  log('kingCharId:', kingCharId, 'actions:', kingActions, 'alive:', kingAlive);
  log('sunmiCharId:', sunmiCharId, 'actions:', sunmiActions, 'alive:', sunmiAlive);
})().catch(e => { log('FATAL ERROR:', e.message, e.stack); process.exit(1); });
