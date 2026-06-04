const AMBIENT_URL = '/audio/ambient.mp3'

type AudioTrack = 'combat-1' | 'combat-2' | 'combat-3' | 'victory' | 'level-up'

class AudioManager {
  private tracks: Map<string, HTMLAudioElement> = new Map()
  private currentMusic: HTMLAudioElement | null = null
  private ambientTrack: HTMLAudioElement | null = null
  private musicEnabled = true
  private sfxEnabled = true
  private musicVolume = 0.4
  private ambientVolume = 0.25
  private sfxVolume = 0.7
  private combatIndex = 0

  private getOrCreate(key: string, src: string, loop = false): HTMLAudioElement {
    if (!this.tracks.has(key)) {
      const audio = new Audio(src)
      audio.loop = loop
      audio.preload = 'auto'
      this.tracks.set(key, audio)
    }
    return this.tracks.get(key)!
  }

  private fadeOut(audio: HTMLAudioElement, duration = 1500): Promise<void> {
    return new Promise((resolve) => {
      const startVol = audio.volume
      const step = startVol / (duration / 50)
      const interval = setInterval(() => {
        audio.volume = Math.max(0, audio.volume - step)
        if (audio.volume <= 0) {
          clearInterval(interval)
          audio.pause()
          audio.currentTime = 0
          resolve()
        }
      }, 50)
    })
  }

  private fadeIn(audio: HTMLAudioElement, targetVol: number, duration = 1500) {
    audio.volume = 0
    audio.play().catch(() => {})
    const step = targetVol / (duration / 50)
    const interval = setInterval(() => {
      audio.volume = Math.min(targetVol, audio.volume + step)
      if (audio.volume >= targetVol) clearInterval(interval)
    }, 50)
  }

  startAmbient() {
    if (!this.musicEnabled) return
    if (!this.ambientTrack) {
      this.ambientTrack = new Audio(AMBIENT_URL)
      this.ambientTrack.loop = true
      this.ambientTrack.volume = 0
    }
    if (!this.ambientTrack.paused) return
    this.fadeIn(this.ambientTrack, this.ambientVolume, 3000)
  }

  private async pauseAmbient() {
    if (!this.ambientTrack || this.ambientTrack.paused) return
    await this.fadeOut(this.ambientTrack, 1000)
  }

  private async resumeAmbient() {
    if (!this.musicEnabled || !this.ambientTrack) return
    this.fadeIn(this.ambientTrack, this.ambientVolume, 2000)
  }

  async playCombat() {
    if (!this.musicEnabled) return
    const tracks: AudioTrack[] = ['combat-1', 'combat-2', 'combat-3']
    const srcs = ['/audio/combat-1.mp3', '/audio/combat-2.mp3', '/audio/combat-3.mp3']
    const key = tracks[this.combatIndex]
    const src = srcs[this.combatIndex]
    this.combatIndex = (this.combatIndex + 1) % 3

    await this.pauseAmbient()
    if (this.currentMusic) await this.fadeOut(this.currentMusic)
    const audio = this.getOrCreate(key, src, true)
    this.currentMusic = audio
    this.fadeIn(audio, this.musicVolume)
  }

  async stopMusic() {
    if (this.currentMusic) {
      await this.fadeOut(this.currentMusic)
      this.currentMusic = null
    }
    this.resumeAmbient()
  }

  playVictory() {
    if (!this.sfxEnabled) return
    this.stopMusic()
    const audio = this.getOrCreate('victory', '/audio/victory.mp3', false)
    audio.volume = this.sfxVolume
    audio.currentTime = 0
    audio.play().catch(() => {})
    audio.onended = () => this.resumeAmbient()
  }

  playDiceRoll() {
    if (!this.sfxEnabled) return
    const audio = this.getOrCreate('dice-roll', '/audio/dice-roll.mp3', false)
    audio.volume = this.sfxVolume
    audio.currentTime = 0
    audio.play().catch(() => {})
  }

  playItemPickup() {
    if (!this.sfxEnabled) return
    const audio = this.getOrCreate('item-pickup', '/audio/item-pickup.mp3', false)
    audio.volume = this.sfxVolume
    audio.currentTime = 0
    audio.play().catch(() => {})
  }

  playPageTurn() {
    if (!this.sfxEnabled) return
    const audio = this.getOrCreate('page-turn', '/audio/page-turn.mp3', false)
    audio.volume = this.sfxVolume
    audio.currentTime = 0
    audio.play().catch(() => {})
  }

  playLevelUp() {
    if (!this.sfxEnabled) return
    const audio = this.getOrCreate('level-up', '/audio/level-up.mp3', false)
    audio.volume = this.sfxVolume
    audio.currentTime = 0
    audio.play().catch(() => {})
  }

  toggleMusic() {
    this.musicEnabled = !this.musicEnabled
    if (!this.musicEnabled) this.stopMusic()
    return this.musicEnabled
  }

  toggleSfx() {
    this.sfxEnabled = !this.sfxEnabled
    return this.sfxEnabled
  }

  setMusicVolume(vol: number) {
    this.musicVolume = vol
    if (this.currentMusic) this.currentMusic.volume = vol
  }

  get isMusicEnabled() { return this.musicEnabled }
  get isSfxEnabled() { return this.sfxEnabled }
}

export const audioManager = new AudioManager()
