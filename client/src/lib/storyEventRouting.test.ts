import { describe, it, expect } from 'vitest'
import { classifyStoryEvent, shouldDisplayStoryEvent } from './storyEventRouting'

const ME = 'char-tellini'
const PARTNER = 'char-sunmi'

describe('classifyStoryEvent', () => {
  it('classifies my own action row (authoritative swap-in for the optimistic bubble)', () => {
    expect(classifyStoryEvent({ character_id: ME, event_type: 'action' }, ME)).toBe('own-action')
  })

  it('classifies a partner action row (shows their submitted action bubble)', () => {
    expect(classifyStoryEvent({ character_id: PARTNER, event_type: 'action' }, ME)).toBe('partner-action')
  })

  it('classifies my own narration row (the DM reaction to MY action)', () => {
    expect(classifyStoryEvent({ character_id: ME, event_type: 'narration' }, ME)).toBe('own-narration')
  })

  // Regression test for the live-play bug: Tellini (ME) could see Sun Mi's
  // (PARTNER) submitted action bubble but never the DM's reaction to it,
  // because the micro-action route persists the reaction as a single
  // story_events row carrying only the ACTING character's id (see
  // server/src/routes/game.ts) and the client had no branch for a narration
  // row belonging to someone else. This must resolve to a distinct,
  // explicitly-handled kind so Game.tsx renders it instead of silently
  // dropping it.
  it('classifies a partner narration row as partner-narration, not "other" (the co-op reaction-sync bug)', () => {
    expect(classifyStoryEvent({ character_id: PARTNER, event_type: 'narration' }, ME)).toBe('partner-narration')
  })

  it('covers combat/contest/tension micro-action roll resolutions the same way as the plain path', () => {
    // resolveMicroActionCombatRollAndPersist / resolveMicroActionContestRollAndPersist /
    // resolveMicroActionRollAndPersist in game.ts all insert a narration row
    // with character_id set to the acting character only, exactly like the
    // plain flavor-only micro-action path - so they must all classify the
    // same way for a non-acting co-op partner.
    const combatReaction = { character_id: PARTNER, event_type: 'narration' }
    const contestReaction = { character_id: PARTNER, event_type: 'narration' }
    const tensionReaction = { character_id: PARTNER, event_type: 'narration' }
    expect(classifyStoryEvent(combatReaction, ME)).toBe('partner-narration')
    expect(classifyStoryEvent(contestReaction, ME)).toBe('partner-narration')
    expect(classifyStoryEvent(tensionReaction, ME)).toBe('partner-narration')
  })

  it('classifies events with no character_id (e.g. system rows) as other', () => {
    expect(classifyStoryEvent({ character_id: null, event_type: 'narration' }, ME)).toBe('other')
    expect(classifyStoryEvent({ character_id: undefined, event_type: 'action' }, ME)).toBe('other')
  })

  it('classifies unknown event types as other regardless of ownership', () => {
    expect(classifyStoryEvent({ character_id: ME, event_type: 'system' }, ME)).toBe('other')
    expect(classifyStoryEvent({ character_id: PARTNER, event_type: 'system' }, ME)).toBe('other')
  })

  it('treats a missing local characterId as never "own" (falls through to partner handling instead)', () => {
    expect(classifyStoryEvent({ character_id: ME, event_type: 'narration' }, null)).toBe('partner-narration')
  })
})

describe('shouldDisplayStoryEvent', () => {
  it('shows a partner action and its single persisted micro-action DM reaction', () => {
    expect(shouldDisplayStoryEvent({ character_id: PARTNER, event_type: 'action' }, ME)).toBe(true)
    expect(shouldDisplayStoryEvent({ character_id: PARTNER, event_type: 'narration', metadata: { microAction: true } }, ME)).toBe(true)
  })

  it('hides a partner macro-turn narration because each player receives their own copy', () => {
    expect(shouldDisplayStoryEvent({ character_id: PARTNER, event_type: 'narration', metadata: {} }, ME)).toBe(false)
  })
})
