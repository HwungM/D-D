const fs = require('fs');

const API = 'http://localhost:3001/api';
const SUPA = 'https://cracdtuoknwmhcwddyoq.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LOG = '/tmp/longhaul2.log';
const SNAP_DIR = '/tmp/longhaul2_snapshots';
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
  return { token: data.session.access_token, userId: data.user.id, username };
}

// Re-login proactively to avoid stale tokens (1hr Supabase JWT lifetime)
class AuthedUser {
  constructor(username) {
    this.username = username;
    this.token = null;
    this.userId = null;
    this.tokenSetAt = 0;
  }
  async ensureFresh() {
    const age = Date.now() - this.tokenSetAt;
    if (!this.token || age > 40 * 60 * 1000) {
      const r = await login(this.username);
      this.token = r.token;
      this.userId = r.userId;
      this.tokenSetAt = Date.now();
      log(`[AUTH] (re)logged in as ${this.username}, userId=${this.userId}`);
    }
  }
  async call(method, path, body) {
    await this.ensureFresh();
    let res = await api(this.token, method, path, body);
    if (res.status === 401) {
      log(`[AUTH] 401 for ${this.username}, forcing re-login and retrying`);
      const r = await login(this.username);
      this.token = r.token;
      this.userId = r.userId;
      this.tokenSetAt = Date.now();
      res = await api(this.token, method, path, body);
    }
    return res;
  }
}

