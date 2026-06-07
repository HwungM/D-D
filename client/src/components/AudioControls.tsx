import { useState } from 'react'
import { audioManager } from '../lib/audio'

export default function AudioControls() {
  const [musicOn, setMusicOn] = useState(true)
  const [sfxOn, setSfxOn] = useState(true)

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setMusicOn(audioManager.toggleMusic())}
        title={musicOn ? 'Mute music' : 'Unmute music'}
        className={`border px-3 py-2 font-fantasy text-[10px] uppercase tracking-[0.16em] transition-all duration-200 ${
          musicOn
            ? 'border-amber-300/42 bg-amber-300/10 text-amber-100 hover:border-amber-200'
            : 'border-white/10 bg-white/[0.025] text-parchment-200/42 hover:border-white/20'
        }`}
      >
        Music
      </button>
      <button
        type="button"
        onClick={() => setSfxOn(audioManager.toggleSfx())}
        title={sfxOn ? 'Mute sounds' : 'Unmute sounds'}
        className={`border px-3 py-2 font-fantasy text-[10px] uppercase tracking-[0.16em] transition-all duration-200 ${
          sfxOn
            ? 'border-cyan-200/36 bg-cyan-200/8 text-cyan-100 hover:border-cyan-100/70'
            : 'border-white/10 bg-white/[0.025] text-parchment-200/42 hover:border-white/20'
        }`}
      >
        Sound
      </button>
    </div>
  )
}
