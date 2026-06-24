export const EVERREALM_ART_BIBLE = {
  styleName: 'Everrealm Painterly Western Fantasy Animation',
  masterPrompt:
    'Hand-painted western fantasy animation style, anime-aware but not anime, sharp expressive faces, angular facial structure, varied body types and silhouettes, exaggerated fantasy species features, rugged adventuring clothing and armor, painterly linework, cinematic warm-and-cool lighting, dramatic expressions, strong personality in every face, animated-film detail, rich fantasy atmosphere, storybook adventure energy, not photorealistic, not grimdark by default.',
  characterStyle: [
    'Sharp expressive faces with readable emotion and angular structure.',
    'Anime-aware eyes and acting, but western RPG fantasy proportions and design language.',
    'Varied silhouettes, species traits, body types, scars, gear, posture, and personality.',
    'Rugged adventuring clothes and armor that feel lived-in, repaired, and story-worn.',
  ],
  environmentStyle: [
    'Painterly fantasy animation backgrounds with strong shape language and cinematic composition.',
    'Locations can be cozy, eerie, heroic, whimsical, bleak, romantic, strange, or sacred depending on the scene.',
    'Avoid defaulting every cave, forest, castle, tavern, or ruin into the same dark-fantasy palette.',
  ],
  lighting: [
    'Warm candlelight, tavern glow, firelight, sunrise, and lamplight should contrast with cool moonlight, stormlight, water, steel, shadow, and magic.',
    'Use glowing magic accents as story focal points, not random decoration.',
    'Keep silhouettes readable even in tense or dark scenes.',
  ],
  toneRules: [
    'The visual style stays consistent while the local genre tone changes by region, faction, scene, and player choice.',
    'Dark scenes are allowed, but darkness is not the baseline.',
    'Wonder, humor, danger, beauty, horror, and heroism can sit side by side in the same world.',
  ],
  avoid: [
    'photorealism',
    'generic dark fantasy concept art',
    'flat cartoon',
    'full anime style',
    'same-face characters',
    'muddy unreadable darkness',
    'empty atmospheric shots with no story focus',
  ],
  scenePromptRules: [
    'Mention the current location, subject, emotional beat, lighting, and visible story objects.',
    'If characters are visible, keep their species, silhouette, clothing, and emotional expression consistent.',
    'Frame scenes as moments from an animated fantasy film, not static item catalog art.',
  ],
};

export const ART_STYLE_PREFIX = `${EVERREALM_ART_BIBLE.masterPrompt} `;
