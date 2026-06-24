import type { Character, WorldBible, WorldState } from '../../../shared/types';
import { actRoleFor, arcNumberFor } from './actPacingSystem';
import { parseJsonRecord } from './aiResponseParser';
import { buildStoryTasteProfile, formatTasteDirective } from './storyTaste';

export type StoryDirectorBeat = {
  beat: string;
  urgency: 'low' | 'high' | 'critical';
  beatType: string;
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

export function parseStoryDirectorBeat(raw: string | null | undefined): StoryDirectorBeat | null {
  const parsed = parseJsonRecord(raw);
  if (parsed.healthy) return null;
  if (!parsed.beat || typeof parsed.beat !== 'string') return null;

  const urgency = parsed.urgency === 'high' || parsed.urgency === 'critical'
    ? parsed.urgency
    : 'low';

  return {
    beat: parsed.beat,
    urgency,
    beatType: typeof parsed.beatType === 'string' && parsed.beatType.trim() ? parsed.beatType : 'pacing',
  };
}

function buildStoryDirectorContext(
  worldState: WorldState,
  worldBible: WorldBible,
  characters: Character[],
  act: number,
): string {
  const actionsInAct = worldState.actionsInCurrentAct || 0;
  const actionCount = worldState.actionCount || 0;
  const sceneState = worldState.sceneState;
  const lastPillar = worldState.lastPillarUsed || sceneState?.purpose || 'explore';
  const spotlightBalance = worldState.spotlightBalance || {};
  const sessionNotes = worldState.sessionNotes || [];
  const futureHooks = (worldState.futureHooks || []).filter(h => !h.resolved);
  const backstoryHooks = worldState.backstoryHooks || [];
  const actGoalsAchieved = worldState.actGoalsAchieved || [];
  const taste = buildStoryTasteProfile(worldBible, worldState);

  const roadmap = worldBible.dmRoadmap;
  const role = actRoleFor(act);
  const arc = arcNumberFor(act);
  const actGoals = role === 1 ? roadmap?.act1Goals : role === 2 ? roadmap?.act2Goals : roadmap?.act3ConvergenceThreads;
  const totalGoals = actGoals?.length || 4;
  const goalsComplete = actGoalsAchieved.length;

  return `
Campaign health check for Act ${act} (Arc ${arc}, ${role === 1 ? 'setup' : role === 2 ? 'escalation' : 'climax'}):
- Actions in current act: ${actionsInAct}
- Total actions: ${actionCount}
- Last scene type (pillar): ${lastPillar}
- Spotlight balance: ${JSON.stringify(spotlightBalance)}
- Unresolved future hooks: ${futureHooks.length} (${futureHooks.slice(-3).map(h => h.description).join('; ') || 'none'})
- Backstory hooks: ${backstoryHooks.filter(h => h.status === 'active').length} active, ${backstoryHooks.filter(h => h.status === 'dormant').length} dormant
- Act goals achieved: ${goalsComplete}/${totalGoals}
- Recent session notes: ${sessionNotes.slice(-3).join(' | ') || 'none'}
- Characters: ${characters.map(c => `${c.name} (${c.race} ${c.class}, Lv${c.level})`).join(', ')}
- Central conflict: ${worldBible.centralConflict || 'unknown'}
- Mystery layer question: ${worldBible.mysteryLayer?.centralQuestion || 'none'}

${formatTasteDirective(taste)}
`;
}

export async function runStoryDirector(
  client: ChatClient,
  worldState: WorldState,
  worldBible: WorldBible,
  characters: Character[],
  act: number,
): Promise<StoryDirectorBeat | null> {
  try {
    const context = buildStoryDirectorContext(worldState, worldBible, characters, act);

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a Story Director evaluating campaign health for a genre-fluid fantasy RPG. Given campaign state, determine if a specific intervention is needed in the next 1-2 player actions to keep the story on track. Be specific - name NPCs, name scenes, name mechanics. Return JSON only.`,
        },
        {
          role: 'user',
          content: `${context}

Based on this campaign state, what specific thing MUST happen in the next 1-2 player actions?

Consider:
- Is the act overdue for a mystery clue drop? (Every 3-4 actions)
- Is one character dominating spotlight while another is ignored?
- Are there urgent future hooks that need to pay off now?
- Are there active backstory hooks that need escalation?
- Is the pillar balance off (all combat, no social/exploration)?
- Are act goals dangerously behind?

If the campaign is healthy and nothing is urgently needed, return {"healthy": true}.

Otherwise return:
{
  "beat": "Specific directive: exactly what must happen, naming NPCs/locations/situations. 2-3 sentences max.",
  "urgency": "low|high|critical",
  "beatType": "mystery_clue|spotlight_shift|hook_payoff|backstory_escalation|pillar_balance|act_goal|pacing"
}`,
        },
      ],
      temperature: 0.6,
      response_format: { type: 'json_object' },
    });

    return parseStoryDirectorBeat(response.choices[0].message.content || '{}');
  } catch {
    return null;
  }
}
