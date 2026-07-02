import type { LocationNode, SubLocation, WorldBible } from '../../../shared/types';

type ChatClient = {
  chat: { completions: { create(args: any): Promise<any> } };
};
type AiCallLogger = (fn: string, data: Record<string, unknown>) => void;

// Location types substantial enough to warrant sub-locations (a tavern, a
// blacksmith, a town hall...) — a single dungeon corridor or an as-yet
// unclassified spot doesn't need this extra layer. Judgment call, kept small
// and easy to extend.
const SUBLOCATION_ELIGIBLE_TYPES = new Set<NonNullable<LocationNode['type']>>(['city', 'region', 'landmark']);

export function locationWantsSubLocations(node: LocationNode | undefined | null): boolean {
  if (!node) return false;
  return !!node.type && SUBLOCATION_ELIGIBLE_TYPES.has(node.type);
}

export function needsSubLocationGeneration(node: LocationNode | undefined | null): boolean {
  return locationWantsSubLocations(node) && !(node!.subLocations && node!.subLocations.length > 0);
}

const VALID_SUBLOCATION_TYPES = new Set<SubLocation['type']>(['shop', 'tavern', 'residence', 'civic', 'outdoor', 'other']);

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asStringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map(v => v.trim()).slice(0, limit);
}

function cleanSubLocationType(value: unknown): SubLocation['type'] {
  const lowered = asString(value).toLowerCase();
  return VALID_SUBLOCATION_TYPES.has(lowered as SubLocation['type']) ? (lowered as SubLocation['type']) : 'other';
}

// Deterministic, no-AI-call fallback — used when the AI call fails/is
// unavailable, and directly by tests. Keeps generation "always succeeds"
// without a request, mirroring signatureRewardsService's template fallback.
export function buildFallbackSubLocations(node: LocationNode): SubLocation[] {
  const templates: { name: string; type: SubLocation['type']; description: string; objectsOfInterest: string[] }[] = [
    { name: `The ${node.name} Tavern`, type: 'tavern', description: `A worn tavern at the heart of ${node.name}, thick with talk and firelight.`, objectsOfInterest: ['a well-worn bar', 'a crackling hearth'] },
    { name: `${node.name} Market`, type: 'shop', description: `Stalls and shopfronts crowd this corner of ${node.name}.`, objectsOfInterest: ['merchant stalls', 'a notice board'] },
    { name: `${node.name} Hall`, type: 'civic', description: `The seat of local authority in ${node.name}.`, objectsOfInterest: ['a council chamber', 'old banners'] },
    { name: `${node.name} Outskirts`, type: 'outdoor', description: `The open edges of ${node.name}, quieter than the center.`, objectsOfInterest: ['a dirt path', 'scattered dwellings'] },
  ];
  return templates.map(entry => ({
    id: crypto.randomUUID(),
    parentLocationName: node.name,
    name: entry.name,
    type: entry.type,
    description: entry.description,
    npcsPresent: [],
    objectsOfInterest: entry.objectsOfInterest,
  }));
}

function cleanGeneratedSubLocations(parsed: Record<string, unknown>, node: LocationNode): SubLocation[] | undefined {
  const raw = Array.isArray(parsed.subLocations) ? parsed.subLocations : undefined;
  if (!raw) return undefined;
  const cleaned = raw
    .map(entry => (entry && typeof entry === 'object' ? entry as Record<string, unknown> : undefined))
    .filter((entry): entry is Record<string, unknown> => !!entry)
    .map((entry): SubLocation | undefined => {
      const name = asString(entry.name);
      if (!name) return undefined;
      return {
        id: crypto.randomUUID(),
        name,
        parentLocationName: node.name,
        description: asString(entry.description) || `A part of ${node.name}.`,
        npcsPresent: asStringArray(entry.npcsPresent, 4),
        objectsOfInterest: asStringArray(entry.objectsOfInterest, 5),
        type: cleanSubLocationType(entry.type),
      };
    })
    .filter((entry): entry is SubLocation => !!entry)
    .slice(0, 6);
  return cleaned.length >= 3 ? cleaned : undefined;
}

const SUBLOCATION_SYSTEM_PROMPT = `You generate the enterable sub-locations inside one location of a fantasy campaign world — the tavern, the blacksmith, the town hall, an alley, a market square. These are the small spots a party can freely walk between within this single place.

RULES:
- Generate 3-6 sub-locations. They must be grounded in what's already established about this location (its description/tags/type) — don't contradict it.
- Each needs a short, evocative name (e.g. "The Rusty Anchor Tavern"), a one-sentence description, 0-2 NPCs who might plausibly be found there (short descriptive names/roles like "a gruff blacksmith" are fine if no name is established), and 1-3 short notable objects/features.
- Keep it grounded and small-scale — this is flavor scaffolding for free-roam exploration, not new plot.

Respond with JSON only:
{"subLocations": [{"name": "string", "description": "one sentence", "npcsPresent": ["string"], "objectsOfInterest": ["string"], "type": "shop|tavern|residence|civic|outdoor|other"}]}`;

