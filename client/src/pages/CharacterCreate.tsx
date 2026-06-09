import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { characterApi, campaignApi } from '../lib/api'
import { createClient } from '@supabase/supabase-js'
import type { Race, CharacterClass } from '../../../shared/types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

type Gender = 'male' | 'female'

const RACE_STAT_BONUSES: Record<Race, Partial<Record<string, number>>> = {
  Human: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 },
  Elf: { dex: 2, int: 1 },
  Dwarf: { con: 2, wis: 1 },
  Halfling: { dex: 2, cha: 1 },
  Gnome: { int: 2, dex: 1 },
  'Half-Orc': { str: 2, con: 1 },
  Tiefling: { cha: 2, int: 1 },
  Dragonborn: { str: 2, cha: 1 },
  Aasimar: { cha: 2, wis: 1 },
  'Fire Genasi': { con: 2, int: 1 },
  'Water Genasi': { con: 2, wis: 1 },
  'Earth Genasi': { con: 2, str: 1 },
  'Air Genasi': { dex: 2, int: 1 },
  Warforged: { con: 2, str: 1 },
  Tabaxi: { dex: 2, cha: 1 },
  Goliath: { str: 2, con: 1 },
  Firbolg: { wis: 2, str: 1 },
  Changeling: { cha: 2, dex: 1 },
  Kenku: { dex: 2, wis: 1 },
  Dhampir: { dex: 2, cha: 1 },
  Owlin: { wis: 2, dex: 1 },
  Lizardfolk: { con: 2, str: 1 },
  Satyr: { cha: 2, dex: 1 },
  Harengon: { dex: 2, wis: 1 },
  'Yuan-Ti': { cha: 2, int: 1 },
  Triton: { str: 1, con: 1, cha: 1 },
  Leonin: { con: 2, str: 1 },
  Minotaur: { str: 2, con: 1 },
  Bugbear: { str: 2, dex: 1 },
  Hobgoblin: { con: 2, int: 1 },
  Goblin: { dex: 2, con: 1 },
  Tortle: { con: 2, wis: 1 },
}

const RACES: Race[] = [
  'Human', 'Elf', 'Dwarf', 'Halfling', 'Gnome', 'Half-Orc', 'Tiefling', 'Dragonborn',
  'Aasimar', 'Fire Genasi', 'Water Genasi', 'Earth Genasi', 'Air Genasi',
  'Warforged', 'Tabaxi', 'Goliath', 'Firbolg', 'Changeling', 'Kenku', 'Dhampir', 'Owlin',
  'Lizardfolk', 'Satyr', 'Harengon', 'Yuan-Ti', 'Triton', 'Leonin',
  'Minotaur', 'Bugbear', 'Hobgoblin', 'Goblin', 'Tortle',
]
const CLASSES: CharacterClass[] = ['Fighter', 'Wizard', 'Rogue', 'Cleric', 'Ranger', 'Paladin', 'Barbarian', 'Bard', 'Druid', 'Monk', 'Sorcerer', 'Warlock']

type RaceInfo = {
  description: string
  tendency: string
  playstyle: string
}

type ClassInfo = {
  description: string
  role: string
  tendency: string
  playstyle: string
}

