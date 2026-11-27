import { EventBus } from "../../core/EventBus";
import { ScreenShakeEvent } from "../TransformHandler";

/**
 * Combat visual effects and kill-feed notifications for IronFront.
 */

let vfxEventBus: EventBus | null = null;

export function setVFXEventBus(eventBus: EventBus): void {
  vfxEventBus = eventBus;
}

function getAudioContext(): AudioContext | null {
  try {
    const howler = (
      window as unknown as { Howler?: { ctx?: AudioContext; _muted?: boolean } }
    ).Howler;
    if (howler?._muted) return null;
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) return null;
    const ctx = howler?.ctx ?? new AudioContextClass();
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    return ctx;
  } catch {
    return null;
  }
}

function getAudioDestination(ctx: AudioContext): AudioNode {
  try {
    const howler = (
      window as unknown as { Howler?: { masterGain?: GainNode } }
    ).Howler;
    if (howler?.masterGain) {
      return howler.masterGain;
    }
  } catch {}
  return ctx.destination;
}

export function playNukeRumble(intensity: number = 8): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = "sawtooth";
    // Sub-bass detonation thump & rumble
    osc.frequency.setValueAtTime(85, now);
    osc.frequency.exponentialRampToValueAtTime(25, now + 1.2);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(180, now);
    filter.frequency.linearRampToValueAtTime(45, now + 1.2);

    const volume = Math.min(0.12, 0.04 + (intensity / 30) * 0.05);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(getAudioDestination(ctx));

    osc.start(now);
    osc.stop(now + 0.9);
  } catch {
    // Autoplay or headless fallback
  }
}

export function playLaserSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(1600, now);
    osc.frequency.exponentialRampToValueAtTime(280, now + 0.18);

    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(getAudioDestination(ctx));
    osc.start(now);
    osc.stop(now + 0.18);
  } catch {
    // fallback
  }
}

export function playEMPSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.45);

    filter.type = "bandpass";
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.linearRampToValueAtTime(120, now + 0.45);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(getAudioDestination(ctx));

    osc.start(now);
    osc.stop(now + 0.45);
  } catch {
    // fallback
  }
}

export function playPlunderSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Pleasant arpeggiated coin chime: C5 (523), E5 (659), G5 (784), C6 (1046)
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const noteTime = now + idx * 0.055;

      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.07, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.22);

      osc.connect(gain);
      gain.connect(getAudioDestination(ctx));
      osc.start(noteTime);
      osc.stop(noteTime + 0.22);
    });
  } catch {
    // fallback
  }
}

let lastShakeTimestamp = 0;

export function triggerScreenShake(
  intensity: number = 4,
  durationMs: number = 250,
): void {
  const now = performance.now();
  // Throttle screen shakes to at most once every 320ms so salvo/rapid detonations don't stack uncontrollably
  if (now - lastShakeTimestamp < 320) {
    return;
  }
  lastShakeTimestamp = now;

  // Gentle, cinematic camera rumble clamp (max 3.2px) so players never lose control
  const clampedIntensity = Math.min(3.2, Math.max(1.0, intensity * 0.35));
  const clampedDuration = Math.min(260, durationMs);

  if (vfxEventBus) {
    vfxEventBus.emit(new ScreenShakeEvent(clampedIntensity, clampedDuration));
  }
  playNukeRumble(clampedIntensity);
}

