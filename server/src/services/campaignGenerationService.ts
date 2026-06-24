import type { StorySeedOption, WorldBible } from '../../../shared/types';
import { parseJsonValueOrFallback } from './aiResponseParser';
import { EVERREALM_ART_BIBLE } from './everrealmArtPrompt';

export type CampaignLength = 'one_shot' | 'short' | 'medium' | 'long' | 'open_ended';

export type CampaignGenerationPlayerPreferences = {
  playMode?: 'solo' | 'collaborative';
  partyIntent?: 'solo_alone' | 'solo_ai_companions' | 'collab_wait_for_party' | 'collab_start_now';
  campaignLength?: CampaignLength;
  tone?: string;
  artStyle?: string;
  favoritePillars?: string[];
  playerCount?: number;
  targetPlayerCount?: number;
  waitForParty?: boolean;
  characterConcepts?: string[];
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

const CAMPAIGN_LENGTH_GUIDANCE: Record<CampaignLength, string> = {
  one_shot: 'One-shot: compress the whole adventure into one focused arc with an immediate hook, a visible antagonist or threat, 3-6 major scenes, fast clues, and a satisfying ending. Avoid slow-burn mysteries unless they are sequel hooks.',
  short: 'Short adventure: aim for a compact 2-3 act story over a few sessions. Reveal information quickly, keep travel purposeful, and make every faction/NPC serve the main arc.',
  medium: 'Medium campaign: pace as a full campaign arc with room for travel, twists, downtime, character growth, and recurring NPCs. Use this as the balanced default.',
  long: 'Long campaign: build for 30-60+ sessions with slow-burn mysteries, recurring rivals, faction turns, evolving locations, downtime, personal arcs, and delayed payoffs that still move forward each session.',
  open_ended: 'Open-ended saga: create a living world with modular arcs and no forced final ending. Resolve local arcs cleanly, then open new fronts until the players choose to pursue an endgame.',
};

const CAMPAIGN_LENGTH_LABELS: Record<CampaignLength, string> = {
  one_shot: 'One-Shot',
  short: 'Short Adventure',
  medium: 'Medium Campaign',
  long: 'Long Campaign',
  open_ended: 'Open-Ended Saga',
};

export function getCampaignLength(value?: string): CampaignLength {
  if (value === 'one_shot' || value === 'short' || value === 'medium' || value === 'long' || value === 'open_ended') {
    return value;
  }
  return 'medium';
}

export function getCampaignLengthGuidance(length: CampaignLength): string {
  return CAMPAIGN_LENGTH_GUIDANCE[length];
}

export function getCampaignLengthLabel(length: CampaignLength): string {
  return CAMPAIGN_LENGTH_LABELS[length];
}

export function normalizeGeneratedWorldBible(
  parsed: WorldBible,
  playerPreferences?: CampaignGenerationPlayerPreferences,
): WorldBible {
  const campaignLength = getCampaignLength(playerPreferences?.campaignLength);

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
    campaignLength,
    tone: playerPreferences?.tone || parsed.playerPreferences?.tone || 'Anything Goes',
    favoritePillars: playerPreferences?.favoritePillars || parsed.playerPreferences?.favoritePillars || ['All of it equally'],
    playerCount: playerPreferences?.playerCount || parsed.playerPreferences?.playerCount || 1,
    characterConcepts: playerPreferences?.characterConcepts || parsed.playerPreferences?.characterConcepts || [],
  };

  return parsed;
}

export function parseStorySeeds(content: string | null | undefined): StorySeedOption[] {
  const parsed = parseJsonValueOrFallback<unknown>(content || '{"seeds":[]}', []);
  return (parsed as { seeds?: StorySeedOption[] }).seeds || (parsed as StorySeedOption[]) || [];
}

function buildPlayerPreferenceContext(playerPreferences?: CampaignGenerationPlayerPreferences): string {
  if (!playerPreferences) return '';

  const campaignLength = getCampaignLength(playerPreferences.campaignLength);
  const campaignLengthLine = playerPreferences.campaignLength
    ? `- Campaign length: ${CAMPAIGN_LENGTH_LABELS[campaignLength]}. ${CAMPAIGN_LENGTH_GUIDANCE[campaignLength]}`
    : '';

  return `
PLAYER PREFERENCES (use these to tailor the campaign):
${playerPreferences.playMode ? `- Human play mode: ${playerPreferences.playMode}. Solo means one human player; collaborative means real human party members may join.` : ''}
${playerPreferences.partyIntent ? `- Party setup intent: ${playerPreferences.partyIntent}. If collaborative, prepare shared spotlight moments and invite-friendly hooks. If solo_ai_companions, leave room for AI companions but do not assume they already exist.` : ''}
${campaignLengthLine}
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
    "trueName": "Their real name - kept secret until Act 3",
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
    "The [specific object/location/secret from Act 1] will [become critical in Act 3 because of this specific reason]",
    "If the players ignore [specific faction from this campaign], [that faction] will [specific retaliation action]",
    "The [specific choice the players will face in Act 2] will [shape the Act 3 resolution in this specific way]",
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
      "Thread 2 converging - how the central mystery connects to the final confrontation",
      "Thread 3 converging - how a choice the players made in Act 2 shapes the ending"
    ],
    "act3ClimaxEvent": "The final confrontation - describe its shape, location, and what makes it climactic. Specific.",
    "act3ResolutionOptions": [
      "Victory option: specific to this campaign's themes",
      "Pyrrhic victory option: the immediate threat ends but something irreversible has changed",
      "Tragic victory option: they save what matters most but lose something personal"
    ]
  }
}

Requirements:
- The dmRoadmap MUST match the requested campaign length. One-shot = immediate threat and compressed payoffs. Short = compact 2-3 act arc. Medium = balanced full campaign. Long = slow-burn saga with recurring payoffs and durable factions. Open-ended = modular arcs with no forced final ending until players pursue one.
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
