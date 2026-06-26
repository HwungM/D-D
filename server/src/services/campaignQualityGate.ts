import type { Faction, GeographyEntry, WorldBible } from '../../../shared/types';
import { EVERREALM_ART_BIBLE } from './everrealmArtPrompt';
import type { CampaignGenerationPlayerPreferences } from './campaignGenerationService';

export type CampaignQualityIssue = {
  code: string;
  severity: 'warn' | 'fail';
  message: string;
};

function issue(code: string, message: string, severity: 'warn' | 'fail' = 'fail'): CampaignQualityIssue {
  return { code, severity, message };
}

function meaningful(text: unknown): text is string {
  return typeof text === 'string' && text.trim().length >= 12 && !/\b(placeholder|tbd|generic|something happens)\b/i.test(text);
}

function hasItems<T>(value: T[] | undefined, min: number): boolean {
  return Array.isArray(value) && value.length >= min;
}

function prefersMystery(preferences?: CampaignGenerationPlayerPreferences): boolean {
  return (preferences?.favoritePillars || []).some(pillar => /\b(mystery|investigation|clue|intrigue|story)\b/i.test(pillar));
}

function prefersCoop(preferences?: CampaignGenerationPlayerPreferences): boolean {
  return preferences?.playMode === 'collaborative'
    || (preferences?.targetPlayerCount || preferences?.playerCount || 1) > 1
    || preferences?.partyIntent === 'collab_start_now'
    || preferences?.partyIntent === 'collab_wait_for_party';
}

function defaultAntagonist(worldBible: WorldBible) {
  return worldBible.primaryAntagonist || {
    name: 'The Hidden Hand',
    trueName: 'Unknown',
    type: 'primary' as const,
    agenda: 'A concealed power is testing the borders of the world and turning local fears into leverage.',
    currentStep: 'Their agents are gathering names, debts, and old promises near the starting location.',
    planSteps: [
      'Identify who can be bent by fear or desire.',
      'Use a local crisis to make their influence look necessary.',
      'Turn a trusted institution into a quiet weapon.',
      'Reveal a larger threat only after the heroes are already entangled.',
      'Claim authority over the region through a bargain no one fully understands.',
    ],
    whatTheyKnow: 'The heroes are not yet known to them.',
    isRevealed: false,
    power: 'legendary' as const,
    allies: ['A compromised local authority', 'An ambitious hidden faction'],
    weaknesses: ['Their plan depends on secrecy.', 'Old oaths can bind their agents against them.'],
  };
}