const RACE_INFO: Record<Race, RaceInfo> = {
  Human: {
    description: 'Humans are the most adaptable and ambitious of all races, found in every corner of the known world. Their brief lives drive them to achieve quickly - to build empires, forge legends, and leave marks that outlast them.',
    tendency: 'The DM leans into human ambition and politics. Faction leaders treat you as a wildcard worth cultivating. Doors open through sheer force of personality - but rivals watch your rise closely.',
    playstyle: 'Best for players who want maximum flexibility and no narrative baggage - a blank slate to write their own legend.',
  },
  Elf: {
    description: 'Elves are ancient beings who walk the world with the quiet confidence of those who have seen civilizations rise and crumble. They carry the weight of long memory - and the loneliness that comes with outliving everything they love.',
    tendency: 'The DM weaves in ancient lore hooks and forgotten histories. Ruins hold personal meaning. NPCs from old bloodlines treat you with earned respect - or ancient resentment.',
    playstyle: 'Best for players who love world-building investment, backstory depth, and playing someone who knows more than they let on.',
  },
  Dwarf: {
    description: 'Dwarves are carved from the bones of the earth - enduring, stubborn, and fiercely loyal to their kin and their oaths. A dwarf never forgets a debt, whether it is owed to them or by them.',
    tendency: 'The DM introduces clan politics, grudges with long histories, and underground threats. Your resilience earns respect from hard people. Slights are remembered and returned.',
    playstyle: 'Best for players who want a tough, dependable character with strong cultural ties and a history that the world actually cares about.',
  },
  Halfling: {
    description: 'Halflings are small in stature but surprisingly difficult to kill - luck follows them the way trouble follows everyone else. They thrive in the cracks of the world, moving unseen and surviving by wit and warmth.',
    tendency: 'The DM narrates moments where the world underestimates you - and you exploit it. Luck turns in your favor at unexpected moments. Common folk trust you instinctively; nobles dismiss you at their peril.',
    playstyle: 'Best for players who enjoy being the underdog, using charm and cleverness over brute force, and surprising the table.',
  },
  Gnome: {
    description: 'Gnomes are relentlessly curious beings whose connection to the arcane runs deep and strange. They see the world as a puzzle to be solved, a mechanism to be taken apart - and they have absolutely no patience for boredom.',
    tendency: 'The DM seeds arcane mysteries and mechanical curiosities that only you notice. Magic items have history you can read. Scholars seek you out. Your inventions sometimes work perfectly and occasionally terribly.',
    playstyle: 'Best for players who love roleplaying eccentricity, tinkering with the world\'s lore, and finding creative off-label solutions.',
  },
  'Half-Orc': {
    description: 'Half-Orcs carry the blood of two worlds and the welcome of neither - they are defined by what they overcome. They are frightening when angered and awe-inspiring when they choose mercy, and both leave an impression.',
    tendency: 'The DM gives weight to your physical presence. Guards step aside. Thugs reconsider. Brute-force solutions are respected, not just tolerated. The world watches to see what you do with your power.',
    playstyle: 'Best for players who want a character defined by inner conflict, physical dominance, and the ongoing project of proving the world wrong.',
  },
  Tiefling: {
    description: 'Tieflings bear the infernal mark of a pact made generations ago - horns, tail, and eyes that glow with hellish light. The world does not trust them, and some have decided the world can burn for it.',
    tendency: 'NPCs are wary or hostile by default until you prove yourself. The DM introduces social friction and moments of prejudice - and gives you the chance to face it down, exploit it, or transcend it entirely.',
    playstyle: 'Best for players who relish playing a complex outsider, earning trust the hard way, and wielding a dark aesthetic with sharp emotional depth.',
  },
  Dragonborn: {
    description: 'Dragonborn are proud warriors of draconic heritage - scales like armor, breath like a weapon, and a culture built entirely on honor and legacy. They do not start fights. They finish them.',
    tendency: 'The DM acknowledges your lineage. Dragon-cults take notice. Enemies who survive speak of you. Your ancestry opens doors in ancient places - and attracts predators who want to claim what you carry.',
    playstyle: 'Best for players who want a dignified, honor-driven character who leaves a mark everywhere they go and never needs to raise their voice.',
  },
  Aasimar: {
    description: 'Born with a touch of the divine, Aasimars carry celestial light within them — a blessing or a burden depending on the day. They are called to greatness, and the world can feel it.',
    tendency: 'Clergy treat you with reverence or dangerous obsession. Undead and fiends recoil. Your inner light surfaces at moments of genuine virtue. Some treat you as an omen. Your divine mandate creates impossible choices.',
    playstyle: 'Best for players who want a character wrestling with destiny, gravitating toward redemption arcs, and experiencing the weight of being seen as sacred.',
  },
  'Fire Genasi': {
    description: 'The blood of the Elemental Plane of Fire runs through your veins — you carry warmth that never leaves, a temper that ignites, and an inner fire that literally shows on your skin.',
    tendency: 'Flames lean toward you. Fire-wielding enemies hesitate. Sages want to study your elemental blood. Fire temples treat you as kin. Your emotions register as temperature changes around you.',
    playstyle: 'Best for players who want a visually striking elemental character with fiery passion and a connection to the primal forces of creation.',
  },
  'Water Genasi': {
    description: 'Touched by the endless ocean, Water Genasi move through the world with the calm patience of deep water — and the sudden terrifying force of a wave when moved to action.',
    tendency: 'Water parts around you subtly. Sailors and sea-folk recognize something in you. Sea creatures treat you with deference. Your emotions shift the weather near coasts when strong enough.',
    playstyle: 'Best for players who want fluid adaptability, an affinity for secrets that run deep, and a serene surface hiding enormous depths.',
  },
  'Earth Genasi': {
    description: 'Solid as stone, patient as mountains. Earth Genasi carry the stillness of bedrock and the inevitability of avalanches. They endure what destroys others and remember everything.',
    tendency: 'The ground responds to you. Miners and stoneworkers trust you instinctively. Burrowing creatures defer. Your patience in negotiations unnerves those used to quick answers.',
    playstyle: 'Best for players who want an unmovable anchor — the character who is still standing when everything else has fallen.',
  },
  'Air Genasi': {
    description: 'Light as a breeze and twice as difficult to catch. Air Genasi carry the restlessness of the wind — always moving, always arriving somewhere new, carrying whispers from a hundred places.',
    tendency: 'Wind moves with you. Messages travel fast in your vicinity. Storm magic resonates. Your laughter can start a wind. Those who deal in secrets find you unnerving — you always seem to already know.',
    playstyle: 'Best for players who want swiftness, freedom of movement, and a character that nobody can quite pin down.',
  },
  Warforged: {
    description: 'Built for war, choosing peace. Warforged are living constructs of metal and magic who survived the conflicts that made them and now must figure out what they are in a world that no longer needs soldiers.',
    tendency: 'Some refuse to see you as a person. Others are fascinated. You do not sleep or eat — creating social friction. Who built you, and why, is always a story hook. Veterans recognize your type and have feelings about it.',
    playstyle: 'Best for players who want to explore questions of identity, consciousness, and purpose — the soldier who must define themselves outside of war.',
  },
  Tabaxi: {
    description: 'Cat-folk driven by insatiable curiosity, Tabaxi wander the world collecting experiences, stories, and occasionally things that do not belong to them. Everything is interesting. Everything.',
    tendency: 'NPCs find you charming until the curiosity becomes unsettling. Your speed catches enemies completely off-guard. You have likely already been everywhere and remember everything you saw. Shiny things are a problem.',
    playstyle: 'Best for players who love information-gathering, unexpected speed, and playing someone who treats the world as an endlessly fascinating museum.',
  },
  Goliath: {
    description: 'Raised in mountain tribes where performance is everything and weakness is not tolerated, Goliaths carry a meritocracy in their bones. They compete with everything. They cannot not compete.',
    tendency: 'Lowland civilization feels soft and dishonest. Physical challenges are invitations. Your sheer size changes room dynamics. You keep track of every test passed and failed — and so does your tribe.',
    playstyle: 'Best for players who want to be the physically unstoppable force and roleplay a character who sees every obstacle as something to be beaten.',
  },
  Firbolg: {
    description: 'Gentle giant-kin who carry deep fey connections and a preference for peace — but whose capacity for violence when pushed is genuinely staggering. They speak to plants. They remember the old forest.',
    tendency: 'Animals and nature behave differently around you. Druids treat you as kin. Your cultural distaste for names and ownership creates odd social moments. When you finally lose your patience, enemies realize they misread you entirely.',
    playstyle: 'Best for players who want the "gentle giant with a secret" arc — peaceful by choice, formidable by nature, wise beyond the trappings of civilization.',
  },
  Changeling: {
    description: 'Natural shapeshifters who live in the gap between identity and performance. Every face they wear is real. Which one is theirs? That question follows them everywhere.',
    tendency: 'People are unsettled when they realize what they are talking to. Even well-intentioned changelings trigger distrust. Their nature is transgressive to fixed identity. NPCs who learn what you are react with specific, personal fear.',
    playstyle: 'Best for players who enjoy deception, social infiltration, and exploring the philosophical question of what makes a self.',
  },
  Kenku: {
    description: 'Crow-folk cursed to never speak with their own voice — only sounds they have heard before. Their communication is uncanny patchwork. Their loss is real. Their cleverness in spite of it is extraordinary.',
    tendency: 'People underestimate how much you understand because of how you speak. Thieves guilds have always found Kenku useful. Your mimicry is perfect — which occasionally creates problems. Your curse has a history that the world sometimes remembers.',
    playstyle: 'Best for players who want a unique roleplaying challenge, a character defined by constraint and creativity, and the melancholy of something taken away.',
  },
  Dhampir: {
    description: 'Half-vampire. The hunger is always there. You are beautiful in a way that unsettles. You are strong in a way that frightens. You are choosing, every day, what you will not become.',
    tendency: 'Religious figures are suspicious. Vampires see you as tool or abomination. Mortals who learn your nature have a specific fear response. Your charm attracts the wrong attention. The tension between what you are and what you choose defines your arc.',
    playstyle: 'Best for players who want a dark seductive edge, the temptation arc done right, and a character whose restraint is as compelling as their power.',
  },
  Owlin: {
    description: 'Owl-folk of silent wings and eerie perception. They are nocturnal, wise, and unreadable to most humanoids — and they prefer it that way. The dark holds no fear for them. Very little does.',
    tendency: 'Your silent movement unnerves people. Daylight is genuinely uncomfortable for you. Scholars and mages want access to your legendary wisdom. Your emotional expression is alien in ways that create interesting misunderstandings.',
    playstyle: 'Best for players who want a mysterious observer archetype — the one who already knows the answer before anyone else thinks to ask the question.',
  },
  Lizardfolk: {
    description: 'Lizardfolk experience the world through survival pragmatism rather than social emotion. They find humanoid sentimentality baffling and fascinating in equal measure. They adapt, mimic, and observe with terrifying precision.',
    tendency: 'Other races project emotions onto you and are wrong. The DM uses this dissonance deliberately. Your cultural practices around food and death disturb NPCs. When you finally understand something about humanoid culture, you ask the question that makes everyone uncomfortable.',
    playstyle: 'Best for players who enjoy playing something genuinely alien — an outsider\'s perspective on what everybody else takes for granted.',
  },
  Satyr: {
    description: 'Fey hedonists who exist at the intersection of joy and danger. Satyrs are excellent at parties and terrible for any plan requiring restraint. The Feywild echoes in them — they age differently, dream strangely, occasionally slip into fey logic.',
    tendency: 'Music and nature magic call to you. Fey creatures treat you as kin. The rules of civilization sit lightly on you. Your joy is genuine and contagious — but your priorities can seem incomprehensible to those who live only in the material world.',
    playstyle: 'Best for players who want to embody charisma and freedom, lean into the morally complex fey worldview, and have the most fun at any given table.',
  },
  Harengon: {
    description: 'Rabbit-folk who escaped the Feywild carrying its restlessness. Lightning-fast and always watchful — a prey animal\'s hypervigilance wrapped in the body of a person who refuses to be prey.',
    tendency: 'Your reflexes are beyond normal limits. Your perception catches things others miss. Your instinct to flee reads as cowardice to those who do not understand it is a survival strategy, not a character flaw. You notice exits first.',
    playstyle: 'Best for players who want breathtaking speed, a nervous-energy character who is more dangerous than they look, and the arc of choosing when to stop running.',
  },
  'Yuan-Ti': {
    description: 'Serpentine bloodline — cold, calculating, long-memoried. Yuan-Ti feel alien to other races in a way that is hard to name. Something instinctual says "wrong" when you look too long. They are very used to this.',
    tendency: 'Serpent cults recognize you and have opinions. Your emotional detachment reads as wisdom or cruelty. Ancient enemies of serpentine peoples carry old grudges that surface. Diplomacy works differently for you — your calm is more unsettling than raised voices.',
    playstyle: 'Best for players who want to play the composed, calculating mastermind — serene on the surface, lethal underneath, with ancient stakes at every turn.',
  },
  Triton: {
    description: 'Sea-dwellers who moved to the surface carrying the politics of the deep with them. Tritons have a subtle condescension about land-folk they are actively trying to suppress — and not always succeeding.',
    tendency: 'The ocean calls to you. Sailors are fascinated. Sea monsters react to your presence with aggression or deference. The underwater kingdoms have interests in the surface world and you are their representative whether you asked to be or not.',
    playstyle: 'Best for players who enjoy playing a fish-out-of-water (literally), navigating cultural misunderstandings, and having a secret political weight behind ordinary encounters.',
  },
  Leonin: {
    description: 'Lion-warrior people from ancient sun-baked plains. Their pride is total, their memory for honor is long, and their roar is a weapon. They do not forget what they are owed — or what they owe.',
    tendency: 'Your roar changes the dynamics of combat. Ancient warrior orders see you as kin. Slights are remembered with leonin patience — which is to say, forever. The honored dead are a presence in your life that others find intense and moving.',
    playstyle: 'Best for players who want to embody noble ferocity, carry their culture into every room, and play someone whose pride is both a strength and a perfect pressure point.',
  },
  Minotaur: {
    description: 'Labyrinth-born and carrying its weight. Some see a monster. What they miss is the person inside who has been fighting that label since birth — and is very tired of it.',
    tendency: 'Your sense of direction is supernatural — you cannot get lost. People who only see your exterior make dangerous assumptions. When you choose to protect someone, it is absolute. The history of minotaurs as weapons has left wounds the world does not always remember it inflicted.',
    playstyle: 'Best for players who want to subvert the monster archetype, play someone whose gentleness is more powerful than their strength, and make NPCs reconsider their assumptions.',
  },
  Bugbear: {
    description: 'Large, sneaky, terrifying in the dark. Bugbears are the thing that moves silently through shadows at a size that should make that impossible. And they know the effect they have.',
    tendency: 'Common folk are afraid. Your stealth at your size genuinely unsettles people. Goblinoid communities have complex politics with you. You are more loyal than anyone expects once trust is earned — and earning it is the whole story.',
    playstyle: 'Best for players who want a powerfully built stealth character, enjoy subverting expectations, and like the arc of being trusted despite what the world says you are.',
  },
  Hobgoblin: {
    description: 'Disciplined, martial, driven by a rigid honor code that is entirely real and entirely theirs. Hobgoblins bring military structure to everything and are inexplicably reliable in a way that surprises people who only know their reputation.',
    tendency: 'Factions with armies want to recruit or conscript you. Breaking your honor system has genuine consequences. You are a devastatingly organized opponent — and an unexpectedly steadfast ally. Military veterans recognize your bearing and treat you differently.',
    playstyle: 'Best for players who want a character defined by discipline and earned trust — the one who keeps their word even when everyone expected them not to.',
  },
  Goblin: {
    description: 'Small, scrappy, underestimated at every turn and exhausted of it. Goblins have had to be twice as clever to get half as far, and they have the creativity to show for it.',
    tendency: 'The world dismisses you first. You weaponize that. Other goblinoids have strong opinions. Your resourcefulness finds solutions nobody else thought of because nobody else had to think that way. The small victories matter most.',
    playstyle: 'Best for players who love the underdog arc, playing the smartest person in the room who nobody believes is the smartest person in the room, and proving everyone wrong.',
  },
  Tortle: {
    description: 'Ancient patient shell-bearers who carry their home on their back. Tortles have likely already lived a full life before setting out — they adventure as a final chapter, not a first one.',
    tendency: 'Your patience is genuine — you have seen generations come and go. Religious figures and philosophers are drawn to you. Your shell is both armor and identity — touching it without permission is deeply transgressive. You have seen how this ends before. You are curious if it ends differently this time.',
    playstyle: 'Best for players who want to roleplay earned wisdom, patient strength, and the specific perspective of someone who is here by choice, not necessity.',
  },
}

