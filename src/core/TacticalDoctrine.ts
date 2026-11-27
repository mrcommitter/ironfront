import { Gold } from "./game/Game";

export enum MilitaryDoctrine {
  Blitzkrieg = "blitzkrieg",     // حمله رعدآسا ⚡
  IronBastion = "iron_bastion", // دژ آهنین 🛡️
  WarEconomy = "war_economy",   // مجتمع صنعتی و جنگ اقتصادی 💰
}

export interface DoctrineInfo {
  id: MilitaryDoctrine;
  name: string;
  persianName: string;
  icon: string;
  badgeClass: string;
  description: string;
  buffs: string[];
}

export const DOCTRINES: Record<MilitaryDoctrine, DoctrineInfo> = {
  [MilitaryDoctrine.Blitzkrieg]: {
    id: MilitaryDoctrine.Blitzkrieg,
    name: "Blitzkrieg",
    persianName: "حمله رعدآسا",
    icon: "⚡",
    badgeClass: "bg-slate-700/80 text-amber-300 border-slate-600",
    description: "تاکتیک تهاجم برق‌آسا با سرعت بالا و کاهش شدید تلفات حمله",
    buffs: [
      "+۲۵٪ سرعت هجوم نیروها",
      "۱۵٪ کاهش تلفات در نبردهای تهاجمی",
      "قابلیت مارش سراسری (War Surge)",
    ],
  },
  [MilitaryDoctrine.IronBastion]: {
    id: MilitaryDoctrine.IronBastion,
    name: "Iron Bastion",
    persianName: "دژ آهنین",
    icon: "🛡️",
    badgeClass: "bg-slate-700/80 text-cyan-300 border-slate-600",
    description: "استراتژی دفاع بتنی، گنبد پدافند لیزری و مقاومت حداکثری در برابر موشک‌ها",
    buffs: [
      "+۵۰٪ مقاومت سنگرها و پدافندها",
      "سامانه پدافند لیزری گنبد آهنین (رهگیری مافوق صوت)",
      "۵۰٪ کاهش تلفات ناشی از تشعشع موشکی در خاک خودی",
    ],
  },
  [MilitaryDoctrine.WarEconomy]: {
    id: MilitaryDoctrine.WarEconomy,
    name: "War Economy",
    persianName: "اقتصاد جنگی و صنعتی",
    icon: "💰",
    badgeClass: "bg-slate-700/80 text-emerald-300 border-slate-600",
    description: "توسعه زیرساخت‌های صنعتی، غارت مضاعف طلا و اوراق قرضه با سود کلان",
    buffs: [
      "+۵۰٪ غنیمت جنگی بیشتر از فتح شهرها و کارخانه‌ها",
      "+۳۰٪ افزایش درآمد مستمر طلا",
      "سرمایه‌گذاری اوراق قرضه جنگی (War Bonds)",
    ],
  },
};

export interface TacticalPower {
  id: string;
  name: string;
  persianName: string;
  icon: string;
  cost: Gold;
  cooldownMs: number;
  description: string;
  requiresTarget: boolean;
  targetType?: "tile" | "area" | "instant";
}

export const TACTICAL_POWERS: TacticalPower[] = [
  {
    id: "cruise_missile",
    name: "Cruise Missile",
    persianName: "موشک کروز نقطه‌زن",
    icon: "🚀",
    cost: 1_200_000n,
    cooldownMs: 40_000,
    description: "موشک نقطه‌زن مافوق صوت با هزینه ۱.۲ میلیون طلا برای انهدام دقیق یک پایگاه، پدافند یا سیلوی کلیدی هدف بدون تشعشع اتمی",
    requiresTarget: true,
    targetType: "tile",
  },
  {
    id: "emp_strike",
    name: "EMP Blackout",
    persianName: "پالس الکترومغناطیسی (EMP)",
    icon: "⚡",
    cost: 1_500_000n,
    cooldownMs: 50_000,
    description: "غیرفعال‌سازی موقت پدافندها و سیلوهای منطقه به شعاع ۸ تایل به مدت ۱۲ ثانیه جهت باز کردن کریدور حمله هوایی",
    requiresTarget: true,
    targetType: "area",
  },
  {
    id: "iron_dome",
    name: "Laser Iron Dome",
    persianName: "پدافند گنبد آهنین",
    icon: "🛡️",
    cost: 1_800_000n,
    cooldownMs: 45_000,
    description: "سپر پدافندی هوشمند به مدت ۱۵ ثانیه با قابلیت رهگیری و شکار خودکار حداکثر ۲ کلاهک موشکی متخاصم در آسمان خودی",
    requiresTarget: false,
    targetType: "instant",
  },
  {
    id: "war_bonds",
    name: "War Bonds",
    persianName: "اوراق قرضه جنگی",
    icon: "💰",
    cost: 1_000_000n,
    cooldownMs: 75_000,
    description: "سرمایه‌گذاری ۱ میلیون طلا به مدت ۴۵ ثانیه و دریافت ۱.۳ میلیون طلا (+۳۰۰ هزار سود) پس از سررسید اوراق",
    requiresTarget: false,
    targetType: "instant",
  },
  {
    id: "war_surge",
    name: "War Surge",
    persianName: "مارش سراسری تهاجم",
    icon: "🔥",
    cost: 700_000n,
    cooldownMs: 45_000,
    description: "سرعت‌بخشی و پشتیبانی روحی خطوط حمله با هزینه ۷۰۰ هزار طلا به مدت ۱۵ ثانیه برای درهم شکستن خطوط دفاعی",
    requiresTarget: false,
    targetType: "instant",
  },
  {
    id: "recon_drone",
    name: "Recon Drone",
    persianName: "پهپاد شناسایی تاکتیکی",
    icon: "🛰️",
    cost: 400_000n,
    cooldownMs: 30_000,
    description: "اسکن هوایی منطقه هدف به شعاع ۸ تایل برای کشف سیلوها و پدافندهای استتارشده دشمن",
    requiresTarget: true,
    targetType: "area",
  },
  {
    id: "stealth_silo",
    name: "Stealth Silo",
    persianName: "سیلو موشک مخفی",
    icon: "🔒",
    cost: 2_000_000n,
    cooldownMs: 30_000,
    description: "احداث سیلوی موشک پنهان‌کار با هزینه ۲ میلیون طلا؛ از دید رادار دشمن مخفی می‌ماند تا با پهپاد کشف شود",
    requiresTarget: true,
    targetType: "tile",
  },
  {
    id: "stealth_sam",
    name: "Stealth SAM",
    persianName: "پدافند سام مخفی",
    icon: "🕶️",
    cost: 2_800_000n,
    cooldownMs: 35_000,
    description: "احداث سامانه پدافندی استتارشده با هزینه ۲.۸ میلیون طلا؛ محل پدافند از رادار دشمن مخفی می‌ماند و غافلگیرانه شلیک می‌کند",
    requiresTarget: true,
    targetType: "tile",
  },
];