// AI-generated, once per location (cached onto LocationNode.subLocations —
// never regenerated once populated). Falls back to a deterministic template
// set if the call fails, so this never blocks scene progress.
export async function generateSubLocationsFromService(
  openai: ChatClient,
  log: AiCallLogger,
  node: LocationNode,
  worldBible: WorldBible,
): Promise<SubLocation[]> {
  try {
    const user = `LOCATION: ${node.name} (${node.type || 'unknown'}) in ${node.region}
DESCRIPTION: ${node.description || 'no description yet established'}
TAGS: ${(node.tags || []).join(', ') || 'none'}
WORLD ERA: ${worldBible.era || 'unspecified'} | TONE: ${(worldBible.toneRules || []).slice(0, 2).join('; ') || 'unspecified'}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SUBLOCATION_SYSTEM_PROMPT },
        { role: 'user', content: user },
      ],
      temperature: 0.8,
      response_format: { type: 'json_object' },
    });
    const content = response.choices[0].message.content || '{}';
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = {};
    }
    log('generateSubLocations', { location: node.name, rawResponse: content });
    return cleanGeneratedSubLocations(parsed, node) || buildFallbackSubLocations(node);
  } catch (error) {
    log('generateSubLocations.error', { location: node.name, error: error instanceof Error ? error.message : String(error) });
    return buildFallbackSubLocations(node);
  }
}

// Deterministic (no-AI) navigation matcher: recognizes when a free-roam
// action is really "walk into X" / "leave to the main square" rather than
// something that needs the AI micro-action reaction. Kept code-side so
// ordinary movement between sub-locations never costs a roll or an AI call.
export type SubLocationNavigationMatch =
  | { kind: 'enter'; subLocation: SubLocation }
  | { kind: 'leave' };

export type ExplicitSubLocationNavigation =
  | { kind: 'enter'; subLocationId: string }
  | { kind: 'leave' };

export function resolveExplicitSubLocationNavigation(
  navigation: ExplicitSubLocationNavigation,
  node: LocationNode | undefined | null,
  currentSubLocationName: string | undefined,
): SubLocationNavigationMatch | undefined {
  if (!node?.subLocations?.length) return undefined;
  if (navigation.kind === 'leave') return currentSubLocationName ? { kind: 'leave' } : undefined;
  const target = node.subLocations.find(sub => sub.id === navigation.subLocationId);
  if (!target || target.name.toLowerCase() === currentSubLocationName?.toLowerCase()) return undefined;
  return { kind: 'enter', subLocation: target };
}

// Free text can discuss a destination, but changing authoritative location is
// reserved for the Explore controls. This recognizes obvious attempts so the
// server can explain what to do instead of letting the AI pretend movement
// happened while world state stays behind.
export function textAttemptsSubLocationNavigation(
  action: string,
  node: LocationNode | undefined | null,
  currentSubLocationName: string | undefined,
): boolean {
  if (!node?.subLocations?.length) return false;
  const lowered = action.toLowerCase();
  const movement = /\b(?:go|head|walk|travel|enter|leave|exit|return|move|visit|want to go|make (?:my|our) way)\b/i;
  if (!movement.test(lowered)) return false;
  if (currentSubLocationName && /\b(?:leave|exit|head back|go back|return)\b/i.test(lowered)) return true;
  const genericWords = new Set(['the', 'this', 'that', 'hall', 'house', 'place']);
  return node.subLocations.some(sub => {
    if (lowered.includes(sub.name.toLowerCase()) || lowered.includes(sub.type)) return true;
    return sub.name.toLowerCase().split(/[^a-z0-9]+/).some(token => token.length >= 4 && !genericWords.has(token) && lowered.includes(token));
  });
}

export function matchSubLocationNavigation(
  action: string,
  node: LocationNode | undefined | null,
  currentSubLocationName: string | undefined,
): SubLocationNavigationMatch | undefined {
  if (!node || !node.subLocations || node.subLocations.length === 0) return undefined;
  const lowered = action.toLowerCase();

  // "leave"/"head back"/"exit" phrasing while inside a sub-location, as long
  // as it doesn't instead name a DIFFERENT sub-location (that's an "enter"
  // for that other spot, handled below), reads as leaving to the top-level
  // location.
  const leaveVerbs = /\b(leave|exit|head back|go back|return)\b/;
  if (currentSubLocationName && leaveVerbs.test(lowered)) {
    const mentionsAnotherSub = node.subLocations.some(s => s.name.toLowerCase() !== currentSubLocationName.toLowerCase() && lowered.includes(s.name.toLowerCase()));
    if (!mentionsAnotherSub) {
      return { kind: 'leave' };
    }
  }

  // Entering a specific sub-location by name — match the longest matching
  // name first so "The Rusty Anchor Tavern" wins over a shorter overlap.
  const candidates = [...node.subLocations].sort((a, b) => b.name.length - a.name.length);
  for (const sub of candidates) {
    if (sub.name.toLowerCase() === currentSubLocationName?.toLowerCase()) continue;
    if (lowered.includes(sub.name.toLowerCase())) {
      return { kind: 'enter', subLocation: sub };
    }
  }
  return undefined;
}
