import type { CombatEnemy, NpcMemory } from '../../../shared/types';

const PERSON_ARCHETYPES = new Set(['soldier', 'mage', 'boss', 'minion']);

export function relationshipLabel(score: number): string {
  if (score >= 80) return 'devoted ally';
  if (score >= 50) return 'trusted friend';
  if (score >= 20) return 'friendly';
  if (score >= 0) return 'acquaintance';
  if (score >= -34) return 'wary';
  if (score >= -69) return 'bitter rival';
  return 'sworn enemy';
}

function combatantRole(enemy: CombatEnemy): string {
  if (enemy.archetype === 'mage') return 'hostile mage';
  if (enemy.archetype === 'boss') return 'enemy leader';
  if (enemy.archetype === 'minion') return 'hostile follower';
  return 'hostile combatant';
}

export function actionSignals(actions: string[]): {
  pursuedOrCornered: boolean;
  sparedOrAcceptedSurrender: boolean;
  rescued: boolean;
} {
  const text = actions.join(' ');
  return {
    pursuedOrCornered: /\b(chase|pursue|corner|cut off|block (?:their|his|her|its) escape|run down|hunt down)\b/i.test(text),
    sparedOrAcceptedSurrender: /\b(spare|show mercy|accept (?:their|his|her|its) surrender|let (?:them|him|her|it) go|release)\b/i.test(text),
    rescued: /\b(rescue|save|free|protect)\b/i.test(text),
  };
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
      let delta = options.newEncounter ? -45 : 0;
      if (defeatedNames.has(enemy.name.toLowerCase())) delta -= 20;
      if (options.pursuedOrCornered) delta -= 30;
      if (options.sparedOrAcceptedSurrender) delta += 10;
      if (options.rescued) delta += 45;
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
        disposition: score < 0 ? 'hostile' : previous?.disposition || 'neutral',
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
