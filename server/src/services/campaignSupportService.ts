import type { BackstoryHook, Character, WorldBible, WorldState } from '../../../shared/types';
import { parseJsonRecord, parseJsonValueOrFallback } from './aiResponseParser';

type ChatClient = {
  chat: {
    completions: {
      create(args: {
        model: string;
        messages: { role: 'system' | 'user'; content: string }[];
        temperature: number;
        max_tokens?: number;
        response_format?: { type: 'json_object' };
      }): Promise<{ choices: { message: { content?: string | null } }[] }>;
    };
  };
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function buildBackstoryHooksPrompt(
  backstory: string,
  characterName: string,
  race: string,
  characterClass: string,
  worldBible: WorldBible,
): string {
  return `You are a DM extracting plot hooks from a character backstory to weave into the campaign.

CHARACTER: ${characterName}, ${race} ${characterClass}
BACKSTORY: ${backstory}

CAMPAIGN CONTEXT:
Central conflict: ${worldBible.centralConflict}
Primary antagonist agenda: ${worldBible.primaryAntagonist?.agenda || 'unknown'}
Factions: ${worldBible.factions?.map(f => f.name).join(', ')}

Extract 2-3 specific plot hooks from this backstory that can be seeded into the campaign.
Each hook should connect the character's personal history to the world's conflict.
Be specific - name people, places, grudges, losses, secrets.

Return JSON:
{
  "hooks": [
    {
      "hook": "Specific 1-2 sentence hook that ties backstory to the main conflict. E.g: 'Elarion's murdered mentor was killed by agents of the Shadow Court - the same faction now serving the primary antagonist.'",
      "seedTiming": "act1" | "act2" | "act3"
    }
  ]
}`;
}

export function parseBackstoryHooks(
  raw: string | null | undefined,
  characterId: string,
  characterName: string,
): BackstoryHook[] {
  const parsed = parseJsonValueOrFallback<{ hooks?: unknown[] }>(raw, { hooks: [] });
  return (parsed.hooks || [])
    .map(asRecord)
    .filter((hook): hook is Record<string, unknown> => !!hook && !!asString(hook.hook))
    .map(hook => ({
      characterId,
      characterName,
      hook: asString(hook.hook)!,
      status: 'dormant' as const,
    }));
}

export async function extractBackstoryHooksFromService(
  openai: ChatClient,
  backstory: string,
  characterName: string,
  race: string,
  characterClass: string,
  worldBible: WorldBible,
  characterId: string,
): Promise<BackstoryHook[]> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{
      role: 'user',
      content: buildBackstoryHooksPrompt(backstory, characterName, race, characterClass, worldBible),
    }],
    max_tokens: 400,
    temperature: 0.8,
    response_format: { type: 'json_object' },
  });

  return parseBackstoryHooks(response.choices[0].message.content, characterId, characterName);
}

export function buildVillainMovePrompt(worldState: WorldState, worldBible: WorldBible, actNumber: number): string {
  const antagonist = worldBible.primaryAntagonist;
  const progress = worldState.antagonistProgress?.[antagonist?.name || ''];
  const stepIndex = progress?.stepIndex ?? 0;
  const currentStep = antagonist?.planSteps?.[stepIndex] || antagonist?.currentStep || 'advancing their plan';
  const roadmap = worldBible.dmRoadmap;

  return `The villain has made a move while the hero was away.

Antagonist: ${antagonist?.isRevealed ? antagonist.name : '[Unknown Force]'}
Current plan step: ${currentStep}
Act: ${actNumber}
${actNumber === 2 && roadmap ? `Act 2 escalation: ${roadmap.act2VillainEscalation}` : ''}
World state: ${worldState.currentLocation || 'unknown location'}, ${worldState.timeOfDay || 'unknown time'}
Central conflict: ${worldBible.centralConflict}

Write a short atmospheric narration of what the villain did - something the hero discovers or hears about when they return. It should feel ominous and advance the threat. Do NOT name the villain if isRevealed is false.

Return JSON:
{
  "narration": "2-4 sentence atmospheric description of what changed while the hero was away",
  "sessionNote": "1 sentence DM note: what the villain actually did mechanically"
}`;
}

