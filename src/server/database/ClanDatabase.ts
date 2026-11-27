import fs from "fs";
import path from "path";

export interface ClanMemberRecord {
  publicId: string;
  username: string;
  role: "leader" | "officer" | "member";
  joinedAt: string;
  wins: number;
  losses: number;
}

export interface ClanDonationRecord {
  publicId: string;
  username: string;
  currencyType: "soft" | "hard";
  amount: number;
  timestamp: string;
}

export interface ClanBanRecord {
  publicId: string;
  username: string;
  bannedBy: string;
  bannedByUsername: string;
  reason: string | null;
  createdAt: string;
}

export interface ClanJoinRequestRecord {
  publicId: string;
  username: string;
  createdAt: string;
}

export interface ClanRecord {
  tag: string;
  name: string;
  description: string;
  discordUrl?: string | null;
  isOpen: boolean;
  createdAt: string;
  softBalance: string;
  hardBalance: string;
  members: ClanMemberRecord[];
  bans: ClanBanRecord[];
  donations: ClanDonationRecord[];
  joinRequests: ClanJoinRequestRecord[];
  stats: {
    games: number;
    wins: number;
    losses: number;
    playerSessions: number;
    weightedWins: number;
    weightedLosses: number;
    weightedWLRatio: number;
  };
}

const DATA_DIR = path.resolve(process.cwd(), "data");
const CLANS_FILE = path.join(DATA_DIR, "clans.json");

export class ClanDatabase {
  private static clans: Map<string, ClanRecord> = new Map(); // key: uppercase tag
  private static userClanIndex: Map<string, string> = new Map(); // key: userId -> uppercase tag
  private static initialized = false;

