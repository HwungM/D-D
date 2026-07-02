import type { Ability, CompanionCharacter, CompanionChangeEntry, CompanionLocationState } from '../../../shared/types';
import { getAbilityForLevel } from '../../../shared/classAbilities';
import { checkLevelUp } from './characterProgressionSystem';
import { recruitCompanionCharacter } from './companionGenerationService';

// ── Prompt context ──────────────────────────────────────────────────────────
// One line per living companion, including its id so the extractor can key
// companionChanges/companionDeparture back to a specific party member — the
// same convention used for character1/character2 ids in co-op prompts.
export function buildCompanionsPromptBlock(companions: CompanionCharacter[] | undefined, locations?: Record<string, CompanionLocationState>): string {
  const living = (companions || []).filter(c => c.is_alive);
  if (living.length === 0) return '';
  const lines = living.map(c =>
    `- id ${c.id}: ${c.name}, ${c.race} ${c.class} L${c.level}, HP ${c.hp}/${c.max_hp}, bond ${c.bondLevel} (-100..100)${locations?.[c.id] ? `; currently at ${locations[c.id].location}${locations[c.id].subLocation ? ` — ${locations[c.id].subLocation}` : ''}${locations[c.id].activity ? `; activity: ${locations[c.id].activity}` : ''}` : ''}`
  );
  return `COMPANIONS (AI-controlled party members — voice their reactions/assists in narration, do not wait for player input for them):\n${lines.join('\n')}`;
}

// ── Death plot armor ─────────────────────────────────────────────────────────
// A companion death is real but must be earned. Mirrors the deterministic
// guard style already used for ungrounded fights (aiContractValidator.
// preventUngroundedFight): rather than an extra LLM round-trip, this walks a
// signaled death back to a battered-but-alive state whenever the beat doesn't
// meet the bar, and reports which ids were blocked so callers can log/repair
// narration language if desired.
export function guardCompanionDeaths(
  companionChanges: Record<string, CompanionChangeEntry> | undefined,
  context: { inCombat: boolean; isHighStakes: boolean; isCriticalFailure: boolean },
): { changes: Record<string, CompanionChangeEntry> | undefined; blockedIds: string[] } {
  if (!companionChanges) return { changes: companionChanges, blockedIds: [] };
  const earned = context.inCombat || context.isHighStakes || context.isCriticalFailure;
  if (earned) return { changes: companionChanges, blockedIds: [] };

  const blockedIds: string[] = [];
  const repaired: Record<string, CompanionChangeEntry> = {};
  for (const [id, change] of Object.entries(companionChanges)) {
    if (change.isDeath) {
      blockedIds.push(id);
      repaired[id] = {
        ...change,
        isDeath: false,
        deathDescription: undefined,
        // Leave them battered instead of dead — the scene stays dangerous,
        // it just doesn't end in a permanent loss on a routine turn.
        hpChange: change.hpChange !== undefined ? Math.min(change.hpChange, -1) : -1,
      };
    } else {
      repaired[id] = change;
    }
  }
  return { changes: repaired, blockedIds };
}

export type CompanionLevelUpNote = { id: string; name: string; newLevel: number; newAbility?: Ability };
export type CompanionDeathNote = { id: string; name: string; deathNote?: string };

// ── Apply per-turn changes ──────────────────────────────────────────────────
// Applies HP/XP/bond/death deltas onto the living companion roster, reusing
// the same HP/leveling primitives PCs use (checkLevelUp is structurally
// compatible — CompanionCharacter shares level/class/stats/xp with Character).
export function applyCompanionChanges(
  companions: CompanionCharacter[] | undefined,
  changes: Record<string, CompanionChangeEntry> | undefined,
): {
  companions: CompanionCharacter[];
  appliedChanges: Record<string, Partial<CompanionCharacter>>;
  levelUps: CompanionLevelUpNote[];
  deaths: CompanionDeathNote[];
} {
  const roster = companions || [];
  if (!changes || Object.keys(changes).length === 0) {
    return { companions: roster, appliedChanges: {}, levelUps: [], deaths: [] };
  }

  const appliedChanges: Record<string, Partial<CompanionCharacter>> = {};
  const levelUps: CompanionLevelUpNote[] = [];
  const deaths: CompanionDeathNote[] = [];

  const updated = roster.map(companion => {
    const change = changes[companion.id];
    if (!change || !companion.is_alive) return companion;

    let hp = companion.hp;
    let xp = companion.xp;
    let level = companion.level;
    let maxHp = companion.max_hp;
    let bondLevel = companion.bondLevel;
    let isAlive: boolean = companion.is_alive;
    let deathNote = companion.deathNote;
    let abilities = companion.abilities;

    if (typeof change.hpChange === 'number') {
      hp = Math.max(0, Math.min(maxHp, hp + change.hpChange));
    }
    if (typeof change.xpGained === 'number' && change.xpGained > 0) {
      xp += change.xpGained;
      const leveled = checkLevelUp({ level, class: companion.class, stats: companion.stats, xp });
      if (leveled.leveledUp && leveled.newLevel) {
        level = leveled.newLevel;
        maxHp += leveled.hpGain || 0;
        hp = Math.min(maxHp, hp + (leveled.hpGain || 0));
        const newAbility = getAbilityForLevel(companion.class, level) ?? undefined;
        if (newAbility && !abilities.some(a => a.name === newAbility.name)) {
          abilities = [...abilities, newAbility];
        }
        levelUps.push({ id: companion.id, name: companion.name, newLevel: level, newAbility });
      }
    }
    if (typeof change.bondLevelChange === 'number') {
      bondLevel = Math.max(-100, Math.min(100, bondLevel + change.bondLevelChange));
    }
    if (change.isDeath || hp <= 0) {
      isAlive = false;
      hp = 0;
      deathNote = change.deathDescription || deathNote || `${companion.name} fell.`;
      deaths.push({ id: companion.id, name: companion.name, deathNote });
    }

    const next: CompanionCharacter = {
      ...companion,
      hp,
      max_hp: maxHp,
      xp,
      level,
      bondLevel,
      is_alive: isAlive,
      deathNote,
      abilities,
      lastSeenAt: new Date().toISOString(),
    };
    appliedChanges[companion.id] = {
      hp: next.hp,
      max_hp: next.max_hp,
      xp: next.xp,
      level: next.level,
      bondLevel: next.bondLevel,
      is_alive: next.is_alive,
      deathNote: next.deathNote,
    };
    return next;
  });

  return { companions: updated, appliedChanges, levelUps, deaths };
}

// ── Recruit / departure ─────────────────────────────────────────────────────
export function recruitCompanion(
  companions: CompanionCharacter[] | undefined,
  recruit: { name?: string; race?: string; class?: string } | undefined,
  partyLevel: number,
): { companions: CompanionCharacter[]; recruited?: CompanionCharacter } {
  const roster = companions || [];
  if (!recruit) return { companions: roster };
  const newCompanion = recruitCompanionCharacter(recruit, partyLevel, roster);
  return { companions: [...roster, newCompanion], recruited: newCompanion };
}

export function departCompanion(
  companions: CompanionCharacter[] | undefined,
  departure: { id: string; reason?: string } | undefined,
): { companions: CompanionCharacter[]; departed?: { id: string; name: string; reason?: string } } {
  const roster = companions || [];
  if (!departure) return { companions: roster };
  const leaving = roster.find(c => c.id === departure.id);
  if (!leaving) return { companions: roster };
  return {
    companions: roster.filter(c => c.id !== departure.id),
    departed: { id: leaving.id, name: leaving.name, reason: departure.reason },
  };
}