type ClassInfoFull = ClassInfo

const CLASS_INFO: Record<CharacterClass, ClassInfoFull> = {
  Fighter: {
    description: 'Fighters are masters of armed combat - weapon and shield, strategy and steel. They don\'t rely on magic or luck; they win through relentless training, superior technique, and the capacity to take as much punishment as they dish out.',
    role: 'Frontline tank',
    tendency: 'The DM highlights tactical options and battlefield control. Enemies respect your threat - they focus you, fear you, and plan around you. Duels and challenges of honor find their way to you first.',
    playstyle: 'Best for players who want reliable, consistent power without resource management - always effective, always in the thick of it.',
  },
  Wizard: {
    description: 'Wizards are scholars of arcane forces - they reshape reality through years of obsessive study. Fragile in body but devastating in output, a wizard turns intellect into the most dangerous weapon in the world.',
    role: 'Arcane artillery',
    tendency: 'The DM seeds lore puzzles, ancient tomes, and magical phenomena that reward your knowledge. Sages and scholars recognize you. Magic-using enemies treat you as their most dangerous target.',
    playstyle: 'Best for players who love preparation, creative problem-solving, and the tactical satisfaction of having exactly the right spell for the situation.',
  },
  Rogue: {
    description: 'Rogues are precision instruments - they don\'t fight fair and see no reason they should. Working from shadow, misdirection, and exploitation of vulnerability, they turn every encounter into a puzzle with a lethal solution.',
    role: 'Shadow striker',
    tendency: 'The DM always narrates stealth opportunities. In social situations, your sharp eye catches details others miss. When you strike, the narration acknowledges the exact moment of vulnerability you exploited.',
    playstyle: 'Best for players who love feeling clever, solving encounters laterally, and having one spectacular moment per fight rather than sustained pressure.',
  },
  Cleric: {
    description: 'Clerics are divine conduits - mortals who have opened themselves to the will of a god and carry that god\'s power into the world. They heal, protect, and when roused to holy wrath, they are terrifying.',
    role: 'Divine support',
    tendency: 'The DM creates moments of divine resonance - your god notices, sometimes responds, occasionally tests you. Faith matters: NPCs with spiritual needs are drawn to you, and dark forces treat you as a threat worth neutralizing.',
    playstyle: 'Best for players who enjoy being the linchpin of the party, blending support and offense, and roleplaying devotion to something larger than themselves.',
  },
  Ranger: {
    description: 'Rangers are hunters who have mastered the wilderness and carry that mastery into every environment. They are patient, precise, and self-sufficient - more at home in the dark forest than in any city.',
    role: 'Skirmisher / tracker',
    tendency: 'The DM enriches environmental details for you - tracks, scents, signs of passage that others miss. Wilderness threats feel navigable. Quarry is rarely able to hide from you for long.',
    playstyle: 'Best for players who love exploration, being ahead of the party in every sense, and the quiet satisfaction of knowing the terrain better than anyone.',
  },
  Paladin: {
    description: 'Paladins are oath-bound warriors who combine martial excellence with divine power. They are the most uncompromising characters in any story - righteous, relentless, and capable of terrible mercy.',
    role: 'Holy vanguard',
    tendency: 'The DM creates moral dilemmas with no clean answer and makes your oath feel real. Temptation comes for you specifically. Divine moments occur when you need them most - or when you deserve them least.',
    playstyle: 'Best for players who want to feel the weight of conviction, wrestle with genuine ethical complexity, and occasionally smite something into dust.',
  },
  Barbarian: {
    description: 'Barbarians tap into a primal fury that transforms them into something that hits harder, takes more punishment, and simply refuses to die. They are not reckless - they are uncaged.',
    role: 'Berserker tank',
    tendency: 'The DM escalates encounters around your presence - you attract the big threats. Violence respects violence: tribal warriors and soldiers treat you differently than they treat anyone else. Your rages become story moments.',
    playstyle: 'Best for players who want to feel physically unstoppable and enjoy the catharsis of hitting something very, very hard.',
  },
  Bard: {
    description: 'Bards are the Swiss Army knife of adventurers - they fight, they charm, they know a little about everything, and they talk their way through doors that others would have kicked down. Their power is in their adaptability.',
    role: 'Social chameleon / support',
    tendency: 'The DM rewards social creativity. The right word at the right moment changes outcomes. NPCs remember you specifically, and their reactions are colored by whatever impression you made. Information finds you.',
    playstyle: 'Best for players who love roleplay, want to influence every scene even when not fighting, and enjoy being the most interesting person in any room.',
  },
  Druid: {
    description: 'Druids are nature\'s will given form - they do not control nature, they speak for it. Their magic is ancient, their patience deep, and their capacity for transformation unsettling to those who thought they understood the world.',
    role: 'Nature shaper',
    tendency: 'The DM makes the natural world feel alive and reactive. Animals behave differently around you. Corruption of nature is personal. Spirits and ancient powers take notice - and sometimes intervene on your behalf.',
    playstyle: 'Best for players who enjoy versatility, thematic resonance, and the satisfaction of being plugged into the world\'s hidden rhythms.',
  },
  Monk: {
    description: 'Monks are living weapons - bodies disciplined into instruments of precision force. They are fast, efficient, and utterly self-reliant. Their power comes from years of brutal training, not gift or luck.',
    role: 'Precision striker',
    tendency: 'The DM highlights moments of stillness in chaos - your calm in a crisis reads as unnerving to enemies and inspiring to allies. Spiritual challenges and tests of will find their way to you. Your presence changes the texture of a room.',
    playstyle: 'Best for players who enjoy mechanically precise play, a strong personal code, and the fantasy of facing danger empty-handed and winning.',
  },
  Sorcerer: {
    description: 'Sorcerers did not study magic - they were born with it leaking out of them. Their power is raw, volatile, and extraordinary, shaped not by learning but by sheer force of will. It is magnificent and occasionally dangerous.',
    role: 'Wild arcane force',
    tendency: 'The DM makes magic feel alive around you. Wild effects and unexpected resonances color your spells. Other magic users recognize your bloodline instinctively - with awe, envy, or fear. Power has a cost you didn\'t choose.',
    playstyle: 'Best for players who love high-ceiling magical moments, lean into narrative chaos, and want their power to feel personal and dangerous.',
  },
  Warlock: {
    description: 'Warlocks sold something to gain power - and they can feel the weight of that deal in every spell they cast. Their patron is always present, always watching, and the power they wield comes with an interest rate no one told them about.',
    role: 'Pact-bound invoker',
    tendency: 'The DM makes your patron\'s influence felt - subtle demands, whispered suggestions, rewards for loyalty. Your power is never fully your own. NPCs sense something wrong about you. The price of your deal comes due at the worst possible time.',
    playstyle: 'Best for players who enjoy moral complexity, a built-in antagonist relationship, and roleplaying a character who is never quite free.',
  },
}