const DISABLED_POWERS_STORAGE_KEY = "openfront_disabled_tactical_powers";
const PREFERRED_DOCTRINE_STORAGE_KEY = "openfront_preferred_doctrine";

export function getDisabledTacticalPowers(): string[] {
  try {
    const raw = localStorage.getItem(DISABLED_POWERS_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // ignore
  }
  return [];
}

export function setDisabledTacticalPowers(powers: string[]): void {
  try {
    localStorage.setItem(DISABLED_POWERS_STORAGE_KEY, JSON.stringify(powers));
  } catch {
    // ignore
  }
}

export function toggleTacticalPowerDisabled(id: string): boolean {
  const current = getDisabledTacticalPowers();
  const index = current.indexOf(id);
  let updated: string[];
  let isDisabled: boolean;
  if (index >= 0) {
    updated = current.filter((p) => p !== id);
    isDisabled = false;
  } else {
    updated = [...current, id];
    isDisabled = true;
  }
  setDisabledTacticalPowers(updated);
  return isDisabled;
}

export function isTacticalPowerDisabled(id: string): boolean {
  return getDisabledTacticalPowers().includes(id);
}

export function getPreferredDoctrine(): MilitaryDoctrine {
  try {
    const raw = localStorage.getItem(PREFERRED_DOCTRINE_STORAGE_KEY);
    if (raw && Object.values(MilitaryDoctrine).includes(raw as MilitaryDoctrine)) {
      return raw as MilitaryDoctrine;
    }
  } catch {
    // ignore
  }
  return MilitaryDoctrine.Blitzkrieg;
}

export function setPreferredDoctrine(doctrine: MilitaryDoctrine): void {
  try {
    localStorage.setItem(PREFERRED_DOCTRINE_STORAGE_KEY, doctrine);
  } catch {
    // ignore
  }
}

export type DoctrineSelectionMode = "free" | "host_enforced";
const DOCTRINE_MODE_STORAGE_KEY = "openfront_doctrine_mode";
const ENFORCED_DOCTRINE_STORAGE_KEY = "openfront_enforced_doctrine";

export function getDoctrineMode(): DoctrineSelectionMode {
  try {
    const raw = localStorage.getItem(DOCTRINE_MODE_STORAGE_KEY);
    if (raw === "host_enforced" || raw === "free") {
      return raw;
    }
  } catch {
    // ignore
  }
  return "free";
}

export function setDoctrineMode(mode: DoctrineSelectionMode): void {
  try {
    localStorage.setItem(DOCTRINE_MODE_STORAGE_KEY, mode);
  } catch {
    // ignore
  }
}

export function getEnforcedDoctrine(): MilitaryDoctrine {
  try {
    const raw = localStorage.getItem(ENFORCED_DOCTRINE_STORAGE_KEY);
    if (raw && Object.values(MilitaryDoctrine).includes(raw as MilitaryDoctrine)) {
      return raw as MilitaryDoctrine;
    }
  } catch {
    // ignore
  }
  return MilitaryDoctrine.Blitzkrieg;
}

export function setEnforcedDoctrine(doctrine: MilitaryDoctrine): void {
  try {
    localStorage.setItem(ENFORCED_DOCTRINE_STORAGE_KEY, doctrine);
  } catch {
    // ignore
  }
}

const ALLOW_CHANGE_DOCTRINE_KEY = "openfront_allow_change_doctrine";

export function canChangeDoctrineInGame(): boolean {
  try {
    const raw = localStorage.getItem(ALLOW_CHANGE_DOCTRINE_KEY);
    if (raw !== null) {
      return raw === "true";
    }
  } catch {
    // ignore
  }
  return true;
}

export function setCanChangeDoctrineInGame(allow: boolean): void {
  try {
    localStorage.setItem(ALLOW_CHANGE_DOCTRINE_KEY, String(allow));
  } catch {
    // ignore
  }
}


