import type { StorySeedOption } from '../../../shared/types'

export const ALL_SEEDS: StorySeedOption[] = [
  {
    id: 'seed-1',
    title: 'The Shattered Throne',
    premise: 'A king has been murdered and his throne sits empty. Five factions each claim the right to rule. The kingdom is weeks from civil war — and something ancient stirs beneath the capital, waiting for the chaos.',
    tone: 'Political intrigue & betrayal',
    startingLocation: 'Ashveil City',
  },
  {
    id: 'seed-2',
    title: 'The Bleaching',
    premise: 'Animals die without cause. Crops rot before harvest. Magic itself feels thin. Something is draining the life from the land, slowly, from somewhere deep in the northern wastes. No one who went to investigate has returned.',
    tone: 'Creeping dread & mystery',
    startingLocation: 'The village of Dunmore',
  },
  {
    id: 'seed-3',
    title: 'Oathbreakers',
    premise: 'The most powerful archmage in the world was found dead this morning. Every nation wants the killer found immediately. You were seen near the tower the night it happened. You have until dawn to prove your innocence — or flee.',
    tone: 'Tense investigation & survival',
    startingLocation: 'The city of Vareth',
  },
  {
    id: 'seed-4',
    title: 'The Last Gate',
    premise: 'A portal to the Abyss tore open thirty days ago. Demons poured through for a week — then went silent. The silence is worse. Something is organizing them. Something that does not want to be found until it is ready.',
    tone: 'Dark horror & desperate odds',
    startingLocation: 'Fort Ashenmere',
  },
  {
    id: 'seed-5',
    title: 'The Hollow Crown',
    premise: 'The young queen has not been seen in three days. The court pretends everything is normal. The guards pretend everything is normal. The city pretends everything is normal. You are the only one who finds this strange.',
    tone: 'Paranoia & conspiracy',
    startingLocation: 'The Royal Capital',
  },
  {
    id: 'seed-6',
    title: 'Salt and Iron',
    premise: "The merchant guilds hired you to escort a shipment to a coastal fort. Simple work. Except the ship's captain is lying, the cargo is not what they claimed, and the fort stopped responding to ravens two weeks ago.",
    tone: 'Gritty survival & secrets',
    startingLocation: 'The port of Thornhaven',
  },
  {
    id: 'seed-7',
    title: 'The Buried God',
    premise: 'Miners broke through into something old beneath the mountain. The dreams started the next night. Miners who went back down never came up. Now the town hears the voice too — a deep voice, patient, promising everything.',
    tone: 'Cosmic horror & temptation',
    startingLocation: 'The mining town of Greyfall',
  },
  {
    id: 'seed-8',
    title: 'Blood of the Compact',
    premise: "A century ago, seven heroes bound themselves in a pact with a death god to seal away a great evil. The pact is breaking. The heroes' descendants are dying one by one — and you are one of them.",
    tone: 'Fate, legacy & urgency',
    startingLocation: 'The Shrine of Ash',
  },
  {
    id: 'seed-9',
    title: "The Warlord's Road",
    premise: 'An unstoppable warlord has united the eastern tribes and is marching west. You have been sent to assassinate them before they reach the mountain pass. You arrive and discover the warlord is twelve years old.',
    tone: 'Moral weight & war',
    startingLocation: 'The eastern border camp',
  },
  {
    id: 'seed-10',
    title: 'City of Masks',
    premise: "In the floating city of Vel Soran, everyone wears a mask and no one speaks their real name. You came here to find someone. The problem is you've forgotten who.",
    tone: 'Surreal mystery & identity',
    startingLocation: 'Vel Soran',
  },
  {
    id: 'seed-11',
    title: 'The Long Winter',
    premise: 'It has not stopped snowing for six months. The sun rises for three hours a day now. Refugees pour into the southern cities. Something ended the seasons — and it was not an accident.',
    tone: 'Survival & epic stakes',
    startingLocation: 'The city of Emberwall',
  },
  {
    id: 'seed-12',
    title: 'The Debt',
    premise: 'A powerful patron did you a great favor once. Now they have called in the debt. You owe them one task — no questions asked. The task: retrieve a box from a vault beneath the most heavily guarded city in the world.',
    tone: 'Heist & moral compromise',
    startingLocation: 'The city of Ironveil',
  },
]

export const TONE_ICONS: Record<string, string> = {
  'Political intrigue & betrayal': '👑',
  'Creeping dread & mystery': '🌑',
  'Tense investigation & survival': '🕯',
  'Dark horror & desperate odds': '🩸',
  'Paranoia & conspiracy': '🎭',
  'Gritty survival & secrets': '⚓',
  'Cosmic horror & temptation': '🕳',
  'Fate, legacy & urgency': '⚔️',
  'Moral weight & war': '🏹',
  'Surreal mystery & identity': '🎭',
  'Survival & epic stakes': '❄️',
  'Heist & moral compromise': '🗝',
}

export function pickRandom4(exclude: string[] = []): StorySeedOption[] {
  const pool = ALL_SEEDS.filter(s => !exclude.includes(s.id))
  const shuffled = [...pool].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, 4)
}
