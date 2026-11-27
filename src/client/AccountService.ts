import {
  CROWN_KEY,
  EFFECTS_KEY,
  FLAG_KEY,
  PATTERN_KEY,
  USER_SETTINGS_CHANGED_EVENT,
  UserSettings,
} from "../core/game/UserSettings";
import { showToast } from "./Utils";
import { broadcastFreshUserMe, invalidateCosmetics } from "./Cosmetics";
import { setClientSession } from "./Auth";
import { invalidateUserMe } from "./Api";

export const PATTERN_BINARY_MAP: Record<string, string> = {
  cyberpunk: "ADEYM5nMZjOZzGY",
  magma: "ADEYzMwzM8zMMzM",
  gold_leaf: "ABEIpaU",
  deep_ocean: "ADEYM5nMZjOZzGY",
  carbon_fiber: "ADEYzMwzM8zMMzM",
  desert_camo: "ADEYzMwzM8zMMzM",
  matrix_code: "ACEQfxAEQQA",
  stripes: "ADEYM5nMZjOZzGY",
  checker: "ABEIpaU",
};

export const CROWN_URL_MAP: Record<string, string> = {
  emperor_gold: "/images/CrownIcon.svg",
  silver_wreath: "/flags/custom/laurel_wreath.svg",
  marshal_star: "/flags/custom/eu_star.svg",
  spartan_crest: "/flags/custom/admin_shield.svg",
};

export type Rarity = "common" | "rare" | "epic" | "legendary";

export interface ShopItem {
  id: string;
  name: string;
  category: "pattern" | "flag" | "crown" | "effect" | "title" | "bundle";
  description: string;
  priceCoins: number;
  priceGems?: number;
  rarity: Rarity;
  icon?: string;
  badge?: string;
  colors?: { primary: string; secondary: string };
  bundleItems?: string[];
}

export interface PlayerAccount {
  id: string;
  username: string;
  phone?: string;
  password?: string;
  level: number;
  xp: number;
  coins: number;
  gems: number;
  clanTag: string;
  flag: string;
  title: string;
  createdAt: number;
  lastDailyClaim: number;
  inventory: string[];
  equipped: {
    pattern?: string;
    flag?: string;
    crown?: string;
    effect?: string;
    title?: string;
  };
  stats: {
    matchesPlayed: number;
    wins: number;
    losses: number;
    kills: number;
    bestTerritory: number;
    elo?: number;
    peakElo?: number;
  };
}

