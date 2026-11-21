class SoundEffects {
  private ctx: AudioContext | null = null;
  private muted = false;
  private activeVoiceAudio: HTMLAudioElement | null = null;
  private activeVoiceSource: AudioBufferSourceNode | null = null;

  private getContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public unlock() {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      try {
        const buffer = this.ctx.createBuffer(1, 1, 22050);
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.ctx.destination);
        source.start(0);
      } catch {
        // Ignore unlock errors
      }
    }
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) {
      this.stopAiVoice();
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public stopAiVoice() {
    if (this.activeVoiceSource) {
      try {
        this.activeVoiceSource.stop();
        this.activeVoiceSource.disconnect();
      } catch {
        // Ignore already stopped
      }
      this.activeVoiceSource = null;
    }
    if (this.activeVoiceAudio) {
      this.activeVoiceAudio.pause();
      this.activeVoiceAudio.currentTime = 0;
      this.activeVoiceAudio = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }
  }

  public speakPhrase(text: string) {
    if (this.muted || typeof window === 'undefined' || !text.trim()) return;
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.05;
      utterance.volume = 0.95;
      window.speechSynthesis.speak(utterance);
    } catch {
      // Ignore speech synthesis restrictions
    }
  }

  public async playBase64Wav(base64Audio: string, mimeType = 'audio/wav'): Promise<void> {
    if (this.muted || typeof window === 'undefined' || !base64Audio) return;
    this.stopAiVoice();

    const byteCharacters = atob(base64Audio);
    const byteArray = new Uint8Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteArray[i] = byteCharacters.charCodeAt(i);
    }

    const ctx = this.getContext();
    if (ctx) {
      try {
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }
        const arrayBuf = byteArray.buffer.slice(
          byteArray.byteOffset,
          byteArray.byteOffset + byteArray.byteLength
        );
        const audioBuffer = await ctx.decodeAudioData(arrayBuf);
        if (this.muted) return;
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        this.activeVoiceSource = source;
        source.onended = () => {
          if (this.activeVoiceSource === source) {
            this.activeVoiceSource = null;
          }
        };
        source.start(0);
        return;
      } catch {
        // Fall back to HTMLAudioElement if decodeAudioData is unsupported
      }
    }

    try {
      const blob = new Blob([byteArray], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      this.activeVoiceAudio = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        if (this.activeVoiceAudio === audio) {
          this.activeVoiceAudio = null;
        }
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
      };
      await audio.play();
    } catch {
      // Ignore autoplay blocks if browser rejects playback
    }
  }

  public async playDataUrlAudio(dataUrl: string): Promise<void> {
    if (this.muted || typeof window === 'undefined' || !dataUrl) return;
    this.stopAiVoice();

    const ctx = this.getContext();
    if (ctx) {
      try {
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }
        const response = await fetch(dataUrl);
        const arrayBuf = await response.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuf);
        if (this.muted) return;
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        this.activeVoiceSource = source;
        source.onended = () => {
          if (this.activeVoiceSource === source) {
            this.activeVoiceSource = null;
          }
        };
        source.start(0);
        return;
      } catch {
        // Fall back to HTMLAudioElement if decodeAudioData is unsupported
      }
    }

    try {
      const audio = new Audio(dataUrl);
      this.activeVoiceAudio = audio;
      audio.onended = () => {
        if (this.activeVoiceAudio === audio) {
          this.activeVoiceAudio = null;
        }
      };
      await audio.play();
    } catch {
      // Ignore autoplay blocks if browser rejects playback
    }
  }

  public playPullCorrect(streak = 1) {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const baseFreq = Math.min(523.25 + (streak - 1) * 35, 784);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.25, now + 0.11);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.21);
  }

  public playMiss() {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(210, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.16);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.19);
  }

  public playOpponentPull() {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(260, now + 0.12);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.09, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  public playVictory(isPlayerWin: boolean) {
    const ctx = this.getContext();
    if (!ctx) return;

    const notes = isPlayerWin ? [523.25, 659.25, 783.99, 1046.5] : [392, 349.23, 329.63, 261.63];
    const now = ctx.currentTime;

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const start = now + idx * 0.09;
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.14, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.28);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.3);
    });
  }
}

export const soundFx = new SoundEffects();