export function auditWorldBibleQuality(worldBible: WorldBible, preferences?: CampaignGenerationPlayerPreferences): CampaignQualityIssue[] {
  const issues: CampaignQualityIssue[] = [];
  const length = preferences?.campaignLength || worldBible.playerPreferences?.campaignLength || 'medium';

  if (!meaningful(worldBible.era)) issues.push(issue('thin_era', 'The campaign era needs an evocative identity.'));
  if (!meaningful(worldBible.magicSystem)) issues.push(issue('thin_magic', 'The magic system needs cost, rarity, or a distinctive rule.'));
  if (!meaningful(worldBible.centralConflict)) issues.push(issue('thin_conflict', 'The central conflict needs a clear emotional/thematic engine.'));
  if (!hasItems(worldBible.geography, 3)) issues.push(issue('thin_geography', 'The world needs at least a few named places to support exploration.'));
  if (!hasItems(worldBible.openingHooks, 3)) issues.push(issue('thin_opening_hooks', 'Opening hooks should give the DM multiple session-one sparks.'));
  if (!hasItems(worldBible.factions, 2)) issues.push(issue('thin_factions', 'The campaign needs at least two factions so the world reacts beyond one villain.'));
  if (!hasItems(worldBible.antagonistRoster, 1) && !worldBible.primaryAntagonist) issues.push(issue('missing_antagonist', 'The campaign needs at least one active antagonist or pressure source.'));

  if (!worldBible.campaignBrief || !meaningful(worldBible.campaignBrief.objective) || !meaningful(worldBible.campaignBrief.whereToStart)) {
    issues.push(issue('weak_campaign_brief', 'The opening campaign brief needs a concrete objective and starting direction.'));
  }

  const roadmap = worldBible.dmRoadmap;
  if (!roadmap || !hasItems(roadmap.act1Goals, 3) || !meaningful(roadmap.act1ClimaxEvent)) {
    issues.push(issue('weak_act1_roadmap', 'Act 1 needs clear playable goals and a climax target.'));
  }
  if (!roadmap || !hasItems(roadmap.act2Goals, 3) || !meaningful(roadmap.act2VillainEscalation)) {
    issues.push(issue('weak_act2_roadmap', 'Act 2 needs escalation goals so the middle does not blur.'));
  }
  if (!roadmap || !hasItems(roadmap.act3ConvergenceThreads, 2) || !hasItems(roadmap.act3ResolutionOptions, 2)) {
    issues.push(issue('weak_late_roadmap', 'The later roadmap needs convergence threads and multiple resolution shapes.'));
  }
  if ((length === 'long' || length === 'open_ended') && !hasItems(worldBible.futureHookSeeds, 4)) {
    issues.push(issue('long_campaign_needs_future_hooks', 'Long/open-ended campaigns need future hooks beyond a three-act local arc.', 'warn'));
  }

  if (prefersMystery(preferences) && (!worldBible.mysteryLayer || !hasItems(worldBible.mysteryLayer.clues, 4))) {
    issues.push(issue('mystery_without_clue_ladder', 'Mystery-heavy preferences need a clue ladder with several playable discoveries.'));
  }
  if (prefersCoop(preferences) && (!worldBible.spotlightDesign || !hasItems(worldBible.spotlightDesign.sharedMoments, 2))) {
    issues.push(issue('coop_without_shared_spotlights', 'Collaborative play needs planned shared spotlight moments.'));
  }

  const concepts = preferences?.characterConcepts || [];
  if (concepts.length > 0) {
    const combined = JSON.stringify([
      worldBible.campaignBrief,
      worldBible.openingHooks,
      worldBible.factions,
      worldBible.lieutenant,
      worldBible.spotlightDesign,
    ]).toLowerCase();
    const conceptAnchors = concepts
      .flatMap(concept => concept.toLowerCase().match(/\b[a-z][a-z'-]{4,}\b/g) || [])
      .filter(word => !['character', 'wants', 'seeks', 'fears', 'their', 'about'].includes(word))
      .slice(0, 12);
    if (conceptAnchors.length > 0 && !conceptAnchors.some(anchor => combined.includes(anchor))) {
      issues.push(issue('character_concepts_not_anchored', 'Character concepts/backstories are not visibly anchored into the generated campaign.', 'warn'));
    }
  }

  return issues;
}

export function repairWorldBibleQuality(worldBible: WorldBible, preferences?: CampaignGenerationPlayerPreferences): WorldBible {
  const repaired = worldBible;
  const antagonist = defaultAntagonist(repaired);
  repaired.primaryAntagonist = antagonist;
  repaired.antagonistRoster = repaired.antagonistRoster?.length
    ? repaired.antagonistRoster
    : [antagonist];
  if (!repaired.antagonistRoster.some(a => a.name === antagonist.name)) {
    repaired.antagonistRoster.unshift(antagonist);
  }

  repaired.era = meaningful(repaired.era) ? repaired.era : 'The Age of Unfinished Oaths';
  repaired.magicSystem = meaningful(repaired.magicSystem)
    ? repaired.magicSystem
    : 'Magic answers promises, debts, and names. It is powerful but costly: every spell leaves a social, spiritual, or physical trace someone can follow.';
  repaired.centralConflict = meaningful(repaired.centralConflict)
    ? repaired.centralConflict
    : 'The campaign asks whether ordinary people can stay kind and free when old powers make safety depend on obedience.';

  const defaultGeography: GeographyEntry[] = [
    { name: 'Hearthwake Crossing', description: 'A warm, imperfect crossroads settlement where rumors, debts, and travelers gather before the road turns strange.', type: 'city' },
    { name: 'The Lanternfen', description: 'A wetland of floating lights and half-sunken shrines where guides disagree about which paths are real.', type: 'wilderness' },
    { name: 'Oathglass Ruin', description: 'A broken landmark of mirrored stone that reflects promises people meant to keep.', type: 'landmark' },
  ];
  repaired.geography = hasItems(repaired.geography, 3) ? repaired.geography : [
    ...(repaired.geography || []),
    ...defaultGeography,
  ].slice(0, Math.max(3, repaired.geography?.length || 0));

  const defaultFactions: Faction[] = [
    { name: 'The Hearthwardens', publicFace: 'Friendly keepers of roads, inns, and rescue bells.', secretAgenda: 'They quietly erase dangerous names from maps to keep old bargains asleep.', power: 'moderate' },
    { name: 'The Gilt Thorn', publicFace: 'Patrons of art, trade, gossip, and generous civic festivals.', secretAgenda: 'They buy secrets before anyone knows those secrets have value.', power: 'strong' },
  ];
  repaired.factions = hasItems(repaired.factions, 2) ? repaired.factions : [
    ...(repaired.factions || []),
    ...defaultFactions,
  ].slice(0, Math.max(2, repaired.factions?.length || 0));

  repaired.openingHooks = hasItems(repaired.openingHooks, 3) ? repaired.openingHooks : [
    ...(repaired.openingHooks || []),
    'A familiar local symbol appears where it should not be, freshly carved into a doorframe before dawn.',
    'A nervous messenger offers the characters a simple job, then forgets who sent them.',
    'Someone beloved in the safe haven asks for help but refuses to say the dangerous name aloud.',
  ].slice(0, 3);

  repaired.campaignBrief = {
    hook: repaired.campaignBrief?.hook || 'A local crisis starts small enough to touch, but strange enough to promise a larger hidden design.',
    objective: repaired.campaignBrief?.objective || 'Find who is manipulating the first crisis and stop their immediate plan.',
    motivation: repaired.campaignBrief?.motivation || 'The danger threatens someone, somewhere, or something the characters can personally choose to care about right away.',
    whereToStart: repaired.campaignBrief?.whereToStart || `${repaired.geography[0]?.name || 'the starting settlement'} — speak to the first person asking for help before the trail goes cold.`,
    worldStakes: repaired.campaignBrief?.worldStakes || 'If no one intervenes, fear becomes policy and the antagonist gains public legitimacy.',
    characterStakes: repaired.campaignBrief?.characterStakes || 'The characters lose a chance to define who they are before the world defines them as pawns.',
    mysteryHint: repaired.campaignBrief?.mysteryHint || 'Why are ordinary signs, names, and promises suddenly behaving like keys?'
  };

  repaired.mysteryLayer = repaired.mysteryLayer && hasItems(repaired.mysteryLayer.clues, 4) ? repaired.mysteryLayer : {
    centralQuestion: repaired.mysteryLayer?.centralQuestion || repaired.campaignBrief.mysteryHint,
    clues: [
      ...(repaired.mysteryLayer?.clues || []),
      'The first clue is sensory and easy to miss: a repeated mark, smell, sound, or phrase near every affected place.',
      'The second clue links the crisis to a faction that publicly appears helpful.',
      'The third clue reveals the antagonist benefits from fear spreading faster than truth.',
      'The fourth clue points toward a personal cost someone willingly paid to keep the secret buried.',
      'The fifth clue makes the eventual revelation feel inevitable rather than random.',
    ].slice(0, 5),
    redHerrings: repaired.mysteryLayer?.redHerrings?.length ? repaired.mysteryLayer.redHerrings : [
      'A visibly suspicious rival whose selfish actions are real but not the source of the main threat.',
      'A local superstition that explains some symptoms while hiding the human choice underneath.',
    ],
    revelation: repaired.mysteryLayer?.revelation || 'The crisis was engineered through an old bargain that turns trust, names, and safety into leverage.',
  };

  repaired.spotlightDesign = {
    sharedMoments: repaired.spotlightDesign?.sharedMoments?.length ? repaired.spotlightDesign.sharedMoments : [
      'One character draws attention or negotiates while another notices the hidden tell that changes the scene.',
      'A danger forces the party to choose between individual reward and protecting the shared safe haven.',
      'A small absurd local custom becomes an inside joke and later a serious clue.',
    ],
    encounterCurve: repaired.spotlightDesign?.encounterCurve || 'Easy → Medium → Easy → Hard → Medium → Hard → Deadly, with each spike tied to a choice, clue, faction move, or personal stake rather than random danger.',
  };

  repaired.futureHookSeeds = hasItems(repaired.futureHookSeeds, 4) ? repaired.futureHookSeeds : [
    ...(repaired.futureHookSeeds || []),
    `If the players earn trust in ${repaired.geography[0]?.name || 'the starting settlement'}, a frightened witness returns later with a crucial contradiction.`,
    `If ${repaired.factions[0]?.name || 'a helpful faction'} is ignored, they solve a problem publicly in a way that creates a worse private debt.`,
    'A spared rival can become either a recurring nuisance, a desperate informant, or the only person who recognizes the antagonist’s pattern.',
    'A harmless keepsake from the opening arc becomes proof during a later accusation.',
  ].slice(0, 6);

  repaired.dmRoadmap = {
    act1Goals: repaired.dmRoadmap?.act1Goals?.length ? repaired.dmRoadmap.act1Goals : [
      'Establish the safe haven, first crisis, and why the characters personally care.',
      'Introduce at least one faction contact and one charming or memorable local NPC.',
      'Let the players discover the first two clues through choices, risk, or roleplay.',
      'End with proof that the problem is larger than the first scene suggested.',
    ],
    act1MustIntroduce: repaired.dmRoadmap?.act1MustIntroduce?.length ? repaired.dmRoadmap.act1MustIntroduce : [
      repaired.geography[0]?.name || 'the starting settlement',
      repaired.factions[0]?.name || 'the first faction contact',
      repaired.campaignBrief.whereToStart,
    ],
    act1ClimaxEvent: repaired.dmRoadmap?.act1ClimaxEvent || 'The opening threat is stopped or exposed, but the victory reveals a larger hand behind it.',
    act2Goals: repaired.dmRoadmap?.act2Goals?.length ? repaired.dmRoadmap.act2Goals : [
      'Put factions into motion so player choices change who has leverage.',
      'Activate a character-facing stake, backstory pressure, or personal temptation.',
      'Reveal a clue that reframes an earlier assumption.',
      'Force a meaningful cost, bargain, rescue, or betrayal before the next climax.',
    ],
    act2VillainEscalation: repaired.dmRoadmap?.act2VillainEscalation || `${antagonist.name} turns a public fear into visible power, making inaction costly.`,
    act2ClimaxEvent: repaired.dmRoadmap?.act2ClimaxEvent || 'The players win something real while losing certainty, safety, or trust in an institution.',
    act3ConvergenceThreads: repaired.dmRoadmap?.act3ConvergenceThreads?.length ? repaired.dmRoadmap.act3ConvergenceThreads : [
      'An opening clue returns with its true meaning revealed.',
      'A faction debt or kindness changes who stands with the characters.',
      'A personal stake collides with the public crisis.',
    ],
    act3ClimaxEvent: repaired.dmRoadmap?.act3ClimaxEvent || 'The local arc reaches a decisive confrontation that resolves the immediate threat without forcing the entire saga to end.',
    act3ResolutionOptions: repaired.dmRoadmap?.act3ResolutionOptions?.length ? repaired.dmRoadmap.act3ResolutionOptions : [
      'Victory preserves the safe haven and exposes the antagonist’s method.',
      'Pyrrhic victory stops the crisis but leaves a faction transformed or broken.',
      'Tragic victory saves what matters most while costing a personal bond, secret, or place.',
    ],
  };

  repaired.artBible = {
    ...EVERREALM_ART_BIBLE,
    ...(repaired.artBible || {}),
  };
  repaired.toneRules = repaired.toneRules?.length ? repaired.toneRules : [
    'Let the chosen table tone decide whether a scene leans cozy, eerie, heroic, funny, romantic, or frightening.',
    'Consequences are honest, but the DM does not force despair as the default mood.',
    'NPCs react to identity, reputation, kindness, threat, and visible choices.',
    'Every session should leave at least one playable lead, pressure, or choice.',
  ];
  repaired.playerPreferences = {
    ...(repaired.playerPreferences || {}),
    ...(preferences || {}),
    campaignLength: preferences?.campaignLength || repaired.playerPreferences?.campaignLength || 'medium',
    tone: preferences?.tone || repaired.playerPreferences?.tone || 'Anything Goes',
    favoritePillars: preferences?.favoritePillars || repaired.playerPreferences?.favoritePillars || ['All of it equally'],
    playerCount: preferences?.playerCount || repaired.playerPreferences?.playerCount || 1,
    characterConcepts: preferences?.characterConcepts || repaired.playerPreferences?.characterConcepts || [],
  };

  return repaired;
}