export const SHOP_CATALOG: ShopItem[] = [
  // ─── بسته‌های ویژه ────────────────────────────────────────────────────────
  {
    id: "bundle:iron_general",
    name: "بسته ژنرال پولادین",
    category: "bundle",
    description: "شامل پترن فیبر کربن + یال جنگجوی باستان + عنوان افتخاری فاتح آهنین با ۳۰٪ تخفیف!",
    priceCoins: 900,
    rarity: "epic",
    icon: "📦",
    bundleItems: ["pattern:carbon_fiber", "crown:spartan_crest", "title:iron_conqueror"],
  },
  {
    id: "bundle:golden_emperor",
    name: "بسته امپراتور زرین",
    category: "bundle",
    description: "کامل‌ترین پک سلطنتی شامل پترن طلایی + تاج امپراتور + نشان شیر و خورشید + انفجار پلاسما!",
    priceCoins: 2500,
    rarity: "legendary",
    icon: "👑",
    bundleItems: ["pattern:gold_leaf", "crown:emperor_gold", "flag:lion_sun", "effect:plasma_nuke"],
  },

  // ─── پترن‌ها و رنگ‌های قلمرو ──────────────────────────────────────────────
  {
    id: "pattern:cyberpunk",
    name: "سایبرپانک نئونی",
    category: "pattern",
    description: "طرح قلمرو با خطوط نئونی بنفش و فیروزه‌ای آینده‌نگرانه و درخشش فوق‌العاده",
    priceCoins: 600,
    rarity: "epic",
    colors: { primary: "#00f0ff", secondary: "#ff007f" },
    icon: "🔮",
  },
  {
    id: "pattern:desert_camo",
    name: "استتار کویری چریکی",
    category: "pattern",
    description: "پوشش استتار نظامی برای نبردهای سهمگین صحرایی و اختفای تاکتیکی پایگاه‌ها",
    priceCoins: 400,
    rarity: "rare",
    colors: { primary: "#c2b280", secondary: "#8b7355" },
    icon: "🏜️",
  },
  {
    id: "pattern:magma",
    name: "گدازه مذاب آتشین",
    category: "pattern",
    description: "قلمرویی شعله‌ور از مواد مذاب با مرزهای سوزان و جوشنده در سراسر نقشه",
    priceCoins: 900,
    rarity: "legendary",
    colors: { primary: "#ff3700", secondary: "#ffbb00" },
    icon: "🌋",
  },
  {
    id: "pattern:deep_ocean",
    name: "اعماق اقیانوس",
    category: "pattern",
    description: "طرح گرادیانت آبی عمیق اقیانوسی با آرامش ظاهری و طوفان زیرین",
    priceCoins: 350,
    rarity: "rare",
    colors: { primary: "#0a2463", secondary: "#3e92cc" },
    icon: "🌊",
  },
  {
    id: "pattern:carbon_fiber",
    name: "فیبر کربن تیتانیوم",
    category: "pattern",
    description: "بافت مدرن فیبر کربن تیره مات با رگه‌های تقویت‌شده تیتانیومی",
    priceCoins: 500,
    rarity: "rare",
    colors: { primary: "#1c1c1c", secondary: "#444444" },
    icon: "🛡️",
  },
  {
    id: "pattern:gold_leaf",
    name: "امپراتوری زرین طلا",
    category: "pattern",
    description: "پترن طلایی درخشان سلطنتی مخصوص فاتحان جهان با حاشیه‌های صیقلی",
    priceCoins: 1200,
    rarity: "legendary",
    colors: { primary: "#ffd700", secondary: "#d4af37" },
    icon: "✨",
  },
  {
    id: "pattern:matrix_code",
    name: "ماتریکس دیجیتال",
    category: "pattern",
    description: "جریان داده‌های دیجیتال سبز سایبری در سراسر خاکریزها و مناطق تحت کنترل",
    priceCoins: 750,
    rarity: "epic",
    colors: { primary: "#00ff66", secondary: "#003b00" },
    icon: "💻",
  },

  // ─── پرچم‌ها و نشان‌های افتخار ──────────────────────────────────────────
  {
    id: "flag:lion_sun",
    name: "شیر و خورشید طلایی",
    category: "flag",
    description: "نماد کهن شجاعت، اصالت و اقتدار با شمشیر بران زرین",
    priceCoins: 500,
    rarity: "legendary",
    icon: "🦁",
  },
  {
    id: "flag:war_eagle",
    name: "عقاب بال‌گشوده تکاور",
    category: "flag",
    description: "نماد نیروی هوایی مقتدر و تسلط چشم‌عقاب بر تمامی سرحدات نبرد",
    priceCoins: 400,
    rarity: "epic",
    icon: "🦅",
  },
  {
    id: "flag:skull_crossbones",
    name: "پرچم دزدان دریایی",
    category: "flag",
    description: "وحشت مطلق در دل حریفان با نشان بی‌رحمی در دریا و خشکی",
    priceCoins: 300,
    rarity: "rare",
    icon: "☠️",
  },
  {
    id: "flag:atomic_hazard",
    name: "خطر اتمی تاکتیکی",
    category: "flag",
    description: "هشدار تشعشعات مرگبار موشک‌های قاره‌پیما و پایگاه‌های تسلیحاتی",
    priceCoins: 450,
    rarity: "epic",
    icon: "☢️",
  },
  {
    id: "flag:dragon_shield",
    name: "سپر اژدهای آتشین",
    category: "flag",
    description: "نماد تسخیرناپذیری دژها و پایداری فولادین در برابر حملات سنگین",
    priceCoins: 600,
    rarity: "legendary",
    icon: "🐉",
  },
  {
    id: "flag:peace_dove",
    name: "کبوتر صلح مسلح",
    category: "flag",
    description: "نماد استراتژی پیشرفت در آرامش اما مجهز به ادوات بازدارنده",
    priceCoins: 200,
    rarity: "common",
    icon: "🕊️",
  },

  // ─── تاج‌ها و نشان‌های فرماندهی ────────────────────────────────────────
  {
    id: "crown:emperor_gold",
    name: "تاج امپراتور زرین",
    category: "crown",
    description: "تاج باشکوه مزین به یاقوت سرخ شاهوار برای رهبر بلامنازع نقشه",
    priceCoins: 1000,
    rarity: "legendary",
    icon: "👑",
  },
  {
    id: "crown:silver_wreath",
    name: "تاج برگ زیتون نقره‌ای",
    category: "crown",
    description: "نشان افتخار و پیروزی‌های متوالی در نبردهای طاقت‌فرسا",
    priceCoins: 450,
    rarity: "rare",
    icon: "🌿",
  },
  {
    id: "crown:marshal_star",
    name: "ستاره ۵‌پر مارشال",
    category: "crown",
    description: "بالاترین نشان شایستگی و لیاقت برای فرماندهان ارشد قوا",
    priceCoins: 700,
    rarity: "epic",
    icon: "⭐",
  },
  {
    id: "crown:spartan_crest",
    name: "یال جنگجوی باستان",
    category: "crown",
    description: "نشان تاکتیکی جنگاوران خط مقدم و شکست‌ناپذیران محاصره",
    priceCoins: 550,
    rarity: "rare",
    icon: "🪖",
  },

  // ─── جلوه‌های ویژه و افکت‌های نبرد ──────────────────────────────────────
  {
    id: "effect:plasma_nuke",
    name: "انفجار هسته‌ای پلاسما",
    category: "effect",
    description: "قارچ هسته‌ای بنفش رنگ با امواج شوک پلاسما هنگام شلیک اتمی",
    priceCoins: 1200,
    rarity: "legendary",
    icon: "💥",
  },
  {
    id: "effect:fire_trail",
    name: "دنباله موشک آتشین",
    category: "effect",
    description: "رد شعله‌های سوزان و دود غلیظ برای شلیک موشک‌ها و ناوگان دریایی",
    priceCoins: 500,
    rarity: "rare",
    icon: "🔥",
  },
  {
    id: "effect:lightning_strike",
    name: "صاعقه رعدآسا",
    category: "effect",
    description: "برخورد آذرخش‌های فیروزه‌ای در لحظه تسخیر خاکریزها و مراکز فرماندهی",
    priceCoins: 850,
    rarity: "epic",
    icon: "⚡",
  },
  {
    id: "effect:golden_dust",
    name: "هاله ذرات زرین",
    category: "effect",
    description: "افکت ذرات شناور طلا بر فراز مرزها و قلمرو تحت کنترل",
    priceCoins: 750,
    rarity: "epic",
    icon: "✨",
  },

  // ─── عناوین و القاب افتخاری نبرد ───────────────────────────────────────
  {
    id: "title:supreme_commander",
    name: "فرمانده معظم",
    category: "title",
    description: "عنوان اختصاصی فرماندهانی که کل قاره را به زانو درمی‌آورند",
    priceCoins: 300,
    rarity: "epic",
    icon: "🎖️",
  },
  {
    id: "title:tank_destroyer",
    name: "شکارچی تانک",
    category: "title",
    description: "لقب رعب‌آور برای متخصصین متلاشی کردن لشکرهای زرهی حریف",
    priceCoins: 200,
    rarity: "rare",
    icon: "🎯",
  },
  {
    id: "title:master_tactician",
    name: "نابغه استراتژی",
    category: "title",
    description: "پیروزی بر حریفان با کمترین تلفات و محاسبات دقیق ریاضی",
    priceCoins: 400,
    rarity: "legendary",
    icon: "🧠",
  },
  {
    id: "title:iron_conqueror",
    name: "فاتح آهنین",
    category: "title",
    description: "سرسخت و تسلیم‌ناپذیر در برابر یورش‌های چندجانبه رقبا",
    priceCoins: 500,
    rarity: "legendary",
    icon: "🏆",
  },
  {
    id: "title:lone_wolf",
    name: "گرگ تنها",
    category: "title",
    description: "جنگ تن‌به‌تن و متکی بر مهارت فردی بدون نیاز به اتحاد",
    priceCoins: 250,
    rarity: "rare",
    icon: "🐺",
  },
];

