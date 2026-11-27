// src/server/vercelApi.ts
import express from "express";
import fs4 from "fs";
import path4 from "path";

// src/server/routes/AccountRoutes.ts
import { Router } from "express";
import fs3 from "fs";
import path3 from "path";
import crypto2 from "crypto";

// src/server/database/AccountDatabase.ts
import fs from "fs";
import path from "path";
import crypto from "crypto";
function normalizePhoneNumber(raw) {
  if (!raw) return null;
  let s = raw.trim().replace(/[۰-۹]/g, (d) => String("\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9".indexOf(d))).replace(/[٠-٩]/g, (d) => String("\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669".indexOf(d))).replace(/[\s\-\(\)]/g, "");
  if (s.startsWith("+98")) s = "0" + s.substring(3);
  if (s.startsWith("0098")) s = "0" + s.substring(4);
  if (s.startsWith("98") && s.length === 12) s = "0" + s.substring(2);
  if (s.startsWith("9") && s.length === 10) s = "0" + s;
  if (!/^09\d{9}$/.test(s)) {
    return null;
  }
  return s;
}
var SEED_DIR = path.resolve(process.cwd(), "data");
var DATA_DIR = process.env.VERCEL ? "/tmp/ironfront-data" : SEED_DIR;
var DB_FILE = path.join(DATA_DIR, "accounts.json");
var ORDERS_FILE = path.join(DATA_DIR, "orders.json");
var DAILY_REWARD_COOLDOWN_MS = 24 * 60 * 60 * 1e3;
var DAILY_REWARD_COINS = 500;
var DAILY_REWARD_GEMS = 10;
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}
var AccountDatabase = class {
  static {
    this.users = /* @__PURE__ */ new Map();
  }
  static {
    // key: userId
    this.uuidIndex = /* @__PURE__ */ new Map();
  }
  static {
    // key: uuid -> userId
    this.usernameIndex = /* @__PURE__ */ new Map();
  }
  static {
    // key: lowercase username -> userId
    this.tokenIndex = /* @__PURE__ */ new Map();
  }
  static {
    // key: token -> userId
    this.phoneIndex = /* @__PURE__ */ new Map();
  }
  static {
    // key: normalized phone -> userId
    this.otpStore = /* @__PURE__ */ new Map();
  }
  static {
    this.orders = /* @__PURE__ */ new Map();
  }
  static {
    // key: authority -> ZarinpalOrder
    this.initialized = false;
  }
  static init() {
    if (this.initialized) return;
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (DATA_DIR !== SEED_DIR) {
        for (const f of ["accounts.json", "orders.json"]) {
          const src = path.join(SEED_DIR, f);
          const dst = path.join(DATA_DIR, f);
          if (!fs.existsSync(dst) && fs.existsSync(src)) {
            fs.copyFileSync(src, dst);
          }
        }
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, "utf-8");
        const list = JSON.parse(raw);
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
        this.seedDemoUsers();
        this.saveSync();
      }
      if (fs.existsSync(ORDERS_FILE)) {
        try {
          const rawOrders = fs.readFileSync(ORDERS_FILE, "utf-8");
          const orderList = JSON.parse(rawOrders);
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
  static seedDemoUsers() {
    const demos = [
      { name: "General_Sorena", elo: 1850, wins: 142, losses: 18, kills: 890, lvl: 15, title: "\u0641\u0631\u0645\u0627\u0646\u062F\u0647 \u0645\u0639\u0638\u0645" },
      { name: "Iron_Hunter", elo: 1720, wins: 110, losses: 25, kills: 730, lvl: 12, title: "\u0634\u06A9\u0627\u0631\u0686\u06CC \u062A\u0627\u0646\u06A9" },
      { name: "Ariobarzan", elo: 1640, wins: 95, losses: 30, kills: 610, lvl: 10, title: "\u0641\u0627\u062A\u062D \u0622\u0647\u0646\u06CC\u0646" },
      { name: "Desert_Eagle", elo: 1530, wins: 78, losses: 29, kills: 480, lvl: 8, title: "\u0646\u0627\u0628\u063A\u0647 \u0627\u0633\u062A\u0631\u0627\u062A\u0698\u06CC" },
      { name: "Alborz_Wolf", elo: 1420, wins: 56, losses: 24, kills: 350, lvl: 6, title: "\u06AF\u0631\u06AF \u062A\u0646\u0647\u0627" }
    ];
    for (const d of demos) {
      const salt = crypto.randomBytes(16).toString("hex");
      const hash = hashPassword("ironfront123", salt);
      const user = {
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
          title: d.title
        },
        stats: {
          matchesPlayed: d.wins + d.losses,
          wins: d.wins,
          losses: d.losses,
          kills: d.kills,
          bestTerritory: 88,
          elo: d.elo,
          peakElo: d.elo + 50
        },
        lastDailyClaim: 0,
        createdAt: Date.now() - 30 * 864e5,
        updatedAt: Date.now()
      };
      this.users.set(user.id, user);
      this.uuidIndex.set(user.uuid, user.id);
      this.usernameIndex.set(user.username.toLowerCase(), user.id);
      this.tokenIndex.set(user.token, user.id);
    }
  }
  static saveSync() {
    try {
      const list = Array.from(this.users.values());
      const tmpFile = DB_FILE + ".tmp";
      fs.writeFileSync(tmpFile, JSON.stringify(list, null, 2), "utf-8");
      fs.renameSync(tmpFile, DB_FILE);
    } catch (e) {
      console.error("[AccountDatabase] Error persisting database:", e);
    }
  }
  static saveOrdersSync() {
    try {
      const list = Array.from(this.orders.values());
      const tmpFile = ORDERS_FILE + ".tmp";
      fs.writeFileSync(tmpFile, JSON.stringify(list, null, 2), "utf-8");
      fs.renameSync(tmpFile, ORDERS_FILE);
    } catch (e) {
      console.error("[AccountDatabase] Error persisting orders:", e);
    }
  }
  static register(username, password = "") {
    this.init();
    const cleanName = username.trim();
    if (!cleanName || cleanName.length < 3 || cleanName.length > 20 || !/^[a-zA-Z0-9_-]+$/.test(cleanName)) {
      return { success: false, message: "\u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0628\u0627\u06CC\u062F \u0641\u0642\u0637 \u0634\u0627\u0645\u0644 \u062D\u0631\u0648\u0641 \u0627\u0646\u06AF\u0644\u06CC\u0633\u06CC\u060C \u0627\u0639\u062F\u0627\u062F \u06CC\u0627 \u0632\u06CC\u0631\u062E\u0637 (\u06F3 \u062A\u0627 \u06F2\u06F0 \u0646\u0648\u06CC\u0633\u0647) \u0628\u0627\u0634\u062F." };
    }
    if (!password || typeof password !== "string" || password.length < 4) {
      return { success: false, message: "\u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0628\u0627\u06CC\u062F \u062D\u062F\u0627\u0642\u0644 \u06F4 \u0646\u0648\u06CC\u0633\u0647 \u0628\u0627\u0634\u062F." };
    }
    if (this.usernameIndex.has(cleanName.toLowerCase())) {
      return { success: false, message: "\u0627\u06CC\u0646 \u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0642\u0628\u0644\u0627\u064B \u062B\u0628\u062A \u0634\u062F\u0647 \u0627\u0633\u062A." };
    }
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = hashPassword(password, salt);
    const token = "tok_" + crypto.randomBytes(24).toString("hex");
    const userId = "usr_" + crypto.randomBytes(8).toString("hex");
    const userUuid = crypto.randomUUID();
    const newUser = {
      id: userId,
      uuid: userUuid,
      username: cleanName,
      passwordSalt: salt,
      passwordHash: hash,
      token,
      level: 1,
      xp: 0,
      coins: 1e3,
      // 1,000 Starting coins welcome bonus
      gems: 50,
      clanTag: "",
      flag: "ir",
      title: "\u0641\u0631\u0645\u0627\u0646\u062F\u0647 \u062A\u0627\u0632\u0647\u200C\u06A9\u0627\u0631",
      inventory: ["pattern:default", "flag:peace_dove", "title:rookie"],
      equipped: {
        pattern: "pattern:default",
        flag: "ir",
        title: "\u0641\u0631\u0645\u0627\u0646\u062F\u0647 \u062A\u0627\u0632\u0647\u200C\u06A9\u0627\u0631"
      },
      stats: {
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        kills: 0,
        bestTerritory: 0,
        elo: 1e3,
        peakElo: 1e3
      },
      lastDailyClaim: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    this.users.set(newUser.id, newUser);
    this.uuidIndex.set(newUser.uuid, newUser.id);
    this.usernameIndex.set(newUser.username.toLowerCase(), newUser.id);
    this.tokenIndex.set(newUser.token, newUser.id);
    this.saveSync();
    return {
      success: true,
      message: "\u062D\u0633\u0627\u0628 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u0627\u06CC\u062C\u0627\u062F \u0634\u062F.",
      user: newUser,
      token
    };
  }
  static login(username, password = "") {
    this.init();
    const cleanName = username.trim().toLowerCase();
    const userId = this.usernameIndex.get(cleanName);
    if (!userId) {
      return { success: false, message: "\u062D\u0633\u0627\u0628 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0628\u0627 \u0627\u06CC\u0646 \u0646\u0627\u0645 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F." };
    }
    const user = this.users.get(userId);
    if (!user) {
      return { success: false, message: "\u06A9\u0627\u0631\u0628\u0631 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F." };
    }
    if (!password || typeof password !== "string") {
      return { success: false, message: "\u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0627\u0644\u0632\u0627\u0645\u06CC \u0627\u0633\u062A." };
    }
    if (!user.passwordHash || !user.passwordSalt) {
      return { success: false, message: "\u062D\u0633\u0627\u0628 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0641\u0627\u0642\u062F \u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A." };
    }
    const computed = hashPassword(password, user.passwordSalt);
    if (computed !== user.passwordHash) {
      return { success: false, message: "\u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0648\u0627\u0631\u062F \u0634\u062F\u0647 \u0646\u0627\u062F\u0631\u0633\u062A \u0627\u0633\u062A." };
    }
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
      message: "\u0648\u0631\u0648\u062F \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u0627\u0646\u062C\u0627\u0645 \u0634\u062F.",
      user,
      token
    };
  }
  static changePassword(userId, oldPassword = "", newPassword = "") {
    this.init();
    const user = this.users.get(userId);
    if (!user) return { success: false, message: "\u06A9\u0627\u0631\u0628\u0631 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F." };
    if (user.passwordHash) {
      const computed = hashPassword(oldPassword, user.passwordSalt);
      if (computed !== user.passwordHash) {
        return { success: false, message: "\u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0641\u0639\u0644\u06CC \u0646\u0627\u062F\u0631\u0633\u062A \u0627\u0633\u062A." };
      }
    }
    if (!newPassword || newPassword.length < 4) {
      return { success: false, message: "\u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u062C\u062F\u06CC\u062F \u0628\u0627\u06CC\u062F \u062D\u062F\u0627\u0642\u0644 \u06F4 \u0646\u0648\u06CC\u0633\u0647 \u0628\u0627\u0634\u062F." };
    }
    const salt = crypto.randomBytes(16).toString("hex");
    user.passwordSalt = salt;
    user.passwordHash = hashPassword(newPassword, salt);
    user.updatedAt = Date.now();
    this.saveSync();
    return { success: true, message: "\u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u062A\u063A\u06CC\u06CC\u0631 \u06A9\u0631\u062F.", user };
  }
  static getUserByToken(token) {
    this.init();
    if (!token) return null;
    const userId = this.tokenIndex.get(token);
    if (!userId) return null;
    return this.users.get(userId) ?? null;
  }
  static getUserById(userId) {
    this.init();
    return this.users.get(userId) ?? null;
  }
  static getUserByUuid(uuid) {
    this.init();
    if (!uuid) return null;
    const userId = this.uuidIndex.get(uuid);
    if (!userId) return null;
    return this.users.get(userId) ?? null;
  }
  static getPrimaryUser() {
    this.init();
    const first = this.users.values().next().value;
    return first ?? null;
  }
  static getAllUsers() {
    this.init();
    return Array.from(this.users.values());
  }
  static updateUsername(userId, newUsername) {
    this.init();
    const cleanName = newUsername.trim();
    if (!cleanName || cleanName.length < 3 || cleanName.length > 20 || !/^[a-zA-Z0-9_-]+$/.test(cleanName)) {
      return { success: false, message: "\u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0628\u0627\u06CC\u062F \u0641\u0642\u0637 \u0634\u0627\u0645\u0644 \u062D\u0631\u0648\u0641 \u0627\u0646\u06AF\u0644\u06CC\u0633\u06CC\u060C \u0627\u0639\u062F\u0627\u062F \u06CC\u0627 \u0632\u06CC\u0631\u062E\u0637 (\u06F3 \u062A\u0627 \u06F2\u06F0 \u0646\u0648\u06CC\u0633\u0647) \u0628\u0627\u0634\u062F." };
    }
    const lower = cleanName.toLowerCase();
    const existingId = this.usernameIndex.get(lower);
    if (existingId && existingId !== userId) {
      return {
        success: false,
        message: "\u0627\u06CC\u0646 \u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u062A\u0648\u0633\u0637 \u06A9\u0627\u0631\u0628\u0631 \u062F\u06CC\u06AF\u0631\u06CC \u062B\u0628\u062A \u0634\u062F\u0647 \u0627\u0633\u062A.",
        bareClaim: "unavailable"
      };
    }
    const user = this.users.get(userId);
    if (!user) {
      return { success: false, message: "\u06A9\u0627\u0631\u0628\u0631 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F." };
    }
    this.usernameIndex.delete(user.username.toLowerCase());
    user.username = cleanName;
    user.updatedAt = Date.now();
    this.usernameIndex.set(lower, user.id);
    this.saveSync();
    return {
      success: true,
      message: "\u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u062A\u063A\u06CC\u06CC\u0631 \u06A9\u0631\u062F.",
      user,
      bareClaim: "claimed"
    };
  }
  static claimDaily(userId) {
    this.init();
    const user = this.users.get(userId);
    if (!user) return { success: false, message: "\u06A9\u0627\u0631\u0628\u0631 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F." };
    const elapsed = Date.now() - (user.lastDailyClaim || 0);
    if (elapsed < DAILY_REWARD_COOLDOWN_MS) {
      const remainingHours = Math.ceil((DAILY_REWARD_COOLDOWN_MS - elapsed) / 36e5);
      return { success: false, message: `\u062C\u0627\u06CC\u0632\u0647 \u0631\u0648\u0632\u0627\u0646\u0647 \u062F\u0631\u06CC\u0627\u0641\u062A \u0634\u062F\u0647 \u0627\u0633\u062A. ${remainingHours} \u0633\u0627\u0639\u062A \u062A\u0627 \u062F\u0631\u06CC\u0627\u0641\u062A \u0628\u0639\u062F\u06CC \u0628\u0627\u0642\u06CC\u0633\u062A.` };
    }
    user.lastDailyClaim = Date.now();
    user.coins += DAILY_REWARD_COINS;
    user.gems += DAILY_REWARD_GEMS;
    user.updatedAt = Date.now();
    this.saveSync();
    return {
      success: true,
      message: `\u067E\u0627\u062F\u0627\u0634 \u0631\u0648\u0632\u0627\u0646\u0647 \u062F\u0631\u06CC\u0627\u0641\u062A \u0634\u062F: +${DAILY_REWARD_COINS} \u0633\u06A9\u0647 \u0648 +${DAILY_REWARD_GEMS} \u0627\u0644\u0645\u0627\u0633!`,
      coins: DAILY_REWARD_COINS,
      gems: DAILY_REWARD_GEMS,
      user
    };
  }
  static buyItem(userId, itemId, priceCoins, bundleItems) {
    this.init();
    const user = this.users.get(userId);
    if (!user) return { success: false, message: "\u06A9\u0627\u0631\u0628\u0631 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F." };
    if (!itemId || typeof itemId !== "string" || itemId.length > 100) {
      return { success: false, message: "\u0634\u0646\u0627\u0633\u0647 \u0622\u06CC\u062A\u0645 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A." };
    }
    if (user.inventory.includes(itemId)) {
      return { success: false, message: "\u0634\u0645\u0627 \u0627\u06CC\u0646 \u0622\u06CC\u062A\u0645 \u0631\u0627 \u0627\u0632 \u0642\u0628\u0644 \u062E\u0631\u06CC\u062F\u0627\u0631\u06CC \u06A9\u0631\u062F\u0647\u200C\u0627\u06CC\u062F." };
    }
    const catalogPrices = {
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
      "crown:emperor_gold": 1e3,
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
      "title:conqueror_of_empires": 1e3,
      "title:tactical_genius": 450,
      "title:invincible": 900
    };
    let realPrice = catalogPrices[itemId];
    if (realPrice === void 0) {
      try {
        const jsonPath = path.resolve(process.cwd(), "resources/cosmetics.json");
        if (fs.existsSync(jsonPath)) {
          const cosmetics = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
          const [type, name] = itemId.split(":");
          if (type && name) {
            const grp = cosmetics[type + "s"] || cosmetics[type];
            if (grp?.[name]?.priceSoft) {
              realPrice = grp[name].priceSoft;
            }
          }
        }
      } catch {
      }
    }
    if (realPrice === void 0) {
      realPrice = Math.max(200, Math.min(1e4, Number(priceCoins) || 500));
    }
    if (user.coins < realPrice) {
      return {
        success: false,
        message: `\u0645\u0648\u062C\u0648\u062F\u06CC \u0646\u0627\u06A9\u0627\u0641\u06CC \u0627\u0633\u062A. \u0628\u0631\u0627\u06CC \u0627\u06CC\u0646 \u062E\u0631\u06CC\u062F \u0628\u0647 ${realPrice - user.coins} \u0633\u06A9\u0647 \u062F\u06CC\u06AF\u0631 \u0646\u06CC\u0627\u0632 \u062F\u0627\u0631\u06CC\u062F.`
      };
    }
    user.coins -= realPrice;
    user.inventory.push(itemId);
    const authorizedBundles = {
      "bundle:starter_commander": ["pattern:desert_camo", "flag:war_eagle", "title:tactical_genius"],
      "bundle:imperial_glory": ["pattern:gold_leaf", "flag:lion_sun", "crown:emperor_gold", "title:conqueror_of_empires"],
      "bundle:cyber_warfare": ["pattern:cyberpunk_neon", "pattern:matrix_code", "flag:atomic_hazard"]
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
    return { success: true, message: "\u0622\u06CC\u062A\u0645 \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u062E\u0631\u06CC\u062F\u0627\u0631\u06CC \u0634\u062F.", user };
  }
  static purchaseCosmetic(userId, params) {
    this.init();
    const user = this.users.get(userId);
    if (!user) return { ok: false, code: "failed" };
    const { cosmeticType, cosmeticName, currencyType, colorPaletteName } = params;
    let flare;
    if (cosmeticType === "pattern") {
      flare = colorPaletteName ? `pattern:${cosmeticName}:${colorPaletteName}` : `pattern:${cosmeticName}`;
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
      let item = null;
      if (cosmeticType === "pattern") item = cosmetics.patterns?.[cosmeticName];
      else if (cosmeticType === "flag") item = cosmetics.flags?.[cosmeticName];
      else if (cosmeticType === "crown") item = cosmetics.crowns?.[cosmeticName];
      else if (cosmeticType === "effect") {
        for (const grp of Object.values(cosmetics.effects || {})) {
          if (grp?.[cosmeticName]) {
            item = grp[cosmeticName];
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
  static purchasePack(userId, packName) {
    this.init();
    const user = this.users.get(userId);
    if (!user) return { ok: false, code: "failed" };
    let pack = null;
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
      const flare = it.type === "pattern" && it.colorPalette ? `pattern:${it.name}:${it.colorPalette}` : `${it.type}:${it.name}`;
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
  static updateProfile(userId, partial) {
    this.init();
    const user = this.users.get(userId);
    if (!user) return { success: false };
    if (typeof partial.clanTag === "string") user.clanTag = partial.clanTag.slice(0, 10);
    if (typeof partial.title === "string") {
      const freeTitles = ["\u0641\u0631\u0645\u0627\u0646\u062F\u0647 \u062A\u0627\u0632\u0647\u200C\u06A9\u0627\u0631", "title:rookie", "title: \u062A\u0627\u0632\u0647\u200C\u06A9\u0627\u0631"];
      if (freeTitles.includes(partial.title) || user.inventory.includes(partial.title) || user.inventory.includes(`title:${partial.title}`)) {
        user.title = partial.title;
      }
    }
    if (typeof partial.flag === "string") {
      if (partial.flag.length === 2 || user.inventory.includes(partial.flag) || user.inventory.includes(`flag:${partial.flag}`)) {
        user.flag = partial.flag;
      }
    }
    if (partial.equipped && typeof partial.equipped === "object") {
      user.equipped ??= {};
      if (partial.equipped.pattern !== void 0) {
        const pat = String(partial.equipped.pattern).trim();
        if (!pat || pat === "pattern:default" || pat === "default") {
          user.equipped.pattern = "pattern:default";
        } else {
          const baseName = pat.replace("pattern:", "").split(":")[0];
          const isOwned = user.inventory.includes(pat) || user.inventory.includes(`pattern:${baseName}`) || user.inventory.some((inv) => inv.startsWith(`pattern:${baseName}:`));
          if (isOwned) {
            user.equipped.pattern = pat;
          }
        }
      }
      if (partial.equipped.flag !== void 0) {
        const flag = String(partial.equipped.flag).trim();
        if (!flag) {
          user.equipped.flag = "ir";
          user.flag = "ir";
        } else {
          const raw = flag.replace("flag:", "").replace("country:", "");
          const isCountry = raw.length === 2 || flag.startsWith("country:");
          const isOwned = isCountry || user.inventory.includes(flag) || user.inventory.includes(`flag:${raw}`) || user.inventory.includes(raw);
          if (isOwned) {
            user.equipped.flag = flag;
            user.flag = raw;
          }
        }
      }
      if (partial.equipped.crown !== void 0) {
        const crown = String(partial.equipped.crown).trim();
        if (!crown || crown === "none") {
          user.equipped.crown = "";
        } else {
          const raw = crown.replace("crown:", "");
          const isOwned = user.inventory.includes(crown) || user.inventory.includes(`crown:${raw}`) || user.inventory.includes(raw);
          if (isOwned) {
            user.equipped.crown = crown;
          }
        }
      }
      if (partial.equipped.effect !== void 0) {
        const effect = String(partial.equipped.effect).trim();
        if (!effect || effect === "none") {
          user.equipped.effect = "";
        } else {
          const raw = effect.replace("effect:", "");
          const isOwned = user.inventory.includes(effect) || user.inventory.includes(`effect:${raw}`) || user.inventory.includes(raw);
          if (isOwned) {
            user.equipped.effect = effect;
          }
        }
      }
      if (partial.equipped.title !== void 0) {
        const title = String(partial.equipped.title).trim();
        const freeTitles = ["\u0641\u0631\u0645\u0627\u0646\u062F\u0647 \u062A\u0627\u0632\u0647\u200C\u06A9\u0627\u0631", "title:rookie", "title: \u062A\u0627\u0632\u0647\u200C\u06A9\u0627\u0631", "rookie"];
        const raw = title.replace("title:", "");
        if (!title || freeTitles.includes(title) || freeTitles.includes(raw)) {
          user.equipped.title = "\u0641\u0631\u0645\u0627\u0646\u062F\u0647 \u062A\u0627\u0632\u0647\u200C\u06A9\u0627\u0631";
          user.title = "\u0641\u0631\u0645\u0627\u0646\u062F\u0647 \u062A\u0627\u0632\u0647\u200C\u06A9\u0627\u0631";
        } else {
          const isOwned = user.inventory.includes(title) || user.inventory.includes(`title:${raw}`) || user.inventory.includes(raw);
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
  static recordMatch(userId, match) {
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
      user.coins += 500;
      user.gems += 15;
      leveledUp = true;
      targetXp = user.level * 500;
    }
    user.updatedAt = Date.now();
    this.saveSync();
    return { success: true, earnedCoins, earnedXp, leveledUp, user };
  }
  static getRankedLeaderboard(page = 1, pageSize = 50) {
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
      accountUsername: u.username
    }));
    return {
      "1v1": oneVOneEntries,
      "2v2": []
    };
  }
  // ─── PHONE AUTHENTICATION ──────────────────────────────────────────────────
  static getUserByPhone(phone) {
    this.init();
    const normalized = normalizePhoneNumber(phone);
    if (!normalized) return void 0;
    const userId = this.phoneIndex.get(normalized);
    if (!userId) return void 0;
    return this.users.get(userId);
  }
  static requestPhoneOtp(phoneRaw) {
    this.init();
    const phone = normalizePhoneNumber(phoneRaw);
    if (!phone) {
      return {
        success: false,
        message: "\u0634\u0645\u0627\u0631\u0647 \u062A\u0644\u0641\u0646 \u0648\u0627\u0631\u062F \u0634\u062F\u0647 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A. \u0641\u0631\u0645\u062A \u0635\u062D\u06CC\u062D: \u06F0\u06F9\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9"
      };
    }
    const now = Date.now();
    const existing = this.otpStore.get(phone);
    if (existing && now - existing.lastSentAt < 45e3) {
      const waitSec = Math.ceil((45e3 - (now - existing.lastSentAt)) / 1e3);
      return {
        success: false,
        message: `\u0644\u0637\u0641\u0627\u064B ${waitSec} \u062B\u0627\u0646\u06CC\u0647 \u0635\u0628\u0631 \u06A9\u0631\u062F\u0647 \u0648 \u0645\u062C\u062F\u062F\u0627\u064B \u062A\u0644\u0627\u0634 \u06A9\u0646\u06CC\u062F.`
      };
    }
    const code = Math.floor(1e4 + Math.random() * 9e4).toString();
    this.otpStore.set(phone, {
      code,
      expiresAt: now + 3 * 60 * 1e3,
      attempts: 0,
      lastSentAt: now
    });
    console.log(`
======================================================`);
    console.log(`[SMS OTP SERVICE] Verification code for ${phone} is: [ ${code} ]`);
    console.log(`======================================================
`);
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
      message: `\u06A9\u062F \u062A\u0627\u06CC\u06CC\u062F \u0628\u0647 \u0634\u0645\u0627\u0631\u0647 ${phone} \u0627\u0631\u0633\u0627\u0644 \u06AF\u0631\u062F\u06CC\u062F.`,
      debugCode: isDev ? code : void 0
    };
  }
  static verifyPhoneOtp(phoneRaw, codeRaw, chosenUsername) {
    this.init();
    const phone = normalizePhoneNumber(phoneRaw);
    if (!phone) {
      return { success: false, message: "\u0634\u0645\u0627\u0631\u0647 \u062A\u0644\u0641\u0646 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A." };
    }
    const entry = this.otpStore.get(phone);
    if (!entry) {
      return {
        success: false,
        message: "\u06A9\u062F \u062A\u0627\u06CC\u06CC\u062F \u0645\u0646\u0642\u0636\u06CC \u0634\u062F\u0647 \u06CC\u0627 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0646\u0634\u062F\u0647 \u0627\u0633\u062A. \u0644\u0637\u0641\u0627\u064B \u0645\u062C\u062F\u062F\u0627\u064B \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u06A9\u062F \u062F\u0647\u06CC\u062F."
      };
    }
    if (Date.now() > entry.expiresAt) {
      this.otpStore.delete(phone);
      return {
        success: false,
        message: "\u06A9\u062F \u062A\u0627\u06CC\u06CC\u062F \u0645\u0646\u0642\u0636\u06CC \u0634\u062F\u0647 \u0627\u0633\u062A. \u0644\u0637\u0641\u0627\u064B \u06A9\u062F \u062C\u062F\u06CC\u062F \u062F\u0631\u06CC\u0627\u0641\u062A \u06A9\u0646\u06CC\u062F."
      };
    }
    if (entry.attempts >= 5) {
      this.otpStore.delete(phone);
      return {
        success: false,
        message: "\u062A\u0639\u062F\u0627\u062F \u062A\u0644\u0627\u0634\u200C\u0647\u0627\u06CC \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u06CC\u0634 \u0627\u0632 \u062D\u062F \u0628\u0648\u062F. \u0644\u0637\u0641\u0627\u064B \u06A9\u062F \u062C\u062F\u06CC\u062F \u062F\u0631\u06CC\u0627\u0641\u062A \u06A9\u0646\u06CC\u062F."
      };
    }
    entry.attempts++;
    const cleanCode = codeRaw.trim().replace(/[۰-۹]/g, (d) => String("\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9".indexOf(d))).replace(/[٠-٩]/g, (d) => String("\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669".indexOf(d)));
    if (entry.code !== cleanCode) {
      return { success: false, message: "\u06A9\u062F \u062A\u0627\u06CC\u06CC\u062F \u0648\u0627\u0631\u062F \u0634\u062F\u0647 \u0646\u0627\u062F\u0631\u0633\u062A \u0627\u0633\u062A." };
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
            message: "\u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0628\u0627\u06CC\u062F \u0641\u0642\u0637 \u0628\u0647 \u062D\u0631\u0648\u0641 \u0648 \u0627\u0631\u0642\u0627\u0645 \u0627\u0646\u06AF\u0644\u06CC\u0633\u06CC \u0628\u0627\u0634\u062F (a-z, 0-9, _) \u0648 \u0628\u06CC\u0646 \u06F3 \u062A\u0627 \u06F2\u06F0 \u06A9\u0627\u0631\u0627\u06A9\u062A\u0631."
          };
        }
      } else {
        finalUsername = `Commander_${phone.slice(-4)}`;
      }
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
        coins: 1e3,
        gems: 50,
        clanTag: "",
        flag: "flag:peace_dove",
        title: "title:rookie",
        inventory: [
          "pattern:default",
          "pattern:stripes:stripes",
          "flag:peace_dove",
          "title:rookie"
        ],
        equipped: { flag: "flag:peace_dove", title: "title:rookie" },
        stats: {
          matchesPlayed: 0,
          wins: 0,
          losses: 0,
          kills: 0,
          bestTerritory: 0,
          elo: 1e3,
          peakElo: 1e3
        },
        lastDailyClaim: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
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
      message: isNew ? "\u062B\u0628\u062A\u200C\u0646\u0627\u0645 \u0628\u0627 \u0634\u0645\u0627\u0631\u0647 \u062A\u0644\u0641\u0646 \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u0627\u0646\u062C\u0627\u0645 \u0634\u062F." : "\u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u0648\u0627\u0631\u062F \u062D\u0633\u0627\u0628 \u062E\u0648\u062F \u0634\u062F\u06CC\u062F.",
      user,
      token: user.token,
      isNew
    };
  }
  // ─── ZARINPAL ORDERS ────────────────────────────────────────────────────────
  static createZarinpalOrder(order) {
    this.init();
    this.orders.set(order.authority, order);
    this.saveOrdersSync();
  }
  static getZarinpalOrder(authority) {
    this.init();
    return this.orders.get(authority);
  }
  static fulfillZarinpalOrder(authority, refId, cardPan) {
    this.init();
    const order = this.orders.get(authority);
    if (!order) {
      return { success: false, message: "\u0633\u0641\u0627\u0631\u0634 \u067E\u0631\u062F\u0627\u062E\u062A \u06CC\u0627\u0641\u062A \u0646\u0634\u062F." };
    }
    if (order.status === "paid") {
      const user2 = this.users.get(order.userId);
      return {
        success: true,
        user: user2,
        message: "\u0627\u06CC\u0646 \u062A\u0631\u0627\u06A9\u0646\u0634 \u0642\u0628\u0644\u0627\u064B \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u0648\u0627\u0631\u06CC\u0632 \u0634\u062F\u0647 \u0627\u0633\u062A.",
        order
      };
    }
    const user = this.users.get(order.userId);
    if (!user) {
      return { success: false, message: "\u06A9\u0627\u0631\u0628\u0631 \u0633\u0641\u0627\u0631\u0634 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F." };
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
      message: "\u067E\u0631\u062F\u0627\u062E\u062A \u0632\u0631\u06CC\u0646\u200C\u067E\u0627\u0644 \u062A\u0627\u06CC\u06CC\u062F \u0634\u062F \u0648 \u0622\u06CC\u062A\u0645\u200C\u0647\u0627 \u0628\u0647 \u062D\u0633\u0627\u0628 \u0648\u0627\u0631\u06CC\u0632 \u06AF\u0631\u062F\u06CC\u062F.",
      order
    };
  }
};

// src/server/database/ClanDatabase.ts
import fs2 from "fs";
import path2 from "path";
var SEED_DIR2 = path2.resolve(process.cwd(), "data");
var DATA_DIR2 = process.env.VERCEL ? "/tmp/ironfront-data" : SEED_DIR2;
var CLANS_FILE = path2.join(DATA_DIR2, "clans.json");
var ClanDatabase = class {
  static {
    this.clans = /* @__PURE__ */ new Map();
  }
  static {
    // key: uppercase tag
    this.userClanIndex = /* @__PURE__ */ new Map();
  }
  static {
    // key: userId -> uppercase tag
    this.initialized = false;
  }
  static init() {
    if (this.initialized) return;
    try {
      if (!fs2.existsSync(DATA_DIR2)) {
        fs2.mkdirSync(DATA_DIR2, { recursive: true });
      }
      if (DATA_DIR2 !== SEED_DIR2) {
        const src = path2.join(SEED_DIR2, "clans.json");
        if (!fs2.existsSync(CLANS_FILE) && fs2.existsSync(src)) {
          fs2.copyFileSync(src, CLANS_FILE);
        }
      }
      if (fs2.existsSync(CLANS_FILE)) {
        const raw = fs2.readFileSync(CLANS_FILE, "utf-8");
        const list = JSON.parse(raw);
        for (const clan of list) {
          const canonicalTag = clan.tag.toUpperCase();
          this.clans.set(canonicalTag, clan);
          for (const m of clan.members) {
            this.userClanIndex.set(m.publicId, canonicalTag);
          }
        }
      } else {
        this.seedInitialClans();
        this.saveSync();
      }
    } catch (e) {
      console.error("[ClanDatabase] Error loading database:", e);
    }
    this.initialized = true;
  }
  static seedInitialClans() {
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const seeds = [
      {
        tag: "IRN",
        name: "Iran Warriors",
        description: "Official top competitive Persian squad. Join for tactical warfare!",
        discordUrl: "https://discord.gg/openfront",
        isOpen: true,
        createdAt: new Date(Date.now() - 60 * 864e5).toISOString(),
        softBalance: "25000",
        hardBalance: "450",
        members: [
          {
            publicId: "usr_8949368d1377",
            username: "General_Sorena",
            role: "leader",
            joinedAt: new Date(Date.now() - 60 * 864e5).toISOString(),
            wins: 142,
            losses: 18
          },
          {
            publicId: "usr_4155432b6da6",
            username: "Iron_Hunter",
            role: "officer",
            joinedAt: new Date(Date.now() - 40 * 864e5).toISOString(),
            wins: 110,
            losses: 25
          }
        ],
        bans: [],
        donations: [
          {
            publicId: "usr_8949368d1377",
            username: "General_Sorena",
            currencyType: "soft",
            amount: 15e3,
            timestamp: nowIso
          }
        ],
        joinRequests: [],
        stats: {
          games: 252,
          wins: 210,
          losses: 42,
          playerSessions: 380,
          weightedWins: 245.5,
          weightedLosses: 38.2,
          weightedWLRatio: 6.42
        }
      },
      {
        tag: "PERS",
        name: "Persian Empire",
        description: "Unite the empires and conquer every frontier across the globe.",
        discordUrl: null,
        isOpen: true,
        createdAt: new Date(Date.now() - 45 * 864e5).toISOString(),
        softBalance: "18000",
        hardBalance: "320",
        members: [
          {
            publicId: "usr_f4d831dd9ff7",
            username: "Ariobarzan",
            role: "leader",
            joinedAt: new Date(Date.now() - 45 * 864e5).toISOString(),
            wins: 95,
            losses: 30
          }
        ],
        bans: [],
        donations: [],
        joinRequests: [],
        stats: {
          games: 160,
          wins: 125,
          losses: 35,
          playerSessions: 210,
          weightedWins: 138,
          weightedLosses: 32.5,
          weightedWLRatio: 4.24
        }
      },
      {
        tag: "APEX",
        name: "Apex Legends",
        description: "Hardcore strategy, global dominators and ranked rushers.",
        discordUrl: null,
        isOpen: false,
        createdAt: new Date(Date.now() - 30 * 864e5).toISOString(),
        softBalance: "35000",
        hardBalance: "600",
        members: [
          {
            publicId: "usr_3643a8d0ef58",
            username: "Desert_Eagle",
            role: "leader",
            joinedAt: new Date(Date.now() - 30 * 864e5).toISOString(),
            wins: 78,
            losses: 29
          }
        ],
        bans: [],
        donations: [],
        joinRequests: [],
        stats: {
          games: 130,
          wins: 98,
          losses: 32,
          playerSessions: 175,
          weightedWins: 112.4,
          weightedLosses: 29.1,
          weightedWLRatio: 3.86
        }
      }
    ];
    for (const clan of seeds) {
      const canonicalTag = clan.tag.toUpperCase();
      this.clans.set(canonicalTag, clan);
      for (const m of clan.members) {
        this.userClanIndex.set(m.publicId, canonicalTag);
      }
    }
  }
  static saveSync() {
    try {
      if (!fs2.existsSync(DATA_DIR2)) {
        fs2.mkdirSync(DATA_DIR2, { recursive: true });
      }
      if (DATA_DIR2 !== SEED_DIR2) {
        const src = path2.join(SEED_DIR2, "clans.json");
        if (!fs2.existsSync(CLANS_FILE) && fs2.existsSync(src)) {
          fs2.copyFileSync(src, CLANS_FILE);
        }
      }
      const data = Array.from(this.clans.values());
      const tmpFile = CLANS_FILE + ".tmp";
      fs2.writeFileSync(tmpFile, JSON.stringify(data, null, 2), "utf-8");
      fs2.renameSync(tmpFile, CLANS_FILE);
    } catch (e) {
      console.error("[ClanDatabase] Error persisting database:", e);
    }
  }
  static clanExists(tag) {
    this.init();
    return this.clans.has(tag.toUpperCase().trim());
  }
  static getClanByTag(tag) {
    this.init();
    return this.clans.get(tag.toUpperCase().trim()) || null;
  }
  static getUserClan(userId) {
    this.init();
    const tag = this.userClanIndex.get(userId);
    if (!tag) return null;
    return this.clans.get(tag) || null;
  }
  static getUserClansList(userId) {
    this.init();
    const userClan = this.getUserClan(userId);
    if (!userClan) return [];
    const member = userClan.members.find((m) => m.publicId === userId);
    return [
      {
        tag: userClan.tag,
        name: userClan.name,
        role: member?.role || "member",
        joinedAt: member?.joinedAt || userClan.createdAt,
        memberCount: userClan.members.length,
        softBalance: userClan.softBalance,
        hardBalance: userClan.hardBalance
      }
    ];
  }
  static getClansBrowse(search, page = 1, limit = 20) {
    this.init();
    let all = Array.from(this.clans.values());
    if (search && search.trim().length >= 2) {
      const q = search.trim().toLowerCase();
      all = all.filter(
        (c) => c.tag.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
      );
    }
    const total = all.length;
    const startIndex = (page - 1) * limit;
    const paginated = all.slice(startIndex, startIndex + limit);
    const results = paginated.map((c) => ({
      name: c.name,
      tag: c.tag,
      description: c.description,
      discordUrl: c.discordUrl ?? null,
      isOpen: c.isOpen,
      createdAt: c.createdAt,
      memberCount: c.members.length,
      softBalance: c.softBalance,
      hardBalance: c.hardBalance
    }));
    return {
      results,
      total,
      page,
      limit
    };
  }
  static getClanLeaderboard() {
    this.init();
    const now = /* @__PURE__ */ new Date();
    const startIso = new Date(now.getTime() - 30 * 864e5).toISOString();
    const endIso = now.toISOString();
    const sorted = Array.from(this.clans.values()).sort(
      (a, b) => b.stats.weightedWins - a.stats.weightedWins
    );
    const clans = sorted.map((c) => ({
      clanTag: c.tag,
      games: c.stats.games,
      wins: c.stats.wins,
      losses: c.stats.losses,
      playerSessions: c.stats.playerSessions,
      weightedWins: c.stats.weightedWins,
      weightedLosses: c.stats.weightedLosses,
      weightedWLRatio: c.stats.weightedWLRatio
    }));
    return {
      start: startIso,
      end: endIso,
      clans,
      total: clans.length,
      limit: 50
    };
  }
  static createClan(userId, username, data) {
    this.init();
    const tag = data.tag.toUpperCase().trim();
    if (!/^[A-Z0-9]{2,5}$/.test(tag)) {
      return { ok: false, message: "\u062A\u06AF \u06A9\u0644\u0646 \u0628\u0627\u06CC\u062F \u06F2 \u062A\u0627 \u06F5 \u06A9\u0627\u0631\u0627\u06A9\u062A\u0631 \u0627\u0646\u06AF\u0644\u06CC\u0633\u06CC \u0648 \u0639\u062F\u062F \u0628\u0627\u0634\u062F." };
    }
    if (this.clans.has(tag)) {
      return { ok: false, message: "\u0627\u06CC\u0646 \u062A\u06AF \u06A9\u0644\u0646 \u0642\u0628\u0644\u0627\u064B \u062B\u0628\u062A \u0634\u062F\u0647 \u0627\u0633\u062A." };
    }
    if (!data.name || data.name.trim().length < 2) {
      return { ok: false, message: "\u0646\u0627\u0645 \u06A9\u0644\u0646 \u0628\u0627\u06CC\u062F \u062D\u062F\u0627\u0642\u0644 \u06F2 \u06A9\u0627\u0631\u0627\u06A9\u062A\u0631 \u0628\u0627\u0634\u062F." };
    }
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const newClan = {
      tag,
      name: data.name.trim(),
      description: (data.description || "").trim(),
      discordUrl: data.discordUrl || null,
      isOpen: data.isOpen !== false,
      createdAt: nowIso,
      softBalance: "0",
      hardBalance: "0",
      members: [
        {
          publicId: userId,
          username,
          role: "leader",
          joinedAt: nowIso,
          wins: 0,
          losses: 0
        }
      ],
      bans: [],
      donations: [],
      joinRequests: [],
      stats: {
        games: 0,
        wins: 0,
        losses: 0,
        playerSessions: 0,
        weightedWins: 0,
        weightedLosses: 0,
        weightedWLRatio: 0
      }
    };
    this.clans.set(tag, newClan);
    this.userClanIndex.set(userId, tag);
    this.saveSync();
    return { ok: true, clan: newClan };
  }
  static joinClan(userId, username, tag) {
    this.init();
    const canonicalTag = tag.toUpperCase().trim();
    const clan = this.clans.get(canonicalTag);
    if (!clan) return { status: "not_found" };
    if (clan.bans.some((b) => b.publicId === userId)) {
      return { status: "banned" };
    }
    if (clan.members.some((m) => m.publicId === userId)) {
      return { status: "already_member" };
    }
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    if (clan.isOpen) {
      clan.members.push({
        publicId: userId,
        username,
        role: "member",
        joinedAt: nowIso,
        wins: 0,
        losses: 0
      });
      this.userClanIndex.set(userId, canonicalTag);
      this.saveSync();
      return { status: "joined" };
    } else {
      if (!clan.joinRequests.some((r) => r.publicId === userId)) {
        clan.joinRequests.push({
          publicId: userId,
          username,
          createdAt: nowIso
        });
        this.saveSync();
      }
      return { status: "requested" };
    }
  }
  static leaveClan(userId, tag) {
    this.init();
    const canonicalTag = tag.toUpperCase().trim();
    const clan = this.clans.get(canonicalTag);
    if (!clan) return false;
    const idx = clan.members.findIndex((m) => m.publicId === userId);
    if (idx === -1) return false;
    clan.members.splice(idx, 1);
    this.userClanIndex.delete(userId);
    if (clan.members.length > 0) {
      if (!clan.members.some((m) => m.role === "leader")) {
        clan.members[0].role = "leader";
      }
    } else {
      this.clans.delete(canonicalTag);
    }
    this.saveSync();
    return true;
  }
  static donate(userId, username, tag, currencyType, amount) {
    this.init();
    const canonicalTag = tag.toUpperCase().trim();
    const clan = this.clans.get(canonicalTag);
    if (!clan || amount <= 0) return { ok: false, newBalance: "0" };
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    clan.donations.unshift({
      publicId: userId,
      username,
      currencyType,
      amount,
      timestamp: nowIso
    });
    if (currencyType === "soft") {
      const current = BigInt(clan.softBalance || "0");
      clan.softBalance = (current + BigInt(amount)).toString();
      this.saveSync();
      return { ok: true, newBalance: clan.softBalance };
    } else {
      const current = BigInt(clan.hardBalance || "0");
      clan.hardBalance = (current + BigInt(amount)).toString();
      this.saveSync();
      return { ok: true, newBalance: clan.hardBalance };
    }
  }
  static getDonations(tag, page = 1, limit = 20) {
    this.init();
    const canonicalTag = tag.toUpperCase().trim();
    const clan = this.clans.get(canonicalTag);
    if (!clan) return { results: [], total: 0, page, limit };
    const total = clan.donations.length;
    const start = (page - 1) * limit;
    const results = clan.donations.slice(start, start + limit);
    return { results, total, page, limit };
  }
  static getMembers(tag, page = 1, limit = 20) {
    this.init();
    const canonicalTag = tag.toUpperCase().trim();
    const clan = this.clans.get(canonicalTag);
    if (!clan) return { results: [], total: 0, page, limit, pendingRequests: 0 };
    const total = clan.members.length;
    const start = (page - 1) * limit;
    const results = clan.members.slice(start, start + limit).map((m) => ({
      role: m.role,
      joinedAt: m.joinedAt,
      publicId: m.publicId,
      username: m.username,
      stats: {
        total: { wins: m.wins, losses: m.losses },
        ffa: { wins: m.wins, losses: m.losses },
        team: { wins: 0, losses: 0 },
        hvn: { wins: 0, losses: 0 },
        duos: { wins: 0, losses: 0 },
        trios: { wins: 0, losses: 0 },
        quads: { wins: 0, losses: 0 },
        "2": { wins: 0, losses: 0 },
        "3": { wins: 0, losses: 0 },
        "4": { wins: 0, losses: 0 },
        "5": { wins: 0, losses: 0 },
        "6": { wins: 0, losses: 0 },
        "7": { wins: 0, losses: 0 },
        ranked: { wins: m.wins, losses: m.losses },
        "1v1": { wins: m.wins, losses: m.losses }
      }
    }));
    return {
      results,
      total,
      page,
      limit,
      pendingRequests: clan.joinRequests.length
    };
  }
  static getRequests(tag, page = 1, limit = 20) {
    this.init();
    const canonicalTag = tag.toUpperCase().trim();
    const clan = this.clans.get(canonicalTag);
    if (!clan) return { results: [], total: 0, page, limit };
    const total = clan.joinRequests.length;
    const start = (page - 1) * limit;
    const results = clan.joinRequests.slice(start, start + limit);
    return { results, total, page, limit };
  }
  static approveRequest(tag, targetPublicId) {
    this.init();
    const canonicalTag = tag.toUpperCase().trim();
    const clan = this.clans.get(canonicalTag);
    if (!clan) return false;
    const reqIdx = clan.joinRequests.findIndex((r) => r.publicId === targetPublicId);
    if (reqIdx === -1) return false;
    const req = clan.joinRequests.splice(reqIdx, 1)[0];
    clan.members.push({
      publicId: req.publicId,
      username: req.username,
      role: "member",
      joinedAt: (/* @__PURE__ */ new Date()).toISOString(),
      wins: 0,
      losses: 0
    });
    this.userClanIndex.set(req.publicId, canonicalTag);
    this.saveSync();
    return true;
  }
  static denyRequest(tag, targetPublicId) {
    this.init();
    const canonicalTag = tag.toUpperCase().trim();
    const clan = this.clans.get(canonicalTag);
    if (!clan) return false;
    const reqIdx = clan.joinRequests.findIndex((r) => r.publicId === targetPublicId);
    if (reqIdx === -1) return false;
    clan.joinRequests.splice(reqIdx, 1);
    this.saveSync();
    return true;
  }
  static banMember(tag, bannedByPublicId, bannedByUsername, targetPublicId, targetUsername, reason) {
    this.init();
    const canonicalTag = tag.toUpperCase().trim();
    const clan = this.clans.get(canonicalTag);
    if (!clan) return false;
    const memberIdx = clan.members.findIndex((m) => m.publicId === targetPublicId);
    if (memberIdx !== -1) {
      clan.members.splice(memberIdx, 1);
      this.userClanIndex.delete(targetPublicId);
    }
    clan.bans.push({
      publicId: targetPublicId,
      username: targetUsername,
      bannedBy: bannedByPublicId,
      bannedByUsername,
      reason,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    this.saveSync();
    return true;
  }
  static unbanMember(tag, targetPublicId) {
    this.init();
    const canonicalTag = tag.toUpperCase().trim();
    const clan = this.clans.get(canonicalTag);
    if (!clan) return false;
    const banIdx = clan.bans.findIndex((b) => b.publicId === targetPublicId);
    if (banIdx === -1) return false;
    clan.bans.splice(banIdx, 1);
    this.saveSync();
    return true;
  }
  static getBans(tag, page = 1, limit = 20) {
    this.init();
    const canonicalTag = tag.toUpperCase().trim();
    const clan = this.clans.get(canonicalTag);
    if (!clan) return { results: [], total: 0, page, limit };
    const total = clan.bans.length;
    const start = (page - 1) * limit;
    const results = clan.bans.slice(start, start + limit);
    return { results, total, page, limit };
  }
  static updateClan(tag, patch) {
    this.init();
    const canonicalTag = tag.toUpperCase().trim();
    const clan = this.clans.get(canonicalTag);
    if (!clan) return null;
    if (typeof patch.name === "string" && patch.name.trim().length >= 2) {
      clan.name = patch.name.trim();
    }
    if (typeof patch.description === "string") {
      clan.description = patch.description.trim();
    }
    if (patch.discordUrl !== void 0) {
      clan.discordUrl = patch.discordUrl || null;
    }
    if (typeof patch.isOpen === "boolean") {
      clan.isOpen = patch.isOpen;
    }
    this.saveSync();
    return clan;
  }
  static disbandClan(tag) {
    this.init();
    const canonicalTag = tag.toUpperCase().trim();
    const clan = this.clans.get(canonicalTag);
    if (!clan) return false;
    for (const m of clan.members) {
      this.userClanIndex.delete(m.publicId);
    }
    this.clans.delete(canonicalTag);
    this.saveSync();
    return true;
  }
  static kickMember(tag, targetPublicId) {
    this.init();
    const canonicalTag = tag.toUpperCase().trim();
    const clan = this.clans.get(canonicalTag);
    if (!clan) return false;
    const idx = clan.members.findIndex((m) => m.publicId === targetPublicId);
    if (idx === -1) return false;
    clan.members.splice(idx, 1);
    this.userClanIndex.delete(targetPublicId);
    this.saveSync();
    return true;
  }
  static promoteMember(tag, targetPublicId) {
    this.init();
    const canonicalTag = tag.toUpperCase().trim();
    const clan = this.clans.get(canonicalTag);
    if (!clan) return false;
    const member = clan.members.find((m) => m.publicId === targetPublicId);
    if (!member) return false;
    member.role = "officer";
    this.saveSync();
    return true;
  }
  static demoteMember(tag, targetPublicId) {
    this.init();
    const canonicalTag = tag.toUpperCase().trim();
    const clan = this.clans.get(canonicalTag);
    if (!clan) return false;
    const member = clan.members.find((m) => m.publicId === targetPublicId);
    if (!member || member.role === "leader") return false;
    member.role = "member";
    this.saveSync();
    return true;
  }
  static transferLeadership(tag, targetPublicId) {
    this.init();
    const canonicalTag = tag.toUpperCase().trim();
    const clan = this.clans.get(canonicalTag);
    if (!clan) return false;
    const target = clan.members.find((m) => m.publicId === targetPublicId);
    if (!target) return false;
    for (const m of clan.members) {
      if (m.role === "leader") {
        m.role = "officer";
      }
    }
    target.role = "leader";
    this.saveSync();
    return true;
  }
  static withdrawRequest(tag, publicId) {
    this.init();
    const canonicalTag = tag.toUpperCase().trim();
    const clan = this.clans.get(canonicalTag);
    if (!clan) return false;
    const idx = clan.joinRequests.findIndex((r) => r.publicId === publicId);
    if (idx === -1) return false;
    clan.joinRequests.splice(idx, 1);
    this.saveSync();
    return true;
  }
};

// src/core/Base64.ts
import { base64url } from "jose";
function uuidToBase64url(uuid) {
  const hex = uuid.replace(/-/g, "");
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return base64url.encode(bytes);
}
function base64urlToUuid(encoded) {
  const bytes = base64url.decode(encoded);
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20)
  ].join("-");
}

// src/server/routes/AccountRoutes.ts
var accountRouter = Router();
function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7).trim();
  }
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)(?:openfront_token|session)=([^;]+)/);
    if (match && match[1]) {
      return decodeURIComponent(match[1].trim());
    }
  }
  return null;
}
function getParam(param) {
  if (Array.isArray(param)) return param[0] || "";
  return param || "";
}
function getApiBase(req) {
  if (req.headers.origin && typeof req.headers.origin === "string") {
    return `${req.headers.origin}/api`;
  }
  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto = typeof forwardedProto === "string" ? forwardedProto : req.protocol || "http";
  const host = req.get("host") || "localhost:9000";
  return `${proto}://${host}/api`;
}
var DEV_DEFAULT_SECRET = "openfront_secret_jwt_key_2026";
var RUNTIME_PRODUCTION_SECRET = crypto2.randomBytes(32).toString("hex");
var JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === "production" ? RUNTIME_PRODUCTION_SECRET : DEV_DEFAULT_SECRET);
function mintJwt(user, req) {
  const now = Math.floor(Date.now() / 1e3);
  const exp = now + 30 * 24 * 3600;
  const sub = uuidToBase64url(user.uuid);
  const iss = getApiBase(req);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    jti: crypto2.randomUUID(),
    sub,
    iat: now,
    exp,
    iss,
    aud: "localhost",
    role: "player"
  };
  const sHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const sPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto2.createHmac("sha256", JWT_SECRET).update(`${sHeader}.${sPayload}`).digest("base64url");
  return `${sHeader}.${sPayload}.${signature}`;
}
function resolveUser(req) {
  AccountDatabase.init();
  const token = extractToken(req);
  if (!token) return null;
  if (token.startsWith("tok_")) {
    const u = AccountDatabase.getUserByToken(token);
    if (u) return u;
  }
  if (token.includes(".")) {
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        const [sHeader, sPayload, sSignature] = parts;
        const expectedSignature = crypto2.createHmac("sha256", JWT_SECRET).update(`${sHeader}.${sPayload}`).digest("base64url");
        const sigBuf = Buffer.from(sSignature);
        const expBuf = Buffer.from(expectedSignature);
        if (sigBuf.length !== expBuf.length || !crypto2.timingSafeEqual(sigBuf, expBuf)) {
          return null;
        }
        const payloadJson = Buffer.from(sPayload, "base64url").toString("utf-8");
        const payload = JSON.parse(payloadJson);
        if (typeof payload.exp === "number" && Math.floor(Date.now() / 1e3) > payload.exp) {
          return null;
        }
        if (payload.sub) {
          const uuid = base64urlToUuid(payload.sub);
          if (uuid) {
            const u = AccountDatabase.getUserByUuid(uuid);
            if (u) return u;
          }
        }
      }
    } catch {
      return null;
    }
  }
  return null;
}
function toPublicUser(user) {
  const { passwordSalt, passwordHash, ...rest } = user;
  return rest;
}
function toUserMeResponse(user) {
  const userClans = ClanDatabase.getUserClansList(user.id);
  const starterFlares = [
    "pattern:default",
    "pattern:stripes:stripes",
    "flag:peace_dove",
    "title:rookie"
  ];
  const flares = Array.from(/* @__PURE__ */ new Set([...starterFlares, ...user.inventory || []]));
  return {
    user: {
      id: user.id,
      username: user.username,
      email: `${user.phone || user.username.toLowerCase()}@ironfront.ir`,
      phone: user.phone
    },
    player: {
      publicId: user.id,
      adfree: true,
      unlimitedRanked: true,
      canCreatePublicLobbies: true,
      trustTier: "trusted",
      username: user.username,
      usernameBase: user.username,
      usernameDiscriminator: "0000",
      usernameStatus: "premium",
      usernameClaimExpiresAt: null,
      nextUsernameChangeAt: null,
      flares,
      achievements: {
        singleplayerMap: [],
        player: []
      },
      leaderboard: {
        oneVone: { elo: user.stats.elo },
        twoVtwo: { elo: user.stats.elo }
      },
      currency: {
        soft: user.coins,
        hard: user.gems
      },
      clans: userClans,
      clanRequests: [],
      friends: [],
      subscription: null,
      marketingConsent: {
        consented: "approved",
        hasEmail: false
      }
    }
  };
}
accountRouter.post("/auth/refresh", (req, res) => {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({ error: "unauthorized", message: "\u0646\u0634\u0633\u062A \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A \u06CC\u0627 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0648\u0627\u0631\u062F \u0646\u0634\u062F\u0647 \u0627\u0633\u062A." });
  }
  const jwt = mintJwt(user, req);
  res.setHeader(
    "Set-Cookie",
    `openfront_token=${user.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`
  );
  return res.json({
    jwt,
    expiresIn: 30 * 24 * 3600
  });
});
accountRouter.post(["/auth/logout", "/auth/revoke"], (_req, res) => {
  res.setHeader(
    "Set-Cookie",
    "openfront_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
  );
  return res.json({ success: true });
});
accountRouter.post(["/auth/phone/request-otp", "/account/phone/request-otp"], (req, res) => {
  const { phone } = req.body || {};
  if (!phone) {
    return res.status(400).json({ success: false, message: "\u0634\u0645\u0627\u0631\u0647 \u062A\u0644\u0641\u0646 \u0647\u0645\u0631\u0627\u0647 \u0627\u0644\u0632\u0627\u0645\u06CC \u0627\u0633\u062A." });
  }
  const result = AccountDatabase.requestPhoneOtp(String(phone));
  if (!result.success) {
    return res.status(400).json(result);
  }
  return res.json(result);
});
accountRouter.post(["/auth/phone/verify-otp", "/account/phone/verify-otp"], (req, res) => {
  const { phone, code, username } = req.body || {};
  if (!phone || !code) {
    return res.status(400).json({ success: false, message: "\u0634\u0645\u0627\u0631\u0647 \u062A\u0644\u0641\u0646 \u0648 \u06A9\u062F \u062A\u0627\u06CC\u06CC\u062F \u0627\u0644\u0632\u0627\u0645\u06CC \u0627\u0633\u062A." });
  }
  const result = AccountDatabase.verifyPhoneOtp(
    String(phone),
    String(code),
    username ? String(username) : void 0
  );
  if (!result.success || !result.user) {
    return res.status(400).json(result);
  }
  const jwt = mintJwt(result.user, req);
  res.setHeader(
    "Set-Cookie",
    `openfront_token=${result.user.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`
  );
  return res.json({
    success: true,
    message: result.message,
    token: result.token,
    jwt,
    expiresIn: 30 * 24 * 3600,
    user: toPublicUser(result.user),
    isNew: result.isNew
  });
});
accountRouter.post(["/payment/zarinpal/request", "/account/payment/zarinpal/request"], async (req, res) => {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({
      ok: false,
      error: "unauthorized",
      message: "\u0628\u0631\u0627\u06CC \u062E\u0631\u06CC\u062F \u0627\u0632 \u062F\u0631\u06AF\u0627\u0647 \u0628\u0627\u0646\u06A9\u06CC \u0627\u0628\u062A\u062F\u0627 \u0628\u0627\u06CC\u062F \u0648\u0627\u0631\u062F \u062D\u0633\u0627\u0628 \u06A9\u0627\u0631\u0628\u0631\u06CC \u062E\u0648\u062F \u0634\u0648\u06CC\u062F."
    });
  }
  const { itemKind, itemAmount, itemName } = req.body || {};
  const validAmount = Math.max(1, Math.floor(Number(itemAmount) || 100));
  let amountTomans = 25e3;
  let description = "\u062E\u0631\u06CC\u062F \u067E\u0644\u0648\u062A\u0648\u0646\u06CC\u0648\u0645 \u062F\u0631 IronFront";
  if (itemKind === "plutonium") {
    amountTomans = Math.max(1e4, validAmount * 250);
    description = `\u062E\u0631\u06CC\u062F ${validAmount.toLocaleString("fa-IR")} \u067E\u0644\u0648\u062A\u0648\u0646\u06CC\u0648\u0645 \u062F\u0631 IronFront`;
  } else if (itemKind === "coins") {
    amountTomans = Math.max(1e4, Math.floor(validAmount * 1.5));
    description = `\u062E\u0631\u06CC\u062F ${validAmount.toLocaleString("fa-IR")} \u0633\u06A9\u0647 \u062F\u0631 IronFront`;
  } else if (itemKind === "pack" || itemKind === "cosmetic") {
    amountTomans = 49e3;
    description = `\u062E\u0631\u06CC\u062F \u0628\u0633\u062A\u0647 ${itemName || "\u0648\u06CC\u0698\u0647"} \u062F\u0631 IronFront`;
  }
  const merchantId = process.env.ZARINPAL_MERCHANT_ID || "00000000-0000-0000-0000-000000000000";
  const callbackUrl = `${getApiBase(req)}/payment/zarinpal/callback`;
  const authority = `A000${crypto2.randomUUID().replace(/-/g, "").substring(0, 32)}`;
  AccountDatabase.createZarinpalOrder({
    authority,
    userId: user.id,
    amountTomans,
    itemKind: itemKind || "plutonium",
    itemAmount: validAmount,
    itemName: itemName || description,
    status: "pending",
    createdAt: Date.now()
  });
  const isRealMerchant = merchantId.length === 36 && !merchantId.startsWith("00000000");
  if (isRealMerchant) {
    try {
      const zarinRes = await fetch("https://payment.zarinpal.com/pg/v4/payment/request.json", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          merchant_id: merchantId,
          amount: amountTomans,
          description,
          callback_url: callbackUrl,
          metadata: {
            mobile: user.phone || void 0,
            email: `${user.username.toLowerCase()}@ironfront.ir`
          }
        })
      });
      const zarinData = await zarinRes.json();
      if (zarinData.data && zarinData.data.code === 100 && zarinData.data.authority) {
        const realAuth = zarinData.data.authority;
        AccountDatabase.createZarinpalOrder({
          authority: realAuth,
          userId: user.id,
          amountTomans,
          itemKind: itemKind || "plutonium",
          itemAmount: validAmount,
          itemName: itemName || description,
          status: "pending",
          createdAt: Date.now()
        });
        return res.json({
          ok: true,
          authority: realAuth,
          paymentUrl: `https://payment.zarinpal.com/pg/StartPay/${realAuth}`,
          amountTomans
        });
      }
    } catch (e) {
      console.warn("[ZarinPal] Network request failed, using sandbox fallback:", e);
    }
  }
  const paymentUrl = `${getApiBase(req)}/payment/zarinpal/sandbox?authority=${authority}`;
  return res.json({
    ok: true,
    authority,
    paymentUrl,
    amountTomans
  });
});
accountRouter.get("/payment/zarinpal/callback", async (req, res) => {
  const authority = String(req.query.Authority || req.query.authority || "");
  const status = String(req.query.Status || req.query.status || "");
  if (!authority) {
    return res.redirect("/?payment=error&message=missing_authority");
  }
  const order = AccountDatabase.getZarinpalOrder(authority);
  if (!order) {
    return res.redirect("/?payment=error&message=order_not_found");
  }
  if (status.toUpperCase() !== "OK") {
    return res.redirect(`/?payment=canceled&amount=${order.amountTomans}`);
  }
  let refId = Math.floor(1e7 + Math.random() * 9e7);
  let cardPan = "502229******1234";
  const merchantId = process.env.ZARINPAL_MERCHANT_ID;
  const isRealMerchant = Boolean(
    merchantId && merchantId.length === 36 && !merchantId.startsWith("00000000")
  );
  if (isRealMerchant) {
    try {
      const verifyRes = await fetch("https://payment.zarinpal.com/pg/v4/payment/verify.json", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          merchant_id: merchantId,
          amount: order.amountTomans,
          authority
        })
      });
      const verifyData = await verifyRes.json();
      if (verifyData.data && (verifyData.data.code === 100 || verifyData.data.code === 101)) {
        refId = verifyData.data.ref_id || refId;
        cardPan = verifyData.data.card_pan || cardPan;
      } else {
        return res.redirect(`/?payment=failed&code=${verifyData.errors?.code || 0}`);
      }
    } catch (e) {
      console.warn("[ZarinPal] Real verification request error:", e);
      return res.redirect("/?payment=failed&message=verification_connection_error");
    }
  }
  const fulfillment = AccountDatabase.fulfillZarinpalOrder(authority, refId, cardPan);
  if (!fulfillment.success) {
    return res.redirect(`/?payment=failed&message=${encodeURIComponent(fulfillment.message)}`);
  }
  return res.redirect(
    `/?payment=success&ref_id=${refId}&amount=${order.amountTomans}&item=${encodeURIComponent(order.itemName)}`
  );
});
accountRouter.get("/payment/zarinpal/sandbox", (req, res) => {
  const authority = String(req.query.authority || "");
  const order = AccountDatabase.getZarinpalOrder(authority);
  if (!order) {
    return res.status(404).send("<h2>\u062E\u0637\u0627: \u062A\u0631\u0627\u06A9\u0646\u0634 \u0632\u0631\u06CC\u0646\u200C\u067E\u0627\u0644 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F.</h2>");
  }
  const htmlContent = `
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>\u062F\u0631\u06AF\u0627\u0647 \u067E\u0631\u062F\u0627\u062E\u062A \u0632\u0631\u06CC\u0646\u200C\u067E\u0627\u0644 | \u0634\u0627\u067E\u0631\u06A9</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      background: #0f172a;
      color: #f8fafc;
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 16px;
    }
    .card {
      background: #1e293b;
      border: 1px solid rgba(245, 158, 11, 0.4);
      border-radius: 20px;
      padding: 32px;
      max-width: 440px;
      width: 100%;
      box-shadow: 0 20px 50px rgba(0,0,0,0.6), 0 0 30px rgba(245, 158, 11, 0.15);
      text-align: center;
    }
    .logo-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(245, 158, 11, 0.15);
      border: 1px solid rgba(245, 158, 11, 0.4);
      padding: 8px 16px;
      border-radius: 12px;
      font-weight: 800;
      color: #fbbf24;
      margin-bottom: 20px;
    }
    .amount-box {
      background: rgba(0,0,0,0.4);
      border-radius: 14px;
      padding: 16px;
      margin: 20px 0;
      border: 1px solid rgba(255,255,255,0.08);
    }
    .amount {
      font-size: 28px;
      font-weight: 900;
      color: #34d399;
    }
    .btn-pay {
      background: linear-gradient(135deg, #10b981, #059669);
      color: white;
      border: none;
      border-radius: 12px;
      padding: 14px;
      font-size: 16px;
      font-weight: bold;
      width: 100%;
      cursor: pointer;
      box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);
      transition: all 0.2s;
    }
    .btn-pay:hover {
      filter: brightness(1.1);
      transform: translateY(-2px);
    }
    .btn-cancel {
      background: transparent;
      color: #ef4444;
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 12px;
      padding: 12px;
      font-size: 14px;
      font-weight: bold;
      width: 100%;
      cursor: pointer;
      margin-top: 10px;
    }
    .meta {
      font-size: 12px;
      color: #94a3b8;
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo-badge">
      <span>\u{1F7E1} \u0632\u0631\u06CC\u0646\u200C\u067E\u0627\u0644 (ZarinPal)</span>
      <span>\u2022 \u0634\u0627\u067E\u0631\u06A9</span>
    </div>
    <h2 style="margin: 0 0 8px 0; font-size: 20px;">\u062F\u0631\u06AF\u0627\u0647 \u067E\u0631\u062F\u0627\u062E\u062A \u0627\u0645\u0646 \u0628\u0627\u0646\u06A9\u06CC</h2>
    <p style="margin: 0; color: #94a3b8; font-size: 13px;">\u067E\u0630\u06CC\u0631\u0646\u062F\u0647: \u0628\u0627\u0632\u06CC \u0622\u0646\u0644\u0627\u06CC\u0646 \u0627\u0633\u062A\u0631\u0627\u062A\u0698\u06CC\u06A9 IronFront</p>

    <div class="amount-box">
      <div style="font-size: 12px; color: #94a3b8; margin-bottom: 4px;">\u0645\u0628\u0644\u063A \u0642\u0627\u0628\u0644 \u067E\u0631\u062F\u0627\u062E\u062A:</div>
      <div class="amount">${order.amountTomans.toLocaleString("fa-IR")} \u062A\u0648\u0645\u0627\u0646</div>
      <div class="meta">\u0628\u0627\u0628\u062A: ${order.itemName}</div>
      <div class="meta" style="font-family: monospace;">\u06A9\u062F \u067E\u06CC\u06AF\u06CC\u0631\u06CC \u0627\u0631\u062C\u0627\u0639: ${authority.substring(0, 16)}...</div>
    </div>

    <form method="GET" action="/api/payment/zarinpal/callback">
      <input type="hidden" name="Authority" value="${authority}" />
      <input type="hidden" name="Status" value="OK" />
      <button type="submit" class="btn-pay">\u062A\u0627\u06CC\u06CC\u062F \u0648 \u067E\u0631\u062F\u0627\u062E\u062A \u0645\u0648\u0641\u0642 (\u0634\u0628\u06CC\u0647\u200C\u0633\u0627\u0632 \u0628\u0627\u0646\u06A9\u06CC)</button>
    </form>

    <form method="GET" action="/api/payment/zarinpal/callback">
      <input type="hidden" name="Authority" value="${authority}" />
      <input type="hidden" name="Status" value="NOK" />
      <button type="submit" class="btn-cancel">\u0627\u0646\u0635\u0631\u0627\u0641 \u0627\u0632 \u067E\u0631\u062F\u0627\u062E\u062A</button>
    </form>
  </div>
</body>
</html>
  `;
  return res.send(htmlContent);
});
accountRouter.get("/users/@me", (req, res) => {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({ error: "unauthorized", message: "\u06A9\u0627\u0631\u0628\u0631 \u0648\u0627\u0631\u062F \u0646\u0634\u062F\u0647 \u0627\u0633\u062A." });
  }
  return res.json(toUserMeResponse(user));
});
accountRouter.all(["/users/@me/username", "/users/@me/username/"], (req, res) => {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({ error: "unauthorized", message: "\u06A9\u0627\u0631\u0628\u0631 \u0648\u0627\u0631\u062F \u0646\u0634\u062F\u0647 \u0627\u0633\u062A." });
  }
  const newName = (req.body?.username || req.body?.name || "").trim();
  if (!newName) {
    return res.status(400).json({ error: "Username is required", message: "\u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0627\u0644\u0632\u0627\u0645\u06CC \u0627\u0633\u062A." });
  }
  const result = AccountDatabase.updateUsername(user.id, newName);
  if (!result.success) {
    return res.status(409).json({
      error: "Username taken or invalid",
      message: result.message,
      bareClaim: result.bareClaim || "unavailable"
    });
  }
  return res.json({
    username: result.user.username,
    base: result.user.username,
    discriminator: "0000",
    usernameStatus: "premium",
    nextUsernameChangeAt: null,
    bareClaim: "claimed"
  });
});
accountRouter.get("/cluster.json", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=10");
  const hostHeader = _req.get("x-forwarded-host") || _req.get("host") || process.env.DOMAIN || "open.zguard.ir";
  const host = hostHeader.split(",")[0].trim().replace(/:(?:80|443)$/, "");
  return res.json({
    latest: "abcdef0123456789",
    servers: {
      a: {
        host,
        numWorkers: 2,
        version: "abcdef0123456789",
        state: "open"
      }
    }
  });
});
accountRouter.get("/leaderboard/tribes", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=30");
  return res.json({
    windowDays: 30,
    start: "2026-09-18",
    end: "2026-10-18",
    tribes: [
      {
        rank: 1,
        name: "Persian Immortals",
        gamesAppeared: 140,
        playerReach: 520,
        ownerPublicId: "usr_8949368d1377",
        ownerUsername: "General_Sorena",
        activeBoosts: 2
      },
      {
        rank: 2,
        name: "Arya Guardians",
        gamesAppeared: 98,
        playerReach: 380,
        ownerPublicId: "usr_4155432b6da6",
        ownerUsername: "Iron_Hunter",
        activeBoosts: 1
      },
      {
        rank: 3,
        name: "Apex Conquerors",
        gamesAppeared: 72,
        playerReach: 290,
        ownerPublicId: "usr_f4d831dd9ff7",
        ownerUsername: "Ariobarzan",
        activeBoosts: 0
      }
    ]
  });
});
accountRouter.get("/users/@me/tribe_names", (_req, res) => {
  return res.json({ names: [] });
});
accountRouter.get("/public/clans/leaderboard", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=10");
  return res.json(ClanDatabase.getClanLeaderboard());
});
accountRouter.get("/public/clan/:tag/exists", (req, res) => {
  const clan = ClanDatabase.getClanByTag(getParam(req.params.tag));
  if (clan) {
    return res.status(200).json({ exists: true });
  }
  return res.status(404).json({ exists: false });
});
accountRouter.get("/clans", (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search : void 0;
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
  const limit = Math.max(1, parseInt(String(req.query.limit || "20"), 10));
  return res.json(ClanDatabase.getClansBrowse(search, page, limit));
});
accountRouter.get("/clans/:tag", (req, res) => {
  const clan = ClanDatabase.getClanByTag(getParam(req.params.tag));
  if (!clan) {
    return res.status(404).json({ error: "Clan not found", message: "\u06A9\u0644\u0646 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F." });
  }
  return res.json({
    name: clan.name,
    tag: clan.tag,
    description: clan.description,
    discordUrl: clan.discordUrl ?? null,
    isOpen: clan.isOpen,
    createdAt: clan.createdAt,
    memberCount: clan.members.length,
    softBalance: clan.softBalance,
    hardBalance: clan.hardBalance
  });
});
accountRouter.post("/clans", (req, res) => {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({ message: "\u0628\u0631\u0627\u06CC \u0627\u06CC\u062C\u0627\u062F \u06A9\u0644\u0646 \u0627\u0628\u062A\u062F\u0627 \u0648\u0627\u0631\u062F \u062D\u0633\u0627\u0628 \u062E\u0648\u062F \u0634\u0648\u06CC\u062F." });
  }
  const { tag, name, description, isOpen, discordUrl } = req.body || {};
  if (!tag || !name) {
    return res.status(400).json({ message: "\u062A\u06AF \u0648 \u0646\u0627\u0645 \u06A9\u0644\u0646 \u0627\u0644\u0632\u0627\u0645\u06CC \u0627\u0633\u062A." });
  }
  const result = ClanDatabase.createClan(user.id, user.username, {
    tag: String(tag),
    name: String(name),
    description: description ? String(description) : "",
    isOpen: isOpen !== false,
    discordUrl: discordUrl ? String(discordUrl) : null
  });
  if (!result.ok) {
    return res.status(400).json({ message: result.message });
  }
  const c = result.clan;
  return res.status(201).json({
    name: c.name,
    tag: c.tag,
    description: c.description,
    discordUrl: c.discordUrl ?? null,
    isOpen: c.isOpen,
    createdAt: c.createdAt,
    memberCount: c.members.length,
    softBalance: c.softBalance,
    hardBalance: c.hardBalance
  });
});
function getCallerClanRole(user, tag) {
  const clan = ClanDatabase.getClanByTag(tag);
  if (!clan) return null;
  const m = clan.members.find((member) => member.publicId === user.id);
  return m ? m.role : null;
}
accountRouter.patch("/clans/:tag", (req, res) => {
  const user = resolveUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized", message: "\u0627\u062D\u0631\u0627\u0632 \u0647\u0648\u06CC\u062A \u0646\u0634\u062F\u0647 \u0627\u0633\u062A." });
  const tag = getParam(req.params.tag);
  const role = getCallerClanRole(user, tag);
  if (role !== "leader" && role !== "officer") {
    return res.status(403).json({ error: "Forbidden", message: "\u0634\u0645\u0627 \u062F\u0633\u062A\u0631\u0633\u06CC \u0648\u06CC\u0631\u0627\u06CC\u0634 \u0627\u06CC\u0646 \u06A9\u0644\u0646 \u0631\u0627 \u0646\u062F\u0627\u0631\u06CC\u062F." });
  }
  const updated = ClanDatabase.updateClan(tag, req.body || {});
  if (!updated) {
    return res.status(404).json({ error: "Clan not found" });
  }
  return res.json({
    name: updated.name,
    tag: updated.tag,
    description: updated.description,
    discordUrl: updated.discordUrl ?? null,
    isOpen: updated.isOpen,
    createdAt: updated.createdAt,
    memberCount: updated.members.length,
    softBalance: updated.softBalance,
    hardBalance: updated.hardBalance
  });
});
accountRouter.delete("/clans/:tag", (req, res) => {
  const user = resolveUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized", message: "\u0627\u062D\u0631\u0627\u0632 \u0647\u0648\u06CC\u062A \u0646\u0634\u062F\u0647 \u0627\u0633\u062A." });
  const tag = getParam(req.params.tag);
  const role = getCallerClanRole(user, tag);
  if (role !== "leader") {
    return res.status(403).json({ error: "Forbidden", message: "\u0641\u0642\u0637 \u0644\u06CC\u062F\u0631 \u06A9\u0644\u0646 \u0645\u06CC\u200C\u062A\u0648\u0627\u0646\u062F \u06A9\u0644\u0646 \u0631\u0627 \u0645\u0646\u062D\u0644 \u06A9\u0646\u062F." });
  }
  const ok = ClanDatabase.disbandClan(tag);
  if (!ok) return res.status(404).json({ error: "Clan not found" });
  return res.json({ success: true });
});
accountRouter.get("/clans/:tag/members", (req, res) => {
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
  const limit = Math.max(1, parseInt(String(req.query.limit || "20"), 10));
  return res.json(ClanDatabase.getMembers(getParam(req.params.tag), page, limit));
});
accountRouter.post("/clans/:tag/join", (req, res) => {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({ error: "unauthorized", message: "\u0628\u0631\u0627\u06CC \u0639\u0636\u0648\u06CC\u062A \u062F\u0631 \u06A9\u0644\u0646 \u0627\u0628\u062A\u062F\u0627 \u0648\u0627\u0631\u062F \u062D\u0633\u0627\u0628 \u062E\u0648\u062F \u0634\u0648\u06CC\u062F." });
  }
  const result = ClanDatabase.joinClan(user.id, user.username, getParam(req.params.tag));
  if (result.status === "not_found") {
    return res.status(404).json({ error: "not_found", message: "\u06A9\u0644\u0646 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F." });
  }
  if (result.status === "banned") {
    return res.status(403).json({ code: "BANNED", reason: "\u0634\u0645\u0627 \u0627\u0632 \u0627\u06CC\u0646 \u06A9\u0644\u0646 \u0628\u0646 \u0634\u062F\u0647\u200C\u0627\u06CC\u062F." });
  }
  if (result.status === "already_member") {
    return res.status(409).json({ message: "already member" });
  }
  return res.json({ status: result.status });
});
accountRouter.post("/clans/:tag/leave", (req, res) => {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({ error: "unauthorized", message: "\u0627\u0628\u062A\u062F\u0627 \u0648\u0627\u0631\u062F \u062D\u0633\u0627\u0628 \u062E\u0648\u062F \u0634\u0648\u06CC\u062F." });
  }
  ClanDatabase.leaveClan(user.id, getParam(req.params.tag));
  return res.json({ success: true });
});
accountRouter.post("/clans/:tag/kick", (req, res) => {
  const user = resolveUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const tag = getParam(req.params.tag);
  const role = getCallerClanRole(user, tag);
  if (role !== "leader" && role !== "officer") {
    return res.status(403).json({ error: "Forbidden", message: "\u0634\u0645\u0627 \u0627\u062C\u0627\u0632\u0647 \u0627\u062E\u0631\u0627\u062C \u0627\u0639\u0636\u0627 \u0631\u0627 \u0646\u062F\u0627\u0631\u06CC\u062F." });
  }
  const { targetPublicId } = req.body || {};
  if (!targetPublicId) return res.status(400).json({ error: "Target required" });
  const clan = ClanDatabase.getClanByTag(tag);
  const target = clan?.members.find((m) => m.publicId === String(targetPublicId));
  if (!target) return res.status(404).json({ error: "Member not found" });
  if (target.role === "leader" || role === "officer" && target.role === "officer") {
    return res.status(403).json({ error: "Forbidden", message: "\u0646\u0645\u06CC\u200C\u062A\u0648\u0627\u0646\u06CC\u062F \u0627\u0639\u0636\u0627\u06CC \u0647\u0645\u200C\u0631\u062A\u0628\u0647 \u06CC\u0627 \u0628\u0627\u0644\u0627\u062A\u0631 \u0631\u0627 \u0627\u062E\u0631\u0627\u062C \u06A9\u0646\u06CC\u062F." });
  }
  ClanDatabase.kickMember(tag, String(targetPublicId));
  return res.json({ success: true });
});
accountRouter.post("/clans/:tag/promote", (req, res) => {
  const user = resolveUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const tag = getParam(req.params.tag);
  if (getCallerClanRole(user, tag) !== "leader") {
    return res.status(403).json({ error: "Forbidden", message: "\u062A\u0646\u0647\u0627 \u0644\u06CC\u062F\u0631 \u06A9\u0644\u0646 \u0645\u06CC\u200C\u062A\u0648\u0627\u0646\u062F \u0627\u0639\u0636\u0627 \u0631\u0627 \u0627\u0631\u062A\u0642\u0627 \u062F\u0647\u062F." });
  }
  const { targetPublicId } = req.body || {};
  ClanDatabase.promoteMember(tag, String(targetPublicId));
  return res.json({ success: true });
});
accountRouter.post("/clans/:tag/demote", (req, res) => {
  const user = resolveUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const tag = getParam(req.params.tag);
  if (getCallerClanRole(user, tag) !== "leader") {
    return res.status(403).json({ error: "Forbidden", message: "\u062A\u0646\u0647\u0627 \u0644\u06CC\u062F\u0631 \u06A9\u0644\u0646 \u0645\u06CC\u200C\u062A\u0648\u0627\u0646\u062F \u0627\u0639\u0636\u0627 \u0631\u0627 \u062A\u0646\u0632\u0644 \u062F\u0647\u062F." });
  }
  const { targetPublicId } = req.body || {};
  ClanDatabase.demoteMember(tag, String(targetPublicId));
  return res.json({ success: true });
});
accountRouter.post("/clans/:tag/transfer", (req, res) => {
  const user = resolveUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const tag = getParam(req.params.tag);
  if (getCallerClanRole(user, tag) !== "leader") {
    return res.status(403).json({ error: "Forbidden", message: "\u062A\u0646\u0647\u0627 \u0644\u06CC\u062F\u0631 \u06A9\u0644\u0646 \u0645\u06CC\u200C\u062A\u0648\u0627\u0646\u062F \u0631\u0647\u0628\u0631\u06CC \u0631\u0627 \u0648\u0627\u06AF\u0630\u0627\u0631 \u06A9\u0646\u062F." });
  }
  const { targetPublicId } = req.body || {};
  ClanDatabase.transferLeadership(tag, String(targetPublicId));
  return res.json({ success: true });
});
accountRouter.get("/clans/:tag/requests", (req, res) => {
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
  const limit = Math.max(1, parseInt(String(req.query.limit || "20"), 10));
  return res.json(ClanDatabase.getRequests(getParam(req.params.tag), page, limit));
});
accountRouter.post("/clans/:tag/requests/approve", (req, res) => {
  const user = resolveUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const tag = getParam(req.params.tag);
  const role = getCallerClanRole(user, tag);
  if (role !== "leader" && role !== "officer") {
    return res.status(403).json({ error: "Forbidden" });
  }
  const { targetPublicId } = req.body || {};
  ClanDatabase.approveRequest(tag, String(targetPublicId));
  return res.json({ success: true });
});
accountRouter.post("/clans/:tag/requests/deny", (req, res) => {
  const user = resolveUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const tag = getParam(req.params.tag);
  const role = getCallerClanRole(user, tag);
  if (role !== "leader" && role !== "officer") {
    return res.status(403).json({ error: "Forbidden" });
  }
  const { targetPublicId } = req.body || {};
  ClanDatabase.denyRequest(tag, String(targetPublicId));
  return res.json({ success: true });
});
accountRouter.post("/clans/:tag/requests/withdraw", (req, res) => {
  const user = resolveUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  ClanDatabase.withdrawRequest(getParam(req.params.tag), user.id);
  return res.json({ success: true });
});
accountRouter.get("/clans/:tag/bans", (req, res) => {
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
  const limit = Math.max(1, parseInt(String(req.query.limit || "20"), 10));
  return res.json(ClanDatabase.getBans(getParam(req.params.tag), page, limit));
});
accountRouter.post("/clans/:tag/ban", (req, res) => {
  const user = resolveUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const tag = getParam(req.params.tag);
  const role = getCallerClanRole(user, tag);
  if (role !== "leader" && role !== "officer") {
    return res.status(403).json({ error: "Forbidden" });
  }
  const { targetPublicId, reason } = req.body || {};
  const targetUser = AccountDatabase.getUserById(String(targetPublicId));
  const targetName = targetUser?.username || "Player";
  ClanDatabase.banMember(
    tag,
    user.id,
    user.username,
    String(targetPublicId),
    targetName,
    reason ? String(reason) : null
  );
  return res.json({ success: true });
});
accountRouter.post("/clans/:tag/unban", (req, res) => {
  const user = resolveUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const tag = getParam(req.params.tag);
  const role = getCallerClanRole(user, tag);
  if (role !== "leader" && role !== "officer") {
    return res.status(403).json({ error: "Forbidden" });
  }
  const { targetPublicId } = req.body || {};
  ClanDatabase.unbanMember(tag, String(targetPublicId));
  return res.json({ success: true });
});
accountRouter.post("/clans/:tag/donate", (req, res) => {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({ message: "\u0628\u0631\u0627\u06CC \u0627\u0647\u062F\u0627\u06CC \u06A9\u0645\u06A9 \u0645\u0627\u0644\u06CC \u0627\u0628\u062A\u062F\u0627 \u0628\u0627\u06CC\u062F \u0648\u0627\u0631\u062F \u062D\u0633\u0627\u0628 \u062E\u0648\u062F \u0634\u0648\u06CC\u062F." });
  }
  const { currencyType, amount } = req.body || {};
  const numAmount = parseInt(String(amount || "0"), 10);
  if (numAmount <= 0) {
    return res.status(400).json({ message: "\u0645\u0628\u0644\u063A \u0627\u0647\u062F\u0627 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A." });
  }
  if (currencyType === "hard") {
    if (user.gems < numAmount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }
    user.gems -= numAmount;
  } else {
    if (user.coins < numAmount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }
    user.coins -= numAmount;
  }
  user.updatedAt = Date.now();
  AccountDatabase.init();
  ClanDatabase.donate(user.id, user.username, getParam(req.params.tag), currencyType || "soft", numAmount);
  return res.status(201).json({ ok: true });
});
accountRouter.get("/clans/:tag/donations", (req, res) => {
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
  const limit = Math.max(1, parseInt(String(req.query.limit || "20"), 10));
  return res.json(ClanDatabase.getDonations(getParam(req.params.tag), page, limit));
});
accountRouter.get("/clans/:tag/games", (_req, res) => {
  return res.json({ results: [], nextCursor: null });
});
accountRouter.get("/public/player/:publicId", (req, res) => {
  const user = AccountDatabase.getUserById(getParam(req.params.publicId)) || AccountDatabase.getPrimaryUser();
  if (!user) {
    return res.status(404).json({ error: "Player not found" });
  }
  const userClans = ClanDatabase.getUserClansList(user.id);
  const statsLeaf = {
    wins: String(user.stats.wins),
    losses: String(user.stats.losses),
    total: String(user.stats.matchesPlayed),
    stats: {
      trophies: user.stats.elo,
      eliminations: user.stats.kills
    },
    recent: {
      games: Math.min(100, user.stats.matchesPlayed),
      wins: Math.min(100, user.stats.wins)
    }
  };
  return res.json({
    createdAt: new Date(user.createdAt).toISOString(),
    username: user.username,
    stats: {
      Public: {
        ffa: { Easy: statsLeaf }
      },
      Ranked: {
        "1v1": statsLeaf
      }
    },
    clans: userClans
  });
});
accountRouter.post("/account/register", (req, res) => {
  const { username, password } = req.body || {};
  if (!username) {
    return res.status(400).json({ success: false, message: "\u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0627\u0644\u0632\u0627\u0645\u06CC \u0627\u0633\u062A." });
  }
  const result = AccountDatabase.register(String(username), String(password || ""));
  if (!result.success || !result.user) {
    return res.status(400).json(result);
  }
  const jwt = mintJwt(result.user, req);
  res.setHeader(
    "Set-Cookie",
    `openfront_token=${result.user.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`
  );
  return res.json({
    success: true,
    message: result.message,
    token: result.token,
    jwt,
    expiresIn: 30 * 24 * 3600,
    user: toPublicUser(result.user)
  });
});
accountRouter.post("/account/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username) {
    return res.status(400).json({ success: false, message: "\u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0627\u0644\u0632\u0627\u0645\u06CC \u0627\u0633\u062A." });
  }
  const result = AccountDatabase.login(String(username), String(password || ""));
  if (!result.success || !result.user) {
    return res.status(401).json(result);
  }
  const jwt = mintJwt(result.user, req);
  res.setHeader(
    "Set-Cookie",
    `openfront_token=${result.user.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`
  );
  return res.json({
    success: true,
    message: result.message,
    token: result.token,
    jwt,
    expiresIn: 30 * 24 * 3600,
    user: toPublicUser(result.user)
  });
});
accountRouter.get("/account/me", (req, res) => {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({ success: false, message: "\u06A9\u0627\u0631\u0628\u0631 \u0648\u0627\u0631\u062F \u0646\u0634\u062F\u0647 \u0627\u0633\u062A." });
  }
  return res.json({ success: true, user: toPublicUser(user) });
});
accountRouter.post("/account/update", (req, res) => {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({ success: false, message: "\u0627\u062D\u0631\u0627\u0632 \u0647\u0648\u06CC\u062A \u0646\u0634\u062F\u0647 \u0627\u0633\u062A." });
  }
  const result = AccountDatabase.updateProfile(user.id, req.body || {});
  return res.json({ success: result.success, user: result.user ? toPublicUser(result.user) : void 0 });
});
accountRouter.post("/account/change-password", (req, res) => {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({ success: false, message: "\u0627\u062D\u0631\u0627\u0632 \u0647\u0648\u06CC\u062A \u0646\u0634\u062F\u0647 \u0627\u0633\u062A." });
  }
  const { oldPassword, newPassword } = req.body || {};
  const result = AccountDatabase.changePassword(user.id, String(oldPassword || ""), String(newPassword || ""));
  if (!result.success) {
    return res.status(400).json(result);
  }
  return res.json({ success: true, message: result.message });
});
accountRouter.post("/account/claim-daily", (req, res) => {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({ success: false, message: "\u0628\u0631\u0627\u06CC \u062F\u0631\u06CC\u0627\u0641\u062A \u062C\u0627\u06CC\u0632\u0647 \u0631\u0648\u0632\u0627\u0646\u0647 \u0644\u0637\u0641\u0627\u064B \u0648\u0627\u0631\u062F \u062D\u0633\u0627\u0628 \u062E\u0648\u062F \u0634\u0648\u06CC\u062F." });
  }
  const result = AccountDatabase.claimDaily(user.id);
  if (!result.success) {
    return res.status(400).json(result);
  }
  return res.json({
    ...result,
    user: result.user ? toPublicUser(result.user) : void 0
  });
});
accountRouter.post("/account/buy", (req, res) => {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({ success: false, message: "\u0628\u0631\u0627\u06CC \u062E\u0631\u06CC\u062F \u0622\u06CC\u062A\u0645 \u0627\u0628\u062A\u062F\u0627 \u0628\u0627\u06CC\u062F \u0648\u0627\u0631\u062F \u062D\u0633\u0627\u0628 \u06A9\u0627\u0631\u0628\u0631\u06CC \u062E\u0648\u062F \u0634\u0648\u06CC\u062F." });
  }
  const { itemId, priceCoins, bundleItems } = req.body || {};
  if (!itemId || typeof priceCoins !== "number") {
    return res.status(400).json({ success: false, message: "\u0634\u0646\u0627\u0633\u0647 \u0622\u06CC\u062A\u0645 \u0648 \u0642\u06CC\u0645\u062A \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A." });
  }
  const result = AccountDatabase.buyItem(user.id, String(itemId), priceCoins, bundleItems);
  if (!result.success) {
    return res.status(400).json(result);
  }
  return res.json({
    ...result,
    user: result.user ? toPublicUser(result.user) : void 0
  });
});
accountRouter.post("/shop/purchase", (req, res) => {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({ error: "unauthorized", message: "\u0628\u0631\u0627\u06CC \u062E\u0631\u06CC\u062F \u0622\u06CC\u062A\u0645 \u0627\u0628\u062A\u062F\u0627 \u0628\u0627\u06CC\u062F \u0648\u0627\u0631\u062F \u062D\u0633\u0627\u0628 \u062E\u0648\u062F \u0634\u0648\u06CC\u062F." });
  }
  const { cosmeticType, cosmeticName, currencyType, colorPaletteName } = req.body || {};
  if (!cosmeticType || !cosmeticName || !currencyType) {
    return res.status(400).json({ reason: "Missing required fields" });
  }
  const result = AccountDatabase.purchaseCosmetic(user.id, {
    cosmeticType,
    cosmeticName,
    currencyType,
    colorPaletteName
  });
  if (!result.ok) {
    if (result.code === "insufficient_balance") {
      return res.status(400).json({ reason: "Insufficient balance" });
    }
    if (result.code === "already_owned") {
      return res.status(409).json({ reason: "Already owned" });
    }
    return res.status(400).json({ reason: "Purchase failed" });
  }
  return res.json({ ok: true });
});
accountRouter.post("/shop/purchase/pack", (req, res) => {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({ error: "unauthorized", message: "\u0628\u0631\u0627\u06CC \u062E\u0631\u06CC\u062F \u067E\u06A9 \u0627\u0628\u062A\u062F\u0627 \u0628\u0627\u06CC\u062F \u0648\u0627\u0631\u062F \u062D\u0633\u0627\u0628 \u062E\u0648\u062F \u0634\u0648\u06CC\u062F." });
  }
  const { packName } = req.body || {};
  if (!packName) {
    return res.status(400).json({ reason: "Pack not found" });
  }
  const result = AccountDatabase.purchasePack(user.id, String(packName));
  if (!result.ok) {
    if (result.code === "insufficient_balance") {
      return res.status(400).json({ reason: "Insufficient balance" });
    }
    if (result.code === "already_owned") {
      return res.status(409).json({ ownedFlareNames: [] });
    }
    if (result.code === "unavailable") {
      return res.status(400).json({ reason: "Pack not found" });
    }
    return res.status(400).json({ reason: "Failed" });
  }
  const flareNames = (result.items || []).map(
    (it) => it.type === "pattern" && it.colorPalette ? `pattern:${it.name}:${it.colorPalette}` : `${it.type}:${it.name}`
  );
  return res.json({
    packName,
    currencyType: "hard",
    amount: "50",
    flareNames
  });
});
var matchRecordCooldown = /* @__PURE__ */ new Map();
accountRouter.post("/account/record-match", (req, res) => {
  const user = resolveUser(req);
  if (!user) {
    return res.json({ success: true, earnedCoins: 0, earnedXp: 0, leveledUp: false, isGuest: true });
  }
  const now = Date.now();
  const lastRecord = matchRecordCooldown.get(user.id) || 0;
  if (now - lastRecord < 15e3) {
    return res.status(429).json({ success: false, message: "\u0627\u0631\u0633\u0627\u0644 \u0628\u06CC\u0634 \u0627\u0632 \u062D\u062F \u0633\u0631\u06CC\u0639 \u0646\u062A\u06CC\u062C\u0647 \u0628\u0627\u0632\u06CC." });
  }
  matchRecordCooldown.set(user.id, now);
  const { isWin, kills, territoryPercent } = req.body || {};
  const validKills = Math.max(0, Math.min(100, Math.floor(Number(kills) || 0)));
  const validTerritory = Math.max(0, Math.min(100, Math.round(Number(territoryPercent) || 0)));
  const result = AccountDatabase.recordMatch(user.id, {
    isWin: Boolean(isWin),
    kills: validKills,
    territoryPercent: validTerritory
  });
  return res.json({
    ...result,
    user: result.user ? toPublicUser(result.user) : void 0
  });
});
accountRouter.get("/leaderboard/ranked", (req, res) => {
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
  const board = AccountDatabase.getRankedLeaderboard(page, 50);
  res.setHeader("Cache-Control", "public, max-age=10");
  return res.json(board);
});
accountRouter.get("/reserved_clan_tags", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=60");
  return res.json([]);
});
accountRouter.get("/cosmetics.json", (_req, res) => {
  const cosmeticsPath = path3.resolve(process.cwd(), "resources/cosmetics.json");
  if (fs3.existsSync(cosmeticsPath)) {
    res.setHeader("Cache-Control", "public, max-age=60");
    return res.sendFile(cosmeticsPath);
  }
  return res.json({ patterns: {}, flags: {}, crowns: {}, effects: {} });
});
accountRouter.get("/news.json", (_req, res) => {
  const newsPath = path3.resolve(process.cwd(), "resources/news.json");
  if (fs3.existsSync(newsPath)) {
    return res.sendFile(newsPath);
  }
  return res.json([]);
});

// src/server/vercelApi.ts
var app = express();
app.use(express.json());
app.get("/api/news.json", (_req, res) => {
  const newsPath = path4.resolve(process.cwd(), "resources/news.json");
  if (fs4.existsSync(newsPath)) {
    res.setHeader("Cache-Control", "public, max-age=60");
    return res.sendFile(newsPath);
  }
  return res.json([]);
});
app.get("/api/cosmetics.json", (_req, res) => {
  const cosmeticsPath = path4.resolve(process.cwd(), "resources/cosmetics.json");
  if (fs4.existsSync(cosmeticsPath)) {
    res.setHeader("Cache-Control", "public, max-age=60");
    return res.sendFile(cosmeticsPath);
  }
  return res.json({ patterns: {}, flags: {}, crowns: {}, effects: {} });
});
app.get("/api/cluster.json", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  return res.json({ servers: {} });
});
app.use("/api", accountRouter);
var vercelApi_default = app;
export {
  vercelApi_default as default
};
