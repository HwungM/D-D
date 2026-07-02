import type { RandomWorldEvent, WorldBible, WorldState } from '../../../shared/types';

// Ambient world events (BitLife-style "something just happens" texture beats)
// — weather, distant news, a passing stranger, a tiny windfall/complication —
// fired independent of player action, purely for flavor/replayability. NEVER
// escalate into combat, a structured contest, or any other guarded system;
// see server/src/routes/game.ts's micro-action route for where these are
// woven into a resolved (non-roll, non-combat, non-contest) reaction.
//
// Firing is deterministic code/dice math (mirrors tensionSystem.ts's
// find-chance pattern), not a per-check AI decision — an LLM is at most used
// to riff a fresh line off an authored seed, never to decide whether/when to
// fire. Kept deliberately RARE: a low single-digit percent chance per
// micro-action, plus a minimum-spacing cooldown so two ambient events can
// never land back-to-back.

// Tune these two constants to change frequency — nothing else in this module
// should need touching.
export const AMBIENT_EVENT_CHANCE = 0.04; // 4% chance per eligible micro-action
export const AMBIENT_EVENT_MIN_SPACING = 8; // minimum micro-actions between fired events

export const MAX_RECENT_WORLD_EVENTS = 10;

// How many micro-actions have elapsed since the last fired ambient event.
// Derived entirely from existing state (WorldState.freeRoam's action log and
// the last RandomWorldEvent's timestamp) rather than a new counter field —
// naturally resets whenever a macro-turn clears freeRoam, which is fine since
// ambient events are a free-roam/lingering-in-scene feature.
function actionsSinceLastAmbientEvent(worldState: WorldState): number {
  const freeRoamActions = worldState.freeRoam?.actions || [];
  const recentEvents = worldState.recentWorldEvents || [];
  const lastEvent = recentEvents[recentEvents.length - 1];
  if (!lastEvent) return freeRoamActions.length;
  return freeRoamActions.filter(entry => entry.createdAt > lastEvent.triggeredAt).length;
}

// Code-driven odds check for whether an ambient event should fire on THIS
// micro-action. Deterministic given `random` — pass a fixed function in tests.
export function shouldFireAmbientEvent(
  worldState: WorldState,
  worldBible: WorldBible,
  random: () => number = Math.random,
): boolean {
  const seeds = worldBible.ambientEventSeeds || [];
  if (seeds.length === 0) return false; // no authored pool — never fall back to generic noise
  if (actionsSinceLastAmbientEvent(worldState) < AMBIENT_EVENT_MIN_SPACING) return false;
  return random() < AMBIENT_EVENT_CHANCE;
}

const WEATHER_HINTS = ['rain', 'wind', 'storm', 'sky', 'cloud', 'sun', 'snow', 'fog', 'mist', 'frost', 'lightning'];
const STRANGER_HINTS = ['stranger', 'traveler', 'traveller', 'merchant', 'caravan', 'beggar', 'peddler', 'wanderer', 'messenger', 'courier'];
const WINDFALL_HINTS = ['coin', 'gold', 'find', 'gift', 'reward', 'trinket', 'fortune'];
const COMPLICATION_HINTS = ['loses', 'breaks', 'trouble', 'argument', 'shout', 'commotion', 'thief', 'spill'];
const OMEN_HINTS = ['omen', 'strange light', 'unnatural', 'shiver', 'flicker', 'whisper', 'shadow moves', 'star'];
const NEWS_HINTS = ['news', 'rumor', 'rumour', 'word', 'letter', 'proclamation', 'crier'];

// Best-effort classification of a free-text ambient line into
// RandomWorldEvent.category via simple keyword matching — good enough for
// filtering/telemetry; never load-bearing for narrative logic.
export function classifyAmbientEventCategory(text: string): RandomWorldEvent['category'] {
  const lowered = text.toLowerCase();
  if (WEATHER_HINTS.some(hint => lowered.includes(hint))) return 'weather';
  if (OMEN_HINTS.some(hint => lowered.includes(hint))) return 'omen';
  if (STRANGER_HINTS.some(hint => lowered.includes(hint))) return 'stranger';
  if (WINDFALL_HINTS.some(hint => lowered.includes(hint))) return 'windfall';
  if (COMPLICATION_HINTS.some(hint => lowered.includes(hint))) return 'complication';
  if (NEWS_HINTS.some(hint => lowered.includes(hint))) return 'news';
  return 'other';
}

// Picks an unused seed first (so the authored pool doesn't repeat within one
// campaign before it has to), falling back to a random seed once all have
// been used at least once.
export function pickAmbientEventSeed(
  worldBible: WorldBible,
  recentWorldEvents: RandomWorldEvent[] | undefined,
  random: () => number = Math.random,
): string | undefined {
  const seeds = worldBible.ambientEventSeeds || [];
  if (seeds.length === 0) return undefined;
  const usedDescriptions = new Set((recentWorldEvents || []).map(event => event.description));
  const unused = seeds.filter(seed => !usedDescriptions.has(seed));
  const pool = unused.length > 0 ? unused : seeds;
  return pool[Math.floor(random() * pool.length)];
}

// Builds a fired RandomWorldEvent from a chosen seed line. Purely code-side —
// no AI call required for the common case (an optional cheap riff can be
// layered on by the caller before persisting, see riffAmbientEventLine below).
export function buildAmbientWorldEvent(description: string, locationName?: string): RandomWorldEvent {
  return {
    id: crypto.randomUUID(),
    description,
    triggeredAt: new Date().toISOString(),
    category: classifyAmbientEventCategory(description),
    locationName,
    resolved: true, // ambient events are pure texture — nothing left to "resolve" later
  };
}

// Appends a fired event to WorldState.recentWorldEvents, bounded to the last
// MAX_RECENT_WORLD_EVENTS (drop oldest first), matching the doc comment on
// WorldState.recentWorldEvents / RandomWorldEvent.
export function appendWorldEvent(
  recentWorldEvents: RandomWorldEvent[] | undefined,
  event: RandomWorldEvent,
): RandomWorldEvent[] {
  const next = [...(recentWorldEvents || []), event];
  return next.length > MAX_RECENT_WORLD_EVENTS ? next.slice(next.length - MAX_RECENT_WORLD_EVENTS) : next;
}

// Folds a fired ambient event into an existing micro-action reaction as a
// brief aside — NOT a parallel response channel, NOT a new narrated turn.
// Kept to one short added sentence.
export function weaveAmbientEventIntoReaction(reaction: string, event: RandomWorldEvent): string {
  const aside = event.description.trim().replace(/\.$/, '');
  return `${reaction.trim()} (Meanwhile: ${aside}.)`;
}

type ChatClient = {
  chat: { completions: { create(args: any): Promise<any> } };
};

// Optional cheap riff off a seed for variety, so the same authored line
// doesn't read identically every time it's reused. Best-effort: any failure
// (network, parse) just falls back to the seed line verbatim — riffing is
// flavor-only and must never block or fail the micro-action it's attached to.
export async function riffAmbientEventLine(openai: ChatClient, seed: string, worldBible: WorldBible): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Rewrite the given one-line ambient world event as a fresh, equally short variant — same idea, different phrasing, matching the world tone. Respond with plain text only, one sentence, no quotes.',
        },
        {
          role: 'user',
          content: `WORLD TONE/ERA: ${worldBible.era}\nSEED: ${seed}`,
        },
      ],
      temperature: 0.9,
      max_tokens: 60,
    });
    const text = response.choices?.[0]?.message?.content?.trim();
    return text && text.length > 0 ? text.replace(/^"|"$/g, '') : seed;
  } catch {
    return seed;
  }
}