export function parseVillainMove(raw: string | null | undefined): { narration: string; sessionNote: string } {
  const parsed = parseJsonRecord(raw);
  return {
    narration: asString(parsed.narration) || 'Something has changed in the world while you were away.',
    sessionNote: asString(parsed.sessionNote) || 'Villain advanced their plan.',
  };
}

export async function generateVillainMoveFromService(
  openai: ChatClient,
  worldState: WorldState,
  worldBible: WorldBible,
  actNumber: number,
): Promise<{ narration: string; sessionNote: string }> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{
      role: 'system',
      content: 'You are a DM narrating what the villain did while the hero was away. Write in second person. Be atmospheric and ominous. 2-4 sentences max. The players did NOT cause this - the world moved without them. Respond with valid JSON only.',
    }, {
      role: 'user',
      content: buildVillainMovePrompt(worldState, worldBible, actNumber),
    }],
    temperature: 0.85,
    response_format: { type: 'json_object' },
  });

  return parseVillainMove(response.choices[0].message.content);
}

export function buildEpiloguePrompt(
  worldState: WorldState,
  worldBible: WorldBible,
  character: Character,
  victory: boolean,
): string {
  const fallenHeroes = worldState.fallenHeroes || [];
  const npcMemory = worldState.npcMemory || [];
  const factionStandings = worldState.factionStandings || {};
  const journal = worldState.campaignJournal || [];

  return `You are the narrator writing the final epilogue of a genre-fluid fantasy campaign. The age has ended.

CHARACTER: ${character.name}, ${character.race} ${character.class}, Level ${character.level}
OUTCOME: ${victory ? 'VICTORY - the central threat was resolved' : 'DEFEAT - the central threat prevailed'}

CAMPAIGN JOURNAL (what happened):
${journal.slice(-5).map(j => `[Act ${j.actNumber}] ${j.summary}`).join('\n') || 'A hero changed the shape of a living world.'}

FALLEN HEROES who came before:
${fallenHeroes.map(h => `- ${h.name} (${h.race} ${h.class}, Lv${h.level}): ${h.cause}`).join('\n') || 'None fell before this hero.'}

KEY NPCs encountered:
${npcMemory.slice(-10).map(n => `- ${n.name} [${n.disposition}]: ${n.notes}`).join('\n') || 'Many faces, many names.'}

FACTION STANDINGS:
${Object.entries(factionStandings).map(([f, v]) => `- ${f}: ${v > 0 ? 'Allied' : v < 0 ? 'Hostile' : 'Neutral'} (${v})`).join('\n') || 'The factions shifted like tides.'}

WORLD: ${worldBible.era} | ${worldBible.centralConflict}
PRIMARY ANTAGONIST: ${worldBible.primaryAntagonist?.name || 'The final threat'} - ${worldBible.primaryAntagonist?.agenda || 'sought to reshape the world'}

Write a rich 400-600 word epilogue in the style of the final page of a genre-fluid fantasy novel. Include:
1. What happened to the world after the conflict ended
2. The fate of 2-3 key NPCs the hero knew
3. The villain's ultimate fate (death, imprisonment, escape, transformation, redemption, exile, or an unresolved return)
4. The character's legacy - what songs will be sung, what statues built, or what they chose to do next
5. How the world changed because of their specific choices
6. A bittersweet final note - the ending should honor the campaign's tone. Hope can be clean, victory can cost something, defeat can leave a spark, and comedy can resolve warmly when earned

Write in second person ("You...") for an immersive final address to the player. Tone: earned, final, and matched to the campaign's actual genre. It may be triumphant, bittersweet, strange, warm, mournful, wondrous, or ominous depending on what happened.

Return plain text only. No JSON. No formatting markers.`;
}

export async function generateEpilogueFromService(
  openai: ChatClient,
  worldState: WorldState,
  worldBible: WorldBible,
  character: Character,
  victory: boolean,
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'You are a master narrator writing the final epilogue of a genre-fluid fantasy campaign. Write beautifully. This is the last thing the player will read. Make it matter.' },
      { role: 'user', content: buildEpiloguePrompt(worldState, worldBible, character, victory) },
    ],
    temperature: 0.9,
    max_tokens: 800,
  });

  return response.choices[0].message.content?.trim() || 'The age ends. The stories live on.';
}
