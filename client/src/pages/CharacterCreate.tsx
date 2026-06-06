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
}

const RACES: Race[] = ['Human', 'Elf', 'Dwarf', 'Halfling', 'Gnome', 'Half-Orc', 'Tiefling', 'Dragonborn']
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
    description: 'Humans are the most adaptable and ambitious of all races, found in every corner of the known world. Their brief lives drive them to achieve quickly â€” to build empires, forge legends, and leave marks that outlast them.',
    tendency: 'The DM leans into human ambition and politics. Faction leaders treat you as a wildcard worth cultivating. Doors open through sheer force of personality â€” but rivals watch your rise closely.',
    playstyle: 'Best for players who want maximum flexibility and no narrative baggage â€” a blank slate to write their own legend.',
  },
  Elf: {
    description: 'Elves are ancient beings who walk the world with the quiet confidence of those who have seen civilizations rise and crumble. They carry the weight of long memory â€” and the loneliness that comes with outliving everything they love.',
    tendency: 'The DM weaves in ancient lore hooks and forgotten histories. Ruins hold personal meaning. NPCs from old bloodlines treat you with earned respect â€” or ancient resentment.',
    playstyle: 'Best for players who love world-building investment, backstory depth, and playing someone who knows more than they let on.',
  },
  Dwarf: {
    description: 'Dwarves are carved from the bones of the earth â€” enduring, stubborn, and fiercely loyal to their kin and their oaths. A dwarf never forgets a debt, whether it is owed to them or by them.',
    tendency: 'The DM introduces clan politics, grudges with long histories, and underground threats. Your resilience earns respect from hard people. Slights are remembered and returned.',
    playstyle: 'Best for players who want a tough, dependable character with strong cultural ties and a history that the world actually cares about.',
  },
  Halfling: {
    description: 'Halflings are small in stature but surprisingly difficult to kill â€” luck follows them the way trouble follows everyone else. They thrive in the cracks of the world, moving unseen and surviving by wit and warmth.',
    tendency: 'The DM narrates moments where the world underestimates you â€” and you exploit it. Luck turns in your favor at unexpected moments. Common folk trust you instinctively; nobles dismiss you at their peril.',
    playstyle: 'Best for players who enjoy being the underdog, using charm and cleverness over brute force, and surprising the table.',
  },
  Gnome: {
    description: 'Gnomes are relentlessly curious beings whose connection to the arcane runs deep and strange. They see the world as a puzzle to be solved, a mechanism to be taken apart â€” and they have absolutely no patience for boredom.',
    tendency: 'The DM seeds arcane mysteries and mechanical curiosities that only you notice. Magic items have history you can read. Scholars seek you out. Your inventions sometimes work perfectly and occasionally terribly.',
    playstyle: 'Best for players who love roleplaying eccentricity, tinkering with the world\'s lore, and finding creative off-label solutions.',
  },
  'Half-Orc': {
    description: 'Half-Orcs carry the blood of two worlds and the welcome of neither â€” they are defined by what they overcome. They are frightening when angered and awe-inspiring when they choose mercy, and both leave an impression.',
    tendency: 'The DM gives weight to your physical presence. Guards step aside. Thugs reconsider. Brute-force solutions are respected, not just tolerated. The world watches to see what you do with your power.',
    playstyle: 'Best for players who want a character defined by inner conflict, physical dominance, and the ongoing project of proving the world wrong.',
  },
  Tiefling: {
    description: 'Tieflings bear the infernal mark of a pact made generations ago â€” horns, tail, and eyes that glow with hellish light. The world does not trust them, and some have decided the world can burn for it.',
    tendency: 'NPCs are wary or hostile by default until you prove yourself. The DM introduces social friction and moments of prejudice â€” and gives you the chance to face it down, exploit it, or transcend it entirely.',
    playstyle: 'Best for players who relish playing a complex outsider, earning trust the hard way, and wielding a dark aesthetic with sharp emotional depth.',
  },
  Dragonborn: {
    description: 'Dragonborn are proud warriors of draconic heritage â€” scales like armor, breath like a weapon, and a culture built entirely on honor and legacy. They do not start fights. They finish them.',
    tendency: 'The DM acknowledges your lineage. Dragon-cults take notice. Enemies who survive speak of you. Your ancestry opens doors in ancient places â€” and attracts predators who want to claim what you carry.',
    playstyle: 'Best for players who want a dignified, honor-driven character who leaves a mark everywhere they go and never needs to raise their voice.',
  },
}