export function showKillBanner(
  killerName: string,
  victimName: string,
  isKillerHuman: boolean,
  isVictimHuman: boolean,
  isMyPlayerKiller: boolean = false,
  isMyPlayerVictim: boolean = false,
): void {
  // Only announce if a real human player is involved (kill or victim)
  if (!isKillerHuman && !isVictimHuman) return;

  let container = document.getElementById("ironfront-killfeed");
  if (!container) {
    container = document.createElement("div");
    container.id = "ironfront-killfeed";
    document.body.appendChild(container);
  }
  // Placed on top-left vertically at top-36 sm:top-40 left-4, safely below any overlay card or leaderboard button
  container.className =
    "fixed top-36 sm:top-40 left-4 z-[350] flex flex-col items-start gap-1.5 pointer-events-none select-none max-w-[280px] sm:max-w-xs";

  // Keep at most 3 kill notifications visible at a time to prevent clutter
  while (container.children.length >= 3) {
    container.removeChild(container.firstChild!);
  }

  const item = document.createElement("div");
  item.style.direction = "ltr"; // Standard esports LTR killfeed: Killer ⚔️ Victim

  if (isMyPlayerVictim) {
    item.className =
      "flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-950/90 border border-red-500/70 text-[11px] font-bold text-white shadow-xl backdrop-blur-md transition-all duration-300 pointer-events-none select-none";
    item.innerHTML = `
      <span class="text-neutral-200 truncate max-w-[90px]">${escapeHtml(killerName)}</span>
      <span class="text-red-400">⚔️</span>
      <span class="text-rose-400 font-extrabold">💀 شما</span>
    `;
  } else if (isMyPlayerKiller) {
    item.className =
      "flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-950/90 border border-amber-400/70 text-[11px] font-bold text-white shadow-xl backdrop-blur-md transition-all duration-300 pointer-events-none select-none";
    item.innerHTML = `
      <span class="text-amber-300 font-extrabold">👑 شما</span>
      <span class="text-amber-400">⚔️</span>
      <span class="text-rose-300 truncate max-w-[90px]">${escapeHtml(victimName)}</span>
    `;
  } else {
    item.className =
      "flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/85 border border-white/20 text-[11px] font-bold text-white shadow-xl backdrop-blur-md transition-all duration-300 pointer-events-none select-none";
    item.innerHTML = `
      <span class="text-amber-400 font-semibold truncate max-w-[85px]">${escapeHtml(killerName)}</span>
      <span class="text-red-400 text-xs">⚔️</span>
      <span class="text-rose-300 font-medium truncate max-w-[85px]">${escapeHtml(victimName)}</span>
    `;
  }

  item.style.transform = "translateX(-40px)";
  item.style.opacity = "0";
  container.appendChild(item);

  // Animate slide in from left
  requestAnimationFrame(() => {
    item.style.transform = "translateX(0)";
    item.style.opacity = "1";
  });

  // Auto remove after 3s
  setTimeout(() => {
    item.style.opacity = "0";
    item.style.transform = "translateX(-30px)";
    setTimeout(() => {
      item.remove();
    }, 250);
  }, 3000);
}

const killStreaks = new Map<string, number>();

export function checkAndAnnounceStreak(_killerName: string): void {
  // Streak banner disabled to preserve clean OpenFront HUD aesthetic
}

export function showStreakBanner(
  _playerName: string,
  _title: string,
  _icon: string,
  _subtitle: string,
): void {
  // Disabled
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

export function showFloatingPlunder(
  screenX: number,
  screenY: number,
  text: string,
  customIcon?: string,
): void {
  if (
    screenX < -100 ||
    screenX > window.innerWidth + 100 ||
    screenY < -100 ||
    screenY > window.innerHeight + 100
  ) {
    return;
  }
  playPlunderSound();
  const el = document.createElement("div");
  el.className =
    "fixed pointer-events-none select-none z-[1002] font-black text-amber-300 text-sm md:text-base drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)] flex items-center gap-1.5 transition-all duration-1000 ease-out";
  el.style.left = `${screenX}px`;
  el.style.top = `${screenY}px`;
  el.style.transform = "translate(-50%, -50%) scale(0.8)";
  el.style.opacity = "0";

  const hasLeadingEmoji = /^[\p{Emoji}\u200d\uFE0F]/u.test(text.trim());
  const iconHtml = customIcon
    ? `<span class="text-xl">${customIcon}</span> `
    : hasLeadingEmoji
      ? ""
      : `<span class="text-xl">💰</span> `;
  el.innerHTML = `${iconHtml}<span class="tracking-wide">${escapeHtml(text)}</span>`;
  document.body.appendChild(el);

  requestAnimationFrame(() => {
    el.style.opacity = "1";
    el.style.transform = "translate(-50%, -85px) scale(1.12)";
  });

  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 400);
  }, 950);
}



