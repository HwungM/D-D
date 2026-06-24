import crypto from 'crypto';
import type { Character, WorldBible, WorldState } from '../../../shared/types';
import { parseJsonRecord, parseJsonValueOrFallback } from './aiResponseParser';

export type FutureHook = {
  id: string;
  description: string;
  source: string;
  createdAt: string;
  resolved: boolean;
};

export type ProactiveEvent = {
  narration: string;
  sceneImagePrompt: string;
  suggestedActions: string[];
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

export function parseFutureHooks(
  raw: string | null | undefined,
  action: string,
  now: () => string = () => new Date().toISOString(),
  createId: () => string = () => crypto.randomUUID(),
): FutureHook[] {
  const parsed = parseJsonValueOrFallback<{ hooks?: { description: string; type?: string }[] }>(raw || '{}', { hooks: [] });
  const hooks = parsed.hooks || [];
  if (!hooks.length) return [];

  return hooks
    .filter(h => typeof h.description === 'string' && h.description.trim().length > 0)
    .slice(0, 2)
    .map(h => ({
      id: createId(),
      description: h.description.trim(),
      source: action.slice(0, 100),
      createdAt: now(),
      resolved: false,
    }));
}

export function parseProactiveEvent(raw: string | null | undefined): ProactiveEvent {
  const parsed = parseJsonRecord(raw);
  return {
    narration: (parsed.narration as string) || 'Something stirs in the distance...',
    sceneImagePrompt: (parsed.sceneImagePrompt as string) || '',
    suggestedActions: Array.isArray(parsed.suggestedActions) ? parsed.suggestedActions as string[] : [],
  };
}

export async function extractFutureHooks(
  client: ChatClient,
  action: string,
  narration: string,
  worldState: WorldState,
  characterName: string,
): Promise<FutureHook[]> {
  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are analyzing a D&D session moment to extract future hooks - things that COULD have repercussions later if remembered. Extract 0-2 items only. Only flag genuinely notable moments, not mundane actions. Return JSON only.`,
        },
        {
          role: 'user',
          content: `Character: ${characterName}
Current location: ${worldState.currentLocation || 'unknown'}
Player action: "${action}"
What happened: "${narration.slice(0, 500)}"

Extract 0-2 future hooks from this moment. These are things that could matter later:
- An NPC was threatened/wronged/helped - they might remember
- A faction noticed something the players did
- A promise or oath was made
- An object of unknown significance appeared
- A choice was made that one character might regret
- Something was left behind or ignored that will matter

Return: {"hooks": [{"description": "short description of the repercussion potential", "type": "npc_grudge|faction_memory|promise|object|choice|abandoned"}]}
Or: {"hooks": []} if nothing notable happened.`,
        },
      ],
      temperature: 0.5,
      response_format: { type: 'json_object' },
    });

    return parseFutureHooks(response.choices[0].message.content || '{}', action);
  } catch {
    return [];
  }
}

export async function generateProactiveEvent(
  client: ChatClient,
  worldState: WorldState,
  worldBible: WorldBible,
  character: Character,
): Promise<ProactiveEvent> {
  const antagonistContext = worldBible.antagonistRoster && worldBible.antagonistRoster.length > 0
    ? `Active antagonists: ${worldBible.antagonistRoster.map(a => `${a.isRevealed ? a.name : '[Unknown Force]'} - ${a.currentStep}`).join('; ')}`
    : '';

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a DM injecting a proactive world event. Something happened in the world without the player doing anything. Make it atmospheric, brief (2-3 sentences), and connected to the antagonist's agenda or world state. NOT a combat encounter. A rumor, an observation, something found, a messenger arriving, distant sounds. End with 3-4 optional action ideas. Respond with valid JSON only.`,
      },
      {
        role: 'user',
        content: `The world stirs while ${character.name} (${character.race} ${character.class}, Level ${character.level}) rests or travels.

Current location: ${worldState.currentLocation || 'unknown'}
Time: ${worldState.timeOfDay || 'unknown'}
Central conflict: ${worldBible.centralConflict || 'unknown'}
${antagonistContext}

Return JSON:
{
  "narration": "2-3 sentence atmospheric world event the character observes or hears about",
  "sceneImagePrompt": "brief scene description",
  "suggestedActions": ["specific reaction 1", "specific reaction 2", "specific reaction 3", "specific reaction 4"]
}`,
      },
    ],
    temperature: 0.9,
    response_format: { type: 'json_object' },
  });

  return parseProactiveEvent(response.choices[0].message.content || '{}');
}