type ClassInfoFull = ClassInfo

const CLASS_INFO: Record<CharacterClass, ClassInfoFull> = {
  Fighter: {
    description: 'Fighters are masters of armed combat â€” weapon and shield, strategy and steel. They don\'t rely on magic or luck; they win through relentless training, superior technique, and the capacity to take as much punishment as they dish out.',
    role: 'Frontline tank',
    tendency: 'The DM highlights tactical options and battlefield control. Enemies respect your threat â€” they focus you, fear you, and plan around you. Duels and challenges of honor find their way to you first.',
    playstyle: 'Best for players who want reliable, consistent power without resource management â€” always effective, always in the thick of it.',
  },
  Wizard: {
    description: 'Wizards are scholars of arcane forces â€” they reshape reality through years of obsessive study. Fragile in body but devastating in output, a wizard turns intellect into the most dangerous weapon in the world.',
    role: 'Arcane artillery',
    tendency: 'The DM seeds lore puzzles, ancient tomes, and magical phenomena that reward your knowledge. Sages and scholars recognize you. Magic-using enemies treat you as their most dangerous target.',
    playstyle: 'Best for players who love preparation, creative problem-solving, and the tactical satisfaction of having exactly the right spell for the situation.',
  },
  Rogue: {
    description: 'Rogues are precision instruments â€” they don\'t fight fair and see no reason they should. Working from shadow, misdirection, and exploitation of vulnerability, they turn every encounter into a puzzle with a lethal solution.',
    role: 'Shadow striker',
    tendency: 'The DM always narrates stealth opportunities. In social situations, your sharp eye catches details others miss. When you strike, the narration acknowledges the exact moment of vulnerability you exploited.',
    playstyle: 'Best for players who love feeling clever, solving encounters laterally, and having one spectacular moment per fight rather than sustained pressure.',
  },
  Cleric: {
    description: 'Clerics are divine conduits â€” mortals who have opened themselves to the will of a god and carry that god\'s power into the world. They heal, protect, and when roused to holy wrath, they are terrifying.',
    role: 'Divine support',
    tendency: 'The DM creates moments of divine resonance â€” your god notices, sometimes responds, occasionally tests you. Faith matters: NPCs with spiritual needs are drawn to you, and dark forces treat you as a threat worth neutralizing.',
    playstyle: 'Best for players who enjoy being the linchpin of the party, blending support and offense, and roleplaying devotion to something larger than themselves.',
  },
  Ranger: {
    description: 'Rangers are hunters who have mastered the wilderness and carry that mastery into every environment. They are patient, precise, and self-sufficient â€” more at home in the dark forest than in any city.',
    role: 'Skirmisher / tracker',
    tendency: 'The DM enriches environmental details for you â€” tracks, scents, signs of passage that others miss. Wilderness threats feel navigable. Quarry is rarely able to hide from you for long.',
    playstyle: 'Best for players who love exploration, being ahead of the party in every sense, and the quiet satisfaction of knowing the terrain better than anyone.',
  },
  Paladin: {
    description: 'Paladins are oath-bound warriors who combine martial excellence with divine power. They are the most uncompromising characters in any story â€” righteous, relentless, and capable of terrible mercy.',
    role: 'Holy vanguard',
    tendency: 'The DM creates moral dilemmas with no clean answer and makes your oath feel real. Temptation comes for you specifically. Divine moments occur when you need them most â€” or when you deserve them least.',
    playstyle: 'Best for players who want to feel the weight of conviction, wrestle with genuine ethical complexity, and occasionally smite something into dust.',
  },
  Barbarian: {
    description: 'Barbarians tap into a primal fury that transforms them into something that hits harder, takes more punishment, and simply refuses to die. They are not reckless â€” they are uncaged.',
    role: 'Berserker tank',
    tendency: 'The DM escalates encounters around your presence â€” you attract the big threats. Violence respects violence: tribal warriors and soldiers treat you differently than they treat anyone else. Your rages become story moments.',
    playstyle: 'Best for players who want to feel physically unstoppable and enjoy the catharsis of hitting something very, very hard.',
  },
  Bard: {
    description: 'Bards are the Swiss Army knife of adventurers â€” they fight, they charm, they know a little about everything, and they talk their way through doors that others would have kicked down. Their power is in their adaptability.',
    role: 'Social chameleon / support',
    tendency: 'The DM rewards social creativity. The right word at the right moment changes outcomes. NPCs remember you specifically, and their reactions are colored by whatever impression you made. Information finds you.',
    playstyle: 'Best for players who love roleplay, want to influence every scene even when not fighting, and enjoy being the most interesting person in any room.',
  },
  Druid: {
    description: 'Druids are nature\'s will given form â€” they do not control nature, they speak for it. Their magic is ancient, their patience deep, and their capacity for transformation unsettling to those who thought they understood the world.',
    role: 'Nature shaper',
    tendency: 'The DM makes the natural world feel alive and reactive. Animals behave differently around you. Corruption of nature is personal. Spirits and ancient powers take notice â€” and sometimes intervene on your behalf.',
    playstyle: 'Best for players who enjoy versatility, thematic resonance, and the satisfaction of being plugged into the world\'s hidden rhythms.',
  },
  Monk: {
    description: 'Monks are living weapons â€” bodies disciplined into instruments of precision force. They are fast, efficient, and utterly self-reliant. Their power comes from years of brutal training, not gift or luck.',
    role: 'Precision striker',
    tendency: 'The DM highlights moments of stillness in chaos â€” your calm in a crisis reads as unnerving to enemies and inspiring to allies. Spiritual challenges and tests of will find their way to you. Your presence changes the texture of a room.',
    playstyle: 'Best for players who enjoy mechanically precise play, a strong personal code, and the fantasy of facing danger empty-handed and winning.',
  },
  Sorcerer: {
    description: 'Sorcerers did not study magic â€” they were born with it leaking out of them. Their power is raw, volatile, and extraordinary, shaped not by learning but by sheer force of will. It is magnificent and occasionally dangerous.',
    role: 'Wild arcane force',
    tendency: 'The DM makes magic feel alive around you. Wild effects and unexpected resonances color your spells. Other magic users recognize your bloodline instinctively â€” with awe, envy, or fear. Power has a cost you didn\'t choose.',
    playstyle: 'Best for players who love high-ceiling magical moments, lean into narrative chaos, and want their power to feel personal and dangerous.',
  },
  Warlock: {
    description: 'Warlocks sold something to gain power â€” and they can feel the weight of that deal in every spell they cast. Their patron is always present, always watching, and the power they wield comes with an interest rate no one told them about.',
    role: 'Pact-bound invoker',
    tendency: 'The DM makes your patron\'s influence felt â€” subtle demands, whispered suggestions, rewards for loyalty. Your power is never fully your own. NPCs sense something wrong about you. The price of your deal comes due at the worst possible time.',
    playstyle: 'Best for players who enjoy moral complexity, a built-in antagonist relationship, and roleplaying a character who is never quite free.',
  },
}

