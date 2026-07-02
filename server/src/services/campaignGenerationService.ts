import type { DmRoadmapArcSegment, PartyComposition, StorySeedOption, WorldBible, WorldState } from '../../../shared/types';
import { parseJsonValueOrFallback } from './aiResponseParser';
import { repairWorldBibleQuality } from './campaignQualityGate';
import { EVERREALM_ART_BIBLE } from './everrealmArtPrompt';

export type CampaignGenerationPlayerPreferences = {
  playMode?: 'solo' | 'collaborative';
  partyIntent?: 'solo_alone' | 'solo_ai_companions' | 'collab_wait_for_party' | 'collab_start_now';
  tone?: string;
  artStyle?: string;
  favoritePillars?: string[];
  playerCount?: number;
  targetPlayerCount?: number;
  waitForParty?: boolean;
  characterConcepts?: string[];
  partyComposition?: PartyComposition;
};

type ChatClient = {
  chat: {
    completions: {
      create(args: {
        model: string;
        messages: { role: 'system' | 'user'; content: string }[];
        temperature: number;
        response_format: { type: 'json_object' };
      }): Promise<{ choices: { message: { content?: string | null } }[] }>;
    };
  };
};

// Every campaign is now one continuous, open-ended, multi-arc saga (no more
// one_shot/short/medium/long tiers) — arcs chain forever like Critical Role's
// Vox Machina campaign. This is the single guidance string used for all campaigns.
export const OPEN_ENDED_CAMPAIGN_GUIDANCE =
  'Open-ended saga: create a living world with modular arcs and no forced final ending. Resolve local arcs cleanly, then open new fronts (a new job, a new threat, a new mystery) forever, using the same characters and world, until the players themselves choose to stop.';

export function normalizeGeneratedWorldBible(
  parsed: WorldBible,
  playerPreferences?: CampaignGenerationPlayerPreferences,
): WorldBible {
  const roster: import('../../../shared/types').Antagonist[] = [];
  if (parsed.primaryAntagonist) roster.push(parsed.primaryAntagonist);
  if (parsed.lieutenant) roster.push(parsed.lieutenant as import('../../../shared/types').Antagonist);
  if (!parsed.antagonistRoster || parsed.antagonistRoster.length === 0) {
    parsed.antagonistRoster = roster;
  } else {
    const names = new Set(parsed.antagonistRoster.map(a => a.name));
    if (parsed.primaryAntagonist && !names.has(parsed.primaryAntagonist.name)) {
      parsed.antagonistRoster.unshift(parsed.primaryAntagonist);
    }
    if (parsed.lieutenant && !names.has(parsed.lieutenant.name)) {
      parsed.antagonistRoster.push(parsed.lieutenant as import('../../../shared/types').Antagonist);
    }
  }

  if (!parsed.toneRules || parsed.toneRules.length === 0) parsed.toneRules = ['The world begins neutral and the current place sets the tone.', 'Different regions can follow different fantasy rules.', 'Consequences remain honest without forcing bitterness.', 'Wonder, danger, humor, horror, and heroism all appear when context earns them.'];
  parsed.plannedBetrayal = normalizePlannedBetrayal(parsed.plannedBetrayal, parsed.primaryAntagonist, parsed.lieutenant as import('../../../shared/types').Antagonist | undefined);
  parsed.artBible = {
    ...EVERREALM_ART_BIBLE,
    ...(parsed.artBible || {}),
  };
  if (!parsed.openingHooks || parsed.openingHooks.length === 0) parsed.openingHooks = ['Something stirs in the shadows.', 'An old warning resurfaces.', 'A stranger arrives with dire news.'];
  if (!parsed.geography || parsed.geography.length === 0) parsed.geography = [{ name: 'The Starting Town', description: 'A small settlement at the edge of the wilderness.', type: 'city' }];
  if (!parsed.factions || parsed.factions.length === 0) parsed.factions = [];
  if (!parsed.pantheon || parsed.pantheon.length === 0) parsed.pantheon = [];
  parsed.playerPreferences = {
    ...(parsed.playerPreferences || {}),
    ...(playerPreferences || {}),
    tone: playerPreferences?.tone || parsed.playerPreferences?.tone || 'Anything Goes',
    favoritePillars: playerPreferences?.favoritePillars || parsed.playerPreferences?.favoritePillars || ['All of it equally'],
    playerCount: playerPreferences?.playerCount || parsed.playerPreferences?.playerCount || 1,
    characterConcepts: playerPreferences?.characterConcepts || parsed.playerPreferences?.characterConcepts || [],
  };

  return repairWorldBibleQuality(parsed, playerPreferences);
}