const CLASS_STATS: Record<CharacterClass, string> = {
  Fighter: 'STR / CON',
  Wizard: 'INT / WIS',
  Rogue: 'DEX / INT',
  Cleric: 'WIS / CHA',
  Ranger: 'DEX / WIS',
  Paladin: 'STR / CHA',
  Barbarian: 'STR / CON',
  Bard: 'CHA / DEX',
  Druid: 'WIS / CON',
  Monk: 'DEX / WIS',
  Sorcerer: 'CHA / CON',
  Warlock: 'CHA / INT',
}

// Returns the portrait option(s) for a given race+gender combo. Each race's
// portrait is illustrated with its own distinct look (skin tone, features,
// styling baked into the art itself), so the roster reads as a diverse cast
// without needing separate "light/dark" variant cards to choose between.
function getPortraits(race: Race, gender: Gender): { url: string; label: string }[] {
  const key = race.toLowerCase().replace(/['\s]/g, '-').replace('--', '-')
  const url = gender === 'female' ? `/assets/races/${key}-f.png` : `/assets/races/${key}.png`
  return [{ url, label: 'Portrait' }]
}

function classImageUrl(cls: CharacterClass): string {
  return `/assets/classes/${cls.toLowerCase()}.png`
}

const STEPS = ['Gender', 'Race', 'Look', 'Class', 'Attributes', 'Identity']

const STAT_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const
type StatKey = typeof STAT_KEYS[number]

const STAT_LABELS: Record<StatKey, string> = {
  str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA',
}

const STAT_NAMES: Record<StatKey, string> = {
  str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma',
}

const CLASS_PRIMARY_STAT: Record<CharacterClass, StatKey> = {
  Fighter: 'str', Wizard: 'int', Rogue: 'dex', Cleric: 'wis', Ranger: 'dex',
  Paladin: 'str', Barbarian: 'str', Bard: 'cha', Druid: 'wis', Monk: 'dex',
  Sorcerer: 'cha', Warlock: 'cha',
}

function roll4d6DropLowest(): number {
  const rolls = [1, 2, 3, 4].map(() => Math.floor(Math.random() * 6) + 1)
  rolls.sort((a, b) => a - b)
  return rolls[1] + rolls[2] + rolls[3]
}

function generateSixScores(): number[] {
  return [1, 2, 3, 4, 5, 6].map(() => roll4d6DropLowest()).sort((a, b) => b - a)
}

function statModifier(stat: number): string {
  const mod = Math.floor((stat - 10) / 2)
  return mod >= 0 ? `+${mod}` : `${mod}`
}

export default function CharacterCreate() {
  const { campaignId } = useParams<{ campaignId: string }>()
  const navigate = useNavigate()

  const [step, setStep] = useState(0)
  const [gender, setGender] = useState<Gender | null>(null)
  const [selectedRace, setSelectedRace] = useState<Race | null>(null)
  const [selectedPortrait, setSelectedPortrait] = useState<string | null>(null)
  const [generateAiPortrait, setGenerateAiPortrait] = useState(false)
  const [selectedClass, setSelectedClass] = useState<CharacterClass | null>(null)
  const [name, setName] = useState('')
  const [backstory, setBackstory] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lobbyState, setLobbyState] = useState<{
    characterId: string
    expectedPlayers: number
    readyCount: number
    allowStartNow: boolean
  } | null>(null)
  const [rolledScores, setRolledScores] = useState<number[]>(() => generateSixScores())
  const [assignments, setAssignments] = useState<Partial<Record<StatKey, number>>>({})

  // Lobby realtime subscription - waits until all players have characters
  useEffect(() => {
    if (!lobbyState || !campaignId || !supabaseUrl || !supabaseAnonKey) return

    const supabase = createClient(supabaseUrl, supabaseAnonKey)
    const countReadyCharacters = async () => {
      const { data } = await campaignApi.getParty(campaignId)
      return (data.members || []).filter((m: { character: { is_alive?: boolean } | null }) => m.character?.is_alive !== false && m.character).length
    }

    // Check immediately in case the partner already created their character
    countReadyCharacters().then((readyCount) => {
      if (readyCount >= lobbyState.expectedPlayers) {
        navigate(`/campaign/${campaignId}/play/${lobbyState.characterId}`)
      } else {
        setLobbyState(prev => prev ? { ...prev, readyCount } : prev)
      }
    }).catch(() => {})

    // Subscribe to new character inserts for this campaign
    const channel = supabase
      .channel(`lobby:${campaignId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'characters',
        filter: `campaign_id=eq.${campaignId}`,
      }, () => {
        countReadyCharacters().then((readyCount) => {
          if (readyCount >= lobbyState.expectedPlayers) {
            navigate(`/campaign/${campaignId}/play/${lobbyState.characterId}`)
          } else {
            setLobbyState(prev => prev ? { ...prev, readyCount } : prev)
          }
        }).catch(() => {})
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [lobbyState, campaignId, navigate])

  async function handleCreate() {
    if (!selectedRace || !selectedClass || !name.trim() || !campaignId) return
    setLoading(true)
    setError('')
    try {
      // Build final stats: assigned score + race bonus
      const raceBonuses = RACE_STAT_BONUSES[selectedRace]
      const finalStats = Object.fromEntries(
        STAT_KEYS.map(k => [k, (assignments[k] ?? 10) + (raceBonuses[k] ?? 0)])
      ) as Record<StatKey, number>

      const { data } = await characterApi.create({
        campaignId,
        name,
        race: selectedRace,
        class: selectedClass,
        backstory,
        portraitUrl: generateAiPortrait ? undefined : (selectedPortrait || undefined),
        generatePortrait: generateAiPortrait,
        stats: finalStats,
      })
      const characterId = data.character.id

      // Check if this is a collaborative campaign
      try {
        const { data: campData } = await campaignApi.get(campaignId)
        const preferences = campData.campaign.world_bible?.playerPreferences
        const expectedPlayers = preferences?.targetPlayerCount || preferences?.playerCount || 1
        const shouldWaitForParty = preferences?.waitForParty !== false && expectedPlayers > 1
        if (shouldWaitForParty) {
          // Check current character count
          const { data: partyData } = await campaignApi.getParty(campaignId)
          const readyCount = (partyData.members || []).filter((m: { character: { is_alive?: boolean } | null }) => m.character?.is_alive !== false && m.character).length
          if (readyCount >= expectedPlayers) {
            navigate(`/campaign/${campaignId}/play/${characterId}`)
          } else {
            setLobbyState({
              characterId,
              expectedPlayers,
              readyCount,
              allowStartNow: preferences?.partyIntent === 'collab_start_now' || preferences?.waitForParty === false,
            })
            setLoading(false)
          }
          return
        }
      } catch {
        // On error, fall through to solo navigate
      }

      navigate(`/campaign/${campaignId}/play/${data.character.id}`)
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to create character')
      setLoading(false)
    }
  }

  const portraits = selectedRace && gender ? getPortraits(selectedRace, gender) : []

  // Lobby waiting screen for co-op campaigns
  if (lobbyState) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[#050607] text-parchment-100">
        <div className="absolute inset-0">
          <img src="/media/loading/everrealm-portal-party.png" alt="" className="h-full w-full object-cover opacity-[0.48]" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.94)_0%,rgba(0,0,0,0.58)_50%,rgba(0,0,0,0.9)_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.18)_0%,rgba(0,0,0,0.6)_60%,rgba(0,0,0,0.96)_100%)]" />
        </div>
        <div className="relative z-10 flex min-h-screen items-center justify-center px-5">
          <div className="w-full max-w-lg border border-parchment-100/34 bg-black/62 p-6 text-center shadow-[0_30px_130px_rgba(0,0,0,0.72)] backdrop-blur-md">
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center border border-amber-200/34 bg-amber-300/8">
              <span className="font-fantasy text-2xl text-amber-200">E</span>
            </div>
            <p className="font-fantasy text-[10px] uppercase tracking-[0.3em] text-cyan-200/62">Party Gate</p>
            <h2 className="mt-2 font-fantasy text-4xl text-parchment-100">Your character is ready.</h2>
            <p className="mt-4 font-serif text-sm leading-relaxed text-parchment-200/66">
              Waiting for your party to finish their characters.
            </p>
            <div className="mx-auto mt-6 max-w-xs border border-amber-200/20 bg-amber-300/[0.045] p-4">
              <p className="font-fantasy text-[10px] uppercase tracking-[0.24em] text-amber-200/62">Party Readiness</p>
              <p className="mt-2 font-fantasy text-3xl text-parchment-100">
                {lobbyState.readyCount}/{lobbyState.expectedPlayers}
              </p>
              <div className="mt-3 h-1 bg-white/10">
                <div
                  className="h-full bg-[linear-gradient(90deg,rgba(34,211,238,0.78),rgba(245,158,11,0.92))]"
                  style={{ width: `${Math.min(100, (lobbyState.readyCount / lobbyState.expectedPlayers) * 100)}%` }}
                />
              </div>
            </div>
            {lobbyState.allowStartNow ? (
              <button
                onClick={() => navigate(`/campaign/${campaignId}/play/${lobbyState.characterId}`)}
                className="mt-6 border border-amber-300/46 bg-amber-300/12 px-6 py-3 font-fantasy text-xs uppercase tracking-[0.2em] text-amber-100 transition-all hover:border-amber-200"
              >
                Start now, invite later
              </button>
            ) : (
              <button
                onClick={() => navigate(`/campaign/${campaignId}/brief`)}
                className="mt-6 border border-white/12 px-6 py-3 font-fantasy text-xs uppercase tracking-[0.18em] text-parchment-200/66 transition-all hover:border-white/24 hover:text-parchment-100"
              >
                Return to party lobby
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen overflow-hidden bg-[#050607] text-parchment-100">
      <div className="fixed inset-0 pointer-events-none">
        <picture>
          <source media="(max-width: 767px)" srcSet="/media/everrealm-hero-mobile.png" />
          <img src="/media/everrealm-hero-desktop.png" alt="" className="h-full w-full object-cover opacity-[0.42]" />
        </picture>
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.94)_0%,rgba(0,0,0,0.62)_52%,rgba(0,0,0,0.9)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.18)_0%,rgba(0,0,0,0.58)_58%,rgba(0,0,0,0.96)_100%)]" />
      </div>

      <header className="relative z-10 border-b border-parchment-100/22 bg-black/36 px-5 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1540px] items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center border border-parchment-100/70 bg-black/28">
              <span className="font-fantasy text-xl text-amber-200">E</span>
            </div>
            <div>
              <p className="font-fantasy text-xl uppercase tracking-[0.1em] text-parchment-100">The Everrealm</p>
              <p className="font-serif text-xs uppercase tracking-[0.22em] text-amber-200/54">Soul forge</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate(`/campaign/${campaignId}/brief`)}
            className="border border-parchment-200/14 bg-black/22 px-4 py-2 font-fantasy text-[10px] uppercase tracking-[0.2em] text-parchment-200/66 transition-all hover:border-amber-200/45 hover:text-parchment-100"
          >
            Brief
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid max-w-[1340px] gap-5 px-4 py-5 lg:grid-cols-[330px_minmax(0,1fr)] lg:px-6 lg:py-7">
        <aside className="border border-parchment-100/28 bg-black/56 p-5 backdrop-blur-md">
          <p className="font-fantasy text-[10px] uppercase tracking-[0.28em] text-cyan-200/62">Character Creation</p>
          <h1 className="mt-2 font-fantasy text-4xl leading-none text-parchment-100">Soul Forge</h1>
          <p className="mt-4 font-serif text-sm leading-relaxed text-parchment-200/66">
            Shape the face, blood, path, and story the realm will remember.
          </p>

          <div className="mt-7 space-y-2">
            {STEPS.map((s, i) => (
              <button
                key={s}
                type="button"
                disabled={i > step}
                onClick={() => setStep(i)}
                className="flex w-full items-center justify-between border px-3 py-3 text-left transition-all disabled:cursor-not-allowed"
                style={{
                  borderColor: i === step ? 'rgba(245,158,11,0.52)' : 'rgba(255,255,255,0.08)',
                  background: i === step ? 'rgba(245,158,11,0.08)' : i < step ? 'rgba(34,211,238,0.05)' : 'rgba(255,255,255,0.018)',
                  opacity: i > step ? 0.48 : 1,
                }}
              >
                <span>
                  <span className="block font-fantasy text-[10px] uppercase tracking-[0.18em] text-parchment-200/48">Step {i + 1}</span>
                  <span className="mt-1 block font-fantasy text-sm text-parchment-100">{s}</span>
                </span>
                <span className="font-fantasy text-[10px] text-amber-100/64">{String(i + 1).padStart(2, '0')}</span>
              </button>
            ))}
          </div>

          <div className="mt-6 border border-white/10 bg-white/[0.025] p-4">
            <p className="font-fantasy text-[10px] uppercase tracking-[0.24em] text-amber-200/58">Current Soul</p>
            <div className="mt-3 space-y-2 font-serif text-sm text-parchment-200/62">
              <p>{gender ? `${gender[0].toUpperCase()}${gender.slice(1)}` : 'Identity unset'}</p>
              <p>{selectedRace || 'Heritage unset'}</p>
              <p>{selectedClass || 'Path unset'}</p>
              <p>{name || 'Name unset'}</p>
            </div>
          </div>
        </aside>

        <section className="min-h-[700px] border border-parchment-100/34 bg-black/62 p-5 shadow-[0_30px_130px_rgba(0,0,0,0.72)] backdrop-blur-md sm:p-7">
          <div className="mb-7 flex flex-col justify-between gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-end">
            <div>
              <p className="font-fantasy text-[10px] uppercase tracking-[0.3em] text-cyan-200/62">Step {step + 1} / {STEPS.length}</p>
              <h2 className="mt-2 font-fantasy text-4xl text-parchment-100">{STEPS[step]}</h2>
            </div>
            <div className="flex gap-1">
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className="h-1 w-10 border border-white/10"
                  style={{ background: i <= step ? 'rgba(245,158,11,0.72)' : 'rgba(255,255,255,0.08)' }}
                />
              ))}
            </div>
          </div>

          <div className="mx-auto max-w-4xl">

        {/* STEP 0: Gender */}
        {step === 0 && (
          <div className="animate-fade-in">
            <p className="font-fantasy text-[10px] uppercase tracking-[0.28em] text-amber-200/62">Choose Your Soul</p>
            <p className="mt-2 text-parchment-200/68 font-serif italic text-sm mb-8">This shapes how the world first sees you.</p>
            <div className="grid grid-cols-2 gap-6 max-w-lg">
              {(['male', 'female'] as Gender[]).map(g => (
                <button
                  key={g}
                  onClick={() => { setGender(g); setSelectedPortrait(null) }}
                  className="group relative min-h-[168px] border transition-all duration-300 overflow-hidden"
                  style={gender === g
                    ? { borderColor: 'rgba(245,158,11,0.58)', background: 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(34,211,238,0.05))', boxShadow: '0 0 38px rgba(245,158,11,0.1)' }
                    : { borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.36)' }
                  }
                >
                  <div className="p-10 flex flex-col items-center gap-3">
                    <div
                      className="w-16 h-16 border flex items-center justify-center text-2xl transition-all duration-300"
                      style={gender === g
                        ? { borderColor: 'rgba(245,158,11,0.54)', background: 'rgba(245,158,11,0.1)' }
                        : { borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.035)' }
                      }
                    >
                      {g === 'male' ? 'M' : 'F'}
                    </div>
                    <span className="font-fantasy text-lg capitalize" style={{ color: gender === g ? '#f5e6c8' : 'rgba(180,160,120,0.55)' }}>
                      {g === 'male' ? 'Male' : 'Female'}
                    </span>
                  </div>
                  {gender === g && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-300" />
                  )}
                </button>
              ))}
            </div>
            <div className="mt-10">
              <button
                onClick={() => setStep(1)}
                disabled={!gender}
                className="border border-amber-300/46 bg-amber-300/12 px-6 py-3 font-fantasy text-xs uppercase tracking-[0.2em] text-amber-100 transition-all hover:border-amber-200 disabled:cursor-not-allowed disabled:opacity-35"
              >
                Choose Your Race
              </button>
            </div>
          </div>
        )}

        {/* STEP 1: Race */}
        {step === 1 && (
          <div className="animate-fade-in">
            <p className="font-fantasy text-[10px] uppercase tracking-[0.28em] text-amber-200/62">Your Heritage</p>
            <p className="mt-2 text-parchment-200/68 font-serif italic text-sm mb-6">Where did you come from? What blood runs in your veins?</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {RACES.map(race => {
                const key = race.toLowerCase().replace(/['\s]/g, '-').replace('--', '-')
                const imgUrl = gender === 'female' ? `/assets/races/${key}-f.png` : `/assets/races/${key}.png`
                return (
                  <button
                    key={race}
                    onClick={() => { setSelectedRace(race); setSelectedPortrait(null) }}
                    className="group relative border overflow-hidden transition-all duration-300 text-left"
                    style={selectedRace === race
                      ? { borderColor: 'rgba(245,158,11,0.58)', boxShadow: '0 0 28px rgba(245,158,11,0.12)' }
                      : { borderColor: 'rgba(255,255,255,0.12)' }
                    }
                  >
                    <div className="relative h-32 bg-black overflow-hidden">
                      <img
                        src={imgUrl}
                        alt={race}
                        className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-110"
                        onError={e => {
                          const img = e.target as HTMLImageElement
                          img.src = `/assets/races/${key}.png`
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-transparent" />
                      {selectedRace === race && (
                        <div className="absolute inset-0 border-2 border-amber-200/60" style={{ background: 'rgba(245,158,11,0.08)' }} />
                      )}
                    </div>
                    <div className="p-2.5" style={{ background: selectedRace === race ? 'rgba(245,158,11,0.08)' : 'rgba(0,0,0,0.72)' }}>
                      <p className="font-fantasy text-sm text-parchment-200">{race}</p>
                      <p className="text-xs text-parchment-200/42 mt-0.5 font-serif">
                        {Object.entries(RACE_STAT_BONUSES[race]).map(([k, v]) => `+${v} ${k.toUpperCase()}`).join(' ')}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
            {selectedRace && (
              <div className="mt-4 p-4 border border-white/10 bg-white/[0.025] space-y-3">
                <p className="text-parchment-200 font-serif text-sm leading-relaxed">{RACE_INFO[selectedRace].description}</p>
                <div className="border-t border-white/10 pt-3 space-y-2">
                  <div className="flex gap-2 items-start">
                    <span className="text-xs uppercase tracking-widest font-sans shrink-0 mt-0.5" style={{ color: '#c8922a' }}>Tendency</span>
                    <p className="text-parchment-200/58 font-serif text-xs leading-relaxed">{RACE_INFO[selectedRace].tendency}</p>
                  </div>
                  <div className="flex gap-2 items-start">
                    <span className="text-xs uppercase tracking-widest font-sans shrink-0 mt-0.5" style={{ color: '#c8922a' }}>Suits</span>
                    <p className="text-parchment-200/58 font-serif text-xs leading-relaxed">{RACE_INFO[selectedRace].playstyle}</p>
                  </div>
                </div>
              </div>
            )}
            <div className="mt-8 flex gap-3">
              <button onClick={() => setStep(0)} className="border border-white/12 px-5 py-3 font-fantasy text-xs uppercase tracking-[0.18em] text-parchment-200/66 transition-all hover:border-white/24 hover:text-parchment-100">Back</button>
              <button onClick={() => setStep(2)} disabled={!selectedRace} className="border border-amber-300/46 bg-amber-300/12 px-6 py-3 font-fantasy text-xs uppercase tracking-[0.2em] text-amber-100 transition-all hover:border-amber-200 disabled:cursor-not-allowed disabled:opacity-35">
                Choose Your Look
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Portrait */}
        {step === 2 && selectedRace && gender && (
          <div className="animate-fade-in">
            <p className="font-fantasy text-[10px] uppercase tracking-[0.28em] text-amber-200/62">Your Face</p>
            <p className="mt-2 text-parchment-200/68 font-serif italic text-sm mb-6">Choose how the world sees you.</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {portraits.map((p) => (
                <button
                  key={p.url}
                  onClick={() => { setSelectedPortrait(p.url); setGenerateAiPortrait(false) }}
                  className="group relative border overflow-hidden transition-all duration-300"
                  style={selectedPortrait === p.url && !generateAiPortrait
                    ? { borderColor: 'rgba(245,158,11,0.58)', boxShadow: '0 0 28px rgba(245,158,11,0.14)' }
                    : { borderColor: 'rgba(255,255,255,0.12)' }
                  }
                >
                  <div className="relative aspect-square overflow-hidden">
                    <img
                      src={p.url}
                      alt={p.label}
                      className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-110"
                      onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = 'none' }}
                    />
                    {selectedPortrait === p.url && !generateAiPortrait && (
                      <div className="absolute inset-0 border-2 border-amber-200/70" style={{ background: 'rgba(245,158,11,0.12)' }}>
                        <div className="absolute top-2 right-2 h-5 w-5 border border-amber-100 bg-amber-300" title="Selected" />
                      </div>
                    )}
                  </div>
                  <div className="p-2 text-center" style={{ background: 'rgba(0,0,0,0.72)' }}>
                    <p className="text-xs font-serif text-parchment-200/62">{p.label}</p>
                  </div>
                </button>
              ))}
              <button
                onClick={() => { setGenerateAiPortrait(true); setSelectedPortrait(null) }}
                className="group relative border overflow-hidden transition-all duration-300 flex flex-col items-center justify-center aspect-square"
                style={generateAiPortrait
                  ? { borderColor: 'rgba(34,211,238,0.58)', boxShadow: '0 0 28px rgba(34,211,238,0.16)', background: 'rgba(34,211,238,0.06)' }
                  : { borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.02)' }
                }
              >
                <span className="font-fantasy text-2xl text-cyan-200/70 transition-transform duration-300 group-hover:scale-110">✦</span>
                <p className="mt-2 px-3 text-center text-xs font-serif text-parchment-200/62">Generate a custom AI portrait</p>
                {generateAiPortrait && (
                  <div className="absolute inset-0 border-2 border-cyan-200/60">
                    <div className="absolute top-2 right-2 h-5 w-5 border border-cyan-100 bg-cyan-300/80" title="Selected" />
                  </div>
                )}
              </button>
            </div>
            {generateAiPortrait && (
              <p className="mt-4 text-xs font-serif text-center" style={{ color: 'rgba(125,211,252,0.6)' }}>
                The DM will paint a one-of-a-kind portrait of your character once you finish creation, based on their name, race, class, and backstory.
              </p>
            )}
            {!selectedPortrait && !generateAiPortrait && (
              <p className="mt-4 text-xs font-serif text-center" style={{ color: 'rgba(180,160,120,0.45)' }}>
                Choose a portrait above to continue
              </p>
            )}
            <div className="mt-4 flex gap-3">
              <button onClick={() => setStep(1)} className="border border-white/12 px-5 py-3 font-fantasy text-xs uppercase tracking-[0.18em] text-parchment-200/66 transition-all hover:border-white/24 hover:text-parchment-100">Back</button>
              <button
                onClick={() => setStep(3)}
                disabled={!selectedPortrait && !generateAiPortrait}
                className="border border-amber-300/46 bg-amber-300/12 px-6 py-3 font-fantasy text-xs uppercase tracking-[0.2em] text-amber-100 transition-all hover:border-amber-200 disabled:cursor-not-allowed disabled:opacity-35"
              >
                Choose Your Class
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Class */}
        {step === 3 && (
          <div className="animate-fade-in">
            <p className="font-fantasy text-[10px] uppercase tracking-[0.28em] text-amber-200/62">Your Path</p>
            <p className="mt-2 text-parchment-200/68 font-serif italic text-sm mb-6">How do you survive in a world like this?</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {CLASSES.map(cls => (
                <button
                  key={cls}
                  onClick={() => setSelectedClass(cls)}
                  className="group relative border overflow-hidden transition-all duration-300 text-left"
                  style={selectedClass === cls
                    ? { borderColor: 'rgba(245,158,11,0.58)', boxShadow: '0 0 28px rgba(245,158,11,0.12)' }
                    : { borderColor: 'rgba(255,255,255,0.12)' }
                  }
                >
                  <div className="relative h-28 overflow-hidden">
                    <img
                      src={classImageUrl(cls)}
                      alt={cls}
                      className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-110"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
                    {selectedClass === cls && (
                      <div className="absolute inset-0 border-2 border-amber-200/60" style={{ background: 'rgba(245,158,11,0.08)' }} />
                    )}
                  </div>
                  <div className="p-2.5" style={{ background: selectedClass === cls ? 'rgba(245,158,11,0.08)' : 'rgba(0,0,0,0.72)' }}>
                    <p className="font-fantasy text-sm text-parchment-200">{cls}</p>
                    <p className="text-xs text-parchment-200/42 font-sans mt-0.5">{CLASS_STATS[cls]}</p>
                  </div>
                </button>
              ))}
            </div>
            {selectedClass && (
              <div className="mt-4 p-4 border border-white/10 bg-white/[0.025] space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs border px-2 py-0.5 font-sans uppercase tracking-widest" style={{ borderColor: '#c8922a', color: '#c8922a' }}>{CLASS_INFO[selectedClass].role}</span>
                </div>
                <p className="text-parchment-200 font-serif text-sm leading-relaxed">{CLASS_INFO[selectedClass].description}</p>
                <div className="border-t border-white/10 pt-3 space-y-2">
                  <div className="flex gap-2 items-start">
                    <span className="text-xs uppercase tracking-widest font-sans shrink-0 mt-0.5" style={{ color: '#c8922a' }}>Tendency</span>
                    <p className="text-parchment-200/58 font-serif text-xs leading-relaxed">{CLASS_INFO[selectedClass].tendency}</p>
                  </div>
                  <div className="flex gap-2 items-start">
                    <span className="text-xs uppercase tracking-widest font-sans shrink-0 mt-0.5" style={{ color: '#c8922a' }}>Suits</span>
                    <p className="text-parchment-200/58 font-serif text-xs leading-relaxed">{CLASS_INFO[selectedClass].playstyle}</p>
                  </div>
                </div>
              </div>
            )}
            <div className="mt-8 flex gap-3">
              <button onClick={() => setStep(2)} className="border border-white/12 px-5 py-3 font-fantasy text-xs uppercase tracking-[0.18em] text-parchment-200/66 transition-all hover:border-white/24 hover:text-parchment-100">Back</button>
              <button onClick={() => setStep(4)} disabled={!selectedClass} className="border border-amber-300/46 bg-amber-300/12 px-6 py-3 font-fantasy text-xs uppercase tracking-[0.2em] text-amber-100 transition-all hover:border-amber-200 disabled:cursor-not-allowed disabled:opacity-35">
                Roll Attributes
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Attributes */}
        {step === 4 && selectedRace && selectedClass && (
          <div className="animate-fade-in">
            <p className="font-fantasy text-[10px] uppercase tracking-[0.28em] text-amber-200/62">Your Attributes</p>
            <p className="mt-2 text-parchment-200/68 font-serif italic text-sm mb-6">
              Roll 4d6, drop the lowest - assign each score to a stat. Race bonuses apply on top.
            </p>

            {/* Rolled scores pool */}
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs uppercase tracking-widest font-sans" style={{ color: '#c8922a' }}>Rolled Scores</span>
                <button
                  onClick={() => {
                    setRolledScores(generateSixScores())
                    setAssignments({})
                  }}
                  className="px-3 py-2 border transition-all font-fantasy text-[10px] uppercase tracking-[0.16em]"
                  style={{ borderColor: 'rgba(200,146,42,0.4)', color: '#c8922a', background: 'rgba(200,146,42,0.06)' }}
                >
                  Re-roll
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {rolledScores.map((score, i) => {
                  // Determine how many times this score has been assigned vs how many times it appears before index i
                  const assignedCount = Object.values(assignments).filter(v => v === score).length
                  const appearsUpToHere = rolledScores.slice(0, i + 1).filter(s => s === score).length
                  const isConsumed = assignedCount >= appearsUpToHere
                  return (
                    <div
                      key={i}
                      className="w-12 h-12 flex items-center justify-center border font-fantasy text-lg transition-all"
                      style={
                        isConsumed
                          ? { borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(180,160,120,0.28)', background: 'rgba(255,255,255,0.018)' }
                          : { borderColor: 'rgba(245,158,11,0.5)', color: '#f2dfb6', background: 'rgba(245,158,11,0.08)' }
                      }
                    >
                      {score}
                    </div>
                  )
                })}
              </div>
              <p className="text-xs text-parchment-200/42 mt-2 font-serif">
                {Object.keys(assignments).length}/6 assigned
                {Object.keys(assignments).length === 6 ? ' - all stats assigned!' : ''}
              </p>
            </div>

            {/* Stat assignment grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
              {STAT_KEYS.map(statKey => {
                const raceBonuses = RACE_STAT_BONUSES[selectedRace]
                const raceBonus = raceBonuses[statKey] ?? 0
                const assigned = assignments[statKey]
                const finalVal = assigned !== undefined ? assigned + raceBonus : null
                const isPrimary = CLASS_PRIMARY_STAT[selectedClass] === statKey

                // Available scores: rolledScores minus already-assigned ones (accounting for duplicates)
                const availableScores = [...rolledScores]
                const tempUsed = Object.entries(assignments)
                  .filter(([k]) => k !== statKey)
                  .map(([, v]) => v)
                for (const used of tempUsed) {
                  const idx = availableScores.indexOf(used)
                  if (idx !== -1) availableScores.splice(idx, 1)
                }
                const uniqueAvailable = [...new Set(availableScores)].sort((a, b) => b - a)

                return (
                  <div
                    key={statKey}
                    className="border p-3 transition-all"
                    style={
                      isPrimary
                        ? { borderColor: 'rgba(245,158,11,0.52)', background: 'rgba(245,158,11,0.06)' }
                        : { borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.38)' }
                    }
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="font-sans text-xs uppercase tracking-widest font-bold" style={{ color: isPrimary ? '#c8922a' : '#d4c5a0' }}>
                          {STAT_LABELS[statKey]}
                        </span>
                        {isPrimary && (
                          <span className="ml-1.5 text-xs font-sans" style={{ color: 'rgba(200,146,42,0.7)' }}>* recommended</span>
                        )}
                      </div>
                      {raceBonus > 0 && (
                        <span className="text-xs font-sans" style={{ color: 'rgba(200,146,42,0.6)' }}>+{raceBonus} race</span>
                      )}
                    </div>
                    <p className="text-xs text-parchment-200/42 font-serif mb-2">{STAT_NAMES[statKey]}</p>

                    <select
                      value={assigned ?? ''}
                      onChange={e => {
                        const val = e.target.value
                        setAssignments(prev => {
                          const next = { ...prev }
                          if (val === '') {
                            delete next[statKey]
                          } else {
                            next[statKey] = parseInt(val, 10)
                          }
                          return next
                        })
                      }}
                      className="w-full text-sm font-sans py-1.5 px-2 border appearance-none cursor-pointer"
                      style={{
                        background: 'rgba(0,0,0,0.72)',
                        borderColor: assigned !== undefined ? 'rgba(245,158,11,0.52)' : 'rgba(255,255,255,0.12)',
                        color: assigned !== undefined ? '#f2dfb6' : 'rgba(180,160,120,0.45)',
                      }}
                    >
                      <option value="">- assign -</option>
                      {assigned !== undefined && (
                        <option value={assigned}>{assigned}</option>
                      )}
                      {uniqueAvailable.map(score => (
                        <option key={score} value={score}>{score}</option>
                      ))}
                    </select>

                    {finalVal !== null && (
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs text-parchment-200/42 font-sans">
                          {assigned}{raceBonus > 0 ? ` +${raceBonus}` : ''} =
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-fantasy text-lg" style={{ color: '#f2dfb6' }}>{finalVal}</span>
                          <span
                            className="text-xs font-sans font-bold px-1.5 py-0.5 border"
                            style={{
                              borderColor: finalVal >= 16 ? '#c8922a' : finalVal <= 8 ? '#c0392b' : '#374151',
                              color: finalVal >= 16 ? '#c8922a' : finalVal <= 8 ? '#c0392b' : '#6b7280',
                              background: 'rgba(0,0,0,0.3)',
                            }}
                          >
                            {statModifier(finalVal)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="mt-8 flex gap-3">
              <button onClick={() => setStep(3)} className="border border-white/12 px-5 py-3 font-fantasy text-xs uppercase tracking-[0.18em] text-parchment-200/66 transition-all hover:border-white/24 hover:text-parchment-100">Back</button>
              <button
                onClick={() => setStep(5)}
                disabled={Object.keys(assignments).length < 6}
                className="border border-amber-300/46 bg-amber-300/12 px-6 py-3 font-fantasy text-xs uppercase tracking-[0.2em] text-amber-100 transition-all hover:border-amber-200 disabled:cursor-not-allowed disabled:opacity-35"
              >
                Name Your Legend
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: Name & Review */}
        {step === 5 && (
          <div className="animate-fade-in">
            <p className="font-fantasy text-[10px] uppercase tracking-[0.28em] text-amber-200/62">Your Legend</p>
            <p className="mt-2 text-parchment-200/68 font-serif italic text-sm mb-8">What do they call you? What brought you here?</p>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Form */}
              <div className="space-y-5">
                <div>
                  <label className="block font-fantasy text-[10px] uppercase tracking-[0.22em] text-amber-200/58 mb-2">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full border border-amber-300/28 bg-black/50 px-4 py-3 text-lg font-serif text-parchment-100 outline-none placeholder:text-parchment-200/30"
                    placeholder="What do they call you?"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block font-fantasy text-[10px] uppercase tracking-[0.22em] text-amber-200/58 mb-2">
                    Backstory <span className="font-serif text-parchment-200/34 normal-case tracking-normal">(optional - the DM reads this)</span>
                  </label>
                  <textarea
                    value={backstory}
                    onChange={e => setBackstory(e.target.value)}
                    className="w-full h-36 resize-none border border-cyan-200/18 bg-black/50 px-4 py-3 font-serif text-sm text-parchment-100 outline-none placeholder:text-parchment-200/30"
                    placeholder="Who were you before? What drives you? What have you lost?"
                  />
                </div>
              </div>

              {/* Preview card */}
              <div>
                <p className="font-fantasy text-[10px] uppercase tracking-[0.22em] text-cyan-200/58 mb-3">Preview</p>
                <div className="border border-white/12 bg-black/48 overflow-hidden">
                  {selectedPortrait && !generateAiPortrait && (
                    <div className="relative h-48 overflow-hidden">
                      <img src={selectedPortrait} alt="portrait" className="w-full h-full object-cover object-top" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
                      <div className="absolute bottom-3 left-4 right-4">
                        <p className="font-fantasy text-xl text-parchment-100">{name || '-'}</p>
                        <p className="text-parchment-200/58 text-xs font-serif">{selectedRace} {selectedClass}</p>
                      </div>
                    </div>
                  )}
                  {generateAiPortrait && (
                    <div className="relative h-48 overflow-hidden flex items-center justify-center" style={{ background: 'rgba(34,211,238,0.05)' }}>
                      <div className="text-center px-4">
                        <span className="font-fantasy text-2xl text-cyan-200/50">✦</span>
                        <p className="mt-2 font-fantasy text-xl text-parchment-100">{name || '-'}</p>
                        <p className="text-parchment-200/58 text-xs font-serif">{selectedRace} {selectedClass}</p>
                        <p className="mt-2 text-cyan-200/50 text-[11px] font-serif italic">A custom portrait will be painted on arrival</p>
                      </div>
                    </div>
                  )}
                  <div className="p-4 space-y-2">
                    {selectedClass && (
                      <div className="space-y-1">
                        <span className="text-xs border px-1.5 py-0.5 font-sans uppercase tracking-widest" style={{ borderColor: '#c8922a', color: '#c8922a' }}>{CLASS_INFO[selectedClass].role}</span>
                        <p className="text-parchment-200/58 font-serif text-xs italic">{CLASS_INFO[selectedClass].description.split('. ')[0]}.</p>
                      </div>
                    )}
                    {selectedRace && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {Object.entries(RACE_STAT_BONUSES[selectedRace]).map(([stat, bonus]) => (
                          <span key={stat} className="text-xs border border-white/12 px-2 py-0.5 text-parchment-200/58 font-sans">
                            +{bonus} {stat.toUpperCase()}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <div className="mt-4 border border-red-300/30 bg-red-500/10 px-3 py-2 text-sm text-red-100/82">
                {error}
              </div>
            )}

            <div className="mt-8 flex gap-3">
              <button onClick={() => setStep(4)} className="border border-white/12 px-5 py-3 font-fantasy text-xs uppercase tracking-[0.18em] text-parchment-200/66 transition-all hover:border-white/24 hover:text-parchment-100">Back</button>
              <button
                onClick={handleCreate}
                disabled={!name.trim() || loading}
                className="border border-amber-300/46 bg-amber-300/12 px-6 py-3 font-fantasy text-xs uppercase tracking-[0.2em] text-amber-100 transition-all hover:border-amber-200 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {loading ? <span className="animate-pulse">Forging your legend...</span> : 'Enter the World'}
              </button>
            </div>
          </div>
        )}
          </div>
        </section>
      </main>
    </div>
  )
}
