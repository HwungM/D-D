import type { UnlockedAchievement } from '../../../shared/types'

export default function AchievementGallery({ achievements }: { achievements?: UnlockedAchievement[] }) {
  const list = [...(achievements || [])].sort((a, b) => new Date(b.unlockedAt).getTime() - new Date(a.unlockedAt).getTime())

  if (list.length === 0) {
    return (
      <div className="p-4">
        <p className="border border-white/8 bg-white/[0.025] px-3 py-4 font-serif text-sm italic text-parchment-200/52">
          No achievements unlocked yet. Bold deeds will be remembered here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3 p-4">
      <p className="font-fantasy text-[10px] uppercase tracking-[0.28em] text-amber-100/54">{list.length} Unlocked</p>
      {list.map((a, i) => (
        <article key={`${a.title}-${i}`} className="flex items-start gap-3 border border-amber-200/14 bg-amber-300/[0.03] p-3">
          <span className="text-2xl">🏆</span>
          <div className="min-w-0 flex-1">
            <p className="font-fantasy text-base text-amber-100">{a.title}</p>
            <p className="mt-1 font-serif text-sm text-parchment-200/72">{a.description}</p>
            <p className="mt-1.5 font-fantasy text-[9px] uppercase tracking-[0.16em] text-parchment-200/40">
              {a.characterName} · {new Date(a.unlockedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        </article>
      ))}
    </div>
  )
}