export function showLaserBeamVFX(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): void {
  playLaserSound();
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.style.position = "fixed";
  svg.style.top = "0";
  svg.style.left = "0";
  svg.style.width = "100vw";
  svg.style.height = "100vh";
  svg.style.pointerEvents = "none";
  svg.style.zIndex = "999";

  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", String(startX));
  line.setAttribute("y1", String(startY));
  line.setAttribute("x2", String(endX));
  line.setAttribute("y2", String(endY));
  line.setAttribute("stroke", "#06b6d4");
  line.setAttribute("stroke-width", "4.5");
  line.setAttribute("stroke-linecap", "round");
  line.style.filter =
    "drop-shadow(0 0 8px #38bdf8) drop-shadow(0 0 20px #06b6d4)";
  line.style.transition = "opacity 0.28s ease-out";
  svg.appendChild(line);
  document.body.appendChild(svg);

  setTimeout(() => {
    line.style.opacity = "0";
    setTimeout(() => svg.remove(), 300);
  }, 160);
}

export function showEMPShockwaveVFX(
  screenX: number,
  screenY: number,
  radiusPx: number = 180,
): void {
  playEMPSound();
  const ring = document.createElement("div");
  ring.className =
    "fixed pointer-events-none select-none z-[998] rounded-full border-4 border-cyan-400 bg-cyan-400/20 backdrop-blur-xs transition-all duration-700 ease-out";
  ring.style.left = `${screenX}px`;
  ring.style.top = `${screenY}px`;
  ring.style.width = "10px";
  ring.style.height = "10px";
  ring.style.transform = "translate(-50%, -50%) scale(0.1)";
  ring.style.boxShadow =
    "0 0 40px #06b6d4, inset 0 0 30px #38bdf8";
  ring.style.opacity = "1";
  document.body.appendChild(ring);

  requestAnimationFrame(() => {
    ring.style.width = `${radiusPx * 2}px`;
    ring.style.height = `${radiusPx * 2}px`;
    ring.style.transform = "translate(-50%, -50%) scale(1)";
    ring.style.opacity = "0";
  });

  setTimeout(() => ring.remove(), 750);
}

export function playSAMLaunchSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(1400, now + 0.22);

    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(getAudioDestination(ctx));
    osc.start(now);
    osc.stop(now + 0.25);
  } catch {
    // fallback
  }
}

export function playFlakAirburstSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.35);

    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(getAudioDestination(ctx));
    osc.start(now);
    osc.stop(now + 0.35);
  } catch {
    // fallback
  }
}

export function playReconRadarSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Dual sonar/radar ping: 880Hz -> 1760Hz
    [880, 1320, 1760].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + idx * 0.1;
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(gain);
      gain.connect(getAudioDestination(ctx));
      osc.start(t);
      osc.stop(t + 0.22);
    });
  } catch {
    // fallback
  }
}

export function playTargetLockSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    // High-tech triple lock chirp: 1100Hz -> 1450Hz -> 1900Hz
    [1100, 1450, 1900].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + idx * 0.055;
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.09, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
      osc.connect(gain);
      gain.connect(getAudioDestination(ctx));
      osc.start(t);
      osc.stop(t + 0.045);
    });
  } catch {
    // fallback
  }
}

export function playCruiseMissileLaunchSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Rocket booster ignite & ascending turbine roar
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(750, now + 0.38);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(280, now);
    filter.frequency.linearRampToValueAtTime(1600, now + 0.38);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(getAudioDestination(ctx));

    osc.start(now);
    osc.stop(now + 0.42);
  } catch {
    // fallback
  }
}