// The planted hidden-identity twist (Vox Machina style: the trusted general who
// turns out to BE the dragon terrorizing the region, in disguise) should feel
// like the same authored story as the primary antagonist/lieutenant, not a
// disconnected system. Prefer whatever the AI generated; fall back to a
// sensible twist tied to the lieutenant (or, absent one, the primary
// antagonist) so a plannedBetrayal always exists for the reveal machinery
// (see hiddenIdentitySystem.ts) to eventually pay off.
function normalizePlannedBetrayal(
  betrayal: WorldBible['plannedBetrayal'] | undefined,
  primaryAntagonist: import('../../../shared/types').Antagonist | undefined,
  lieutenant: import('../../../shared/types').Antagonist | undefined,
): WorldBible['plannedBetrayal'] | undefined {
  if (betrayal?.npcRole?.trim() && betrayal.trueIdentity?.trim() && betrayal.setupHint?.trim()) {
    return betrayal;
  }
  const villain = lieutenant || primaryAntagonist;
  if (!villain) return betrayal;
  const isPrimary = villain === primaryAntagonist;
  return {
    npcRole: 'a trusted officer, general, or advisor who genuinely aids the party from early on',
    trueIdentity: isPrimary
      ? `secretly ${villain.name}, the very threat terrorizing the region, in disguise`
      : `secretly ${villain.name}, the primary antagonist's lieutenant, operating under a false identity`,
    setupHint: 'Introduce them early as genuinely helpful and trustworthy, offering real aid the party can rely on; drop only subtle, deniable tells before the story is ready to pay off the reveal.',
  };
}

export function parseStorySeeds(content: string | null | undefined): StorySeedOption[] {
  const parsed = parseJsonValueOrFallback<unknown>(content || '{"seeds":[]}', []);
  return (parsed as { seeds?: StorySeedOption[] }).seeds || (parsed as StorySeedOption[]) || [];
}

