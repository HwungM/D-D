import { api } from './api'

class TtsManager {
  enabled: boolean = true
  private currentAudio: HTMLAudioElement | null = null
  private currentObjectUrl: string | null = null

  toggle(): boolean {
    this.enabled = !this.enabled
    if (!this.enabled) this.stop()
    return this.enabled
  }

  stop(): void {
    if (this.currentAudio) {
      this.currentAudio.pause()
      this.currentAudio.src = ''
      this.currentAudio = null
    }
    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl)
      this.currentObjectUrl = null
    }
  }

  async speak(text: string): Promise<void> {
    if (!this.enabled) return
    this.stop()

    try {
      const response = await api.post('/tts', { text }, { responseType: 'arraybuffer' })
      if (!this.enabled) return

      const blob = new Blob([response.data as ArrayBuffer], { type: 'audio/mpeg' })
      const url = URL.createObjectURL(blob)
      this.currentObjectUrl = url

      const audio = new Audio(url)
      this.currentAudio = audio
      audio.onended = () => {
        if (this.currentObjectUrl === url) {
          URL.revokeObjectURL(url)
          this.currentObjectUrl = null
        }
      }
      audio.play().catch(() => {})
    } catch (err) {
      console.error('[TTS] Error:', err)
    }
  }
}

export const ttsManager = new TtsManager()