/**
 * Supersonic SAM interceptor missile launch & aerial flak burst with kinetic shrapnel sparks.
 */
export function showSAMInterceptionVFX(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): void {
  // Viewport culling: Skip rendering if entirely offscreen
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;
  const isStartOnscreen =
    startX >= -100 && startX <= viewW + 100 && startY >= -100 && startY <= viewH + 100;
  const isEndOnscreen =
    endX >= -100 && endX <= viewW + 100 && endY >= -100 && endY <= viewH + 100;
  if (!isStartOnscreen && !isEndOnscreen) return;

  playSAMLaunchSound();

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.style.position = "fixed";
  svg.style.top = "0";
  svg.style.left = "0";
  svg.style.width = "100vw";
  svg.style.height = "100vh";
  svg.style.pointerEvents = "none";
  svg.style.zIndex = "998";

  // Glowing rocket missile trail
  const trail = document.createElementNS("http://www.w3.org/2000/svg", "line");
  trail.setAttribute("x1", String(startX));
  trail.setAttribute("y1", String(startY));
  trail.setAttribute("x2", String(startX));
  trail.setAttribute("y2", String(startY));
  trail.setAttribute("stroke", "#38bdf8");
  trail.setAttribute("stroke-width", "3.5");
  trail.setAttribute("stroke-linecap", "round");
  trail.style.filter = "drop-shadow(0 0 6px #0284c7) drop-shadow(0 0 14px #38bdf8)";
  trail.style.transition = "all 0.22s cubic-bezier(0.2, 0.8, 0.4, 1)";
  svg.appendChild(trail);
  document.body.appendChild(svg);

  // Animate rocket flight to target
  requestAnimationFrame(() => {
    trail.setAttribute("x2", String(endX));
    trail.setAttribute("y2", String(endY));
  });

  // Detonation at intercept point
  setTimeout(() => {
    playFlakAirburstSound();
    triggerScreenShake(2.2, 190);

    // Flak burst ring
    const burst = document.createElement("div");
    burst.className =
      "fixed pointer-events-none select-none z-[999] rounded-full border-2 border-amber-300 bg-amber-400/35 backdrop-blur-xs transition-all duration-400 ease-out";
    burst.style.left = `${endX}px`;
    burst.style.top = `${endY}px`;
    burst.style.width = "10px";
    burst.style.height = "10px";
    burst.style.transform = "translate(-50%, -50%) scale(0.1)";
    burst.style.boxShadow = "0 0 38px #f59e0b, 0 0 16px #fbbf24";
    document.body.appendChild(burst);

    // 6 kinetic golden shrapnel sparks flying outwards (optimized from 14)
    const sparkCount = 6;
    const sparkElements: HTMLElement[] = [];
    for (let i = 0; i < sparkCount; i++) {
      const spark = document.createElement("div");
      spark.className =
        "fixed pointer-events-none select-none z-[1000] rounded-full bg-amber-200 transition-all duration-350 ease-out";
      spark.style.left = `${endX}px`;
      spark.style.top = `${endY}px`;
      spark.style.width = "4px";
      spark.style.height = "4px";
      spark.style.boxShadow = "0 0 8px #f59e0b, 0 0 3px #fff";
      spark.style.transform = "translate(-50%, -50%)";
      document.body.appendChild(spark);
      sparkElements.push(spark);

      const angle = (i / sparkCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const distance = 35 + Math.random() * 40;
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance;

      requestAnimationFrame(() => {
        spark.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.3)`;
        spark.style.opacity = "0";
      });
    }

    requestAnimationFrame(() => {
      burst.style.width = "120px";
      burst.style.height = "120px";
      burst.style.transform = "translate(-50%, -50%) scale(1)";
      burst.style.opacity = "0";
    });

    showFloatingPlunder(endX, endY, "🛡️ رهگیری موفق SAM: کلاهک منهدم شد!");

    setTimeout(() => {
      burst.remove();
      sparkElements.forEach((s) => s.remove());
    }, 420);
    trail.style.opacity = "0";
    setTimeout(() => svg.remove(), 250);
  }, 220);
}

/**
 * Cinematic Supersonic Cruise Missile flight and devastating explosive impact.
 */
export function showCruiseMissileStrikeVFX(
  startX: number,
  startY: number,
  targetX: number,
  targetY: number,
  onImpact?: () => void,
): void {
  playCruiseMissileLaunchSound();

  const dx = targetX - startX;
  const dy = targetY - startY;
  const angleRad = Math.atan2(dy, dx);
  const angleDeg = (angleRad * 180) / Math.PI;

  // Supersonic rocket container
  const missile = document.createElement("div");
  missile.className =
    "fixed pointer-events-none select-none z-[1001] transition-transform duration-380 ease-in";
  missile.style.left = `${startX}px`;
  missile.style.top = `${startY}px`;
  missile.style.width = "36px";
  missile.style.height = "10px";
  missile.style.transformOrigin = "18px 5px";
  missile.style.transform = `translate(-50%, -50%) rotate(${angleDeg}deg) scale(0.7)`;

  // Rocket body + glowing exhaust trail
  missile.innerHTML = `
    <div class="relative w-full h-full flex items-center">
      <!-- Fiery engine plume -->
      <div class="absolute -left-6 top-1/2 -translate-y-1/2 w-7 h-2.5 rounded-full bg-gradient-to-r from-transparent via-amber-500 to-white shadow-[0_0_15px_#f97316] animate-pulse"></div>
      <!-- Missile fuselage -->
      <div class="w-7 h-2 rounded-r-full bg-slate-200 border border-slate-400 shadow-md"></div>
      <!-- Warhead tip -->
      <div class="w-2.5 h-2.5 rounded-full bg-red-600 shadow-[0_0_8px_#ef4444]"></div>
    </div>
  `;
  document.body.appendChild(missile);

  // Flight animation
  requestAnimationFrame(() => {
    missile.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${angleDeg}deg) scale(1.15)`;
  });

  // Impact and detonation
  setTimeout(() => {
    missile.remove();
    playNukeRumble(6.5);
    triggerScreenShake(3.5, 270);
    try {
      onImpact?.();
    } catch (e) {
      console.error("Error executing cruise missile impact callback:", e);
    }

    // Blinding core flash
    const flash = document.createElement("div");
    flash.className =
      "fixed pointer-events-none select-none z-[1002] rounded-full bg-white transition-all duration-200 ease-out";
    flash.style.left = `${targetX}px`;
    flash.style.top = `${targetY}px`;
    flash.style.width = "20px";
    flash.style.height = "20px";
    flash.style.transform = "translate(-50%, -50%) scale(1)";
    flash.style.boxShadow = "0 0 60px #ffffff, 0 0 30px #f59e0b";
    document.body.appendChild(flash);

    requestAnimationFrame(() => {
      flash.style.transform = "translate(-50%, -50%) scale(5.5)";
      flash.style.opacity = "0";
    });
    setTimeout(() => flash.remove(), 220);

    // Fiery expanding fireball
    const fireball = document.createElement("div");
    fireball.className =
      "fixed pointer-events-none select-none z-[1001] rounded-full bg-gradient-to-tr from-rose-600 via-amber-500 to-yellow-300 transition-all duration-550 ease-out";
    fireball.style.left = `${targetX}px`;
    fireball.style.top = `${targetY}px`;
    fireball.style.width = "16px";
    fireball.style.height = "16px";
    fireball.style.transform = "translate(-50%, -50%) scale(0.2)";
    fireball.style.boxShadow = "0 0 50px #ef4444, inset 0 0 25px #fef08a";
    document.body.appendChild(fireball);

    requestAnimationFrame(() => {
      fireball.style.width = "150px";
      fireball.style.height = "150px";
      fireball.style.transform = "translate(-50%, -50%) scale(1)";
      fireball.style.opacity = "0";
    });
    setTimeout(() => fireball.remove(), 580);

    // Shockwave blast ring
    const blastRing = document.createElement("div");
    blastRing.className =
      "fixed pointer-events-none select-none z-[1000] rounded-full border-4 border-amber-400 bg-amber-500/10 backdrop-blur-[1px] transition-all duration-600 ease-out";
    blastRing.style.left = `${targetX}px`;
    blastRing.style.top = `${targetY}px`;
    blastRing.style.width = "20px";
    blastRing.style.height = "20px";
    blastRing.style.transform = "translate(-50%, -50%) scale(0.1)";
    blastRing.style.boxShadow = "0 0 35px #f59e0b";
    document.body.appendChild(blastRing);

    requestAnimationFrame(() => {
      blastRing.style.width = "230px";
      blastRing.style.height = "230px";
      blastRing.style.transform = "translate(-50%, -50%) scale(1)";
      blastRing.style.opacity = "0";
    });
    setTimeout(() => blastRing.remove(), 620);

    // 10 Fiery blast sparks
    for (let i = 0; i < 10; i++) {
      const spark = document.createElement("div");
      spark.className =
        "fixed pointer-events-none select-none z-[1002] rounded-full bg-amber-300 transition-all duration-450 ease-out";
      spark.style.left = `${targetX}px`;
      spark.style.top = `${targetY}px`;
      spark.style.width = "5px";
      spark.style.height = "5px";
      spark.style.boxShadow = "0 0 10px #f97316";
      document.body.appendChild(spark);

      const angle = (i / 10) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const dist = 50 + Math.random() * 60;
      const sx = Math.cos(angle) * dist;
      const sy = Math.sin(angle) * dist;

      requestAnimationFrame(() => {
        spark.style.transform = `translate(calc(-50% + ${sx}px), calc(-50% + ${sy}px)) scale(0.2)`;
        spark.style.opacity = "0";
      });
      setTimeout(() => spark.remove(), 480);
    }

    if (!onImpact) {
      showFloatingPlunder(targetX, targetY, "🎯 اصابت دقیق موشک کروز!");
    }
  }, 380);
}

/**
 * Renders or removes the tactical radar dome around a SAM launcher.
 */
export function showSAMRadarDome(
  screenX: number,
  screenY: number,
  radiusPx: number,
  visible: boolean = true,
  isStealth: boolean = false,
): void {
  let dome = document.getElementById("sam-radar-dome");
  if (!visible) {
    if (dome) {
      dome.style.opacity = "0";
      setTimeout(() => dome?.remove(), 200);
    }
    return;
  }

  if (!dome) {
    dome = document.createElement("div");
    dome.id = "sam-radar-dome";
    document.body.appendChild(dome);
  }

  dome.className = isStealth
    ? "fixed pointer-events-none select-none z-[180] rounded-full border-2 border-emerald-400/80 bg-emerald-500/15 shadow-[0_0_30px_rgba(16,185,129,0.45)] backdrop-blur-[1px] transition-all duration-200 animate-pulse flex items-start justify-center pt-2"
    : "fixed pointer-events-none select-none z-[180] rounded-full border-2 border-cyan-400/60 bg-cyan-400/10 shadow-[0_0_25px_rgba(6,182,212,0.35)] backdrop-blur-[1px] transition-all duration-200 animate-pulse flex items-start justify-center pt-2";

  dome.innerHTML = isStealth
    ? `
      <span class="text-[10px] font-bold text-emerald-200 bg-gray-900/90 px-2 py-0.5 rounded border border-emerald-500/70 shadow-lg flex items-center gap-1">
        <span>🕶️ چتر پدافند SAM مخفی (پنهان از رادار دشمن)</span>
      </span>
    `
    : `
      <span class="text-[10px] font-bold text-cyan-200 bg-gray-900/80 px-2 py-0.5 rounded border border-cyan-500/50 shadow-md">
        چتر پدافند SAM
      </span>
    `;

  const diameter = Math.max(40, radiusPx * 2);
  dome.style.left = `${screenX}px`;
  dome.style.top = `${screenY}px`;
  dome.style.width = `${diameter}px`;
  dome.style.height = `${diameter}px`;
  dome.style.transform = "translate(-50%, -50%)";
  dome.style.opacity = "1";
}

/**
 * Holographic Reconnaissance Drone Scan effect with high-tech CRT sweep and concentric range rings.
 */
export function showReconDroneScanVFX(
  screenX: number,
  screenY: number,
  radiusPx: number = 210,
): void {
  playReconRadarSound();

  const scan = document.createElement("div");
  scan.className =
    "fixed pointer-events-none select-none z-[997] rounded-full border border-emerald-400/80 bg-emerald-950/20 backdrop-blur-[2px] transition-all duration-1200 ease-out flex items-center justify-center overflow-hidden";
  scan.style.left = `${screenX}px`;
  scan.style.top = `${screenY}px`;
  scan.style.width = "30px";
  scan.style.height = "30px";
  scan.style.transform = "translate(-50%, -50%) scale(0.2)";
  scan.style.boxShadow =
    "0 0 60px rgba(16,185,129,0.5), inset 0 0 45px rgba(16,185,129,0.25)";

  // Inner concentric range rings (30%, 65%) and high-tech radar sweep cone
  scan.innerHTML = `
    <div class="absolute inset-[35%] rounded-full border border-emerald-400/40 border-dashed pointer-events-none"></div>
    <div class="absolute inset-[70%] rounded-full border border-emerald-400/50 pointer-events-none"></div>
    <!-- Crosshairs -->
    <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div class="w-full h-[1px] bg-emerald-400/30"></div>
    </div>
    <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div class="h-full w-[1px] bg-emerald-400/30"></div>
    </div>
    <!-- Rotating 360° radar sweep cone -->
    <div class="absolute inset-0 rounded-full animate-spin pointer-events-none" style="background: conic-gradient(from 0deg, rgba(16, 185, 129, 0.45) 0deg, rgba(16, 185, 129, 0.05) 50deg, transparent 65deg);"></div>
  `;
  document.body.appendChild(scan);

  requestAnimationFrame(() => {
    scan.style.width = `${radiusPx * 2}px`;
    scan.style.height = `${radiusPx * 2}px`;
    scan.style.transform = "translate(-50%, -50%) scale(1)";
    scan.style.opacity = "0";
  });

  showFloatingPlunder(screenX, screenY, "🛰️ اسکن پهپاد شناسایی تکمیل شد!");

  setTimeout(() => scan.remove(), 1250);
}

/**
 * Tactical Stealth Silo HUD Indicator shown when hovering over an undetected stealth silo.
 */
export function showStealthSiloIndicator(
  screenX: number,
  screenY: number,
  visible: boolean = true,
): void {
  let indicator = document.getElementById("stealth-silo-indicator");
  if (!visible) {
    if (indicator) {
      indicator.style.opacity = "0";
      setTimeout(() => indicator?.remove(), 200);
    }
    return;
  }

  if (!indicator) {
    indicator = document.createElement("div");
    indicator.id = "stealth-silo-indicator";
    document.body.appendChild(indicator);
  }

  indicator.className =
    "fixed pointer-events-none select-none z-[180] transition-all duration-200 animate-pulse flex items-center justify-center";
  indicator.innerHTML = `
    <span class="text-[10px] font-bold text-amber-200 bg-gray-900/95 px-2.5 py-1 rounded-md border border-amber-500/70 shadow-[0_0_15px_rgba(245,158,11,0.4)] flex items-center gap-1.5 backdrop-blur-xs">
      <span>🔒 سیلوی موشک مخفی (پنهان از رادار دشمن)</span>
    </span>
  `;

  indicator.style.left = `${screenX}px`;
  indicator.style.top = `${screenY - 20}px`;
  indicator.style.transform = "translate(-50%, -100%)";
  indicator.style.opacity = "1";
}