async function snapshot(campaignId, label) {
  const r = await fetch(`${SUPA}/rest/v1/campaigns?id=eq.${campaignId}&select=world_state,act,campaign_type`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  const data = await r.json();
  const ws = data?.[0]?.world_state || {};
  const fh = ws.futureHooks || [];
  const fl = Array.isArray(ws.campaignJournal?.foreshadowingLedger)
    ? ws.campaignJournal.foreshadowingLedger
    : (Array.isArray(ws.foreshadowingLedger) ? ws.foreshadowingLedger : []);
  const summary = {
    label,
    timestamp: new Date().toISOString(),
    act: data?.[0]?.act,
    endgamePhase: ws.endgamePhase,
    endgameResolved: ws.endgameResolved,
    actionCount: ws.actionCount,
    actionsInCurrentAct: ws.actionsInCurrentAct,
    discoveredLocations: ws.discoveredLocations,
    discoveredLocationsCount: (ws.discoveredLocations || []).length,
    keyNPCsCount: (ws.keyNPCs || []).length,
    keyNPCs: (ws.keyNPCs || []).map(n => ({ name: n.name, disposition: n.disposition, relationshipScore: n.relationshipScore, interactionCount: n.interactionCount })),
    spotlightBalance: ws.spotlightBalance,
    antagonistProgress: ws.antagonistProgress,
    foreshadowingLedgerCount: fl.length,
    foreshadowingPaidOff: fl.filter(f => f.payoffStatus === 'paid_off').length,
    backstoryHooksCount: (ws.backstoryHooks || []).length,
    backstoryHooks: (ws.backstoryHooks || []).map(h => ({ id: h.id, status: h.status, seedTiming: h.seedTiming })),
    futureHooksCount: fh.length,
    futureHooksResolved: fh.filter(h => h.resolved).length,
    journalLength: JSON.stringify(ws.campaignJournal || {}).length,
    npcMemoryLength: JSON.stringify(ws.npcMemory || {}).length,
    knownRecipes: ws.knownRecipes,
    shopInventory: ws.shopInventory || ws.merchant || null,
    companion: ws.companion ? { name: ws.companion.name, hp: ws.companion.hp } : null,
    fallenHeroesCount: (ws.fallenHeroes || []).length,
    fallenHeroes: ws.fallenHeroes,
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
  "I try to talk to that NPC who died earlier, as if they were still standing here.",
  "I demand the merchant give me their goods for free, threatening them.",
];

const FALLBACK_ACTIONS = [
  "I press onward, looking for whatever comes next on our path.",
  "I take a moment to study my surroundings for clues or threats.",
  "I check in with my companion about our next move.",
  "I ready my weapon and stay alert for danger.",
  "I search for anything useful nearby before we move on.",
];

// Goal-driven scripted beats injected at specific action milestones (per-character index)
// These push toward merchant/companion/recipe/death/exploration coverage.
const GOAL_BEATS = {
  king: {
    8: "I ask around for the nearest merchant, trader, or shop where we could buy supplies.",
    10: "I head into the merchant's shop and browse what they have for sale, looking to buy something useful with my gold.",
    11: "I purchase whatever item the merchant is offering that looks most useful to me.",
    14: "I ask the merchant about any unusual ingredients or materials I could gather for crafting something.",
    20: "I set off toward a completely different region or area we haven't explored yet, putting real distance between us and where we started.",
    26: "I look for any creature or person who might travel with us as a companion or ally, and try to recruit them.",
    34: "If I have any crafting materials, I attempt to craft or assemble something useful from them at a workbench or campfire.",
    42: "I travel toward another distant, unexplored part of the region - a different town, dungeon, or wilderness area entirely.",
    50: "I go back to that merchant's shop from before to see if they still have the same goods for sale.",
    58: "Spotting a foe that looks far too powerful for us, I charge in recklessly anyway and refuse to retreat no matter how hurt I get.",
    60: "Even though I'm severely wounded and near death, I keep fighting with everything I have instead of retreating.",
    62: "I try to find a safe place to rest and recover from my near-fatal wounds.",
    70: "I check on my companion or ally to see how they're holding up after everything we've been through.",
    80: "I head toward whatever the most dangerous, climactic threat is in this region and confront it head-on, alone if I have to.",
  },
  sunmi: {
    9: "I follow my companion toward the merchant they mentioned and look over the goods myself too.",
    12: "I buy something from the merchant's stock with my own gold.",
    16: "I gather any useful plants, ores, or materials I can find nearby that might be used for crafting.",
    22: "I push us toward exploring a new region or area we've never been to, away from familiar territory.",
    28: "I try to befriend or recruit any friendly creature or wandering NPC as a companion to join our party.",
    36: "I attempt to craft or combine the materials I've gathered into something useful.",
    44: "I lead us toward yet another distant location - somewhere we haven't set foot before.",
    52: "I revisit the merchant from earlier to see if their shop still has the same items as before.",
    59: "Even though our enemy is clearly far stronger than us, I throw myself fully into the fight rather than backing down.",
    61: "Badly hurt and barely standing, I refuse any retreat and keep fighting no matter the cost, even if it could kill me.",
    63: "I try to heal up or rest after that brutal fight.",
    72: "I think back on everything we've experienced together and reflect on how far we've come.",
    82: "I rush to back up my companion in whatever final confrontation they're walking into, no matter the danger.",
  },
};

async function resolveRollIfNeeded(user, characterId, campaignId, res, who) {
  let r = res;
  let rolls = 0;
  while (r?.data?.awaitingRoll && r.data.rollContext && rolls < 3) {
    rolls++;
    log(`[${who}] awaitingRoll, resolving...`, JSON.stringify(r.data.rollContext));
    r = await user.call('POST', '/game/resolve-roll', { characterId, campaignId, rollContext: r.data.rollContext });
    log(`[${who}] roll-resolve status=${r.status}`);
  }
  return r;
}

(async () => {
  log('=== LONG HAUL TEST 2 START ===');

  const king = new AuthedUser('king');
  const sunmi = new AuthedUser('sunmi');
  await king.ensureFresh();
  await sunmi.ensureFresh();
  log('Logged in. King userId:', king.userId, 'SunMi userId:', sunmi.userId);

  const seedsRes = await king.call('GET', '/campaigns/seeds');
  const seed = seedsRes.data?.seeds?.campaigns?.[0] || seedsRes.data?.seeds;
  if (!seed?.title) { log('Unexpected seeds response:', seedsRes.status, JSON.stringify(seedsRes.data)); process.exit(1); }
  log('Chosen seed:', seed.title);

  const createRes = await king.call('POST', '/campaigns', {
    name: `Long Haul Test 2 ${Date.now()}`,
    storySeed: seed.premise || seed.title,
    campaignType: 'adventure',
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

  const kingBackstory = "Kingsley Dawnbreaker grew up the youngest son of a minor noble house that fell into ruin after his older brother Aldric was killed in a border skirmish years ago. Kingsley swore an oath at Aldric's grave to one day track down the warlord responsible and avenge him, and he carries Aldric's old signet ring as a reminder. He left home to earn his own reputation as a warrior, hoping that fame and skill will one day let him confront his brother's killer.";
  const sunmiBackstory = "Sun Mi Stormblade trained for years in a hidden monastery that was destroyed by raiders when she was a teenager. She was the only survivor, and has spent years since then haunted by the memory of her mentor, Master Yun, who sacrificed himself so she could escape. She carries his prayer beads and is constantly searching for any sign that fragments of her old order's teachings or relics survived the destruction.";

  const kingCharRes = await king.call('POST', '/characters', {
    campaignId, name: 'Kingsley Dawnbreaker', race: 'Human', class: 'Fighter', generatePortrait: false,
    backstory: kingBackstory,
  });
  if (kingCharRes.status >= 400) { log('King char create failed:', kingCharRes.status, JSON.stringify(kingCharRes.data)); process.exit(1); }
  const kingCharId = kingCharRes.data.id || kingCharRes.data.character?.id;
  log('kingCharId:', kingCharId);

  const sunmiCharRes = await sunmi.call('POST', '/characters', {
    campaignId, name: 'Sun Mi Stormblade', race: 'Elf', class: 'Rogue', generatePortrait: false,
    backstory: sunmiBackstory,
  });
  if (sunmiCharRes.status >= 400) { log('SunMi char create failed:', sunmiCharRes.status, JSON.stringify(sunmiCharRes.data)); process.exit(1); }
  const sunmiCharId = sunmiCharRes.data.id || sunmiCharRes.data.character?.id;
  log('sunmiCharId:', sunmiCharId);

  fs.writeFileSync('/tmp/longhaul2_state.json', JSON.stringify({ campaignId, kingCharId, sunmiCharId }, null, 2));

  const kingStart = await king.call('POST', '/game/start', { characterId: kingCharId, campaignId });
  log('King start status:', kingStart.status);
  const sunmiStart = await sunmi.call('POST', '/game/start', { characterId: sunmiCharId, campaignId });
  log('SunMi start status:', sunmiStart.status);

  let kingAlive = true, sunmiAlive = true;
  let kingActions = 0, sunmiActions = 0;
  const TARGET = 200;
  const MAX_PER_CHAR = 250;
  let kingSuggested = (kingStart.data?.suggestedActions) || [];
  let sunmiSuggested = (sunmiStart.data?.suggestedActions) || [];
  let edgeIdx = 0;
  let round = 0;

  function pickAction(suggested, count, who) {
    const beats = who === 'KING' ? GOAL_BEATS.king : GOAL_BEATS.sunmi;
    if (beats[count + 1] !== undefined) {
      return { text: beats[count + 1], edge: false, scripted: true };
    }
    if (count > 0 && (count + 1) % 13 === 0) {
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

  async function doTurn(who, user, charId, count, suggested) {
    const { text, edge, scripted } = pickAction(suggested, count, who);
    log(`[${who}] ACTION #${count + 1}${edge ? ' [EDGE CASE]' : ''}${scripted ? ' [SCRIPTED]' : ''}: ${text}`);
    let res = await user.call('POST', '/game/action', { characterId: charId, campaignId, action: text });
    if (res.status === 400 && /perished|can no longer act/i.test(res.data?.error || '')) {
      log(`[${who}] -> character cannot act (likely dead): ${res.data.error}`);
      return { dead: true, suggested };
    }
    if (res.status >= 400) {
      log(`[${who}] ERROR status=${res.status}`, JSON.stringify(res.data));
      return { error: true, suggested };
    }
    res = await resolveRollIfNeeded(user, charId, campaignId, res, who);
    const status = res.data?.status;
    let newSuggested = suggested;
    if (status === 'waiting') {
      log(`[${who}] -> waiting for partner (${res.data.submittedCount}/${res.data.neededCount})`);
    } else {
      newSuggested = res.data?.suggestedActions || res.data?.result?.suggestedActions || suggested;
      const narr = (res.data?.narration || res.data?.result?.narration || '').slice(0, 180);
      log(`[${who}] -> resolved. narration: ${narr}`);
      if (res.data?.deathOccurred || res.data?.characterDied || res.data?.result?.deathOccurred) {
        log(`[${who}] -> DEATH FLAG in response`);
      }
    }
    return { newSuggested };
  }

  while ((kingActions < MAX_PER_CHAR || sunmiActions < MAX_PER_CHAR) && (kingAlive || sunmiAlive)) {
    if (kingActions >= TARGET && sunmiActions >= TARGET) break;

    if (kingAlive && kingActions < MAX_PER_CHAR) {
      const r = await doTurn('KING', king, kingCharId, kingActions, kingSuggested);
      if (r.dead) kingAlive = false;
      else { kingActions++; if (r.newSuggested) kingSuggested = r.newSuggested; }
    }
    if (sunmiAlive && sunmiActions < MAX_PER_CHAR) {
      const r = await doTurn('SUNMI', sunmi, sunmiCharId, sunmiActions, sunmiSuggested);
      if (r.dead) sunmiAlive = false;
      else { sunmiActions++; if (r.newSuggested) sunmiSuggested = r.newSuggested; }
    }

    round++;
    if (round % 20 === 0) {
      const s = await snapshot(campaignId, `round-${round}`);
      if (s.endgameResolved) {
        log('Endgame resolved! Ending run early.');
        break;
      }
    }
    if (!kingAlive && !sunmiAlive) {
      log('Both characters dead, ending run.');
      break;
    }
    if (kingActions >= MAX_PER_CHAR && sunmiActions >= MAX_PER_CHAR) break;
  }

  // After main loop: if one died, continue solo turns for survivor a bit to verify solo-path coop fallback
  if (kingAlive !== sunmiAlive) {
    log('One character died — testing survivor solo continuation for 5 more actions...');
    for (let i = 0; i < 5; i++) {
      if (kingAlive && kingActions < MAX_PER_CHAR) {
        const r = await doTurn('KING', king, kingCharId, kingActions, kingSuggested);
        if (!r.dead && !r.error) { kingActions++; kingSuggested = r.newSuggested || kingSuggested; }
      }
      if (sunmiAlive && sunmiActions < MAX_PER_CHAR) {
        const r = await doTurn('SUNMI', sunmi, sunmiCharId, sunmiActions, sunmiSuggested);
        if (!r.dead && !r.error) { sunmiActions++; sunmiSuggested = r.newSuggested || sunmiSuggested; }
      }
      // also try the dead character's action to confirm it's blocked
      if (!kingAlive) {
        const r = await doTurn('KING', king, kingCharId, kingActions, kingSuggested);
        log('[KING] dead-character-action-attempt result:', JSON.stringify(r));
      }
      if (!sunmiAlive) {
        const r = await doTurn('SUNMI', sunmi, sunmiCharId, sunmiActions, sunmiSuggested);
        log('[SUNMI] dead-character-action-attempt result:', JSON.stringify(r));
      }
    }
  }

  await snapshot(campaignId, 'final');
  log('=== LONG HAUL TEST 2 COMPLETE ===');
  log('campaignId:', campaignId);
  log('kingCharId:', kingCharId, 'actions:', kingActions, 'alive:', kingAlive);
  log('sunmiCharId:', sunmiCharId, 'actions:', sunmiActions, 'alive:', sunmiAlive);
})().catch(e => { log('FATAL ERROR:', e.message, e.stack); process.exit(1); });