const CLASS_STATS: Record<CharacterClass, string> = {
  Fighter: 'STR Â· CON',
  Wizard: 'INT Â· WIS',
  Rogue: 'DEX Â· INT',
  Cleric: 'WIS Â· CHA',
  Ranger: 'DEX Â· WIS',
  Paladin: 'STR Â· CHA',
  Barbarian: 'STR Â· CON',
  Bard: 'CHA Â· DEX',
  Druid: 'WIS Â· CON',
  Monk: 'DEX Â· WIS',
  Sorcerer: 'CHA Â· CON',
  Warlock: 'CHA Â· INT',
}

// Returns all portrait options for a given race+gender combo
function getPortraits(race: Race, gender: Gender): { url: string; label: string }[] {
  const key = race.toLowerCase().replace(/['\s]/g, '-').replace('--', '-')
  const portraits: { url: string; label: string }[] = []

  if (gender === 'male') {
    // Default (usually male)
    portraits.push({ url: `/assets/races/${key}.png`, label: 'Classic' })
    // Black variant
    if (['human', 'elf', 'dwarf', 'halfling', 'gnome'].includes(key)) {
      portraits.push({ url: `/assets/races/${key}-m-black.png`, label: 'Dark' })
    }
  } else {
    portraits.push({ url: `/assets/races/${key}-f.png`, label: 'Classic' })
    if (['human', 'elf', 'dwarf', 'halfling', 'gnome'].includes(key)) {
      portraits.push({ url: `/assets/races/${key}-f-black.png`, label: 'Dark' })
    }
  }

  return portraits
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
  const [selectedClass, setSelectedClass] = useState<CharacterClass | null>(null)
  const [name, setName] = useState('')
  const [backstory, setBackstory] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lobbyState, setLobbyState] = useState<{ characterId: string; expectedPlayers: number } | null>(null)
  const [rolledScores, setRolledScores] = useState<number[]>(() => generateSixScores())
  const [assignments, setAssignments] = useState<Partial<Record<StatKey, number>>>({})

  // Lobby realtime subscription â€” waits until all players have characters
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
        portraitUrl: selectedPortrait || undefined,
        stats: finalStats,
      })
      const characterId = data.character.id

      // Check if this is a collaborative campaign
      try {
        const { data: campData } = await campaignApi.get(campaignId)
        const expectedPlayers = campData.campaign.world_bible?.playerPreferences?.playerCount || 1
        if (expectedPlayers > 1) {
          // Check current character count
          const { data: partyData } = await campaignApi.getParty(campaignId)
          const readyCount = (partyData.members || []).filter((m: { character: { is_alive?: boolean } | null }) => m.character?.is_alive !== false && m.character).length
          if (readyCount >= expectedPlayers) {
            navigate(`/campaign/${campaignId}/play/${characterId}`)
          } else {
            setLobbyState({ characterId, expectedPlayers })
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'radial-gradient(ellipse at center top, #0f1923 0%, #070d14 100%)' }}>
        <div className="text-center max-w-md px-8">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full border-2 flex items-center justify-center" style={{
            borderColor: 'rgba(200,146,42,0.4)',
            boxShadow: '0 0 40px rgba(200,146,42,0.15)',
          }}>
            <span className="font-fantasy text-2xl" style={{ color: '#c8922a' }}>âš”</span>
          </div>
          <h2 className="font-fantasy text-3xl text-parchment-200 mb-3">Your character is ready.</h2>
          <p className="font-serif text-sm leading-relaxed mb-6" style={{ color: 'rgba(180,160,120,0.6)' }}>
            Waiting for your companion to finish their character...
          </p>
          <div className="flex items-center justify-center gap-2 mb-8">
            {[0, 1, 2].map(j => (
              <div key={j} className="w-2 h-2 rounded-full" style={{
                background: 'rgba(200,146,42,0.6)',
                animation: `bounce 1.2s ease-in-out ${j * 0.2}s infinite`,
              }} />
            ))}
          </div>
          <button
            onClick={() => navigate(`/campaign/${campaignId}/play/${lobbyState.characterId}`)}
            className="font-serif text-sm px-6 py-2.5 transition-all"
            style={{
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(180,160,120,0.5)',
            }}
          >
            Start Solo for now â†’
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'radial-gradient(ellipse at center top, #0f1923 0%, #070d14 100%)' }}>
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-800/60">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs uppercase tracking-widest text-ember-400/60 font-sans mb-1">Character Creation</p>
          <div className="flex items-center gap-3">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-full border flex items-center justify-center text-xs font-sans transition-all duration-300"
                    style={i < step
                      ? { borderColor: '#c0392b', background: '#641e16', color: '#f5e6c8' }
                      : i === step
                      ? { borderColor: '#c0392b', background: 'rgba(192,57,43,0.15)', color: '#c0392b' }
                      : { borderColor: '#374151', background: 'transparent', color: '#4b5563' }
                    }
                  >
                    {i < step ? 'âœ“' : i + 1}
                  </div>
                  <span className={`text-xs font-sans hidden sm:block ${i === step ? 'text-parchment-200' : i < step ? 'text-slate-500' : 'text-slate-700'}`}>
                    {s}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className="w-8 h-px" style={{ background: i < step ? '#641e16' : '#1f2937' }} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-3xl mx-auto w-full px-6 py-8">

        {/* STEP 0: Gender */}
        {step === 0 && (
          <div className="animate-fade-in">
            <h2 className="font-fantasy text-2xl text-parchment-200 mb-2">Who Are You?</h2>
            <p className="text-slate-500 font-serif italic text-sm mb-8">This shapes your appearance in the world.</p>
            <div className="grid grid-cols-2 gap-6 max-w-lg">
              {(['male', 'female'] as Gender[]).map(g => (
                <button
                  key={g}
                  onClick={() => { setGender(g); setSelectedPortrait(null) }}
                  className="group relative border transition-all duration-300 overflow-hidden"
                  style={gender === g
                    ? { borderColor: '#c0392b', background: 'rgba(192,57,43,0.08)', boxShadow: '0 0 20px rgba(192,57,43,0.2)' }
                    : { borderColor: '#1f2937', background: 'rgba(15,25,35,0.8)' }
                  }
                >
                  <div className="p-10 flex flex-col items-center gap-3">
                    <div
                      className="w-16 h-16 rounded-full border-2 flex items-center justify-center text-2xl transition-all duration-300"
                      style={gender === g
                        ? { borderColor: '#c0392b', background: 'rgba(192,57,43,0.15)' }
                        : { borderColor: '#374151', background: 'rgba(15,25,35,0.5)' }
                      }
                    >
                      {g === 'male' ? 'â™‚' : 'â™€'}
                    </div>
                    <span className="font-fantasy text-lg capitalize" style={{ color: gender === g ? '#f5e6c8' : '#6b7280' }}>
                      {g === 'male' ? 'Male' : 'Female'}
                    </span>
                  </div>
                  {gender === g && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-ember-400" />
                  )}
                </button>
              ))}
            </div>
            <div className="mt-10">
              <button
                onClick={() => setStep(1)}
                disabled={!gender}
                className="fantasy-btn px-8 disabled:opacity-40"
              >
                Choose Your Race â†’
              </button>
            </div>
          </div>
        )}

        {/* STEP 1: Race */}
        {step === 1 && (
          <div className="animate-fade-in">
            <h2 className="font-fantasy text-2xl text-parchment-200 mb-2">Your Heritage</h2>
            <p className="text-slate-500 font-serif italic text-sm mb-6">Where did you come from? What blood runs in your veins?</p>
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
                      ? { borderColor: '#c0392b', boxShadow: '0 0 15px rgba(192,57,43,0.3)' }
                      : { borderColor: '#1f2937' }
                    }
                  >
                    <div className="relative h-32 bg-slate-900 overflow-hidden">
                      <img
                        src={imgUrl}
                        alt={race}
                        className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-110"
                        onError={e => {
                          const img = e.target as HTMLImageElement
                          img.src = `/assets/races/${key}.png`
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent" />
                      {selectedRace === race && (
                        <div className="absolute inset-0 border-2 border-ember-400/60" style={{ background: 'rgba(192,57,43,0.1)' }} />
                      )}
                    </div>
                    <div className="p-2.5" style={{ background: selectedRace === race ? 'rgba(192,57,43,0.06)' : '#0a0e18' }}>
                      <p className="font-fantasy text-sm text-parchment-200">{race}</p>
                      <p className="text-xs text-slate-600 mt-0.5 font-serif">
                        {Object.entries(RACE_STAT_BONUSES[race]).map(([k, v]) => `+${v} ${k.toUpperCase()}`).join(' ')}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
            {selectedRace && (
              <div className="mt-4 p-4 border border-slate-800 bg-slate-900/50 space-y-3">
                <p className="text-parchment-200 font-serif text-sm leading-relaxed">{RACE_INFO[selectedRace].description}</p>
                <div className="border-t border-slate-800 pt-3 space-y-2">
                  <div className="flex gap-2 items-start">
                    <span className="text-xs uppercase tracking-widest font-sans shrink-0 mt-0.5" style={{ color: '#c8922a' }}>Tendency</span>
                    <p className="text-slate-400 font-serif text-xs leading-relaxed">{RACE_INFO[selectedRace].tendency}</p>
                  </div>
                  <div className="flex gap-2 items-start">
                    <span className="text-xs uppercase tracking-widest font-sans shrink-0 mt-0.5" style={{ color: '#c8922a' }}>Suits</span>
                    <p className="text-slate-400 font-serif text-xs leading-relaxed">{RACE_INFO[selectedRace].playstyle}</p>
                  </div>
                </div>
              </div>
            )}
            <div className="mt-8 flex gap-3">
              <button onClick={() => setStep(0)} className="fantasy-btn-secondary">â† Back</button>
              <button onClick={() => setStep(2)} disabled={!selectedRace} className="fantasy-btn px-8 disabled:opacity-40">
                Choose Your Look â†’
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Portrait */}
        {step === 2 && selectedRace && gender && (
          <div className="animate-fade-in">
            <h2 className="font-fantasy text-2xl text-parchment-200 mb-2">Your Face</h2>
            <p className="text-slate-500 font-serif italic text-sm mb-6">Choose how the world sees you.</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {portraits.map((p) => (
                <button
                  key={p.url}
                  onClick={() => setSelectedPortrait(p.url)}
                  className="group relative border overflow-hidden transition-all duration-300"
                  style={selectedPortrait === p.url
                    ? { borderColor: '#c0392b', boxShadow: '0 0 20px rgba(192,57,43,0.4)' }
                    : { borderColor: '#1f2937' }
                  }
                >
                  <div className="relative aspect-square overflow-hidden">
                    <img
                      src={p.url}
                      alt={p.label}
                      className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-110"
                      onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = 'none' }}
                    />
                    {selectedPortrait === p.url && (
                      <div className="absolute inset-0 border-2 border-ember-400" style={{ background: 'rgba(192,57,43,0.15)' }}>
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-ember-500 flex items-center justify-center text-white text-xs">âœ“</div>
                      </div>
                    )}
                  </div>
                  <div className="p-2 text-center" style={{ background: '#0a0e18' }}>
                    <p className="text-xs font-serif text-slate-400">{p.label}</p>
                  </div>
                </button>
              ))}
            </div>
            {!selectedPortrait && (
              <p className="mt-4 text-xs font-serif text-center" style={{ color: 'rgba(180,160,120,0.45)' }}>
                Choose a portrait above to continue
              </p>
            )}
            <div className="mt-4 flex gap-3">
              <button onClick={() => setStep(1)} className="fantasy-btn-secondary">â† Back</button>
              <button
                onClick={() => setStep(3)}
                disabled={!selectedPortrait}
                className="fantasy-btn px-8 disabled:opacity-40"
              >
                Choose Your Class â†’
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Class */}
        {step === 3 && (
          <div className="animate-fade-in">
            <h2 className="font-fantasy text-2xl text-parchment-200 mb-2">Your Path</h2>
            <p className="text-slate-500 font-serif italic text-sm mb-6">How do you survive in a world like this?</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {CLASSES.map(cls => (
                <button
                  key={cls}
                  onClick={() => setSelectedClass(cls)}
                  className="group relative border overflow-hidden transition-all duration-300 text-left"
                  style={selectedClass === cls
                    ? { borderColor: '#c0392b', boxShadow: '0 0 15px rgba(192,57,43,0.25)' }
                    : { borderColor: '#1f2937' }
                  }
                >
                  <div className="relative h-28 overflow-hidden">
                    <img
                      src={classImageUrl(cls)}
                      alt={cls}
                      className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-110"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent" />
                    {selectedClass === cls && (
                      <div className="absolute inset-0 border-2 border-ember-400/60" style={{ background: 'rgba(192,57,43,0.1)' }} />
                    )}
                  </div>
                  <div className="p-2.5" style={{ background: selectedClass === cls ? 'rgba(192,57,43,0.06)' : '#0a0e18' }}>
                    <p className="font-fantasy text-sm text-parchment-200">{cls}</p>
                    <p className="text-xs text-slate-600 font-sans mt-0.5">{CLASS_STATS[cls]}</p>
                  </div>
                </button>
              ))}
            </div>
            {selectedClass && (
              <div className="mt-4 p-4 border border-slate-800 bg-slate-900/50 space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs border px-2 py-0.5 font-sans uppercase tracking-widest" style={{ borderColor: '#c8922a', color: '#c8922a' }}>{CLASS_INFO[selectedClass].role}</span>
                </div>
                <p className="text-parchment-200 font-serif text-sm leading-relaxed">{CLASS_INFO[selectedClass].description}</p>
                <div className="border-t border-slate-800 pt-3 space-y-2">
                  <div className="flex gap-2 items-start">
                    <span className="text-xs uppercase tracking-widest font-sans shrink-0 mt-0.5" style={{ color: '#c8922a' }}>Tendency</span>
                    <p className="text-slate-400 font-serif text-xs leading-relaxed">{CLASS_INFO[selectedClass].tendency}</p>
                  </div>
                  <div className="flex gap-2 items-start">
                    <span className="text-xs uppercase tracking-widest font-sans shrink-0 mt-0.5" style={{ color: '#c8922a' }}>Suits</span>
                    <p className="text-slate-400 font-serif text-xs leading-relaxed">{CLASS_INFO[selectedClass].playstyle}</p>
                  </div>
                </div>
              </div>
            )}
            <div className="mt-8 flex gap-3">
              <button onClick={() => setStep(2)} className="fantasy-btn-secondary">â† Back</button>
              <button onClick={() => setStep(4)} disabled={!selectedClass} className="fantasy-btn px-8 disabled:opacity-40">
                Roll Attributes â†’
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Attributes */}
        {step === 4 && selectedRace && selectedClass && (
          <div className="animate-fade-in">
            <h2 className="font-fantasy text-2xl text-parchment-200 mb-1">Your Attributes</h2>
            <p className="text-slate-500 font-serif italic text-sm mb-6">
              Roll 4d6, drop the lowest â€” assign each score to a stat. Race bonuses apply on top.
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
                  className="text-xs font-sans px-3 py-1 border transition-all"
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
                          ? { borderColor: '#374151', color: '#4b5563', background: 'rgba(15,25,35,0.3)' }
                          : { borderColor: '#c8922a', color: '#d4c5a0', background: 'rgba(200,146,42,0.08)' }
                      }
                    >
                      {score}
                    </div>
                  )
                })}
              </div>
              <p className="text-xs text-slate-600 mt-2 font-serif">
                {Object.keys(assignments).length}/6 assigned
                {Object.keys(assignments).length === 6 ? ' â€” all stats assigned!' : ''}
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
                        ? { borderColor: 'rgba(200,146,42,0.5)', background: 'rgba(200,146,42,0.04)' }
                        : { borderColor: '#1f2937', background: 'rgba(10,14,24,0.8)' }
                    }
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="font-sans text-xs uppercase tracking-widest font-bold" style={{ color: isPrimary ? '#c8922a' : '#d4c5a0' }}>
                          {STAT_LABELS[statKey]}
                        </span>
                        {isPrimary && (
                          <span className="ml-1.5 text-xs font-sans" style={{ color: 'rgba(200,146,42,0.7)' }}>â˜… recommended</span>
                        )}
                      </div>
                      {raceBonus > 0 && (
                        <span className="text-xs font-sans" style={{ color: 'rgba(200,146,42,0.6)' }}>+{raceBonus} race</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 font-serif mb-2">{STAT_NAMES[statKey]}</p>

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
                        background: '#0a0e18',
                        borderColor: assigned !== undefined ? '#c8922a' : '#374151',
                        color: assigned !== undefined ? '#d4c5a0' : '#6b7280',
                      }}
                    >
                      <option value="">â€” assign â€”</option>
                      {assigned !== undefined && (
                        <option value={assigned}>{assigned}</option>
                      )}
                      {uniqueAvailable.map(score => (
                        <option key={score} value={score}>{score}</option>
                      ))}
                    </select>

                    {finalVal !== null && (
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs text-slate-500 font-sans">
                          {assigned}{raceBonus > 0 ? ` +${raceBonus}` : ''} =
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-fantasy text-lg" style={{ color: '#d4c5a0' }}>{finalVal}</span>
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
              <button onClick={() => setStep(3)} className="fantasy-btn-secondary">â† Back</button>
              <button
                onClick={() => setStep(5)}
                disabled={Object.keys(assignments).length < 6}
                className="fantasy-btn px-8 disabled:opacity-40"
              >
                Name Your Legend â†’
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: Name & Review */}
        {step === 5 && (
          <div className="animate-fade-in">
            <h2 className="font-fantasy text-2xl text-parchment-200 mb-2">Your Legend</h2>
            <p className="text-slate-500 font-serif italic text-sm mb-8">What do they call you? What brought you here?</p>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Form */}
              <div className="space-y-5">
                <div>
                  <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="fantasy-input w-full text-lg font-serif"
                    placeholder="What do they call you?"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">
                    Backstory <span className="text-slate-700 normal-case tracking-normal">(optional â€” the DM reads this)</span>
                  </label>
                  <textarea
                    value={backstory}
                    onChange={e => setBackstory(e.target.value)}
                    className="fantasy-input w-full h-36 resize-none font-serif text-sm"
                    placeholder="Who were you before? What drives you? What have you lost?"
                  />
                </div>
              </div>

              {/* Preview card */}
              <div>
                <p className="text-xs uppercase tracking-widest text-slate-600 mb-3">Preview</p>
                <div className="border border-slate-800 bg-slate-900/60 overflow-hidden">
                  {selectedPortrait && (
                    <div className="relative h-48 overflow-hidden">
                      <img src={selectedPortrait} alt="portrait" className="w-full h-full object-cover object-top" />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent" />
                      <div className="absolute bottom-3 left-4 right-4">
                        <p className="font-fantasy text-xl text-parchment-100">{name || 'â€”'}</p>
                        <p className="text-slate-400 text-xs font-serif">{selectedRace} {selectedClass}</p>
                      </div>
                    </div>
                  )}
                  <div className="p-4 space-y-2">
                    {selectedClass && (
                      <div className="space-y-1">
                        <span className="text-xs border px-1.5 py-0.5 font-sans uppercase tracking-widest" style={{ borderColor: '#c8922a', color: '#c8922a' }}>{CLASS_INFO[selectedClass].role}</span>
                        <p className="text-slate-400 font-serif text-xs italic">{CLASS_INFO[selectedClass].description.split('. ')[0]}.</p>
                      </div>
                    )}
                    {selectedRace && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {Object.entries(RACE_STAT_BONUSES[selectedRace]).map(([stat, bonus]) => (
                          <span key={stat} className="text-xs border border-slate-700 px-2 py-0.5 text-slate-400 font-sans">
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
              <div className="mt-4 border border-ember-600 bg-ember-600/10 px-3 py-2 text-ember-400 text-sm">
                {error}
              </div>
            )}

            <div className="mt-8 flex gap-3">
              <button onClick={() => setStep(4)} className="fantasy-btn-secondary">â† Back</button>
              <button
                onClick={handleCreate}
                disabled={!name.trim() || loading}
                className="fantasy-btn px-10 disabled:opacity-40"
              >
                {loading ? <span className="animate-pulse">Forging your legend...</span> : 'Enter the World'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
