import OpenAI from 'openai';
import type { CampaignJournalEntry } from '../../../shared/types';
export { processAction } from './soloTurnProcessor';
export { processCoopAction } from './coopTurnProcessor';
export { resolveCoopRollAction, resolveRollAction } from './rollResolutionProcessor';
export { getCoopOpeningScene, getOpeningScene } from './openingSceneProcessor';

const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function compressToJournalEntry(
  _campaignId: string,
  sessionNotes: string[],
  actNumber: number,
  sessionCount: number
): Promise<CampaignJournalEntry> {
  const response = await openaiClient.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are a campaign journal scribe. Compress session notes into a brief journal entry. Respond with valid JSON only.',
      },
      {
        role: 'user',
        content: `Compress these session notes into a journal entry. Extract key decisions and notable NPCs introduced.

Session notes:
${sessionNotes.join('\n')}

Return JSON:
{
  "summary": "2-3 sentence summary of the session",
  "keyDecisions": ["decision 1", "decision 2"],
  "majorNPCsIntroduced": ["npc name 1", "npc name 2"]
}`,
      },
    ],
    temperature: 0.7,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content || '{}';
  const parsed = JSON.parse(content);
  return {
    actNumber,
    sessionNumber: sessionCount,
    summary: parsed.summary || 'Session events recorded.',
    keyDecisions: parsed.keyDecisions || [],
    majorNPCsIntroduced: parsed.majorNPCsIntroduced || [],
    createdAt: new Date().toISOString(),
  };
}
