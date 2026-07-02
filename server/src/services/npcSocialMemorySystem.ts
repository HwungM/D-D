import type { Character, NpcMemory, SceneInteractable, WorldState } from '../../../shared/types';

const DEMEANORS = ['warm but observant', 'brisk and practical', 'guarded and dry', 'cheerful but nosy', 'formal and exacting', 'weary but kind'];
const SPEECH_STYLES = ['plainspoken and direct', 'wry and economical', 'polite with pointed pauses', 'animated and anecdotal', 'measured and careful', 'blunt with little patience for repetition'];
const VALUES = ['community', 'privacy', 'honesty', 'coin', 'reputation', 'order', 'hospitality', 'self-preservation'];
const QUIRKS = ['remembers names immediately', 'taps the counter when skeptical', 'answers questions with a question', 'lowers their voice around rumors', 'corrects imprecise wording', 'notices who arrived together'];
const STOP_WORDS = new Set(['the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'at', 'is', 'are', 'was', 'were', 'i', 'you', 'we', 'they', 'he', 'she', 'it', 'about', 'ask', 'tell', 'talk', 'with', 'what', 'why', 'how', 'do', 'does', 'did']);

function hash(text: string): number {
  let value = 2166136261;
  for (const char of text.toLowerCase()) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return Math.abs(value);
}

function pick<T>(items: T[], seed: number, offset: number): T {
  return items[(seed + offset * 7919) % items.length];
}

export function personalityForNpc(name: string, role?: string): NonNullable<NpcMemory['personality']> {
  const seed = hash(`${name}:${role || 'unknown'}`);
  const hospitalityBias = /innkeeper|tavern|host|merchant/.test((role || '').toLowerCase()) ? 12 : 0;
  return {
    demeanor: pick(DEMEANORS, seed, 1),
    patience: Math.min(95, 28 + (seed % 61) + hospitalityBias),
    openness: Math.min(95, 24 + ((seed >>> 3) % 65) + hospitalityBias),
    suspicion: Math.max(5, 70 - ((seed >>> 5) % 58) - Math.floor(hospitalityBias / 2)),
    speechStyle: pick(SPEECH_STYLES, seed, 2),
    values: Array.from(new Set([pick(VALUES, seed, 3), pick(VALUES, seed, 4)])),
    quirk: pick(QUIRKS, seed, 5),
  };
}

export function conversationTopic(action: string): string {
  const words = (action.toLowerCase().match(/[a-z0-9'-]+/g) || []).filter(word => word.length > 2 && !STOP_WORDS.has(word));
  return Array.from(new Set(words)).slice(0, 8).join(' ') || 'general conversation';
}

export function topicSimilarity(a: string, b: string): number {
  const left = new Set(a.split(/\s+/).filter(Boolean));
  const right = new Set(b.split(/\s+/).filter(Boolean));
  if (!left.size || !right.size) return 0;
  return [...left].filter(word => right.has(word)).length / Math.min(left.size, right.size);
}

export function npcTargetForAction(worldState: WorldState, interactables: SceneInteractable[], action: string): NpcMemory | undefined {
  const lowered = action.toLowerCase();
  const npcInteractables = interactables.filter(item => item.kind === 'npc');
  const isConversation = /\b(talk|ask|tell|say|question|speak|chat|interview|greet|threaten|persuade|bargain|buy|sell)\b/i.test(action);
  const target = npcInteractables.find(item => lowered.includes(item.name.toLowerCase()))
    || npcInteractables.find(item => item.hook && lowered.includes(item.hook.toLowerCase()))
    || (isConversation && npcInteractables.length === 1 ? npcInteractables[0] : undefined);
  const name = target?.name || (isConversation ? worldState.activeNPC : undefined);
  if (!name) return undefined;
  const existing = [...(worldState.npcMemory || []), ...(worldState.keyNPCs || [])].find(npc => npc.name.toLowerCase() === name.toLowerCase());
  return existing || { name, disposition: 'unknown', notes: target?.hook || 'Recently encountered.', role: 'local resident' };
}

export function buildNpcInteractionContext(worldState: WorldState, character: Character, interactables: SceneInteractable[], action: string): string {
  const npc = npcTargetForAction(worldState, interactables, action);
  if (!npc) return '';
  const personality = npc.personality || personalityForNpc(npc.name, npc.role);
  const topic = conversationTopic(action);
  const prior = (npc.conversationHistory || []).filter(entry => topicSimilarity(entry.topic, topic) >= 0.34).slice(-4);
  const priorBlock = prior.length
    ? prior.map(entry => `- ${entry.characterName} asked about [${entry.topic}]; response: ${entry.responseSummary}`).join('\n')
    : '- No substantially matching prior question.';
  const repeatDirective = prior.length
    ? `REPEATED TOPIC DETECTED. ${npc.name} knows this was already discussed with ${Array.from(new Set(prior.map(entry => entry.characterName))).join(', ')}. They MUST acknowledge it. With patience ${personality.patience}/100 and suspicion ${personality.suspicion}/100, decide whether they answer warmly, summarize impatiently, ask why the party keeps pressing, become guarded, or refuse.`
    : `This topic is new to ${npc.name}'s recorded conversation history.`;
  return `
NPC SOCIAL MEMORY — authoritative shared campaign state:
- NPC: ${npc.name}${npc.role ? ` (${npc.role})` : ''}; disposition ${npc.disposition}; relationship ${npc.relationshipLabel || npc.relationshipScore || 'unscored'}
- Personality: ${personality.demeanor}; patience ${personality.patience}/100; openness ${personality.openness}/100; suspicion ${personality.suspicion}/100; speech ${personality.speechStyle}; values ${personality.values.join(', ')}${personality.quirk ? `; quirk ${personality.quirk}` : ''}
- Current speaker: ${character.name}; people previously met: ${(npc.metCharacters || []).join(', ') || 'none'}
- Current topic: ${topic}
- Matching prior conversations:
${priorBlock}
${repeatDirective}
Keep the personality stable. Never pretend this is a first meeting or first question when the ledger says otherwise.`;
}

export function recordNpcConversation(worldState: WorldState, character: Character, interactables: SceneInteractable[], action: string, response: string): { npcMemory: NpcMemory[]; activeNPC: string } | undefined {
  const target = npcTargetForAction(worldState, interactables, action);
  if (!target) return undefined;
  const existing = worldState.npcMemory || [];
  const key = target.name.toLowerCase();
  const prior = existing.find(npc => npc.name.toLowerCase() === key) || target;
  const entry = {
    id: crypto.randomUUID(),
    characterName: character.name,
    topic: conversationTopic(action),
    playerAction: action.slice(0, 300),
    responseSummary: response.slice(0, 400),
    location: worldState.characterSubLocations?.[character.id] || worldState.currentLocation,
    createdAt: new Date().toISOString(),
  };
  const updated: NpcMemory = {
    ...prior,
    personality: prior.personality || personalityForNpc(prior.name, prior.role),
    metCharacters: Array.from(new Set([...(prior.metCharacters || []), character.name])),
    interactionCount: (prior.interactionCount || 0) + 1,
    lastMet: entry.location,
    conversationHistory: [...(prior.conversationHistory || []), entry].slice(-16),
  };
  return { npcMemory: [...existing.filter(npc => npc.name.toLowerCase() !== key), updated], activeNPC: updated.name };
}
