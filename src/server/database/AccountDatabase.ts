import fs from "fs";
import path from "path";
import crypto from "crypto";

export interface ServerUserStats {
  matchesPlayed: number;
  wins: number;
  losses: number;
  kills: number;
  bestTerritory: number;
  elo: number;
  peakElo: number;
}

export interface ServerUser {
  id: string;
  uuid: string;
  username: string;
  phone?: string;
  passwordSalt: string;
  passwordHash: string;
  token: string;
  level: number;
  xp: number;
  coins: number;
  gems: number;
  clanTag: string;
  flag: string;
  title: string;
  inventory: string[];
  equipped: {
    pattern?: string;
    flag?: string;
    crown?: string;
    effect?: string;
    title?: string;
  };
  stats: ServerUserStats;
  lastDailyClaim: number;
  createdAt: number;
  updatedAt: number;
}

export interface ZarinpalOrder {
  authority: string;
  userId: string;
  amountTomans: number;
  itemKind: "plutonium" | "pack" | "coins" | "cosmetic";
  itemAmount: number;
  itemName: string;
  status: "pending" | "paid" | "failed";
  refId?: number | string;
  cardPan?: string;
  createdAt: number;
  paidAt?: number;
}

export function normalizePhoneNumber(raw: string): string | null {
  if (!raw) return null;
  let s = raw
    .trim()
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[\s\-\(\)]/g, "");

  if (s.startsWith("+98")) s = "0" + s.substring(3);
  if (s.startsWith("0098")) s = "0" + s.substring(4);
  if (s.startsWith("98") && s.length === 12) s = "0" + s.substring(2);
  if (s.startsWith("9") && s.length === 10) s = "0" + s;

  if (!/^09\d{9}$/.test(s)) {
    return null;
  }
  return s;
}