function buildPlayerPreferenceContext(playerPreferences?: CampaignGenerationPlayerPreferences): string {
  if (!playerPreferences) return '';

  const composition = playerPreferences.partyComposition;
  const companionSlotCount = composition?.slots?.filter(slot => slot.kind === 'ai_companion').length || 0;
  const partyCompositionLine = composition
    ? `- Starting party: ${composition.startingSize} member(s)${companionSlotCount > 0 ? `, including ${companionSlotCount} AI-controlled companion(s) who need their own names, races, classes, and personalities fitting this world` : ''}.`
    : '';

  return `
PLAYER PREFERENCES (use these to tailor the campaign):
${playerPreferences.playMode ? `- Human play mode: ${playerPreferences.playMode}. Solo means one human player; collaborative means real human party members may join.` : ''}
${playerPreferences.partyIntent ? `- Party setup intent: ${playerPreferences.partyIntent}. If collaborative, prepare shared spotlight moments and invite-friendly hooks. If solo_ai_companions, leave room for AI companions but do not assume they already exist.` : ''}
${partyCompositionLine}
${playerPreferences.tone ? `- Desired tone: ${playerPreferences.tone} - let this calibrate the toneRules and overall feel.` : ''}
${playerPreferences.artStyle ? `- Visual art style: ${playerPreferences.artStyle}. Keep this as the campaign's art bible foundation.` : ''}
${playerPreferences.favoritePillars?.length ? `- What they love most: ${playerPreferences.favoritePillars.join(', ')} - weight spotlightDesign.encounterCurve and suggested encounters toward these.` : ''}
${playerPreferences.playerCount ? `- Party size: ${playerPreferences.playerCount} players - scale the safeHaven, spotlightDesign.sharedMoments, and encounter difficulty accordingly.` : ''}
${playerPreferences.targetPlayerCount && playerPreferences.targetPlayerCount !== playerPreferences.playerCount ? `- Target party size after invites: ${playerPreferences.targetPlayerCount}. Start playable now, but design the campaign so new companions can join naturally.` : ''}
${typeof playerPreferences.waitForParty === 'boolean' ? `- Wait-for-party preference: ${playerPreferences.waitForParty ? 'the host expects to gather the party before starting' : 'the host may start now and invite others later'}.` : ''}
${playerPreferences.characterConcepts?.length ? `- Character concepts and backstories: ${playerPreferences.characterConcepts.join('; ')} - These character concepts and backstories are CANON. Build NPCs, factions, and opening hooks that directly reference what these characters care about, fear, or are running from. At least one faction or NPC in the world should have a direct tie to one of these character backstories. Use these to make campaignBrief.motivation personal, personalMotivation of the lieutenant feel relevant, and shape backstory hooks.` : ''}
`;
}

function buildWorldBiblePrompt(storySeed: string, playerPreferences?: CampaignGenerationPlayerPreferences): string {
  const prefContext = buildPlayerPreferenceContext(playerPreferences);
  return `Design a complete dynamic, genre-fluid fantasy sandbox campaign for this premise: "${storySeed}"
${prefContext}
Return JSON matching this exact schema. Every field must be substantive and specific to the premise - no placeholder text:

{
  "era": "Name of the age - something evocative, not a generic age name",
  "magicSystem": "2-3 sentences on how magic works - its cost, rarity, and what makes it distinctive to this world",
  "geography": [
    {"name": "place name", "description": "2 sentences - what it looks and feels like", "type": "city|region|dungeon|wilderness|landmark"}
  ],
  "pantheon": [
    {"name": "god name", "domain": "domain", "alignment": "alignment", "conflict": "their specific conflict with another deity or mortal power"}
  ],
  "toneRules": [
    "rule 1 - specific to this premise, not generic fantasy",
    "rule 2",
    "rule 3",
    "rule 4"
  ],
  "artBible": {
    "styleName": "Everrealm Painterly Western Fantasy Animation",
    "masterPrompt": "${EVERREALM_ART_BIBLE.masterPrompt}",
    "characterStyle": [
      "Sharp expressive faces with readable emotion and angular structure.",
      "Anime-aware eyes and acting, but western RPG fantasy proportions and design language.",
      "Varied silhouettes, species traits, body types, scars, gear, posture, and personality.",
      "Rugged adventuring clothes and armor that feel lived-in, repaired, and story-worn."
    ],
    "environmentStyle": [
      "Painterly fantasy animation backgrounds with strong shape language and cinematic composition.",
      "Locations can be cozy, eerie, heroic, whimsical, bleak, romantic, strange, or sacred depending on the scene.",
      "Avoid defaulting every cave, forest, castle, tavern, or ruin into the same dark-fantasy palette."
    ],
    "lighting": [
      "Warm candlelight, tavern glow, firelight, sunrise, and lamplight should contrast with cool moonlight, stormlight, water, steel, shadow, and magic.",
      "Use glowing magic accents as story focal points, not random decoration.",
      "Keep silhouettes readable even in tense or dark scenes."
    ],
    "toneRules": [
      "The visual style stays consistent while the local genre tone changes by region, faction, scene, and player choice.",
      "Dark scenes are allowed, but darkness is not the baseline.",
      "Wonder, humor, danger, beauty, horror, and heroism can sit side by side in the same world."
    ],
    "avoid": [
      "photorealism",
      "generic dark fantasy concept art",
      "flat cartoon",
      "full anime style",
      "same-face characters",
      "muddy unreadable darkness",
      "empty atmospheric shots with no story focus"
    ],
    "scenePromptRules": [
      "Mention the current location, subject, emotional beat, lighting, and visible story objects.",
      "If characters are visible, keep their species, silhouette, clothing, and emotional expression consistent.",
      "Frame scenes as moments from an animated fantasy film, not static item catalog art."
    ]
  },
  "forbiddenLoreHooks": ["mystery 1 - something strange, hidden, sacred, dangerous, or forgotten about this world's history", "mystery 2", "mystery 3", "mystery 4"],
  "factions": [
    {"name": "faction name", "publicFace": "what they claim to be - their public reputation", "secretAgenda": "what they actually want - specific and surprising", "power": "weak|moderate|strong"}
  ],
  "primaryAntagonist": {
    "name": "A cryptic title or name (not their true name yet)",
    "trueName": "Their real name - kept secret until a climax arc when the reveal has been earned",
    "type": "primary",
    "agenda": "Their goal in 1-2 sentences - concrete and specific, vague enough to remain mysterious",
    "currentStep": "The specific step of their plan currently underway - what they are doing RIGHT NOW",
    "planSteps": ["step 1", "step 2", "step 3", "step 4", "step 5 - the completion of their goal"],
    "whatTheyKnow": "Nothing yet - the players are unknown to them",
    "isRevealed": false,
    "power": "legendary",
    "allies": ["ally faction or specific named person 1", "ally faction or specific named person 2"],
    "weaknesses": ["specific weakness 1 - something the players could discover and use", "specific weakness 2"]
  },
  "lieutenant": {
    "name": "Their name - someone the players will meet before knowing they're the villain's lieutenant",
    "trueName": "Same as name (lieutenants are not secret in the same way)",
    "type": "secondary",
    "agenda": "Their stated or apparent goal - what they seem to be pursuing",
    "currentStep": "What they are actively doing right now in the story",
    "planSteps": ["step 1", "step 2", "step 3"],
    "whatTheyKnow": "What they know about the primary antagonist's plan",
    "isRevealed": false,
    "power": "major",
    "allies": ["their personal allies, separate from the primary antagonist's"],
    "weaknesses": ["their specific vulnerability"],
    "tieToVillain": "1 sentence - how they are connected to the primary antagonist and why they serve",
    "firstAppearanceHint": "What the players first notice about this person before realizing they're the lieutenant - describe a scene or interaction",
    "personalMotivation": "What THEY want, independent of the villain - they're not just a lackey, they have their own goal the villain is helping them achieve"
  },
  "centralConflict": "2-3 sentences - the emotional and thematic core of the campaign. Not plot specifics. What does this campaign ultimately ask of the players?",
  "antagonistRoster": [],
  "openingHooks": [
    "A subtle hint that can be seeded in session 1 - specific, not generic",
    "A second breadcrumb - different in nature (visual, heard, felt, smelled)",
    "A third early omen - something that seems innocuous but is deeply significant"
  ],
  "plotTwist": "The mid-campaign revelation that reframes everything the players thought they knew. Should make them say 'oh god, of course.' Not a random surprise - something that was always true but hidden.",
  "plannedBetrayal": {
    "npcRole": "A specific early-trustworthy NPC role, e.g. 'a general/officer who aids the party from early on' - specific to this premise",
    "trueIdentity": "What they secretly are - tie this to primaryAntagonist or lieutenant wherever it fits this premise (e.g. 'secretly the primary antagonist in disguise' or 'secretly the lieutenant operating under a false identity'); only invent a fully separate secret identity if that is clearly stronger for this specific premise",
    "setupHint": "1-2 sentences: how this NPC should be introduced early as genuinely trustworthy and helpful, and what subtle, deniable foreshadowing can be dropped before the reveal without confirming anything"
  },
  "mysteryLayer": {
    "centralQuestion": "The one question that drives all investigation - specific enough to pursue, mysterious enough to sustain a campaign",
    "clues": [
      "clue 1 - earliest, most subtle. Something players could easily overlook",
      "clue 2 - slightly more concrete, but still ambiguous",
      "clue 3 - raises more questions than it answers",
      "clue 4 - starts pointing at the truth in an uncomfortable direction",
      "clue 5 - confirms part of the answer but opens a worse question",
      "clue 6 - the final piece before revelation. Should make the revelation feel inevitable"
    ],
    "redHerrings": [
      "false trail 1 - plausible, misleading, has its own internal logic",
      "false trail 2 - points at the wrong person or cause convincingly"
    ],
    "revelation": "The full truth behind the central question - what actually happened/is happening. Be specific."
  },
  "safeHaven": {
    "name": "Name of the home base - evocative, fits the world",
    "description": "2 sentences - what it looks, sounds, smells like. It should feel lived-in and slightly imperfect.",
    "keyNPC": "Name and one sentence about the person who runs/protects it - warm, slightly odd, genuinely fond of the characters",
    "flavor": "One specific sensory detail that players will associate with safety - the smell of something always cooking, a particular lamp, a sound that means they're home"
  },
  "toneBreaks": [
    "A specific NPC who is genuinely funny or absurd in a tonally different part of the world - describe them in one sentence with their name",
    "A recurring comic situation or running joke built into the world - specific to this premise",
    "A moment of unexpected tonal contrast - warmth inside danger, danger inside beauty, comedy inside tension, or awe after fear. Describe the scenario",
    "An encounter that is lighter in difficulty and tone, designed to let players breathe - describe it"
  ],
  "futureHookSeeds": [
    "IF players choose to [specific action X in this world], then [future consequence Y - be specific about what changes]",
    "IF [specific NPC name from this campaign] survives/is spared, they will [specific future role]",
    "The [specific object/location/secret from the setup arc] will [become critical in a later climax because of this specific reason]",
    "If the players ignore [specific faction from this campaign], [that faction] will [specific retaliation action]",
    "The [specific choice the players will face in an escalation arc] will [shape a later arc resolution in this specific way]",
    "A recurring small NPC (name them) who, if players are kind to them, turns out to [have this crucial role later]"
  ],
  "campaignBrief": {
    "hook": "2 sentences. Clear objective + immediate emotional pull. No mystery yet - just: what do they need to do and why should they care RIGHT NOW.",
    "objective": "Exactly what the characters need to accomplish - concrete and actionable. Start with a verb.",
    "motivation": "Why would any character care about this personally? Make it visceral. If character concepts were provided, appeal to them directly.",
    "whereToStart": "Exactly where to go and who to talk to first. Give a name. Give a reason why that person specifically.",
    "worldStakes": "What happens to the world - specifically - if they fail. Make it visceral and concrete.",
    "characterStakes": "What the characters personally lose if they fail. More intimate than world stakes.",
    "mysteryHint": "Pose the central mystery as a question the players will want to answer. Intriguing, not spoiling."
  },
  "spotlightDesign": {
    "sharedMoments": [
      "A scenario that REQUIRES two characters to cooperate - one creates the opening, the other executes. Describe the specific situation.",
      "A moment where the characters must choose between individual goals and party loyalty - what is the specific dilemma?",
      "A scene designed to create an inside joke or shared reference - something absurd that only works in this world"
    ],
    "encounterCurve": "Describe the encounter difficulty curve for this campaign: Easy → Medium → Easy → Hard → Medium → Hard → DEADLY (boss). For each difficulty tier, describe what it represents in THIS campaign's specific context."
  },
  "dmRoadmap": {
    "act1Goals": [
      "Specific goal 1 for Act 1 - tailored to this premise",
      "Specific goal 2 for Act 1",
      "Specific goal 3 for Act 1",
      "Specific goal 4 for Act 1"
    ],
    "act1MustIntroduce": ["name of a key NPC specific to this campaign", "name of a key location", "name of a faction contact"],
    "act1ClimaxEvent": "The specific event that ends Act 1 - a revelation, a loss, a crossing of the point of no return. Specific to this premise.",
    "act2Goals": [
      "Specific goal 1 for Act 2",
      "Specific goal 2 for Act 2",
      "Specific goal 3 for Act 2",
      "Specific goal 4 for Act 2"
    ],
    "act2VillainEscalation": "The specific action the villain takes in Act 2 - something visible, terrible, personal to the players",
    "act2ClimaxEvent": "The darkest moment - the low point where players question whether victory is possible. Specific.",
    "act3ConvergenceThreads": [
      "Thread 1 converging - specific NPC or plot element from Act 1 that returns",
      "Thread 2 converging - how the central mystery connects to the current arc climax",
      "Thread 3 converging - how a choice the players made in Act 2 shapes the ending"
    ],
    "act3ClimaxEvent": "The current arc climax - describe its shape, location, and what makes it climactic. This resolves the local arc without forcing the whole campaign to end - the saga continues into a new arc afterward.",
    "act3ResolutionOptions": [
      "Victory option: specific to this campaign's themes",
      "Pyrrhic victory option: the immediate threat ends but something irreversible has changed",
      "Tragic victory option: they save what matters most but lose something personal"
    ]
  }
}

Requirements:
- ${OPEN_ENDED_CAMPAIGN_GUIDANCE} The dmRoadmap describes this arc's three acts, but design it knowing the campaign never truly ends - build in durable factions, recurring rivals, and slow-burn threads that can carry into future arcs.
- 5-7 geography entries (varied: city, dungeon, wilderness, landmark, region)
- 5-6 gods in pantheon with genuine theological conflicts
- Exactly 4 tone rules - specific to THIS premise, not boilerplate fantasy
- Include the Everrealm artBible exactly as the visual foundation, then tailor scenePromptRules only if this premise needs specific recurring visual motifs.
- 3-4 forbidden lore hooks
- Exactly 3 factions with genuinely surprising secret agendas
- The lieutenant must feel like a real person with their own goals, not just a henchman
- The mystery layer clues must form a coherent trail - each one building on the last
- The safeHaven must feel warm and specific - a place players will want to return to
- The plotTwist must be earned - something that was always true but cleverly hidden
- The plannedBetrayal is a genuinely PLANNED hidden-identity twist (Vox Machina style: the general who's been helping the party turns out to BE the dragon terrorizing the land, in disguise), authored now so it can be introduced early and paid off later - not improvised. Couple it to primaryAntagonist/lieutenant when it makes sense so it feels like the same authored story, not a separate twist.
- Make everything specific to THIS premise. Never use placeholder text.`;
}

export async function generateStorySeed(client: ChatClient): Promise<StorySeedOption[]> {
  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'You are a master worldbuilder specializing in dynamic, genre-fluid fantasy sandboxes. Generate exactly 4 distinct campaign premises across different fantasy modes. Respond with valid JSON only.',
      },
      {
        role: 'user',
        content: `Generate 4 genre-fluid fantasy sandbox campaign seed options. Each should be distinct in tone, setting, stakes, and texture. Do not make every premise grim; include a range such as whimsical wonder, heroic adventure, eerie mystery, political intrigue, mythic exploration, cozy danger, or bleak dungeon horror when appropriate.
Return JSON array:
[{
  "id": "seed-1",
  "title": "Campaign title (3-5 words)",
  "premise": "2-3 sentence hook. Make it vivid, playable, emotionally clear, and open-ended. Let the chosen genre mode define whether it feels wondrous, eerie, heroic, funny, intimate, political, or frightening.",
  "tone": "e.g. 'Political intrigue and betrayal' or 'Cosmic horror and survival'",
  "startingLocation": "Name of starting city or location"
}]`,
      },
    ],
    temperature: 0.9,
    response_format: { type: 'json_object' },
  });

  return parseStorySeeds(response.choices[0].message.content || '{"seeds":[]}');
}

export async function generateWorldBible(
  client: ChatClient,
  storySeed: string,
  playerPreferences?: CampaignGenerationPlayerPreferences,
): Promise<WorldBible> {
  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a master adventure designer creating a FULL CAMPAIGN DESIGN - not just a world setting. This is a complete adventure package: mystery, antagonists, emotional hooks, tonal contrast, safe haven, player spotlights, and a DM roadmap. Every field must be specific to THIS premise, not generic. Make it memorable. Respond with valid JSON only.`,
      },
      {
        role: 'user',
        content: buildWorldBiblePrompt(storySeed, playerPreferences),
      },
    ],
    temperature: 0.88,
    response_format: { type: 'json_object' },
  });

  const parsed = parseJsonValueOrFallback<WorldBible | undefined>(response.choices[0].message.content || '{}', undefined);
  if (!parsed) {
    throw new Error('Failed to parse world bible from AI response');
  }

  return normalizeGeneratedWorldBible(parsed, playerPreferences);
}

