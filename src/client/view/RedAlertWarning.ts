/**
 * Tactical Red Alert & Ballistic Missile Warning for IronFront.
 * Activates full-screen pulsing vignette and tactical alert when nukes are inbound.
 */

let redAlertTimeout: ReturnType<typeof setTimeout> | null = null;

export function playTacticalSiren(): void {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx =
      (window as unknown as { Howler?: { ctx?: AudioContext } }).Howler?.ctx ??
      new AudioContextClass();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = "sawtooth";
    // Sweeping air raid siren pitch
    osc.frequency.setValueAtTime(460, now);
    osc.frequency.linearRampToValueAtTime(820, now + 1.2);
    osc.frequency.linearRampToValueAtTime(460, now + 2.4);
    osc.frequency.linearRampToValueAtTime(820, now + 3.6);
    osc.frequency.linearRampToValueAtTime(420, now + 4.6);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1400, now);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.25);
    gain.gain.setValueAtTime(0.2, now + 3.8);
    gain.gain.linearRampToValueAtTime(0.001, now + 4.6);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 4.6);
  } catch {
    // Autoplay restrictions or headless environment
  }
}

export function triggerRedAlert(messageText?: string): void {
  playTacticalSiren();

  let overlay = document.getElementById("ironfront-red-alert");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "ironfront-red-alert";
    overlay.className =
      "fixed inset-0 pointer-events-none z-[99998] transition-opacity duration-300 opacity-0 flex flex-col items-center justify-start pt-16";
    document.body.appendChild(overlay);
  }

  // Style with red pulsating vignette
  overlay.style.boxShadow = "inset 0 0 100px rgba(220, 38, 38, 0.85)";

  overlay.innerHTML = `
    <div class="flex items-center gap-3 px-6 py-3.5 rounded-2xl bg-red-950/95 border-2 border-red-500 text-white shadow-[0_0_50px_rgba(239,68,68,0.6)] backdrop-blur-lg animate-pulse max-w-lg mx-4">
      <span class="text-3xl animate-bounce">🚨</span>
      <div class="flex flex-col text-right" style="direction: rtl;">
        <span class="text-sm font-black text-red-300 uppercase tracking-wide">
          اخطار: حمله موشکی بالستیک!
        </span>
        <span class="text-xs text-neutral-200 font-medium mt-0.5">
          ${messageText ?? "یک کلاهک هسته‌ای به سمت قلمرو شما شلیک شد — سامانه‌های پدافند را آماده کنید!"}
        </span>
      </div>
    </div>
  `;

  // Show
  overlay.style.opacity = "1";

  if (redAlertTimeout) clearTimeout(redAlertTimeout);
  redAlertTimeout = setTimeout(() => {
    if (overlay) {
      overlay.style.opacity = "0";
    }
  }, 5000);
}
