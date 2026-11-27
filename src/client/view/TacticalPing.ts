/**
 * Tactical Map Ping system for IronFront.
 * Allows Alt+Click or HUD button to drop tactical ping beacons on map.
 */

export type PingType = "attack" | "defend" | "danger";

interface PingConfig {
  icon: string;
  label: string;
  borderColor: string;
  ringColor: string;
}

const PING_CONFIGS: Record<PingType, PingConfig> = {
  attack: {
    icon: "🎯",
    label: "حمله به اینجا!",
    borderColor: "border-red-500",
    ringColor: "rgba(239, 68, 68, 0.8)",
  },
  defend: {
    icon: "🛡️",
    label: "دفاع از اینجا!",
    borderColor: "border-blue-500",
    ringColor: "rgba(59, 130, 246, 0.8)",
  },
  danger: {
    icon: "⚠️",
    label: "خطر / هشدار!",
    borderColor: "border-amber-500",
    ringColor: "rgba(245, 158, 11, 0.8)",
  },
};

class TacticalPingSystem {
  private activePingType: PingType = "attack";
  private hudBtn: HTMLElement | null = null;

  public init(): void {
    this.setupListeners();
  }

  private setupListeners(): void {
    // Listen for Alt+Click on canvas
    window.addEventListener("pointerdown", (e: MouseEvent) => {
      if (e.altKey && e.button === 0) {
        e.preventDefault();
        e.stopPropagation();
        this.spawnPing(e.clientX, e.clientY, this.activePingType);
      }
    });
  }

  public spawnPing(x: number, y: number, type: PingType = "attack"): void {
    const config = PING_CONFIGS[type];

    // Create Ping Beacon container
    const pingEl = document.createElement("div");
    pingEl.className =
      "fixed pointer-events-none z-[99995] flex flex-col items-center justify-center select-none transition-all";
    pingEl.style.left = `${x}px`;
    pingEl.style.top = `${y}px`;
    pingEl.style.transform = "translate(-50%, -50%)";

    // Animated Sonar Ripple Ring
    const ring = document.createElement("div");
    ring.className = "absolute rounded-full border-2 animate-ping";
    ring.style.width = "70px";
    ring.style.height = "70px";
    ring.style.borderColor = config.ringColor;
    pingEl.appendChild(ring);

    // Tactical Marker Badge
    const badge = document.createElement("div");
    badge.className = `relative flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-neutral-950/90 border-2 ${config.borderColor} shadow-2xl text-xs font-bold text-white backdrop-blur-md animate-bounce`;
    badge.innerHTML = `
      <span class="text-base">${config.icon}</span>
      <span style="direction: rtl;">${config.label}</span>
    `;
    pingEl.appendChild(badge);

    document.body.appendChild(pingEl);

    // Audio cue
    this.playPingAudio();

    // Auto remove after 3.5s
    setTimeout(() => {
      pingEl.style.opacity = "0";
      pingEl.style.transform = "translate(-50%, -70%) scale(0.8)";
      setTimeout(() => pingEl.remove(), 400);
    }, 3200);
  }

  private playPingAudio(): void {
    try {
      const audioCtx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
      osc.frequency.exponentialRampToValueAtTime(1320, audioCtx.currentTime + 0.15);

      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.2);
    } catch {
      // AudioContext fallback
    }
  }
}

export const tacticalPing = new TacticalPingSystem();