const CURRENT_USER_KEY = "ironfront_user_v1";
const AUTH_TOKEN_KEY = "ironfront_auth_token";
const DAILY_REWARD_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const DAILY_REWARD_COINS = 500;
const DAILY_REWARD_GEMS = 10;

// Cleanup legacy mock account storage keys on module load
try {
  localStorage.removeItem("ironfront_accounts");
  localStorage.removeItem("ironfront_accounts_v1");
  localStorage.removeItem("ironfront_active_account_id");
} catch {
  // Ignored
}

export class AccountService {
  private static cachedAccount: PlayerAccount | null = null;
  private static serverSyncStarted = false;

  public static getAuthToken(): string | null {
    try {
      return localStorage.getItem(AUTH_TOKEN_KEY);
    } catch {
      return null;
    }
  }

  public static setAuthToken(token: string | null): void {
    try {
      if (token) {
        localStorage.setItem(AUTH_TOKEN_KEY, token);
      } else {
        localStorage.removeItem(AUTH_TOKEN_KEY);
      }
    } catch (e) {
      console.warn("Error setting auth token", e);
    }
  }

  public static getActiveAccount(): PlayerAccount | null {
    if (this.cachedAccount) return this.cachedAccount;

    const token = this.getAuthToken();
    if (!token) {
      // In guest mode, there is NO account!
      return null;
    }

    try {
      const raw = localStorage.getItem(CURRENT_USER_KEY);
      if (raw) {
        this.cachedAccount = JSON.parse(raw);
        if (this.cachedAccount) {
          if (!this.serverSyncStarted) {
            this.serverSyncStarted = true;
            void this.syncWithServer();
          }
          return this.cachedAccount;
        }
      }
    } catch {
      // Ignored
    }

    if (!this.serverSyncStarted) {
      this.serverSyncStarted = true;
      void this.syncWithServer();
    }

    return null;
  }

