// Pure classification of an incoming story_events row for handleIncomingEvent
// in Game.tsx (shared by the realtime subscription and the co-op poll
// fallback). Extracted so the routing decision - which branch a given event
// falls into - is unit-testable without spinning up the full Game page.
//
// Background: a micro-action's DM reaction is persisted as a SINGLE
// story_events row whose character_id is always the ACTING character (see
// server/src/routes/game.ts's many story_events inserts in the micro-action
// route and its roll-resolution helpers). A co-op partner's client therefore
// receives that row with character_id !== their own characterId. Before this
// fix, Game.tsx only had handling for 'own-narration' and 'partner-action' -
// there was no 'partner-narration' branch, so the DM's reaction to a
// partner's micro-action was silently dropped: the partner's action bubble
// showed up (via 'partner-action'), but the reply to it never did.
//
// Macro-turn co-op narration doesn't hit 'partner-narration': coopTurnProcessor.ts
// inserts one row PER party member, each carrying that member's own
// character_id, so every player always sees their own copy via 'own-narration'.
export type StoryEventKind = 'own-action' | 'partner-action' | 'own-narration' | 'partner-narration' | 'other'

export interface MinimalStoryEvent {
  character_id?: string | null
  event_type: string
  metadata?: Record<string, unknown> | null
}

export function classifyStoryEvent(event: MinimalStoryEvent, characterId: string | null | undefined): StoryEventKind {
  const isOwnEvent = !!characterId && event.character_id === characterId
  const isPartnerEvent = !!event.character_id && event.character_id !== characterId

  if (isOwnEvent && event.event_type === 'action') return 'own-action'
  if (isPartnerEvent && event.event_type === 'action') return 'partner-action'
  if (isPartnerEvent && event.event_type === 'narration') return 'partner-narration'
  if (isOwnEvent && event.event_type === 'narration') return 'own-narration'
  return 'other'
}

// Party-mode history contains one macro-turn narration copy per player, so
// partner narration cannot be displayed indiscriminately without duplicating
// the same DM passage. Micro-action reactions are different: the server saves
// only one narration row, owned by the acting character. Every party member
// must render that row or they see the partner's action with no DM response.
export function shouldDisplayStoryEvent(event: MinimalStoryEvent, characterId: string | null | undefined): boolean {
  if (!event.character_id || event.character_id === characterId || event.event_type === 'action') return true
  return event.event_type === 'narration' && event.metadata?.microAction === true
}

const ADVANCE_CONTEXT_MARKER = '(During free-roam since the last turn'

export function storyEventDisplayContent(event: MinimalStoryEvent & { content: string }): string {
  if (event.event_type !== 'action' || !event.content.includes(ADVANCE_CONTEXT_MARKER)) return event.content
  const framing = event.content.slice(0, event.content.indexOf(ADVANCE_CONTEXT_MARKER)).trim()
  return framing || 'Move the story forward.'
}