  public static init(): void {
    if (this.initialized) return;

    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(CLANS_FILE)) {
        const raw = fs.readFileSync(CLANS_FILE, "utf-8");
        const list: ClanRecord[] = JSON.parse(raw);
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

  private static seedInitialClans(): void {
    const nowIso = new Date().toISOString();
    const seeds: ClanRecord[] = [
      {
        tag: "IRN",
        name: "Iran Warriors",
        description: "Official top competitive Persian squad. Join for tactical warfare!",
        discordUrl: "https://discord.gg/openfront",
        isOpen: true,
        createdAt: new Date(Date.now() - 60 * 86400000).toISOString(),
        softBalance: "25000",
        hardBalance: "450",
        members: [
          {
            publicId: "usr_8949368d1377",
            username: "General_Sorena",
            role: "leader",
            joinedAt: new Date(Date.now() - 60 * 86400000).toISOString(),
            wins: 142,
            losses: 18,
          },
          {
            publicId: "usr_4155432b6da6",
            username: "Iron_Hunter",
            role: "officer",
            joinedAt: new Date(Date.now() - 40 * 86400000).toISOString(),
            wins: 110,
            losses: 25,
          },
        ],
        bans: [],
        donations: [
          {
            publicId: "usr_8949368d1377",
            username: "General_Sorena",
            currencyType: "soft",
            amount: 15000,
            timestamp: nowIso,
          },
        ],
        joinRequests: [],
        stats: {
          games: 252,
          wins: 210,
          losses: 42,
          playerSessions: 380,
          weightedWins: 245.5,
          weightedLosses: 38.2,
          weightedWLRatio: 6.42,
        },
      },
      {
        tag: "PERS",
        name: "Persian Empire",
        description: "Unite the empires and conquer every frontier across the globe.",
        discordUrl: null,
        isOpen: true,
        createdAt: new Date(Date.now() - 45 * 86400000).toISOString(),
        softBalance: "18000",
        hardBalance: "320",
        members: [
          {
            publicId: "usr_f4d831dd9ff7",
            username: "Ariobarzan",
            role: "leader",
            joinedAt: new Date(Date.now() - 45 * 86400000).toISOString(),
            wins: 95,
            losses: 30,
          },
        ],
        bans: [],
        donations: [],
        joinRequests: [],
        stats: {
          games: 160,
          wins: 125,
          losses: 35,
          playerSessions: 210,
          weightedWins: 138.0,
          weightedLosses: 32.5,
          weightedWLRatio: 4.24,
        },
      },
      {
        tag: "APEX",
        name: "Apex Legends",
        description: "Hardcore strategy, global dominators and ranked rushers.",
        discordUrl: null,
        isOpen: false,
        createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
        softBalance: "35000",
        hardBalance: "600",
        members: [
          {
            publicId: "usr_3643a8d0ef58",
            username: "Desert_Eagle",
            role: "leader",
            joinedAt: new Date(Date.now() - 30 * 86400000).toISOString(),
            wins: 78,
            losses: 29,
          },
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
          weightedWLRatio: 3.86,
        },
      },
    ];

    for (const clan of seeds) {
      const canonicalTag = clan.tag.toUpperCase();
      this.clans.set(canonicalTag, clan);
      for (const m of clan.members) {
        this.userClanIndex.set(m.publicId, canonicalTag);
      }
    }
  }

  public static saveSync(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const data = Array.from(this.clans.values());
      const tmpFile = CLANS_FILE + ".tmp";
      fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), "utf-8");
      fs.renameSync(tmpFile, CLANS_FILE);
    } catch (e) {
      console.error("[ClanDatabase] Error persisting database:", e);
    }
  }

  public static clanExists(tag: string): boolean {
    this.init();
    return this.clans.has(tag.toUpperCase().trim());
  }

  public static getClanByTag(tag: string): ClanRecord | null {
    this.init();
    return this.clans.get(tag.toUpperCase().trim()) || null;
  }

  public static getUserClan(userId: string): ClanRecord | null {
    this.init();
    const tag = this.userClanIndex.get(userId);
    if (!tag) return null;
    return this.clans.get(tag) || null;
  }

  public static getUserClansList(userId: string): Array<{
    tag: string;
    name: string;
    role: "leader" | "officer" | "member";
    joinedAt: string;
    memberCount: number;
    softBalance: string;
    hardBalance: string;
  }> {
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
        hardBalance: userClan.hardBalance,
      },
    ];
  }

  public static getClansBrowse(search?: string, page = 1, limit = 20) {
    this.init();
    let all = Array.from(this.clans.values());
    if (search && search.trim().length >= 2) {
      const q = search.trim().toLowerCase();
      all = all.filter(
        (c) =>
          c.tag.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q),
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
      hardBalance: c.hardBalance,
    }));

    return {
      results,
      total,
      page,
      limit,
    };
  }

  public static getClanLeaderboard() {
    this.init();
    const now = new Date();
    const startIso = new Date(now.getTime() - 30 * 86400000).toISOString();
    const endIso = now.toISOString();

    const sorted = Array.from(this.clans.values()).sort(
      (a, b) => b.stats.weightedWins - a.stats.weightedWins,
    );

    const clans = sorted.map((c) => ({
      clanTag: c.tag,
      games: c.stats.games,
      wins: c.stats.wins,
      losses: c.stats.losses,
      playerSessions: c.stats.playerSessions,
      weightedWins: c.stats.weightedWins,
      weightedLosses: c.stats.weightedLosses,
      weightedWLRatio: c.stats.weightedWLRatio,
    }));

    return {
      start: startIso,
      end: endIso,
      clans,
      total: clans.length,
      limit: 50,
    };
  }

  public static createClan(
    userId: string,
    username: string,
    data: { tag: string; name: string; description?: string; isOpen?: boolean; discordUrl?: string | null },
  ): { ok: boolean; message?: string; clan?: ClanRecord } {
    this.init();
    const tag = data.tag.toUpperCase().trim();
    if (!/^[A-Z0-9]{2,5}$/.test(tag)) {
      return { ok: false, message: "تگ کلن باید ۲ تا ۵ کاراکتر انگلیسی و عدد باشد." };
    }
    if (this.clans.has(tag)) {
      return { ok: false, message: "این تگ کلن قبلاً ثبت شده است." };
    }
    if (!data.name || data.name.trim().length < 2) {
      return { ok: false, message: "نام کلن باید حداقل ۲ کاراکتر باشد." };
    }

    const nowIso = new Date().toISOString();
    const newClan: ClanRecord = {
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
          losses: 0,
        },
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
        weightedWLRatio: 0,
      },
    };

    this.clans.set(tag, newClan);
    this.userClanIndex.set(userId, tag);
    this.saveSync();

    return { ok: true, clan: newClan };
  }

  public static joinClan(
    userId: string,
    username: string,
    tag: string,
  ): { status: "joined" | "requested" | "banned" | "already_member" | "not_found" } {
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

    const nowIso = new Date().toISOString();

    if (clan.isOpen) {
      clan.members.push({
        publicId: userId,
        username,
        role: "member",
        joinedAt: nowIso,
        wins: 0,
        losses: 0,
      });
      this.userClanIndex.set(userId, canonicalTag);
      this.saveSync();
      return { status: "joined" };
    } else {
      if (!clan.joinRequests.some((r) => r.publicId === userId)) {
        clan.joinRequests.push({
          publicId: userId,
          username,
          createdAt: nowIso,
        });
        this.saveSync();
      }
      return { status: "requested" };
    }
  }

  public static leaveClan(userId: string, tag: string): boolean {
    this.init();
    const canonicalTag = tag.toUpperCase().trim();
    const clan = this.clans.get(canonicalTag);
    if (!clan) return false;

    const idx = clan.members.findIndex((m) => m.publicId === userId);
    if (idx === -1) return false;

    clan.members.splice(idx, 1);
    this.userClanIndex.delete(userId);

    // If leader left and others remain, promote officer/member
    if (clan.members.length > 0) {
      if (!clan.members.some((m) => m.role === "leader")) {
        clan.members[0].role = "leader";
      }
    } else {
      // Clan empty -> remove
      this.clans.delete(canonicalTag);
    }

    this.saveSync();
    return true;
  }

  public static donate(
    userId: string,
    username: string,
    tag: string,
    currencyType: "soft" | "hard",
    amount: number,
  ): { ok: boolean; newBalance: string } {
    this.init();
    const canonicalTag = tag.toUpperCase().trim();
    const clan = this.clans.get(canonicalTag);
    if (!clan || amount <= 0) return { ok: false, newBalance: "0" };

    const nowIso = new Date().toISOString();
    clan.donations.unshift({
      publicId: userId,
      username,
      currencyType,
      amount,
      timestamp: nowIso,
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

  public static getDonations(tag: string, page = 1, limit = 20) {
    this.init();
    const canonicalTag = tag.toUpperCase().trim();
    const clan = this.clans.get(canonicalTag);
    if (!clan) return { results: [], total: 0, page, limit };

    const total = clan.donations.length;
    const start = (page - 1) * limit;
    const results = clan.donations.slice(start, start + limit);

    return { results, total, page, limit };
  }

  public static getMembers(tag: string, page = 1, limit = 20) {
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
        "1v1": { wins: m.wins, losses: m.losses },
      },
    }));

    return {
      results,
      total,
      page,
      limit,
      pendingRequests: clan.joinRequests.length,
    };
  }

  public static getRequests(tag: string, page = 1, limit = 20) {
    this.init();
    const canonicalTag = tag.toUpperCase().trim();
    const clan = this.clans.get(canonicalTag);
    if (!clan) return { results: [], total: 0, page, limit };

    const total = clan.joinRequests.length;
    const start = (page - 1) * limit;
    const results = clan.joinRequests.slice(start, start + limit);

    return { results, total, page, limit };
  }

  public static approveRequest(tag: string, targetPublicId: string): boolean {
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
      joinedAt: new Date().toISOString(),
      wins: 0,
      losses: 0,
    });
    this.userClanIndex.set(req.publicId, canonicalTag);
    this.saveSync();
    return true;
  }

  public static denyRequest(tag: string, targetPublicId: string): boolean {
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

  public static banMember(
    tag: string,
    bannedByPublicId: string,
    bannedByUsername: string,
    targetPublicId: string,
    targetUsername: string,
    reason: string | null,
  ): boolean {
    this.init();
    const canonicalTag = tag.toUpperCase().trim();
    const clan = this.clans.get(canonicalTag);
    if (!clan) return false;

    // Remove from members if present
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
      createdAt: new Date().toISOString(),
    });

    this.saveSync();
    return true;
  }

  public static unbanMember(tag: string, targetPublicId: string): boolean {
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

  public static getBans(tag: string, page = 1, limit = 20) {
    this.init();
    const canonicalTag = tag.toUpperCase().trim();
    const clan = this.clans.get(canonicalTag);
    if (!clan) return { results: [], total: 0, page, limit };

    const total = clan.bans.length;
    const start = (page - 1) * limit;
    const results = clan.bans.slice(start, start + limit);

    return { results, total, page, limit };
  }

  public static updateClan(
    tag: string,
    patch: { name?: string; description?: string; discordUrl?: string | null; isOpen?: boolean },
  ): ClanRecord | null {
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
    if (patch.discordUrl !== undefined) {
      clan.discordUrl = patch.discordUrl || null;
    }
    if (typeof patch.isOpen === "boolean") {
      clan.isOpen = patch.isOpen;
    }

    this.saveSync();
    return clan;
  }

  public static disbandClan(tag: string): boolean {
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

  public static kickMember(tag: string, targetPublicId: string): boolean {
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

  public static promoteMember(tag: string, targetPublicId: string): boolean {
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

  public static demoteMember(tag: string, targetPublicId: string): boolean {
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

  public static transferLeadership(tag: string, targetPublicId: string): boolean {
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

  public static withdrawRequest(tag: string, publicId: string): boolean {
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
}
