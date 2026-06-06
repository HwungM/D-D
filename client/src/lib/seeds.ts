import type { StorySeedOption } from '../../../shared/types'

export const ALL_SEEDS: StorySeedOption[] = [
  {
    id: 'seed-1',
    title: 'The Prism Road',
    premise: 'A road of living crystal appears overnight, connecting seven kingdoms that were never meant to touch. Every mile changes the rules of magic, manners, and danger. Caravans vanish, children hear songs from cities that do not exist, and the first traveler to reach the end may choose what kind of world comes next.',
    tone: 'Wonder, travel & shifting genres',
    startingLocation: 'The roadside town of Bellwether',
  },
  {
    id: 'seed-2',
    title: 'The Laughing Lanterns',
    premise: 'In the festival city of Lumaire, lanterns have started laughing at secrets no one spoke aloud. The jokes are harmless at first, then cruel, then prophetic. To stop the city from tearing itself apart, you must enter its theaters, tea houses, rooftops, and dream-lit canals to find who taught the lights to talk.',
    tone: 'Whimsy, mystery & social chaos',
    startingLocation: 'Lumaire, City of Lanterns',
  },
  {
    id: 'seed-3',
    title: 'Crown of the Dawnward',
    premise: 'A high-heroic kingdom has lost the oath that binds its sunlit guardians. Monsters gather at the borders, but the court is too proud to admit fear. You are asked to recover the oath before the next sunrise ceremony, when the whole realm will learn whether its legends still answer.',
    tone: 'Heroic quest & royal drama',
    startingLocation: 'The Dawnward Keep',
  },
  {
    id: 'seed-4',
    title: 'Below Hollowglass',
    premise: 'Beneath a cheerful seaside town lies a dungeon made of mirrors, tide pools, and old promises. Each chamber reflects a different version of what the town could become. The deeper you go, the more the surface changes to match what you have chosen below.',
    tone: 'Eerie dungeon & consequence',
    startingLocation: 'Hollowglass Harbor',
  },
  {
    id: 'seed-5',
    title: 'The Soft Rebellion',
    premise: 'A cozy valley of bakers, herbalists, and retired adventurers refuses to pay tribute to a floating empire. The empire sends an elegant diplomat instead of soldiers. The conflict begins with tea, contracts, and compliments, but every kind word hides a battlefield.',
    tone: 'Cozy resistance & political wit',
    startingLocation: 'The village of Hearthmere',
  },
  {
    id: 'seed-6',
    title: 'Storm Choir',
    premise: 'Every storm now sings in a different voice, and sailors swear the songs are directions. One melody leads to treasure, another to war, another to a god who wants to retire. You board a ship where the crew votes on destiny every morning.',
    tone: 'Mythic voyage & strange wonder',
    startingLocation: 'The port of Brinewake',
  },
  {
    id: 'seed-7',
    title: 'The Bone Orchard',
    premise: 'A bleak orchard grows white trees from buried names. Nobles pay fortunes to erase scandals there, but erased names have begun walking home. What starts as a haunted investigation may become a moral war over memory, grief, and who deserves to be forgotten.',
    tone: 'Bleak mystery & moral horror',
    startingLocation: 'The village of Marrowfen',
  },
  {
    id: 'seed-8',
    title: 'Library of Possible Kings',
    premise: 'A library appears only to people standing at the edge of a life-changing decision. Inside are books about rulers who never existed, futures that can still happen, and one empty shelf with your name on it. Every book you open changes a kingdom somewhere in the world.',
    tone: 'Surreal fate & political fantasy',
    startingLocation: 'The Midnight Stacks',
  },
  {
    id: 'seed-9',
    title: 'Mooncalf Market',
    premise: 'Once a year, a moonlit market sells impossible things: bottled courage, borrowed childhoods, honest maps, and swords that apologize. This year the market opens in the wrong town, and a missing friend has left you a shopping list written in your handwriting.',
    tone: 'Playful magic & hidden danger',
    startingLocation: 'Mooncalf Market',
  },
  {
    id: 'seed-10',
    title: 'The Ashen Tournament',
    premise: 'Champions from every realm gather for a tournament where the prize is a wish granted by the last dragon. Duels, feasts, rivalries, romances, and sabotage fill the arena. The dragon, however, has chosen this tournament to secretly judge whether mortals deserve wishes at all.',
    tone: 'Adventure, rivalry & spectacle',
    startingLocation: 'The Ashen Arena',
  },
  {
    id: 'seed-11',
    title: 'Garden at the Edge',
    premise: 'At the edge of the world, an impossible garden grows doors instead of flowers. Each door opens into a different fantasy: one comic, one tragic, one heroic, one terrifying. Something is pruning the doors before the people inside can escape.',
    tone: 'Portal fantasy & tonal contrast',
    startingLocation: 'The Edgegarden',
  },
  {
    id: 'seed-12',
    title: 'The Smallest Apocalypse',
    premise: 'The end of the world begins in a toy shop, where miniature castles burn and tiny armies beg for help. No one else takes it seriously. If the toy kingdom falls, the real one will follow, but saving it means becoming small enough to enter a war everyone laughs at.',
    tone: 'Whimsical peril & heartfelt stakes',
    startingLocation: 'Pellwyn Toyworks',
  },
]

export const TONE_ICONS: Record<string, string> = {
  'Wonder, travel & shifting genres': '*',
  'Whimsy, mystery & social chaos': '*',
  'Heroic quest & royal drama': '*',
  'Eerie dungeon & consequence': '*',
  'Cozy resistance & political wit': '*',
  'Mythic voyage & strange wonder': '*',
  'Bleak mystery & moral horror': '*',
  'Surreal fate & political fantasy': '*',
  'Playful magic & hidden danger': '*',
  'Adventure, rivalry & spectacle': '*',
  'Portal fantasy & tonal contrast': '*',
  'Whimsical peril & heartfelt stakes': '*',
}

export function pickRandom4(exclude: string[] = []): StorySeedOption[] {
  const pool = ALL_SEEDS.filter(s => !exclude.includes(s.id))
  const shuffled = [...pool].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, 4)
}