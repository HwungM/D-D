import type { StoryEvent } from '../../../shared/types'

interface NarratorBoxProps {
  event: StoryEvent
}

export default function NarratorBox({ event }: NarratorBoxProps) {
  if (event.event_type === 'action') {
    return (
      <div className="flex justify-end animate-fade-in">
        <div className="max-w-[80%] bg-slate-800 border border-slate-700 px-4 py-2 text-sm font-serif text-slate-300 italic">
          &gt; {event.content.replace(/^ACTION:\s*/i, '')}
        </div>
      </div>
    )
  }

  const narrative = event.content.replace(/^NARRATION:\s*/i, '').replace(/^ACTION:.*\nNARRATION:\s*/is, '')

  return (
    <div className="animate-fade-in">
      <div className="parchment-box px-5 py-4">
        <p className="font-serif text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">{narrative}</p>
      </div>
      {event.event_type === 'level_up' && (
        <div className="mt-1 text-center text-ember-400 text-xs uppercase tracking-widest font-serif animate-pulse">
          ✦ Level Up! ✦
        </div>
      )}
    </div>
  )
}