function normalizeArcSegment(parsed: Record<string, unknown> | undefined, arcNumber: number, fallbackAntagonist?: string): DmRoadmapArcSegment {
  const asStringArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0) : [];
  const asString = (value: unknown, fallback: string): string =>
    typeof value === 'string' && value.trim().length > 0 ? value : fallback;

  return {
    arcNumber,
    antagonistName: typeof parsed?.antagonistName === 'string' && parsed.antagonistName.trim().length > 0
      ? parsed.antagonistName
      : fallbackAntagonist,
    act1Goals: asStringArray(parsed?.act1Goals).length ? asStringArray(parsed?.act1Goals) : ['Answer the new call this arc opened with.'],
    act1MustIntroduce: asStringArray(parsed?.act1MustIntroduce),
    act1ClimaxEvent: asString(parsed?.act1ClimaxEvent, 'The new front reveals its first real danger.'),
    act2Goals: asStringArray(parsed?.act2Goals).length ? asStringArray(parsed?.act2Goals) : ['Escalate the new arc toward a decisive choice.'],
    act2VillainEscalation: asString(parsed?.act2VillainEscalation, 'The antagonist behind this arc tightens their grip.'),
    act2ClimaxEvent: asString(parsed?.act2ClimaxEvent, 'A costly reversal forces the party to commit.'),
    act3ConvergenceThreads: asStringArray(parsed?.act3ConvergenceThreads).length
      ? asStringArray(parsed?.act3ConvergenceThreads)
      : ['The arc\'s central threat converges with a personal stake.'],
    act3ClimaxEvent: asString(parsed?.act3ClimaxEvent, 'This arc reaches a decisive confrontation that resolves it without ending the saga.'),
    act3ResolutionOptions: asStringArray(parsed?.act3ResolutionOptions).length
      ? asStringArray(parsed?.act3ResolutionOptions)
      : ['Victory resolves this arc and opens a new front.'],
  };
}

