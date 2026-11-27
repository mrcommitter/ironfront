/**
 * Procedural Cinematic In-Game War Music Generator for IronFront.
 * Uses Web Audio API to synthesize cinematic war ambient drones, rhythmic tension pulses,
 * and battle ambiance with zero network bandwidth requirements.
 */

class InGameWarMusic {
  private ctx: AudioContext | null = null;
  private isPlaying: boolean = false;
  private masterGain: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private isMuted: boolean = false;

  constructor() {
    this.isMuted = localStorage.getItem("ironfront_war_music") === "false";
  }

  public init(): void {
    // Disabled per user request
    const oldBtn = document.getElementById("ironfront-music-toggle");
    if (oldBtn) oldBtn.remove();
  }

  private initAudio(): void {
    // Disabled per user request
  }

  public start(): void {
    // Disabled in-game war music per user request
    return;
  }

  public stop(): void {
    this.isPlaying = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public toggle(): boolean {
    return false;
  }

  public toggleMute(): boolean {
    return false;
  }

  private startAmbientDrone(): void {
    if (!this.ctx || !this.masterGain) return;

    // Cinematic deep sub drone (D2 = 73.42Hz and A2 = 110Hz)
    const baseFreqs = [55, 73.42, 110, 146.83];
    baseFreqs.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const filter = this.ctx!.createBiquadFilter();
      const gain = this.ctx!.createGain();

      osc.type = idx % 2 === 0 ? "sawtooth" : "triangle";
      osc.frequency.value = freq;

      filter.type = "lowpass";
      filter.frequency.value = 220 + idx * 40;

      gain.gain.value = 0.08 / (idx + 1);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain!);

      osc.start();
    });
  }

  private startRhythmLoop(): void {
    if (!this.ctx || !this.masterGain) return;

    let step = 0;
    // Rhythmic tension war pulse every 1.2 seconds
    this.timer = setInterval(() => {
      if (!this.isPlaying || !this.ctx || !this.masterGain || this.isMuted) return;

      const now = this.ctx.currentTime;
      step = (step + 1) % 4;

      // War drum kick
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.frequency.setValueAtTime(step === 0 ? 110 : 85, now);
      osc.frequency.exponentialRampToValueAtTime(35, now + 0.35);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.36);
    }, 1200);
  }


}

export const inGameMusic = new InGameWarMusic();
