export function isFightSeekingAction(action: string): boolean {
  return /\b(look|search|hunt|find|seek|ask|go|want|start|pick|cause)\b.{0,40}\b(fight|trouble|brawl|bandits?|enemies|enemy|monsters?|combat)\b/i.test(action)
    || /\b(fight|brawl|combat)\b.{0,20}\b(now|someone|anything|anyone)\b/i.test(action);
}

export function hasGroundedEncounterSetup(narration: string): boolean {
  return /\b(follow|track|trace|investigate|approach|stake out)\b.{0,60}\b(trail|tracks?|footprints?|smoke|camp|hideout|rumou?r|shouts?|screams?|signs?|suspect|threat)\b|\b(trail|tracks?|footprints?|rumou?r|witness|victim|guards?|locals?)\b.{0,60}\b(lead|point|warn|report|mention|describe|direct)\b|\b(spot|notice|hear|see)\b.{0,60}\b(ahead|nearby|in the distance|watching|following|ambush|camp|hideout|patrol)\b|\b(set|prepare|spring|walk into)\b.{0,30}\b(an? )?ambush\b/i.test(narration);
}

export function groundedFightSearchNarration(location?: string): string {
  const place = location || 'the area';
  return `At ${place}, trouble does not simply materialize on command. You spend time asking questions, reading the mood, and searching for signs of danger. Fresh boot prints, guarded whispers, and evidence of a recent disturbance point toward a real threat nearby—but no enemy is in reach yet. You can follow the trail, question a witness, or prepare an ambush before committing to a fight.`;
}
