import type { Character, StoryActionMemory, StoryLedgerEntry, WorldBible, WorldState } from '../../../shared/types';
import type { NarrationResult } from './openai';
import type { ActionRail } from './storyRails';

function nowIso(): string {
  return new Date().toISOString();
}

function pronounsFor(character: Character): { subject: string; object: string; possessive: string; label: string } {
  if (character.gender === 'male') return { subject: 'he', object: 'him', possessive: 'his', label: 'he/him' };
  if (character.gender === 'female') return { subject: 'she', object: 'her', possessive: 'her', label: 'she/her' };
  return { subject: 'they', object: 'them', possessive: 'their', label: 'they/them' };
}

function normalize(value: string | undefined): string {
  return (value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function sentenceDigest(text: string | undefined, fallback: string): string {
  const first = (text || '').split(/(?<=[.!?])\s+/).find(s => s.trim().length > 0)?.trim();
  return (first || fallback).slice(0, 220);
}

function uniqueKey(kind: StoryLedgerEntry['kind'], value: string): string {
  return `${kind}:${normalize(value).slice(0, 80)}`;
}

function upsertLedger(existing: StoryLedgerEntry[], entry: StoryLedgerEntry): StoryLedgerEntry[] {
  const key = uniqueKey(entry.kind, entry.anchorLocation || entry.anchorNpc || entry.title || entry.summary);
  const index = existing.findIndex(item =>
    uniqueKey(item.kind, item.anchorLocation || item.anchorNpc || item.title || item.summary) === key &&
    item.status !== 'resolved'
  );
  if (index === -1) return [...existing, entry];
  const copy = [...existing];
  copy[index] = {
    ...copy[index],
    ...entry,
    id: copy[index].id,
    createdAt: copy[index].createdAt,
    updatedAt: entry.updatedAt || nowIso(),
    status: copy[index].status === 'pressing' ? 'pressing' : entry.status,
    urgency: copy[index].urgency === 'high' ? 'high' : entry.urgency,
  };
  return copy;
}

function resolveMatchingLedgers(ledger: StoryLedgerEntry[], rails: ActionRail[], actionCount: number): StoryLedgerEntry[] {
  const targets = rails.map(r => normalize(r.targetLocation)).filter(Boolean);
  if (targets.length === 0) return ledger;
  return ledger.map(entry => {
    if (entry.status === 'resolved') return entry;
    const anchor = normalize(entry.anchorLocation);
    const title = normalize(entry.title);
    const matched = targets.some(target => anchor.includes(target) || target.includes(anchor) || title.includes(target));
    if (!matched) return entry;
    return {
      ...entry,
      status: 'resolved',
      updatedAt: nowIso(),
      resolvedAt: nowIso(),
      summary: `${entry.summary} The party acted on this lead at action ${actionCount}.`,
    };
  });
}

function findNarratedLead(narration: string): { location?: string; npc?: string; summary: string } | null {
  const patterns = [
    /\bmeet\s+(?:me|us|them|him|her|[A-Z][a-z]+)\s+at\s+(?:the\s+)?([A-Z][A-Za-z'\-\s]{2,60})/,
    /\bgo\s+to\s+(?:the\s+)?([A-Z][A-Za-z'\-\s]{2,60})/,
    /\bfind\s+([A-Z][A-Za-z'\-\s]{2,40})\s+at\s+(?:the\s+)?([A-Z][A-Za-z'\-\s]{2,60})/,
  ];
  for (const pattern of patterns) {
    const match = narration.match(pattern);
    if (!match) continue;
    const location = (match[2] || match[1] || '').replace(/[.,!?].*$/, '').trim();
    const npc = match[2] ? match[1] : undefined;
    if (!location) continue;
    return { location, npc, summary: sentenceDigest(match[0], `Lead points to ${location}.`) };
  }
  return null;
}

function repeatedLocationWarning(rails: ActionRail[], worldState: WorldState): string | null {
  const recent = worldState.recentPlayerActions || [];
  for (const rail of rails) {
    if (!rail.targetLocation) continue;
    const target = normalize(rail.targetLocation);
    const repeats = recent.slice(-4).filter(action => normalize(action.targetLocation || action.action).includes(target)).length;
    if (repeats >= 1) {
      return `${rail.characterName} has already pushed toward ${rail.targetLocation}. This turn must honor that destination immediately; do not redirect to another NPC, merchant, or holding pattern.`;
    }
  }
  return null;
}

function repeatedIntentWarning(rails: ActionRail[], worldState: WorldState): string | null {
  const recent = worldState.recentPlayerActions || [];
  for (const rail of rails) {
    const sameIntent = recent.slice(-4).filter(action =>
      action.characterId === rail.characterId &&
      action.intent === rail.intent &&
      normalize(action.action) === normalize(rail.action)
    ).length;
    if (sameIntent >= 1) {
      return `${rail.characterName} is repeating the same declared action. Treat this as insistence: resolve it now with a concrete result, a roll, a cost, or a refusal from the world.`;
    }
  }
  return null;
}

function pressingLedger(worldState: WorldState): StoryLedgerEntry[] {
  const actionCount = worldState.actionCount || 0;
  return (worldState.storyLedger || [])
    .filter(entry => entry.status !== 'resolved')
    .sort((a, b) => {
      const urgency = { high: 3, medium: 2, low: 1 };
      const dueA = a.dueByAction && a.dueByAction <= actionCount + 1 ? 10 : 0;
      const dueB = b.dueByAction && b.dueByAction <= actionCount + 1 ? 10 : 0;
      return dueB + urgency[b.urgency] - (dueA + urgency[a.urgency]);
    })
    .slice(0, 6);
}

export function buildContinuityDirective(
  characters: Character[],
  rails: ActionRail[],
  worldState: WorldState,
  worldBible: WorldBible
): string {
  const canon = characters.map(character => {
    const p = pronounsFor(character);
    return `- ${character.name}: ${character.gender || 'unspecified'} ${character.race} ${character.class}; use ${p.label} only (${p.subject}/${p.object}/${p.possessive}).`;
  });
  const seenNpcs = new Set<string>();
  const npcCanon = [...(worldState.keyNPCs || []), ...(worldState.npcMemory || [])]
    .filter(npc => {
      const key = npc.name.toLowerCase();
      if (seenNpcs.has(key)) return false;
      seenNpcs.add(key);
      return true;
    })
    .slice(-14)
    .map(npc => {
      const pronouns = npc.gender === 'male' ? 'he/him/his' : npc.gender === 'female' ? 'she/her/her' : npc.gender === 'nonbinary' ? 'they/them/their' : 'unspecified pronouns';
      return `- ${npc.name}: ${npc.gender || 'gender unspecified'} (${pronouns}), ${npc.role || 'role unknown'}; ${npc.notes || npc.disposition}.`;
    });
  const ledger = pressingLedger(worldState);
  const warnings = [repeatedLocationWarning(rails, worldState), repeatedIntentWarning(rails, worldState)].filter((v): v is string => !!v);
  const location = worldState.currentLocation || worldState.locationGraph?.currentLocation || worldBible.campaignBrief?.whereToStart || 'Unknown';

  return `CONTINUITY LEDGER - HARD TABLE MEMORY:
Character canon:
${canon.join('\n')}
NPC canon:
${npcCanon.length ? npcCanon.join('\n') : '- No recurring NPC canon recorded yet.'}
Current committed location: ${location}
${ledger.length > 0 ? `Open story obligations:\n${ledger.map(entry => `- [${entry.urgency}/${entry.kind}] ${entry.title}: ${entry.summary}${entry.anchorLocation ? ` (location: ${entry.anchorLocation})` : ''}${entry.anchorNpc ? ` (NPC: ${entry.anchorNpc})` : ''}`).join('\n')}` : 'Open story obligations: none yet.'}
${warnings.length > 0 ? `Immediate continuity warnings:\n${warnings.map(w => `- ${w}`).join('\n')}` : 'Immediate continuity warnings: none.'}
Rules:
- If the player repeats a destination, question, or pressure tactic, escalate or resolve. Never loop the same hint.
- If an open obligation is relevant to this action, pay it off, complicate it, or give a concrete next step this turn.
- Do not change a character's pronouns, race, class, or agency to fit the narration.
- NPC gender, pronouns, role, personality, knowledge, and remembered history above are binding canon.`;
}

export function buildContinuityPatch(
  characters: Character[],
  rails: ActionRail[],
  worldState: WorldState,
  response: NarrationResult,
  nextActionCount: number,
  location: string | undefined
): Pick<WorldState, 'storyLedger' | 'recentPlayerActions'> {
  const createdAt = nowIso();
  let ledger = resolveMatchingLedgers([...(worldState.storyLedger || [])], rails, nextActionCount);

  for (const info of response.turnOutcome?.informationRevealed || []) {
    if (!info.trim()) continue;
    ledger = upsertLedger(ledger, {
      id: crypto.randomUUID(),
      kind: 'clue',
      title: `Clue: ${info.slice(0, 48)}`,
      summary: info.slice(0, 240),
      status: 'open',
      urgency: 'medium',
      anchorLocation: location || worldState.currentLocation,
      characterIds: characters.map(c => c.id),
      createdAt,
      updatedAt: createdAt,
      dueByAction: nextActionCount + 4,
    });
  }

  const narratedLead = findNarratedLead(response.narration || '');
  if (narratedLead?.location) {
    ledger = upsertLedger(ledger, {
      id: crypto.randomUUID(),
      kind: 'lead',
      title: `Go to ${narratedLead.location}`,
      summary: narratedLead.summary,
      status: 'pressing',
      urgency: 'high',
      anchorLocation: narratedLead.location,
      anchorNpc: narratedLead.npc,
      characterIds: characters.map(c => c.id),
      createdAt,
      updatedAt: createdAt,
      dueByAction: nextActionCount + 2,
    });
  }

  for (const rail of rails) {
    if (!rail.targetLocation) continue;
    ledger = upsertLedger(ledger, {
      id: crypto.randomUUID(),
      kind: 'lead',
      title: `Chosen destination: ${rail.targetLocation}`,
      summary: `${rail.characterName} explicitly chose to go to ${rail.targetLocation}.`,
      status: 'resolved',
      urgency: 'high',
      anchorLocation: rail.targetLocation,
      characterIds: [rail.characterId],
      sourceAction: rail.action,
      createdAt,
      updatedAt: createdAt,
      resolvedAt: createdAt,
    });
  }

  const resultDigest = sentenceDigest(response.turnOutcome?.concreteResult || response.narration, 'The scene moved forward.');
  const concreteChange = response.awaitingRoll
    ? false
    : response.turnOutcome?.situationChanged !== false && resultDigest.length > 0;
  const recentPlayerActions: StoryActionMemory[] = [
    ...(worldState.recentPlayerActions || []),
    ...rails.map(rail => ({
      characterId: rail.characterId,
      characterName: rail.characterName,
      action: rail.action,
      intent: rail.intent,
      scenePurpose: response.scenePurpose || worldState.sceneState?.purpose || 'explore',
      location: location || worldState.currentLocation,
      targetLocation: rail.targetLocation,
      resultDigest,
      concreteChange,
      rollRequested: !!response.awaitingRoll || !!rail.roll,
      createdAt,
    })),
  ].slice(-14);

  const open = ledger.filter(entry => entry.status !== 'resolved').slice(-30);
  const resolved = ledger.filter(entry => entry.status === 'resolved').slice(-20);
  return { storyLedger: [...open, ...resolved], recentPlayerActions };
}

export function applyContinuityRepairs<T extends NarrationResult>(response: T, characters: Character[], rails: ActionRail[], worldState?: WorldState): T {
  const seen = new Set<string>();
  const people = [
    ...characters.filter(character => !!character.gender).map(character => ({ name: character.name, gender: character.gender! })),
    ...[...(worldState?.keyNPCs || []), ...(worldState?.npcMemory || [])]
      .filter(npc => !!npc.gender)
      .map(npc => ({ name: npc.name, gender: npc.gender! })),
  ].filter(person => {
    const key = person.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  response.narration = response.narration.split(/(?<=[.!?])\s+/).map(sentence => {
    const named = people.filter(person => new RegExp(`\\b${person.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(sentence));
    // Pronouns become ambiguous when multiple known people share a sentence;
    // leave those to the quality critic rather than corrupting the wrong person.
    if (named.length !== 1) return sentence;
    const person = named[0];
    if (person.gender === 'male') {
      return sentence.replace(/\bShe\b/g, 'He').replace(/\bshe\b/g, 'he').replace(/\bHer(?=\s+\w)/g, 'His').replace(/\bher(?=\s+\w)/g, 'his').replace(/\bHer\b/g, 'Him').replace(/\bher\b/g, 'him');
    }
    if (person.gender === 'female') {
      return sentence.replace(/\bHe\b/g, 'She').replace(/\bhe\b/g, 'she').replace(/\bHis(?=\s+\w)/g, 'Her').replace(/\bhis(?=\s+\w)/g, 'her').replace(/\bHim\b/g, 'Her').replace(/\bhim\b/g, 'her');
    }
    return sentence.replace(/\bHe\b|\bShe\b/g, 'They').replace(/\bhe\b|\bshe\b/g, 'they').replace(/\bHim\b|\bHer\b/g, 'Them').replace(/\bhim\b|\bher\b/g, 'them').replace(/\bHis\b|\bHer(?=\s+\w)/g, 'Their').replace(/\bhis\b|\bher(?=\s+\w)/g, 'their');
  }).join(' ');

  const targetLocation = [...rails].reverse().find(r => r.targetLocation)?.targetLocation;
  if (targetLocation && !response.narration.toLowerCase().includes(targetLocation.toLowerCase())) {
    response.narration = `At ${targetLocation}, ${response.narration.charAt(0).toLowerCase()}${response.narration.slice(1)}`;
    response.worldStateChanges = { ...(response.worldStateChanges || {}), currentLocation: targetLocation };
    response.sceneMomentum = 'transitioning';
    response.scenePurpose = 'travel';
  }

  return response;
}