  public static async syncWithServer(): Promise<void> {
    const token = this.getAuthToken();
    if (!token) {
      this.cachedAccount = null;
      try {
        localStorage.removeItem(CURRENT_USER_KEY);
      } catch {}
      return;
    }

    try {
      const res = await fetch("/api/account/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 401) {
          await this.logout();
        }
        return;
      }

      const data = await res.json();
      if (data.success && data.user) {
        this.applyServerUser(data.user);
      }
    } catch (e) {
      console.debug("[AccountService] Server sync offline, keeping cached state", e);
    }
  }

  private static applyServerUser(serverUser: any): void {
    const acc: PlayerAccount = {
      id: serverUser.id,
      username: serverUser.username,
      level: serverUser.level ?? 1,
      xp: serverUser.xp ?? 0,
      coins: serverUser.coins ?? 0,
      gems: serverUser.gems ?? 0,
      clanTag: serverUser.clanTag ?? "",
      flag: serverUser.flag ?? "ir",
      title: serverUser.title ?? "فرمانده تازه‌کار",
      createdAt: serverUser.createdAt ?? Date.now(),
      lastDailyClaim: serverUser.lastDailyClaim ?? 0,
      inventory: serverUser.inventory ?? ["pattern:default"],
      equipped: serverUser.equipped ?? { pattern: "pattern:default", flag: "ir" },
      stats: serverUser.stats ?? {
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        kills: 0,
        bestTerritory: 0,
        elo: 1000,
        peakElo: 1000,
      },
    };

    this.cachedAccount = acc;
    try {
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(acc));
      localStorage.setItem("username", acc.username);
      if (acc.clanTag) localStorage.setItem("clan_tag", acc.clanTag);
    } catch (e) {
      console.warn("Failed to persist current user", e);
    }

    this.applyLoadoutToSettings(acc);
    this.notifyChange();
  }

  public static saveActiveAccount(account: PlayerAccount): void {
    this.cachedAccount = account;
    try {
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(account));
      localStorage.setItem("username", account.username);
      if (account.clanTag) {
        localStorage.setItem("clan_tag", account.clanTag);
      }
    } catch (e) {
      console.warn("Failed to save active account", e);
    }
    this.notifyChange();
  }

  public static async requestPhoneOtp(
    phone: string,
  ): Promise<{ success: boolean; message: string; debugCode?: string }> {
    try {
      const res = await fetch("/api/auth/phone/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      return data;
    } catch (e) {
      console.error("[AccountService] requestPhoneOtp error", e);
      return { success: false, message: "خطا در ارتباط با سرور." };
    }
  }

  public static async verifyPhoneOtp(
    phone: string,
    code: string,
    username?: string,
  ): Promise<{ success: boolean; message: string; account?: PlayerAccount; isNew?: boolean }> {
    try {
      const res = await fetch("/api/auth/phone/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code, username }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        this.setAuthToken(data.token);
        if (data.jwt) {
          setClientSession(data.jwt, data.expiresIn);
        }
        this.applyServerUser(data.user);
        invalidateUserMe();
        await broadcastFreshUserMe();
        showToast(
          data.isNew
            ? `حساب کاربری با شماره «${phone}» با موفقیت ایجاد شد!`
            : `خوش آمدید «${data.user.username}»!`,
          "green",
        );
        return {
          success: true,
          message: data.message,
          account: this.cachedAccount!,
          isNew: data.isNew,
        };
      } else {
        return { success: false, message: data.message ?? "کد وارد شده معتبر نیست." };
      }
    } catch (e) {
      console.error("[AccountService] verifyPhoneOtp error", e);
      return { success: false, message: "خطا در برقراری ارتباط با سرور." };
    }
  }

  public static async requestZarinpalPayment(params: {
    itemKind: "plutonium" | "pack" | "coins" | "cosmetic";
    itemAmount: number;
    itemName?: string;
  }): Promise<{ ok: boolean; paymentUrl?: string; authority?: string; message?: string }> {
    const token = this.getAuthToken();
    if (!token) {
      showToast("برای پرداخت ابتدا باید وارد حساب کاربری خود شوید.", "red");
      return { ok: false, message: "کاربر وارد نشده است." };
    }

    try {
      const res = await fetch("/api/payment/zarinpal/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (data.ok && data.paymentUrl) {
        return { ok: true, paymentUrl: data.paymentUrl, authority: data.authority };
      } else {
        showToast(data.message ?? "خطا در اتصال به درگاه زرین‌پال", "red");
        return { ok: false, message: data.message };
      }
    } catch (e) {
      console.error("[AccountService] Zarinpal request error", e);
      showToast("خطا در برقراری ارتباط با درگاه پرداخت.", "red");
      return { ok: false, message: "خطا در ارتباط با سرور" };
    }
  }

  public static async register(
    username: string,
    password = "",
  ): Promise<{ success: boolean; message: string; account?: PlayerAccount }> {
    const trimmed = username.trim();
    if (!trimmed || trimmed.length < 2) {
      return { success: false, message: "نام کاربری باید حداقل ۲ حرف باشد." };
    }

    try {
      const res = await fetch("/api/account/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmed, password }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        this.setAuthToken(data.token);
        if (data.jwt) {
          setClientSession(data.jwt, data.expiresIn);
        }
        this.applyServerUser(data.user);
        invalidateUserMe();
        await broadcastFreshUserMe();
        showToast(`حساب کاربری «${data.user.username}» با موفقیت ایجاد شد!`, "green");
        return { success: true, message: data.message, account: this.cachedAccount! };
      } else {
        return { success: false, message: data.message ?? "خطا در ثبت‌نام" };
      }
    } catch (e) {
      console.error("[AccountService] Register error", e);
      return { success: false, message: "خطا در برقراری ارتباط با سرور." };
    }
  }

  public static async login(
    username: string,
    password = "",
  ): Promise<{ success: boolean; message: string; account?: PlayerAccount }> {
    const trimmed = username.trim();
    if (!trimmed) {
      return { success: false, message: "لطفاً نام کاربری را وارد کنید." };
    }

    try {
      const res = await fetch("/api/account/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmed, password }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        this.setAuthToken(data.token);
        if (data.jwt) {
          setClientSession(data.jwt, data.expiresIn);
        }
        this.applyServerUser(data.user);
        invalidateUserMe();
        await broadcastFreshUserMe();
        showToast(`خوش آمدید «${data.user.username}»!`, "green");
        return { success: true, message: data.message, account: this.cachedAccount! };
      } else {
        return { success: false, message: data.message ?? "نام کاربری یا رمز عبور نادرست است." };
      }
    } catch (e) {
      console.error("[AccountService] Login error", e);
      return { success: false, message: "خطا در برقراری ارتباط با سرور." };
    }
  }

  public static isLoggedIn(): boolean {
    return Boolean(this.getAuthToken() && this.getActiveAccount());
  }

  public static async changePassword(
    oldPassword = "",
    newPassword = "",
  ): Promise<{ success: boolean; message: string }> {
    const token = this.getAuthToken();
    if (!token) {
      return { success: false, message: "برای تغییر رمز عبور باید وارد حساب کاربری شوید." };
    }

    try {
      const res = await fetch("/api/account/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("رمز عبور با موفقیت به‌روزرسانی شد.", "green");
        return { success: true, message: data.message };
      } else {
        showToast(data.message ?? "خطا در تغییر رمز عبور", "red");
        return { success: false, message: data.message };
      }
    } catch (e) {
      console.warn("[AccountService] changePassword failed", e);
      return { success: false, message: "خطا در برقراری ارتباط با سرور." };
    }
  }

  public static async logout(): Promise<void> {
    try {
      await fetch("/auth/logout", { method: "POST", credentials: "include" });
    } catch {}

    this.setAuthToken(null);
    this.cachedAccount = null;

    // 1. Reset UserSettings and clear all active cosmetic equips
    try {
      const userSettings = new UserSettings();
      userSettings.unequipAll();
      userSettings.setSelectedPatternName(undefined);
      userSettings.setSelectedCrownName(undefined);
      userSettings.clearFlag(true);
      userSettings.setFlag("country:ir");
      userSettings.setSelectedEffects({});
      userSettings.setActiveLoadout(null);
    } catch (e) {
      console.warn("[AccountService] Error unequipping settings on logout:", e);
    }

    // 2. Clear dev and custom cosmetic keys from localStorage
    try {
      localStorage.removeItem("dev-pattern");
      localStorage.removeItem("dev-primary");
      localStorage.removeItem("dev-secondary");
      localStorage.removeItem("dev-crown");
      localStorage.removeItem("settings.territoryColor");
      localStorage.removeItem("ironfront_player_title");
      localStorage.removeItem(PATTERN_KEY);
      localStorage.removeItem(FLAG_KEY);
      localStorage.removeItem(CROWN_KEY);
      localStorage.removeItem(EFFECTS_KEY);
      localStorage.removeItem("settings.activeLoadout");
      localStorage.removeItem(CURRENT_USER_KEY);
      localStorage.removeItem("ironfront_jwt");
      localStorage.removeItem("ironfront_accounts");
      localStorage.removeItem("ironfront_accounts_v1");
      localStorage.removeItem("ironfront_active_account_id");
    } catch {}

    // 3. Reset UserSettings player scope to clean guest scope
    UserSettings.setPlayerId(null);

    invalidateUserMe();
    invalidateCosmetics();
    this.notifyChange();
    document.dispatchEvent(new CustomEvent("session-cleared"));
    document.dispatchEvent(
      new CustomEvent("userMeResponse", {
        detail: false,
        bubbles: true,
        cancelable: true,
      }),
    );
    void broadcastFreshUserMe();
    showToast("با موفقیت از حساب کاربری خارج شدید.", "green");
  }

  public static updateProfile(partial: Partial<PlayerAccount>): void {
    const acc = this.getActiveAccount();
    if (!acc) return;
    const updated = { ...acc, ...partial };
    this.saveActiveAccount(updated);

    const token = this.getAuthToken();
    if (token) {
      fetch("/api/account/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(partial),
      }).catch(() => {});
    }
  }

  public static getXpForNextLevel(level: number): number {
    return Math.max(500, level * 500);
  }

  public static addXp(amount: number): { leveledUp: boolean; newLevel: number } {
    const acc = this.getActiveAccount();
    if (!acc) return { leveledUp: false, newLevel: 1 };
    acc.xp += Math.max(0, amount);
    let leveledUp = false;

    let target = this.getXpForNextLevel(acc.level);
    while (acc.xp >= target) {
      acc.xp -= target;
      acc.level += 1;
      acc.coins += 500;
      acc.gems += 15;
      leveledUp = true;
      target = this.getXpForNextLevel(acc.level);
      showToast(`🎉 ارتقای سطح! سطح شما به ${acc.level} رسید (+۵۰۰ سکه پاداش)`, "green");
    }

    this.saveActiveAccount(acc);
    return { leveledUp, newLevel: acc.level };
  }

  public static addCoins(amount: number, reason?: string): void {
    const acc = this.getActiveAccount();
    if (!acc) return;
    acc.coins += amount;
    this.saveActiveAccount(acc);
    if (amount > 0 && reason) {
      showToast(`+${amount} سکه دریافتی (${reason})`, "green");
    }
  }

  public static hasItem(itemId: string): boolean {
    if (itemId.startsWith("country:")) return true;
    if (itemId === "pattern:default" || itemId === "title:rookie") return true;
    const acc = this.getActiveAccount();
    if (!acc) return false;
    return acc.inventory.includes(itemId);
  }

  public static async buyItem(item: ShopItem): Promise<{ success: boolean; message: string }> {
    if (!this.isLoggedIn()) {
      showToast("برای خرید از فروشگاه لطفاً ابتدا وارد حساب خود شوید یا ثبت‌نام کنید.", "red");
      window.location.hash = "modal=account";
      return { success: false, message: "نیاز به ورود به حساب کاربری دارد." };
    }
    const acc = this.getActiveAccount();
    if (!acc) return { success: false, message: "حساب کاربری یافت نشد." };

    if (this.hasItem(item.id)) {
      return { success: false, message: "شما این آیتم را از قبل خریداری کرده‌اید." };
    }

    if (acc.coins < item.priceCoins) {
      const needed = item.priceCoins - acc.coins;
      return {
        success: false,
        message: `موجودی ناکافی! به ${needed.toLocaleString("en-US")} سکه دیگر نیاز دارید. با انجام نبردها یا هدیه روزانه سکه کسب کنید.`,
      };
    }

    const token = this.getAuthToken();
    try {
      const res = await fetch("/api/account/buy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          itemId: item.id,
          priceCoins: item.priceCoins,
          bundleItems: item.bundleItems,
        }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        this.applyServerUser(data.user);
        void broadcastFreshUserMe();
        showToast(`آیتم «${item.name}» با موفقیت خریداری شد!`, "green");
        return { success: true, message: data.message };
      } else {
        return { success: false, message: data.message ?? "خطا در خرید آیتم" };
      }
    } catch {
      return { success: false, message: "خطا در برقراری ارتباط با سرور." };
    }
  }

  public static applyLoadoutToSettings(acc: PlayerAccount): void {
    this.isSyncingEquipped = true;
    try {
      const userSettings = new UserSettings();

      // 1. Pattern
      const equippedPattern = acc.equipped?.pattern;
      if (equippedPattern && equippedPattern !== "pattern:default" && equippedPattern !== "default") {
        let patternRef = equippedPattern;
        if (!patternRef.startsWith("pattern:") && !patternRef.startsWith("skin:")) {
          patternRef = `pattern:${patternRef}:${patternRef}`;
        } else if (patternRef.startsWith("pattern:")) {
          const raw = patternRef.slice("pattern:".length);
          if (!raw.includes(":")) {
            patternRef = `pattern:${raw}:${raw}`;
          }
        }
        userSettings.setSelectedPatternName(patternRef);

        const baseName = patternRef.replace("pattern:", "").replace("skin:", "").split(":")[0];
        const found = SHOP_CATALOG.find((i) => i.id === `pattern:${baseName}` || i.id === baseName);
        if (PATTERN_BINARY_MAP[baseName]) {
          localStorage.setItem("dev-pattern", PATTERN_BINARY_MAP[baseName]);
        }
        if (found?.colors) {
          localStorage.setItem("dev-primary", found.colors.primary);
          localStorage.setItem("dev-secondary", found.colors.secondary);
          localStorage.setItem("settings.territoryColor", found.colors.primary);
        }
      } else {
        localStorage.removeItem("dev-pattern");
        localStorage.removeItem("dev-primary");
        localStorage.removeItem("dev-secondary");
        userSettings.setSelectedPatternName(undefined);
      }

      // 2. Crown
      const equippedCrown = acc.equipped?.crown;
      if (equippedCrown && equippedCrown !== "none" && equippedCrown !== "") {
        const crownName = equippedCrown.replace("crown:", "");
        userSettings.setSelectedCrownName(crownName);
        const crownUrl = CROWN_URL_MAP[crownName] || `/crowns/${crownName}.svg`;
        localStorage.setItem("dev-crown", crownUrl);
      } else {
        localStorage.removeItem("dev-crown");
        userSettings.setSelectedCrownName(undefined);
      }

      // 3. Flag
      const equippedFlag = acc.equipped?.flag ?? acc.flag ?? "ir";
      if (equippedFlag) {
        let flagRef = equippedFlag;
        if (!flagRef.startsWith("flag:") && !flagRef.startsWith("country:")) {
          flagRef = flagRef.length === 2 ? `country:${flagRef}` : `flag:${flagRef}`;
        }
        userSettings.setFlag(flagRef);
      } else {
        userSettings.setFlag("country:ir");
      }

      // 4. Effect
      const equippedEffect = acc.equipped?.effect;
      if (equippedEffect && equippedEffect !== "none" && equippedEffect !== "") {
        const effectName = equippedEffect.replace("effect:", "");
        if (effectName === "plasma_nuke") {
          userSettings.setSelectedEffectName("atom", effectName);
        } else if (effectName === "fire_trail" || effectName === "golden_dust") {
          userSettings.setSelectedEffectName("transportShipTrail", effectName);
        } else if (effectName === "lightning_strike") {
          userSettings.setSelectedEffectName("nukeTrail", effectName);
        } else {
          userSettings.setSelectedEffectName("transportShipTrail", effectName);
        }
      } else {
        userSettings.setSelectedEffects({});
      }

      // 5. Title
      if (acc.title) {
        localStorage.setItem("ironfront_player_title", acc.title);
      }

      invalidateCosmetics();
    } catch (e) {
      console.warn("[AccountService] Error applying loadout to settings", e);
    } finally {
      setTimeout(() => {
        AccountService.isSyncingEquipped = false;
      }, 100);
    }
  }

  private static syncDebounceTimer: any = null;
  private static isSyncingEquipped = false;

  public static syncCurrentLoadoutToServer(): void {
    if (!this.isLoggedIn() || this.isSyncingEquipped) return;
    const acc = this.getActiveAccount();
    if (!acc) return;

    if (this.syncDebounceTimer) clearTimeout(this.syncDebounceTimer);
    this.syncDebounceTimer = setTimeout(() => {
      try {
        const userSettings = new UserSettings();
        const currentLoadout = userSettings.captureLoadout("sync");
        const currentPattern = currentLoadout.pattern ?? "pattern:default";
        const currentCrown = currentLoadout.crown ?? "";
        const currentFlag = currentLoadout.flag ?? "ir";
        const firstEffect = Object.values(currentLoadout.effects || {})[0] || "";

        acc.equipped = {
          ...acc.equipped,
          pattern: currentPattern,
          crown: currentCrown,
          flag: currentFlag.replace("flag:", "").replace("country:", ""),
          effect: firstEffect,
        };

        this.saveActiveAccount(acc);

        const token = this.getAuthToken();
        if (token) {
          fetch("/api/account/update", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              equipped: acc.equipped,
              flag: acc.equipped.flag,
              title: acc.title,
            }),
          }).catch(() => {});
        }
      } catch (err) {
        console.warn("[AccountService] syncCurrentLoadoutToServer error", err);
      }
    }, 150);
  }

  private static syncInitialized = false;
  public static initEquippedSync(): void {
    if (this.syncInitialized || typeof window === "undefined") return;
    this.syncInitialized = true;

    const events = [
      `${USER_SETTINGS_CHANGED_EVENT}:${PATTERN_KEY}`,
      `${USER_SETTINGS_CHANGED_EVENT}:${FLAG_KEY}`,
      `${USER_SETTINGS_CHANGED_EVENT}:${CROWN_KEY}`,
      `${USER_SETTINGS_CHANGED_EVENT}:${EFFECTS_KEY}`,
    ];

    for (const evt of events) {
      window.addEventListener(evt, () => {
        if (AccountService.isLoggedIn()) {
          AccountService.syncCurrentLoadoutToServer();
        }
      });
    }
  }

  public static equipItem(category: "pattern" | "flag" | "crown" | "effect" | "title", itemId: string): boolean {
    if (!this.isLoggedIn()) {
      showToast("برای تجهیز آیتم‌ها لطفاً وارد حساب خود شوید.", "red");
      return false;
    }
    const acc = this.getActiveAccount();
    if (!acc) return false;
    if (!this.hasItem(itemId) && !itemId.startsWith("country:")) {
      showToast("این آیتم هنوز بازگشایی نشده است!", "red");
      return false;
    }

    acc.equipped[category] = itemId;

    if (category === "flag") {
      acc.flag = itemId.replace("flag:", "").replace("country:", "");
    } else if (category === "title") {
      const found = SHOP_CATALOG.find((i) => i.id === itemId);
      acc.title = found ? found.name : itemId;
    }

    this.saveActiveAccount(acc);
    this.applyLoadoutToSettings(acc);

    const token = this.getAuthToken();
    if (token) {
      fetch("/api/account/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ equipped: acc.equipped, flag: acc.flag, title: acc.title }),
      }).catch(() => {});
    }

    showToast(`آیتم به عنوان ظاهر فعال تجهیز شد و در نبرد اعمال گردید`, "green");
    return true;
  }

  public static canClaimDailyReward(): { canClaim: boolean; msRemaining: number } {
    const acc = this.getActiveAccount();
    if (!acc) return { canClaim: false, msRemaining: 0 };
    const now = Date.now();
    const elapsed = now - (acc.lastDailyClaim || 0);
    if (elapsed >= DAILY_REWARD_COOLDOWN_MS) {
      return { canClaim: true, msRemaining: 0 };
    }
    return { canClaim: false, msRemaining: DAILY_REWARD_COOLDOWN_MS - elapsed };
  }

  public static async claimDailyReward(): Promise<{ success: boolean; message: string; coins?: number; gems?: number }> {
    if (!this.isLoggedIn()) {
      showToast("برای دریافت جایزه روزانه لطفاً ابتدا وارد حساب خود شوید.", "red");
      window.location.hash = "modal=account";
      return { success: false, message: "نیاز به ورود به حساب کاربری دارد." };
    }
    const token = this.getAuthToken();
    try {
      const res = await fetch("/api/account/claim-daily", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && data.user) {
        this.applyServerUser(data.user);
        void broadcastFreshUserMe();
        showToast(data.message, "green");
        return { success: true, message: data.message, coins: data.coins, gems: data.gems };
      } else {
        showToast(data.message ?? "امکان دریافت جایزه روزانه وجود ندارد.", "red");
        return { success: false, message: data.message ?? "خطا در دریافت جایزه" };
      }
    } catch {
      return { success: false, message: "خطا در برقراری ارتباط با سرور." };
    }
  }

  public static recordMatchOutcome(isWin: boolean, kills = 0, territoryPercent = 0): void {
    if (!this.isLoggedIn()) {
      // Guest mode - no saved match rewards
      return;
    }
    const acc = this.getActiveAccount();
    if (!acc) return;

    const token = this.getAuthToken();
    if (token) {
      fetch("/api/account/record-match", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isWin, kills, territoryPercent }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.user) {
            this.applyServerUser(data.user);
            void broadcastFreshUserMe();
            showToast(
              isWin
                ? `🏆 پیروزی در نبرد! +${data.earnedCoins} سکه | +${data.earnedXp} XP`
                : `⚔️ پایان نبرد: +${data.earnedCoins} سکه | +${data.earnedXp} XP`,
              "green",
            );
          }
        })
        .catch(() => {});
    }
  }

  private static notifyChange(): void {
    const event = new CustomEvent("ironfront:account-changed", {
      detail: this.cachedAccount,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);
    document.dispatchEvent(event);
  }
}

// Automatically sync equipped loadout between UserSettings and account
AccountService.initEquippedSync();

