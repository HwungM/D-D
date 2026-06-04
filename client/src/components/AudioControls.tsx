import { useState } from 'react'
import { audioManager } from '../lib/audio'

export default function AudioControls() {
  const [musicOn, setMusicOn] = useState(true)
  const [sfxOn, setSfxOn] = useState(true)

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setMusicOn(audioManager.toggleMusic())}
        title={musicOn ? 'Mute music' : 'Unmute music'}
        className={`w-7 h-7 flex items-center justify-center border transition-colors duration-200 text-xs
          ${musicOn ? 'border-ember-500 text-ember-400 hover:bg-ember-600/10' : 'border-slate-700 text-slate-600 hover:border-slate-500'}`}
      >
        ♪
      </button>
      <button
        onClick={() => setSfxOn(audioManager.toggleSfx())}
        title={sfxOn ? 'Mute sounds' : 'Unmute sounds'}
        className={`w-7 h-7 flex items-center justify-center border transition-colors duration-200 text-xs
          ${sfxOn ? 'border-ember-500 text-ember-400 hover:bg-ember-600/10' : 'border-slate-700 text-slate-600 hover:border-slate-500'}`}
      >
        ◆
      </button>
    </div>
  )
}
