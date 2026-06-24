import { parseJsonRecord, type JsonRecord } from './aiResponseParser';
import { cleanTurnOutcome, detectNarrationIssues } from './narrationQualityValidator';

export type AiTurnRepairMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type AiTurnRepairResult = {
  parsed: JsonRecord;
  issues: string[];
  retried: boolean;
};

type RepairNarrationDraftOptions = {
  parsed: JsonRecord;
  rawContent: string;
  isCoop: boolean;
  action: string;
  messages: AiTurnRepairMessage[];
  buildRepairInstruction: (issues: string[]) => string;
  requestRepair: (messages: AiTurnRepairMessage[]) => Promise<string>;
};

function hasNarration(value: JsonRecord): boolean {
  const narration = value.narration;
  return typeof narration === 'string' && narration.trim().length > 0;
}

export async function repairNarrationDraftIfNeeded({
  parsed,
  rawContent,
  isCoop,
  action,
  messages,
  buildRepairInstruction,
  requestRepair,
}: RepairNarrationDraftOptions): Promise<AiTurnRepairResult> {
  const issues = detectNarrationIssues(
    typeof parsed.narration === 'string' ? parsed.narration : '',
    isCoop,
    {
      action,
      turnOutcome: cleanTurnOutcome(parsed.turnOutcome),
    },
  );

  if (issues.length === 0) {
    return { parsed, issues, retried: false };
  }

  try {
    const repairMessages: AiTurnRepairMessage[] = [
      ...messages,
      { role: 'assistant', content: rawContent },
      { role: 'user', content: buildRepairInstruction(issues) },
    ];
    const retryContent = await requestRepair(repairMessages);
    const repaired = parseJsonRecord(retryContent);
    return {
      parsed: hasNarration(repaired) ? repaired : parsed,
      issues,
      retried: true,
    };
  } catch {
    return { parsed, issues, retried: true };
  }
}
