const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
import { useAuthStore } from './store'

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

    const token = useAuthStore.getState().session?.access_token
    if (!token) return

    try {
      const response = await fetch(`${API_URL}/api/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ text }),
      })

      if (!response.ok || !response.body) return
      if (!this.enabled) return

      // Stream response body into chunks — server sends bytes as OpenAI generates them
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (!this.enabled) { reader.cancel(); return }
        chunks.push(value)
      }

      if (!this.enabled || chunks.length === 0) return

      const blob = new Blob(chunks, { type: 'audio/mpeg' })
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