// Generates a lightweight addendum to the DM roadmap for the *next* arc once
// the current arc's climax has closed — a fresh mini 3-act structure (new
// escalation, possibly a new/returning antagonist from antagonistRoster) that
// keeps the tone consistent with the world bible, without regenerating the
// whole world bible. This is what makes arc-chaining feel organic instead of
// every later arc silently reusing arc 1's goals forever.
export async function generateNextArcRoadmapSegment(
  client: ChatClient,
  worldBible: WorldBible,
  worldState: WorldState,
  arcNumber: number,
): Promise<DmRoadmapArcSegment> {
  const fallbackAntagonist = worldBible.antagonistRoster?.find(a => !a.isRevealed)?.name
    || worldBible.primaryAntagonist?.name;

  const recentEvents = [
    ...(worldState.completedEvents || []).slice(-6),
    ...(worldState.campaignJournal || []).slice(-3).map(entry => entry.summary),
  ].join(' | ') || 'The previous arc resolved without much detail recorded.';
  const openFutureHooks = (worldState.futureHooks || []).filter(h => !h.resolved).slice(-6).map(h => h.description).join(' | ') || 'none';
  const roster = (worldBible.antagonistRoster || []).map(a => `${a.name} (${a.type}, ${a.isRevealed ? 'revealed' : 'hidden'}): ${a.agenda}`).join(' | ') || 'none';

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a DM planning the next arc of an ongoing, open-ended fantasy campaign (Critical Role style: same characters and world, chained 3-act arcs forever). Write a fresh mini roadmap for the new arc only. Respond with valid JSON only.',
        },
        {
          role: 'user',
          content: `CAMPAIGN ERA: ${worldBible.era || 'unknown'}
CENTRAL CONFLICT: ${worldBible.centralConflict || 'unknown'}
ANTAGONIST ROSTER: ${roster}
PREVIOUS ARC'S RESOLUTION (recent events): ${recentEvents}
UNRESOLVED FUTURE HOOKS carried forward: ${openFutureHooks}

This is arc ${arcNumber}. The previous arc's climax just resolved cleanly. Design a new local 3-act arc (setup, escalation, climax) that grows out of that fallout — reuse an existing antagonist from the roster if one fits (revealed ones can return with a new plan; hidden ones can finally step forward), or introduce a new pressure source consistent with the world's tone if none fits. Keep it playable and specific, not generic.

Return JSON:
{
  "antagonistName": "name from the roster this arc centers on, or a new name",
  "act1Goals": ["3-4 concrete setup goals for the new arc"],
  "act1MustIntroduce": ["0-3 new NPCs/locations this arc's setup should introduce, or leave empty if none are needed"],
  "act1ClimaxEvent": "what closes this arc's setup act",
  "act2Goals": ["3-4 escalation goals"],
  "act2VillainEscalation": "how the antagonist escalates in this arc",
  "act2ClimaxEvent": "what closes the escalation act",
  "act3ConvergenceThreads": ["2-3 threads that converge at this arc's climax"],
  "act3ClimaxEvent": "the decisive confrontation of this arc",
  "act3ResolutionOptions": ["2-3 possible shapes this arc's ending could take"]
}`,
        },
      ],
      temperature: 0.85,
      response_format: { type: 'json_object' },
    });

    const parsed = parseJsonValueOrFallback<Record<string, unknown> | undefined>(response.choices[0].message.content || '{}', undefined);
    return normalizeArcSegment(parsed, arcNumber, fallbackAntagonist);
  } catch {
    return normalizeArcSegment(undefined, arcNumber, fallbackAntagonist);
  }
}
