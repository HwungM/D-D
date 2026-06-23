import type { CombatEnemy, NpcMemory, WorldBible, WorldState } from '../../../shared/types';

const PERSON_ARCHETYPES = new Set(['soldier', 'mage', 'boss', 'minion']);

export function relationshipLabel(score: number): string {
  if (score >= 80) return 'devoted ally';
  if (score >= 50) return 'trusted friend';
  if (score >= 20) return 'friendly';
  if (score >= -19) return 'acquaintance';
  if (score >= -49) return 'wary';
  if (score >= -79) return 'bitter rival';
  return 'sworn enemy';
}

function combatantRole(enemy: CombatEnemy): string {
  if (enemy.archetype === 'mage') return 'hostile mage';
  if (enemy.archetype === 'boss') return 'enemy leader';
  if (enemy.archetype === 'minion') return 'hostile follower';
  return 'hostile combatant';
}

export function combatantMemoryPatch(
  enemies: CombatEnemy[] | undefined,
  existingMemory: NpcMemory[] | undefined,
  options: {
    location?: string;
    playerNames: string[];
    newEncounter?: boolean;
    defeatedNames?: string[];
    pursuedOrCornered?: boolean;
    sparedOrAcceptedSurrender?: boolean;
    rescued?: boolean;
  },
): NpcMemory[] {
  if (!enemies?.length) return [];
  const existing = new Map((existingMemory || []).map(npc => [npc.name.toLowerCase(), npc]));
  const defeatedNames = new Set((options.defeatedNames || []).map(name => name.toLowerCase()));

  return enemies
    .filter(enemy => PERSON_ARCHETYPES.has(enemy.archetype) && enemy.name.trim().length > 0)
    .map(enemy => {
      const previous = existing.get(enemy.name.toLowerCase());
      let delta = options.newEncounter ? -35 : 0;
      if (defeatedNames.has(enemy.name.toLowerCase())) delta -= 15;
      if (options.pursuedOrCornered) delta -= 25;
      if (options.sparedOrAcceptedSurrender) delta += 20;
      if (options.rescued) delta += 50;
      const score = Math.max(-100, Math.min(100, (previous?.relationshipScore ?? 0) + delta));

      const eventNote = options.rescued
        ? `Was rescued by ${options.playerNames.join(' and ')}.`
        : options.sparedOrAcceptedSurrender
          ? `Fought ${options.playerNames.join(' and ')} and was spared after yielding.`
          : options.pursuedOrCornered
            ? `Fought ${options.playerNames.join(' and ')} and was pursued or cornered while trying to escape.`
            : `Fought ${options.playerNames.join(' and ')} in open violence.`;

      return {
        ...previous,
        name: previous?.name || enemy.name,
        disposition: score <= -20 ? 'hostile' : previous?.disposition || 'neutral',
        notes: [previous?.notes, eventNote].filter(Boolean).join(' ').slice(-1000),
        lastMet: options.location,
        metCharacters: Array.from(new Set([...(previous?.metCharacters || []), ...options.playerNames])),
        interactionCount: (previous?.interactionCount || 0) + 1,
        relationshipScore: score,
        relationshipLabel: relationshipLabel(score),
        role: previous?.role || combatantRole(enemy),
      };
    });
}

export function isFightSeekingAction(action: string): boolean {
  return /\b(look|search|hunt|find|seek|ask|go)\b.{0,30}\b(fight|trouble|brawl|bandit|enemy|monster|combat)\b/i.test(action);
}

export function hasGroundedEncounterSetup(narration: string): boolean {
  return /\b(follow|track|trace|investigate|approach|stake out)\b.{0,60}\b(trail|tracks?|footprints?|smoke|camp|hideout|rumou?r|shouts?|screams?|signs?|suspect|threat)\b|\b(trail|tracks?|footprints?|rumou?r|witness|victim|guards?|locals?)\b.{0,60}\b(lead|point|warn|report|mention|describe|direct)\b|\b(spot|notice|hear|see)\b.{0,60}\b(ahead|nearby|in the distance|watching|following|ambush|camp|hideout|patrol)\b|\b(set|prepare|spring|walk into)\b.{0,30}\b(an? )?ambush\b/i.test(narration);
}

export function groundedFightSearchNarration(location?: string): string {
  const place = location || 'the area';
  return `At ${place}, trouble does not simply materialize on command. You spend time asking questions, reading the mood, and searching for signs of danger. Fresh boot prints, guarded whispers, and evidence of a recent disturbance point toward a real threat nearby—but no enemy is in reach yet. You can follow the trail, question a witness, or prepare an ambush before committing to a fight.`;
}

type CampaignLength = NonNullable<WorldBible['playerPreferences']>['campaignLength'];

export function minimumActActions(length: CampaignLength | undefined, act: number): number {
  const minimumByLength: Record<string, number> = {
    one_shot: 2,
    short: 5,
    medium: 10,
    long: 20,
    open_ended: 24,
  };
  const base = minimumByLength[length || 'medium'] || 10;
  return act >= 3 ? Math.max(2, Math.floor(base * 0.7)) : base;
}

export function canAdvanceAct(
  worldState: WorldState,
  worldBible: WorldBible,
  act: number,
): { allowed: boolean; reason?: string } {
  const minimum = minimumActActions(worldBible.playerPreferences?.campaignLength, act);
  const actions = worldState.actionsInCurrentAct || 0;
  if (actions < minimum) {
    return { allowed: false, reason: `Act ${act} needs at least ${minimum} meaningful actions; only ${actions} are complete.` };
  }

  if (act === 1) {
    const required = worldBible.dmRoadmap?.act1MustIntroduce || [];
    const knownText = [
      ...(worldState.npcMemory || []).map(npc => npc.name),
      ...(worldState.discoveredLocations || []),
      ...(worldState.completedEvents || []),
    ].join(' ').toLowerCase();
    const missing = required.filter(item => !knownText.includes(item.toLowerCase()));
    if (missing.length > 0) {
      return { allowed: false, reason: `Act 1 still needs: ${missing.join(', ')}.` };
    }
  }

  return { allowed: true };
}