const DATA_DIR = path.resolve(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "accounts.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const DAILY_REWARD_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const DAILY_REWARD_COINS = 500;
const DAILY_REWARD_GEMS = 10;

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

export class AccountDatabase {
  private static users: Map<string, ServerUser> = new Map(); // key: userId
  private static uuidIndex: Map<string, string> = new Map(); // key: uuid -> userId
  private static usernameIndex: Map<string, string> = new Map(); // key: lowercase username -> userId
  private static tokenIndex: Map<string, string> = new Map(); // key: token -> userId
  private static phoneIndex: Map<string, string> = new Map(); // key: normalized phone -> userId
  private static otpStore: Map<
    string,
    { code: string; expiresAt: number; attempts: number; lastSentAt: number }
  > = new Map();
  private static orders: Map<string, ZarinpalOrder> = new Map(); // key: authority -> ZarinpalOrder
  private static initialized = false;

  public static init(): void {
    if (this.initialized) return;

    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, "utf-8");
        const list: ServerUser[] = JSON.parse(raw);
        let migrated = false;
        for (const user of list) {
          if (!user.uuid) {
            user.uuid = crypto.randomUUID();
            migrated = true;
          }
          this.users.set(user.id, user);
          this.uuidIndex.set(user.uuid, user.id);
          this.usernameIndex.set(user.username.toLowerCase(), user.id);
          if (user.token) {
            this.tokenIndex.set(user.token, user.id);
          }
          if (user.phone) {
            this.phoneIndex.set(user.phone, user.id);
          }
        }
        if (migrated) {
          this.saveSync();
        }
      } else {
        // Seed initial admin/demo leader accounts for a rich production feel
        this.seedDemoUsers();
        this.saveSync();
      }

      if (fs.existsSync(ORDERS_FILE)) {
        try {
          const rawOrders = fs.readFileSync(ORDERS_FILE, "utf-8");
          const orderList: ZarinpalOrder[] = JSON.parse(rawOrders);
          for (const ord of orderList) {
            this.orders.set(ord.authority, ord);
          }
        } catch (e) {
          console.error("[AccountDatabase] Error loading orders:", e);
        }
      }
    } catch (e) {
      console.error("[AccountDatabase] Error loading database:", e);
    }

    this.initialized = true;
  }

  private static seedDemoUsers(): void {
    const demos = [
      { name: "General_Sorena", elo: 1850, wins: 142, losses: 18, kills: 890, lvl: 15, title: "فرمانده معظم" },
      { name: "Iron_Hunter", elo: 1720, wins: 110, losses: 25, kills: 730, lvl: 12, title: "شکارچی تانک" },
      { name: "Ariobarzan", elo: 1640, wins: 95, losses: 30, kills: 610, lvl: 10, title: "فاتح آهنین" },
      { name: "Desert_Eagle", elo: 1530, wins: 78, losses: 29, kills: 480, lvl: 8, title: "نابغه استراتژی" },
      { name: "Alborz_Wolf", elo: 1420, wins: 56, losses: 24, kills: 350, lvl: 6, title: "گرگ تنها" },
    ];

    for (const d of demos) {
      const salt = crypto.randomBytes(16).toString("hex");
      const hash = hashPassword("ironfront123", salt);
      const user: ServerUser = {
        id: "usr_" + crypto.randomBytes(6).toString("hex"),
        uuid: crypto.randomUUID(),
        username: d.name,
        passwordSalt: salt,
        passwordHash: hash,
        token: "tok_" + crypto.randomBytes(16).toString("hex"),
        level: d.lvl,
        xp: d.lvl * 350,
        coins: d.lvl * 1200,
        gems: d.lvl * 25,
        clanTag: "IRN",
        flag: "ir",
        title: d.title,
        inventory: ["pattern:default", "flag:lion_sun", "title:supreme_commander"],
        equipped: {
          pattern: "pattern:default",
          flag: "ir",
          title: d.title,
        },
        stats: {
          matchesPlayed: d.wins + d.losses,
          wins: d.wins,
          losses: d.losses,
          kills: d.kills,
          bestTerritory: 88,
          elo: d.elo,
          peakElo: d.elo + 50,
        },
        lastDailyClaim: 0,
        createdAt: Date.now() - 30 * 86400000,
        updatedAt: Date.now(),
      };
      this.users.set(user.id, user);
      this.uuidIndex.set(user.uuid, user.id);
      this.usernameIndex.set(user.username.toLowerCase(), user.id);
      this.tokenIndex.set(user.token, user.id);
    }
  }

  private static saveSync(): void {
    try {
      const list = Array.from(this.users.values());
      const tmpFile = DB_FILE + ".tmp";
      fs.writeFileSync(tmpFile, JSON.stringify(list, null, 2), "utf-8");
      fs.renameSync(tmpFile, DB_FILE);
    } catch (e) {
      console.error("[AccountDatabase] Error persisting database:", e);
    }
  }

  private static saveOrdersSync(): void {
    try {
      const list = Array.from(this.orders.values());
      const tmpFile = ORDERS_FILE + ".tmp";
      fs.writeFileSync(tmpFile, JSON.stringify(list, null, 2), "utf-8");
      fs.renameSync(tmpFile, ORDERS_FILE);
    } catch (e) {
      console.error("[AccountDatabase] Error persisting orders:", e);
    }
  }

  public static register(
    username: string,
    password = "",
  ): { success: boolean; message: string; user?: ServerUser; token?: string } {
    this.init();
    const cleanName = username.trim();
    if (!cleanName || cleanName.length < 3 || cleanName.length > 20 || !/^[a-zA-Z0-9_-]+$/.test(cleanName)) {
      return { success: false, message: "نام کاربری باید فقط شامل حروف انگلیسی، اعداد یا زیرخط (۳ تا ۲۰ نویسه) باشد." };
    }

    if (!password || typeof password !== "string" || password.length < 4) {
      return { success: false, message: "رمز عبور باید حداقل ۴ نویسه باشد." };
    }

    if (this.usernameIndex.has(cleanName.toLowerCase())) {
      return { success: false, message: "این نام کاربری قبلاً ثبت شده است." };
    }

    const salt = crypto.randomBytes(16).toString("hex");
    const hash = hashPassword(password, salt);
    const token = "tok_" + crypto.randomBytes(24).toString("hex");
    const userId = "usr_" + crypto.randomBytes(8).toString("hex");
    const userUuid = crypto.randomUUID();

    const newUser: ServerUser = {
      id: userId,
      uuid: userUuid,
      username: cleanName,
      passwordSalt: salt,
      passwordHash: hash,
      token,
      level: 1,
      xp: 0,
      coins: 1000, // 1,000 Starting coins welcome bonus
      gems: 50,
      clanTag: "",
      flag: "ir",
      title: "فرمانده تازه‌کار",
      inventory: ["pattern:default", "flag:peace_dove", "title:rookie"],
      equipped: {
        pattern: "pattern:default",
        flag: "ir",
        title: "فرمانده تازه‌کار",
      },
      stats: {
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        kills: 0,
        bestTerritory: 0,
        elo: 1000,
        peakElo: 1000,
      },
      lastDailyClaim: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.users.set(newUser.id, newUser);
    this.uuidIndex.set(newUser.uuid, newUser.id);
    this.usernameIndex.set(newUser.username.toLowerCase(), newUser.id);
    this.tokenIndex.set(newUser.token, newUser.id);
    this.saveSync();

    return {
      success: true,
      message: "حساب کاربری با موفقیت ایجاد شد.",
      user: newUser,
      token,
    };
  }

  public static login(
    username: string,
    password = "",
  ): { success: boolean; message: string; user?: ServerUser; token?: string } {
    this.init();
    const cleanName = username.trim().toLowerCase();
    const userId = this.usernameIndex.get(cleanName);
    if (!userId) {
      return { success: false, message: "حساب کاربری با این نام یافت نشد." };
    }

    const user = this.users.get(userId);
    if (!user) {
      return { success: false, message: "کاربر یافت نشد." };
    }

    if (!password || typeof password !== "string") {
      return { success: false, message: "رمز عبور الزامی است." };
    }
    if (!user.passwordHash || !user.passwordSalt) {
      return { success: false, message: "حساب کاربری فاقد رمز عبور معتبر است." };
    }

    const computed = hashPassword(password, user.passwordSalt);
    if (computed !== user.passwordHash) {
      return { success: false, message: "رمز عبور وارد شده نادرست است." };
    }

    // Refresh token
    const token = "tok_" + crypto.randomBytes(24).toString("hex");
    if (user.token) {
      this.tokenIndex.delete(user.token);
    }
    user.token = token;
    user.updatedAt = Date.now();
    this.tokenIndex.set(token, user.id);
    this.saveSync();

    return {
      success: true,
      message: "ورود با موفقیت انجام شد.",
      user,
      token,
    };
  }

  public static changePassword(
    userId: string,
    oldPassword = "",
    newPassword = "",
  ): { success: boolean; message: string; user?: ServerUser } {
    this.init();
    const user = this.users.get(userId);
    if (!user) return { success: false, message: "کاربر یافت نشد." };

    if (user.passwordHash) {
      const computed = hashPassword(oldPassword, user.passwordSalt);
      if (computed !== user.passwordHash) {
        return { success: false, message: "رمز عبور فعلی نادرست است." };
      }
    }

    if (!newPassword || newPassword.length < 4) {
      return { success: false, message: "رمز عبور جدید باید حداقل ۴ نویسه باشد." };
    }

    const salt = crypto.randomBytes(16).toString("hex");
    user.passwordSalt = salt;
    user.passwordHash = hashPassword(newPassword, salt);
    user.updatedAt = Date.now();
    this.saveSync();
    return { success: true, message: "رمز عبور با موفقیت تغییر کرد.", user };
  }

  public static getUserByToken(token: string): ServerUser | null {
    this.init();
    if (!token) return null;
    const userId = this.tokenIndex.get(token);
    if (!userId) return null;
    return this.users.get(userId) ?? null;
  }

  public static getUserById(userId: string): ServerUser | null {
    this.init();
    return this.users.get(userId) ?? null;
  }

  public static getUserByUuid(uuid: string): ServerUser | null {
    this.init();
    if (!uuid) return null;
    const userId = this.uuidIndex.get(uuid);
    if (!userId) return null;
    return this.users.get(userId) ?? null;
  }

  public static getPrimaryUser(): ServerUser | null {
    this.init();
    const first = this.users.values().next().value;
    return first ?? null;
  }

  public static getAllUsers(): ServerUser[] {
    this.init();
    return Array.from(this.users.values());
  }

  public static updateUsername(
    userId: string,
    newUsername: string,
  ): {
    success: boolean;
    message: string;
    user?: ServerUser;
    bareClaim?: "claimed" | "unavailable" | "not_eligible";
  } {
    this.init();
    const cleanName = newUsername.trim();
    if (!cleanName || cleanName.length < 3 || cleanName.length > 20 || !/^[a-zA-Z0-9_-]+$/.test(cleanName)) {
      return { success: false, message: "نام کاربری باید فقط شامل حروف انگلیسی، اعداد یا زیرخط (۳ تا ۲۰ نویسه) باشد." };
    }

    const lower = cleanName.toLowerCase();
    const existingId = this.usernameIndex.get(lower);
    if (existingId && existingId !== userId) {
      return {
        success: false,
        message: "این نام کاربری توسط کاربر دیگری ثبت شده است.",
        bareClaim: "unavailable",
      };
    }

    const user = this.users.get(userId);
    if (!user) {
      return { success: false, message: "کاربر یافت نشد." };
    }

    // Update index
    this.usernameIndex.delete(user.username.toLowerCase());
    user.username = cleanName;
    user.updatedAt = Date.now();
    this.usernameIndex.set(lower, user.id);
    this.saveSync();

    return {
      success: true,
      message: "نام کاربری با موفقیت تغییر کرد.",
      user,
      bareClaim: "claimed",
    };
  }

  public static claimDaily(userId: string): { success: boolean; message: string; coins?: number; gems?: number; user?: ServerUser } {
    this.init();
    const user = this.users.get(userId);
    if (!user) return { success: false, message: "کاربر یافت نشد." };

    const elapsed = Date.now() - (user.lastDailyClaim || 0);
    if (elapsed < DAILY_REWARD_COOLDOWN_MS) {
      const remainingHours = Math.ceil((DAILY_REWARD_COOLDOWN_MS - elapsed) / 3600000);
      return { success: false, message: `جایزه روزانه دریافت شده است. ${remainingHours} ساعت تا دریافت بعدی باقیست.` };
    }

    user.lastDailyClaim = Date.now();
    user.coins += DAILY_REWARD_COINS;
    user.gems += DAILY_REWARD_GEMS;
    user.updatedAt = Date.now();
    this.saveSync();

    return {
      success: true,
      message: `پاداش روزانه دریافت شد: +${DAILY_REWARD_COINS} سکه و +${DAILY_REWARD_GEMS} الماس!`,
      coins: DAILY_REWARD_COINS,
      gems: DAILY_REWARD_GEMS,
      user,
    };
  }

  public static buyItem(
    userId: string,
    itemId: string,
    priceCoins: number,
    bundleItems?: string[],
  ): { success: boolean; message: string; user?: ServerUser } {
    this.init();
    const user = this.users.get(userId);
    if (!user) return { success: false, message: "کاربر یافت نشد." };

    if (!itemId || typeof itemId !== "string" || itemId.length > 100) {
      return { success: false, message: "شناسه آیتم نامعتبر است." };
    }

    if (user.inventory.includes(itemId)) {
      return { success: false, message: "شما این آیتم را از قبل خریداری کرده‌اید." };
    }

    // Server-verified catalog prices (tamper prevention)
    const catalogPrices: Record<string, number> = {
      // patterns
      "pattern:cyberpunk_neon": 600,
      "pattern:desert_camo": 400,
      "pattern:magma": 900,
      "pattern:deep_ocean": 350,
      "pattern:carbon_fiber": 500,
      "pattern:gold_leaf": 1200,
      "pattern:matrix_code": 750,
      // flags
      "flag:lion_sun": 500,
      "flag:war_eagle": 400,
      "flag:skull_crossbones": 300,
      "flag:atomic_hazard": 450,
      "flag:dragon_shield": 600,
      "flag:peace_dove": 200,
      // crowns
      "crown:emperor_gold": 1000,
      "crown:silver_wreath": 450,
      "crown:marshal_star": 700,
      "crown:diamond_tiara": 850,
      "crown:iron_spikes": 550,
      "crown:glory_laurel": 600,
      // titles
      "title:supreme_commander": 500,
      "title:blitzkrieg_master": 600,
      "title:grand_strategist": 800,
      "title:iron_chancellor": 700,
      "title:lone_wolf": 350,
      "title:conqueror_of_empires": 1000,
      "title:tactical_genius": 450,
      "title:invincible": 900,
    };

    let realPrice = catalogPrices[itemId];
    if (realPrice === undefined) {
      try {
        const jsonPath = path.resolve(process.cwd(), "resources/cosmetics.json");
        if (fs.existsSync(jsonPath)) {
          const cosmetics = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
          const [type, name] = itemId.split(":");
          if (type && name) {
            const grp = (cosmetics as any)[type + "s"] || (cosmetics as any)[type];
            if (grp?.[name]?.priceSoft) {
              realPrice = grp[name].priceSoft;
            }
          }
        }
      } catch {}
    }

    if (realPrice === undefined) {
      realPrice = Math.max(200, Math.min(10000, Number(priceCoins) || 500));
    }

    if (user.coins < realPrice) {
      return {
        success: false,
        message: `موجودی ناکافی است. برای این خرید به ${realPrice - user.coins} سکه دیگر نیاز دارید.`,
      };
    }

    user.coins -= realPrice;
    user.inventory.push(itemId);

    // Only authorized server-side bundles can unpack multiple items
    const authorizedBundles: Record<string, string[]> = {
      "bundle:starter_commander": ["pattern:desert_camo", "flag:war_eagle", "title:tactical_genius"],
      "bundle:imperial_glory": ["pattern:gold_leaf", "flag:lion_sun", "crown:emperor_gold", "title:conqueror_of_empires"],
      "bundle:cyber_warfare": ["pattern:cyberpunk_neon", "pattern:matrix_code", "flag:atomic_hazard"],
    };

    if (authorizedBundles[itemId]) {
      for (const bi of authorizedBundles[itemId]) {
        if (!user.inventory.includes(bi)) {
          user.inventory.push(bi);
        }
      }
    }

    user.updatedAt = Date.now();
    this.saveSync();

    return { success: true, message: "آیتم با موفقیت خریداری شد.", user };
  }

  public static purchaseCosmetic(
    userId: string,
    params: {
      cosmeticType: "pattern" | "skin" | "flag" | "crown" | "effect";
      cosmeticName: string;
      currencyType: "hard" | "soft";
      colorPaletteName?: string;
    },
  ): { ok: boolean; code?: "insufficient_balance" | "already_owned" | "failed"; user?: ServerUser; flare?: string } {
    this.init();
    const user = this.users.get(userId);
    if (!user) return { ok: false, code: "failed" };

    const { cosmeticType, cosmeticName, currencyType, colorPaletteName } = params;

    let flare: string;
    if (cosmeticType === "pattern") {
      flare = colorPaletteName
        ? `pattern:${cosmeticName}:${colorPaletteName}`
        : `pattern:${cosmeticName}`;
    } else {
      flare = `${cosmeticType}:${cosmeticName}`;
    }

    if (user.inventory.includes(flare)) {
      return { ok: false, code: "already_owned" };
    }

    let price = 0;
    try {
      const jsonPath = path.resolve(process.cwd(), "resources/cosmetics.json");
      const cosmetics = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
      let item: any = null;
      if (cosmeticType === "pattern") item = cosmetics.patterns?.[cosmeticName];
      else if (cosmeticType === "flag") item = cosmetics.flags?.[cosmeticName];
      else if (cosmeticType === "crown") item = cosmetics.crowns?.[cosmeticName];
      else if (cosmeticType === "effect") {
        for (const grp of Object.values(cosmetics.effects || {})) {
          if ((grp as any)?.[cosmeticName]) {
            item = (grp as any)[cosmeticName];
            break;
          }
        }
      }
      if (currencyType === "hard") {
        price = item?.priceHard ?? 30;
      } else {
        price = item?.priceSoft ?? 500;
      }
    } catch {
      price = currencyType === "hard" ? 30 : 500;
    }

    if (currencyType === "hard") {
      if (user.gems < price) {
        return { ok: false, code: "insufficient_balance" };
      }
      user.gems -= price;
    } else {
      if (user.coins < price) {
        return { ok: false, code: "insufficient_balance" };
      }
      user.coins -= price;
    }

    user.inventory.push(flare);

    user.equipped ??= {};
    if (cosmeticType === "pattern") {
      user.equipped.pattern = flare;
    } else if (cosmeticType === "flag") {
      user.equipped.flag = cosmeticName;
    } else if (cosmeticType === "crown") {
      user.equipped.crown = cosmeticName;
    } else if (cosmeticType === "effect") {
      user.equipped.effect = cosmeticName;
    }

    user.updatedAt = Date.now();
    this.saveSync();

    return { ok: true, user, flare };
  }

  public static purchasePack(
    userId: string,
    packName: string,
  ): { ok: boolean; code?: "insufficient_balance" | "already_owned" | "unavailable" | "failed"; user?: ServerUser; items?: any[] } {
    this.init();
    const user = this.users.get(userId);
    if (!user) return { ok: false, code: "failed" };

    let pack: any = null;
    try {
      const jsonPath = path.resolve(process.cwd(), "resources/cosmetics.json");
      const cosmetics = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
      pack = cosmetics.packs?.[packName];
    } catch {
      return { ok: false, code: "unavailable" };
    }

    if (!pack || !Array.isArray(pack.items)) {
      return { ok: false, code: "unavailable" };
    }

    const price = pack.priceHard ?? 50;
    if (user.gems < price) {
      return { ok: false, code: "insufficient_balance" };
    }

    user.gems -= price;
    user.equipped ??= {};

    for (const it of pack.items) {
      const flare =
        it.type === "pattern" && it.colorPalette
          ? `pattern:${it.name}:${it.colorPalette}`
          : `${it.type}:${it.name}`;
      if (!user.inventory.includes(flare)) {
        user.inventory.push(flare);
      }
      if (it.type === "pattern") {
        user.equipped.pattern = flare;
      } else if (it.type === "flag") {
        user.equipped.flag = it.name;
      } else if (it.type === "crown") {
        user.equipped.crown = it.name;
      } else if (it.type === "effect") {
        user.equipped.effect = it.name;
      }
    }

    user.updatedAt = Date.now();
    this.saveSync();

    return { ok: true, user, items: pack.items };
  }

  public static updateProfile(
    userId: string,
    partial: Partial<{ clanTag: string; title: string; flag: string; equipped: ServerUser["equipped"] }>,
  ): { success: boolean; user?: ServerUser } {
    this.init();
    const user = this.users.get(userId);
    if (!user) return { success: false };

    if (typeof partial.clanTag === "string") user.clanTag = partial.clanTag.slice(0, 10);
    if (typeof partial.title === "string") {
      const freeTitles = ["فرمانده تازه‌کار", "title:rookie", "title: تازه‌کار"];
      if (
        freeTitles.includes(partial.title) ||
        user.inventory.includes(partial.title) ||
        user.inventory.includes(`title:${partial.title}`)
      ) {
        user.title = partial.title;
      }
    }
    if (typeof partial.flag === "string") {
      if (
        partial.flag.length === 2 ||
        user.inventory.includes(partial.flag) ||
        user.inventory.includes(`flag:${partial.flag}`)
      ) {
        user.flag = partial.flag;
      }
    }
    if (partial.equipped && typeof partial.equipped === "object") {
      user.equipped ??= {};

      // Pattern
      if (partial.equipped.pattern !== undefined) {
        const pat = String(partial.equipped.pattern).trim();
        if (!pat || pat === "pattern:default" || pat === "default") {
          user.equipped.pattern = "pattern:default";
        } else {
          const baseName = pat.replace("pattern:", "").split(":")[0];
          const isOwned =
            user.inventory.includes(pat) ||
            user.inventory.includes(`pattern:${baseName}`) ||
            user.inventory.some((inv) => inv.startsWith(`pattern:${baseName}:`));
          if (isOwned) {
            user.equipped.pattern = pat;
          }
        }
      }

      // Flag
      if (partial.equipped.flag !== undefined) {
        const flag = String(partial.equipped.flag).trim();
        if (!flag) {
          user.equipped.flag = "ir";
          user.flag = "ir";
        } else {
          const raw = flag.replace("flag:", "").replace("country:", "");
          const isCountry = raw.length === 2 || flag.startsWith("country:");
          const isOwned =
            isCountry ||
            user.inventory.includes(flag) ||
            user.inventory.includes(`flag:${raw}`) ||
            user.inventory.includes(raw);
          if (isOwned) {
            user.equipped.flag = flag;
            user.flag = raw;
          }
        }
      }

      // Crown
      if (partial.equipped.crown !== undefined) {
        const crown = String(partial.equipped.crown).trim();
        if (!crown || crown === "none") {
          user.equipped.crown = "";
        } else {
          const raw = crown.replace("crown:", "");
          const isOwned =
            user.inventory.includes(crown) ||
            user.inventory.includes(`crown:${raw}`) ||
            user.inventory.includes(raw);
          if (isOwned) {
            user.equipped.crown = crown;
          }
        }
      }

      // Effect
      if (partial.equipped.effect !== undefined) {
        const effect = String(partial.equipped.effect).trim();
        if (!effect || effect === "none") {
          user.equipped.effect = "";
        } else {
          const raw = effect.replace("effect:", "");
          const isOwned =
            user.inventory.includes(effect) ||
            user.inventory.includes(`effect:${raw}`) ||
            user.inventory.includes(raw);
          if (isOwned) {
            user.equipped.effect = effect;
          }
        }
      }

      // Title
      if (partial.equipped.title !== undefined) {
        const title = String(partial.equipped.title).trim();
        const freeTitles = ["فرمانده تازه‌کار", "title:rookie", "title: تازه‌کار", "rookie"];
        const raw = title.replace("title:", "");
        if (!title || freeTitles.includes(title) || freeTitles.includes(raw)) {
          user.equipped.title = "فرمانده تازه‌کار";
          user.title = "فرمانده تازه‌کار";
        } else {
          const isOwned =
            user.inventory.includes(title) ||
            user.inventory.includes(`title:${raw}`) ||
            user.inventory.includes(raw);
          if (isOwned) {
            user.equipped.title = title;
            user.title = title;
          }
        }
      }
    }

    user.updatedAt = Date.now();
    this.saveSync();

    return { success: true, user };
  }

  public static recordMatch(
    userId: string,
    match: { isWin: boolean; kills: number; territoryPercent: number },
  ): { success: boolean; earnedCoins: number; earnedXp: number; leveledUp: boolean; user?: ServerUser } {
    this.init();
    const user = this.users.get(userId);
    if (!user) return { success: false, earnedCoins: 0, earnedXp: 0, leveledUp: false };

    const isWin = Boolean(match.isWin);
    const kills = Math.max(0, Math.min(100, Math.floor(Number(match.kills) || 0)));
    const territoryPercent = Math.max(0, Math.min(100, Math.round(Number(match.territoryPercent) || 0)));

    user.stats.matchesPlayed += 1;
    if (isWin) {
      user.stats.wins += 1;
      user.stats.elo += 25;
      if (user.stats.elo > user.stats.peakElo) user.stats.peakElo = user.stats.elo;
    } else {
      user.stats.losses += 1;
      user.stats.elo = Math.max(500, user.stats.elo - 15);
    }

    user.stats.kills += kills;
    if (territoryPercent > user.stats.bestTerritory) {
      user.stats.bestTerritory = territoryPercent;
    }

    const earnedCoins = 100 + (isWin ? 250 : 0) + kills * 20 + Math.round(territoryPercent * 1.5);
    const earnedXp = 150 + (isWin ? 300 : 0) + kills * 25 + Math.round(territoryPercent * 2);

    user.coins += earnedCoins;
    user.xp += earnedXp;

    let leveledUp = false;
    let targetXp = user.level * 500;
    while (user.xp >= targetXp) {
      user.xp -= targetXp;
      user.level += 1;
      user.coins += 500; // Level up reward
      user.gems += 15;
      leveledUp = true;
      targetXp = user.level * 500;
    }

    user.updatedAt = Date.now();
    this.saveSync();

    return { success: true, earnedCoins, earnedXp, leveledUp, user };
  }

  public static getRankedLeaderboard(page = 1, pageSize = 50) {
    this.init();
    const sorted = Array.from(this.users.values()).sort((a, b) => {
      if (b.stats.elo !== a.stats.elo) return b.stats.elo - a.stats.elo;
      return b.stats.wins - a.stats.wins;
    });

    const start = (page - 1) * pageSize;
    const pageItems = sorted.slice(start, start + pageSize);

    const oneVOneEntries = pageItems.map((u, idx) => ({
      rank: start + idx + 1,
      elo: u.stats.elo,
      peakElo: u.stats.peakElo,
      wins: u.stats.wins,
      losses: u.stats.losses,
      total: u.stats.matchesPlayed,
      public_id: u.id,
      accountUsername: u.username,
    }));

    return {
      "1v1": oneVOneEntries,
      "2v2": [],
    };
  }

  // ─── PHONE AUTHENTICATION ──────────────────────────────────────────────────
  public static getUserByPhone(phone: string): ServerUser | undefined {
    this.init();
    const normalized = normalizePhoneNumber(phone);
    if (!normalized) return undefined;
    const userId = this.phoneIndex.get(normalized);
    if (!userId) return undefined;
    return this.users.get(userId);
  }

  public static requestPhoneOtp(phoneRaw: string): {
    success: boolean;
    message: string;
    debugCode?: string;
  } {
    this.init();
    const phone = normalizePhoneNumber(phoneRaw);
    if (!phone) {
      return {
        success: false,
        message: "شماره تلفن وارد شده نامعتبر است. فرمت صحیح: ۰۹۱۲۳۴۵۶۷۸۹",
      };
    }

    const now = Date.now();
    const existing = this.otpStore.get(phone);
    if (existing && now - existing.lastSentAt < 45000) {
      const waitSec = Math.ceil((45000 - (now - existing.lastSentAt)) / 1000);
      return {
        success: false,
        message: `لطفاً ${waitSec} ثانیه صبر کرده و مجدداً تلاش کنید.`,
      };
    }

    // 5-digit verification code
    const code = Math.floor(10000 + Math.random() * 90000).toString();
    this.otpStore.set(phone, {
      code,
      expiresAt: now + 3 * 60 * 1000,
      attempts: 0,
      lastSentAt: now,
    });

    console.log(`\n======================================================`);
    console.log(`[SMS OTP SERVICE] Verification code for ${phone} is: [ ${code} ]`);
    console.log(`======================================================\n`);

    // If external SMS gateway like Kavenegar is configured:
    const kavenegarKey = process.env.KAVENEGAR_API_KEY;
    if (kavenegarKey) {
      try {
        const url = `https://api.kavenegar.com/v1/${kavenegarKey}/verify/lookup.json?receptor=${phone}&token=${code}&template=ironfront_verify`;
        fetch(url).catch((err) => console.warn("[SMS] Failed to send real SMS:", err));
      } catch (err) {
        console.warn("[SMS] Error invoking SMS provider:", err);
      }
    }

    const isDev = process.env.NODE_ENV !== "production" && process.env.GAME_ENV !== "prod";
    return {
      success: true,
      message: `کد تایید به شماره ${phone} ارسال گردید.`,
      debugCode: isDev ? code : undefined,
    };
  }

  public static verifyPhoneOtp(
    phoneRaw: string,
    codeRaw: string,
    chosenUsername?: string,
  ): {
    success: boolean;
    message: string;
    user?: ServerUser;
    token?: string;
    isNew?: boolean;
  } {
    this.init();
    const phone = normalizePhoneNumber(phoneRaw);
    if (!phone) {
      return { success: false, message: "شماره تلفن نامعتبر است." };
    }

    const entry = this.otpStore.get(phone);
    if (!entry) {
      return {
        success: false,
        message: "کد تایید منقضی شده یا درخواست نشده است. لطفاً مجدداً درخواست کد دهید.",
      };
    }

    if (Date.now() > entry.expiresAt) {
      this.otpStore.delete(phone);
      return {
        success: false,
        message: "کد تایید منقضی شده است. لطفاً کد جدید دریافت کنید.",
      };
    }

    if (entry.attempts >= 5) {
      this.otpStore.delete(phone);
      return {
        success: false,
        message: "تعداد تلاش‌های ناموفق بیش از حد بود. لطفاً کد جدید دریافت کنید.",
      };
    }

    entry.attempts++;
    const cleanCode = codeRaw
      .trim()
      .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
      .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));

    if (entry.code !== cleanCode) {
      return { success: false, message: "کد تایید وارد شده نادرست است." };
    }

    let user = this.getUserByPhone(phone);
    let isNew = false;

    if (!user) {
      isNew = true;
      let finalUsername = chosenUsername?.trim();
      if (finalUsername) {
        if (!/^[a-zA-Z0-9_-]{3,20}$/.test(finalUsername)) {
          return {
            success: false,
            message: "نام کاربری باید فقط به حروف و ارقام انگلیسی باشد (a-z, 0-9, _) و بین ۳ تا ۲۰ کاراکتر.",
          };
        }
      } else {
        finalUsername = `Commander_${phone.slice(-4)}`;
      }

      // OTP verified and username valid, now consume OTP
      this.otpStore.delete(phone);

      let uniqueUsername = finalUsername;
      let counter = 1;
      while (this.usernameIndex.has(uniqueUsername.toLowerCase())) {
        uniqueUsername = `${finalUsername}_${counter++}`;
      }

      const id = `usr_${crypto.randomUUID().replace(/-/g, "").substring(0, 12)}`;
      const uuid = crypto.randomUUID();
      const token = `tok_${crypto.randomBytes(24).toString("hex")}`;
      const salt = crypto.randomBytes(16).toString("hex");
      const passwordHash = hashPassword(crypto.randomBytes(16).toString("hex"), salt);

      user = {
        id,
        uuid,
        username: uniqueUsername,
        phone,
        passwordSalt: salt,
        passwordHash,
        token,
        level: 1,
        xp: 0,
        coins: 1000,
        gems: 50,
        clanTag: "",
        flag: "flag:peace_dove",
        title: "title:rookie",
        inventory: [
          "pattern:default",
          "pattern:stripes:stripes",
          "flag:peace_dove",
          "title:rookie",
        ],
        equipped: { flag: "flag:peace_dove", title: "title:rookie" },
        stats: {
          matchesPlayed: 0,
          wins: 0,
          losses: 0,
          kills: 0,
          bestTerritory: 0,
          elo: 1000,
          peakElo: 1000,
        },
        lastDailyClaim: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      this.users.set(user.id, user);
      this.uuidIndex.set(user.uuid, user.id);
      this.usernameIndex.set(user.username.toLowerCase(), user.id);
      this.tokenIndex.set(user.token, user.id);
      this.phoneIndex.set(phone, user.id);
      this.saveSync();
    } else {
      this.otpStore.delete(phone);
      if (!user.token) {
        user.token = `tok_${crypto.randomBytes(24).toString("hex")}`;
        this.tokenIndex.set(user.token, user.id);
        this.saveSync();
      }
    }

    return {
      success: true,
      message: isNew
        ? "ثبت‌نام با شماره تلفن با موفقیت انجام شد."
        : "با موفقیت وارد حساب خود شدید.",
      user,
      token: user.token,
      isNew,
    };
  }

  // ─── ZARINPAL ORDERS ────────────────────────────────────────────────────────
  public static createZarinpalOrder(order: ZarinpalOrder): void {
    this.init();
    this.orders.set(order.authority, order);
    this.saveOrdersSync();
  }

  public static getZarinpalOrder(authority: string): ZarinpalOrder | undefined {
    this.init();
    return this.orders.get(authority);
  }

  public static fulfillZarinpalOrder(
    authority: string,
    refId: number | string,
    cardPan?: string,
  ): {
    success: boolean;
    user?: ServerUser;
    message: string;
    order?: ZarinpalOrder;
  } {
    this.init();
    const order = this.orders.get(authority);
    if (!order) {
      return { success: false, message: "سفارش پرداخت یافت نشد." };
    }

    if (order.status === "paid") {
      const user = this.users.get(order.userId);
      return {
        success: true,
        user,
        message: "این تراکنش قبلاً با موفقیت واریز شده است.",
        order,
      };
    }

    const user = this.users.get(order.userId);
    if (!user) {
      return { success: false, message: "کاربر سفارش یافت نشد." };
    }

    order.status = "paid";
    order.refId = refId;
    order.cardPan = cardPan;
    order.paidAt = Date.now();

    if (order.itemKind === "plutonium") {
      user.gems += order.itemAmount;
    } else if (order.itemKind === "coins") {
      user.coins += order.itemAmount;
    } else if (order.itemKind === "cosmetic" || order.itemKind === "pack") {
      if (!user.inventory.includes(order.itemName)) {
        user.inventory.push(order.itemName);
      }
    }

    user.updatedAt = Date.now();
    this.saveSync();
    this.saveOrdersSync();

    return {
      success: true,
      user,
      message: "پرداخت زرین‌پال تایید شد و آیتم‌ها به حساب واریز گردید.",
      order,
    };
  }
}
