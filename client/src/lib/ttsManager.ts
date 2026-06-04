import { api } from './api'

class TtsManager {
  enabled: boolean = true
  private currentSource: AudioBufferSourceNode | null = null
  private audioContext: AudioContext | null = null

  private getContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext()
    }
    return this.audioContext
  }

  toggle(): boolean {
    this.enabled = !this.enabled
    if (!this.enabled) {
      this.stop()
    }
    return this.enabled
  }

  stop(): void {
    if (this.currentSource) {
      try {
        this.currentSource.stop()
      } catch {
        // already stopped
      }
      this.currentSource = null
    }
  }

  async speak(text: string): Promise<void> {
    if (!this.enabled) return

    // Cancel any currently playing audio
    this.stop()

    try {
      const response = await api.post('/tts', { text }, { responseType: 'arraybuffer' })
      if (!this.enabled) return // check again after async

      const ctx = this.getContext()
      if (ctx.state === 'suspended') {
        await ctx.resume()
      }

      const audioBuffer = await ctx.decodeAudioData(response.data as ArrayBuffer)
      const source = ctx.createBufferSource()
      source.buffer = audioBuffer
      source.connect(ctx.destination)
      source.onended = () => {
        if (this.currentSource === source) {
          this.currentSource = null
        }
      }
      this.currentSource = source
      source.start(0)
    } catch (err) {
      console.error('[TTS] Error:', err)
    }
  }
}

export const ttsManager = new TtsManager()
