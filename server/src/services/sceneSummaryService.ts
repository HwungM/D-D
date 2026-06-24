import type { WorldState } from '../../../shared/types';

type ChatClient = {
  chat: {
    completions: {
      create(args: {
        model: string;
        messages: { role: 'user'; content: string }[];
        max_tokens: number;
        temperature: number;
      }): Promise<{ choices: { message: { content?: string | null } }[] }>;
    };
  };
};

export type SceneSummaryArgs = {
  recentHistory: string[];
  currentLocation: string;
  characterName: string;
  combatState: WorldState['combatState'];
};

export function buildSceneSummaryPrompt({
  recentHistory,
  currentLocation,
  characterName,
  combatState,
}: SceneSummaryArgs): string {
  const historyText = recentHistory.slice(-8).join('\n');
  const combatContext = combatState?.inCombat
    ? `\nCurrently in combat with ${combatState.enemyName} (${combatState.enemyCondition}, round ${combatState.roundNumber}).`
    : '';

  return `Summarize what is CURRENTLY happening in this RPG scene in 2-3 sentences. Be specific: who is present, what just happened, what the immediate situation is. Focus on the last few actions.${combatContext}\n\nLocation: ${currentLocation}\nCharacter: ${characterName}\n\nRecent events:\n${historyText}\n\nWrite ONLY the summary, no preamble.`;
}

export async function generateSceneSummaryFromService(
  openai: ChatClient,
  args: SceneSummaryArgs,
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{
      role: 'user',
      content: buildSceneSummaryPrompt(args),
    }],
    max_tokens: 150,
    temperature: 0.3,
  });

  return response.choices[0].message.content?.trim() || '';
}
