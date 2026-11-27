/* oxlint-disable typescript/prefer-nullish-coalescing */
import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { AccountDatabase, ServerUser } from "../database/AccountDatabase";
import { ClanDatabase } from "../database/ClanDatabase";
import { uuidToBase64url, base64urlToUuid } from "../../core/Base64";

export const accountRouter = Router();

function extractToken(req: Request): string | null {
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

function getParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] || "";
  return param || "";
}

function getApiBase(req: Request): string {
  if (req.headers.origin && typeof req.headers.origin === "string") {
    return `${req.headers.origin}/api`;
  }
  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto = typeof forwardedProto === "string" ? forwardedProto : req.protocol || "http";
  const host = req.get("host") || "localhost:9000";
  return `${proto}://${host}/api`;
}

const DEV_DEFAULT_SECRET = "openfront_secret_jwt_key_2026";
const RUNTIME_PRODUCTION_SECRET = crypto.randomBytes(32).toString("hex");
const JWT_SECRET =
  process.env.JWT_SECRET ||
  (process.env.NODE_ENV === "production"
    ? RUNTIME_PRODUCTION_SECRET
    : DEV_DEFAULT_SECRET);

function mintJwt(user: ServerUser, req: Request): string {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 30 * 24 * 3600; // 30 days
  const sub = uuidToBase64url(user.uuid);
  const iss = getApiBase(req);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    jti: crypto.randomUUID(),
    sub,
    iat: now,
    exp,
    iss,
    aud: "localhost",
    role: "player",
  };
  const sHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const sPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${sHeader}.${sPayload}`)
    .digest("base64url");
  return `${sHeader}.${sPayload}.${signature}`;
}

function resolveUser(req: Request): ServerUser | null {
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
        const expectedSignature = crypto
          .createHmac("sha256", JWT_SECRET)
          .update(`${sHeader}.${sPayload}`)
          .digest("base64url");

        const sigBuf = Buffer.from(sSignature);
        const expBuf = Buffer.from(expectedSignature);
        if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
          return null;
        }

        const payloadJson = Buffer.from(sPayload, "base64url").toString("utf-8");
        const payload = JSON.parse(payloadJson);
        if (typeof payload.exp === "number" && Math.floor(Date.now() / 1000) > payload.exp) {
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

function toPublicUser(user: ServerUser) {
  const { passwordSalt, passwordHash, ...rest } = user;
  return rest;
}

function toUserMeResponse(user: ServerUser) {
  const userClans = ClanDatabase.getUserClansList(user.id);
  const starterFlares = [
    "pattern:default",
    "pattern:stripes:stripes",
    "flag:peace_dove",
    "title:rookie",
  ];
  const flares = Array.from(new Set([...starterFlares, ...(user.inventory || [])]));

  return {
    user: {
      id: user.id,
      username: user.username,
      email: `${user.phone || user.username.toLowerCase()}@ironfront.ir`,
      phone: user.phone,
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
        player: [],
      },
      leaderboard: {
        oneVone: { elo: user.stats.elo },
        twoVtwo: { elo: user.stats.elo },
      },
      currency: {
        soft: user.coins,
        hard: user.gems,
      },
      clans: userClans,
      clanRequests: [],
      friends: [],
      subscription: null,
      marketingConsent: {
        consented: "approved",
        hasEmail: false,
      },
    },
  };
}

// ─── AUTH REFRESH (Primary session dispenser) ────────────────────────────────
accountRouter.post("/auth/refresh", (req: Request, res: Response) => {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({ error: "unauthorized", message: "نشست نامعتبر است یا کاربری وارد نشده است." });
  }
  const jwt = mintJwt(user, req);
  res.setHeader(
    "Set-Cookie",
    `openfront_token=${user.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`,
  );
  return res.json({
    jwt,
    expiresIn: 30 * 24 * 3600,
  });
});

// ─── AUTH LOGOUT ─────────────────────────────────────────────────────────────
accountRouter.post(["/auth/logout", "/auth/revoke"], (_req: Request, res: Response) => {
  res.setHeader(
    "Set-Cookie",
    "openfront_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
  );
  return res.json({ success: true });
});

// ─── PHONE NUMBER OTP AUTHENTICATION ─────────────────────────────────────────
accountRouter.post(["/auth/phone/request-otp", "/account/phone/request-otp"], (req: Request, res: Response) => {
  const { phone } = req.body || {};
  if (!phone) {
    return res.status(400).json({ success: false, message: "شماره تلفن همراه الزامی است." });
  }
  const result = AccountDatabase.requestPhoneOtp(String(phone));
  if (!result.success) {
    return res.status(400).json(result);
  }
  return res.json(result);
});

accountRouter.post(["/auth/phone/verify-otp", "/account/phone/verify-otp"], (req: Request, res: Response) => {
  const { phone, code, username } = req.body || {};
  if (!phone || !code) {
    return res.status(400).json({ success: false, message: "شماره تلفن و کد تایید الزامی است." });
  }
  const result = AccountDatabase.verifyPhoneOtp(
    String(phone),
    String(code),
    username ? String(username) : undefined,
  );

  if (!result.success || !result.user) {
    return res.status(400).json(result);
  }

  const jwt = mintJwt(result.user, req);
  res.setHeader(
    "Set-Cookie",
    `openfront_token=${result.user.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`,
  );

  return res.json({
    success: true,
    message: result.message,
    token: result.token,
    jwt,
    expiresIn: 30 * 24 * 3600,
    user: toPublicUser(result.user),
    isNew: result.isNew,
  });
});

// ─── ZARINPAL PAYMENT GATEWAY ────────────────────────────────────────────────
accountRouter.post(["/payment/zarinpal/request", "/account/payment/zarinpal/request"], async (req: Request, res: Response) => {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({
      ok: false,
      error: "unauthorized",
      message: "برای خرید از درگاه بانکی ابتدا باید وارد حساب کاربری خود شوید.",
    });
  }

  const { itemKind, itemAmount, itemName } = req.body || {};
  const validAmount = Math.max(1, Math.floor(Number(itemAmount) || 100));

  let amountTomans = 25000;
  let description = "خرید پلوتونیوم در IronFront";

  if (itemKind === "plutonium") {
    amountTomans = Math.max(10000, validAmount * 250);
    description = `خرید ${validAmount.toLocaleString("fa-IR")} پلوتونیوم در IronFront`;
  } else if (itemKind === "coins") {
    amountTomans = Math.max(10000, Math.floor(validAmount * 1.5));
    description = `خرید ${validAmount.toLocaleString("fa-IR")} سکه در IronFront`;
  } else if (itemKind === "pack" || itemKind === "cosmetic") {
    amountTomans = 49000;
    description = `خرید بسته ${itemName || "ویژه"} در IronFront`;
  }

  const merchantId = process.env.ZARINPAL_MERCHANT_ID || "00000000-0000-0000-0000-000000000000";
  const callbackUrl = `${getApiBase(req)}/payment/zarinpal/callback`;
  const authority = `A000${crypto.randomUUID().replace(/-/g, "").substring(0, 32)}`;

  AccountDatabase.createZarinpalOrder({
    authority,
    userId: user.id,
    amountTomans,
    itemKind: (itemKind as any) || "plutonium",
    itemAmount: validAmount,
    itemName: itemName || description,
    status: "pending",
    createdAt: Date.now(),
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
            mobile: user.phone || undefined,
            email: `${user.username.toLowerCase()}@ironfront.ir`,
          },
        }),
      });
      const zarinData = await zarinRes.json();
      if (zarinData.data && zarinData.data.code === 100 && zarinData.data.authority) {
        const realAuth = zarinData.data.authority;
        AccountDatabase.createZarinpalOrder({
          authority: realAuth,
          userId: user.id,
          amountTomans,
          itemKind: (itemKind as any) || "plutonium",
          itemAmount: validAmount,
          itemName: itemName || description,
          status: "pending",
          createdAt: Date.now(),
        });
        return res.json({
          ok: true,
          authority: realAuth,
          paymentUrl: `https://payment.zarinpal.com/pg/StartPay/${realAuth}`,
          amountTomans,
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
    amountTomans,
  });
});

accountRouter.get("/payment/zarinpal/callback", async (req: Request, res: Response) => {
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

  let refId: number | string = Math.floor(10000000 + Math.random() * 90000000);
  let cardPan = "502229******1234";

  const merchantId = process.env.ZARINPAL_MERCHANT_ID;
  const isRealMerchant = Boolean(
    merchantId && merchantId.length === 36 && !merchantId.startsWith("00000000"),
  );

  if (isRealMerchant) {
    try {
      const verifyRes = await fetch("https://payment.zarinpal.com/pg/v4/payment/verify.json", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          merchant_id: merchantId,
          amount: order.amountTomans,
          authority,
        }),
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
    `/?payment=success&ref_id=${refId}&amount=${order.amountTomans}&item=${encodeURIComponent(order.itemName)}`,
  );
});

// ─── ZARINPAL SANDBOX INTERACTIVE TERMINAL ──────────────────────────────────
accountRouter.get("/payment/zarinpal/sandbox", (req: Request, res: Response) => {
  const authority = String(req.query.authority || "");
  const order = AccountDatabase.getZarinpalOrder(authority);

  if (!order) {
    return res.status(404).send("<h2>خطا: تراکنش زرین‌پال یافت نشد.</h2>");
  }

  const htmlContent = `
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>درگاه پرداخت زرین‌پال | شاپرک</title>
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
      <span>🟡 زرین‌پال (ZarinPal)</span>
      <span>• شاپرک</span>
    </div>
    <h2 style="margin: 0 0 8px 0; font-size: 20px;">درگاه پرداخت امن بانکی</h2>
    <p style="margin: 0; color: #94a3b8; font-size: 13px;">پذیرنده: بازی آنلاین استراتژیک IronFront</p>

    <div class="amount-box">
      <div style="font-size: 12px; color: #94a3b8; margin-bottom: 4px;">مبلغ قابل پرداخت:</div>
      <div class="amount">${order.amountTomans.toLocaleString("fa-IR")} تومان</div>
      <div class="meta">بابت: ${order.itemName}</div>
      <div class="meta" style="font-family: monospace;">کد پیگیری ارجاع: ${authority.substring(0, 16)}...</div>
    </div>

    <form method="GET" action="/api/payment/zarinpal/callback">
      <input type="hidden" name="Authority" value="${authority}" />
      <input type="hidden" name="Status" value="OK" />
      <button type="submit" class="btn-pay">تایید و پرداخت موفق (شبیه‌ساز بانکی)</button>
    </form>

    <form method="GET" action="/api/payment/zarinpal/callback">
      <input type="hidden" name="Authority" value="${authority}" />
      <input type="hidden" name="Status" value="NOK" />
      <button type="submit" class="btn-cancel">انصراف از پرداخت</button>
    </form>
  </div>
</body>
</html>
  `;
  return res.send(htmlContent);
});

// ─── /users/@me (Full UserMeResponse schema compliance) ──────────────────────
accountRouter.get("/users/@me", (req: Request, res: Response) => {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({ error: "unauthorized", message: "کاربر وارد نشده است." });
  }
  return res.json(toUserMeResponse(user));
});

// ─── CHANGE / SET USERNAME ───────────────────────────────────────────────────
accountRouter.all(["/users/@me/username", "/users/@me/username/"], (req: Request, res: Response) => {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({ error: "unauthorized", message: "کاربر وارد نشده است." });
  }
  const newName = (req.body?.username || req.body?.name || "").trim();

  if (!newName) {
    return res.status(400).json({ error: "Username is required", message: "نام کاربری الزامی است." });
  }

  const result = AccountDatabase.updateUsername(user.id, newName);
  if (!result.success) {
    return res.status(409).json({
      error: "Username taken or invalid",
      message: result.message,
      bareClaim: result.bareClaim || "unavailable",
    });
  }

  return res.json({
    username: result.user!.username,
    base: result.user!.username,
    discriminator: "0000",
    usernameStatus: "premium",
    nextUsernameChangeAt: null,
    bareClaim: "claimed",
  });
});

// ─── CLUSTER JSON DISCOVERY ──────────────────────────────────────────────────
accountRouter.get("/cluster.json", (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "public, max-age=10");
  const hostHeader =
    _req.get("x-forwarded-host") ||
    _req.get("host") ||
    process.env.DOMAIN ||
    "open.zguard.ir";
  const host = hostHeader.split(",")[0].trim().replace(/:(?:80|443)$/, "");
  return res.json({
    latest: "abcdef0123456789",
    servers: {
      a: {
        host: host,
        numWorkers: 2,
        version: "abcdef0123456789",
        state: "open",
      },
    },
  });
});

// ─── TRIBES LEADERBOARD & STATS ──────────────────────────────────────────────
accountRouter.get("/leaderboard/tribes", (_req: Request, res: Response) => {
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
        activeBoosts: 2,
      },
      {
        rank: 2,
        name: "Arya Guardians",
        gamesAppeared: 98,
        playerReach: 380,
        ownerPublicId: "usr_4155432b6da6",
        ownerUsername: "Iron_Hunter",
        activeBoosts: 1,
      },
      {
        rank: 3,
        name: "Apex Conquerors",
        gamesAppeared: 72,
        playerReach: 290,
        ownerPublicId: "usr_f4d831dd9ff7",
        ownerUsername: "Ariobarzan",
        activeBoosts: 0,
      },
    ],
  });
});

accountRouter.get("/users/@me/tribe_names", (_req: Request, res: Response) => {
  return res.json({ names: [] });
});

// ─── CLAN LEADERBOARD ────────────────────────────────────────────────────────
accountRouter.get("/public/clans/leaderboard", (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "public, max-age=10");
  return res.json(ClanDatabase.getClanLeaderboard());
});

// ─── CLAN EXISTENCE CHECK ────────────────────────────────────────────────────
accountRouter.get("/public/clan/:tag/exists", (req: Request, res: Response) => {
  const clan = ClanDatabase.getClanByTag(getParam(req.params.tag));
  if (clan) {
    return res.status(200).json({ exists: true });
  }
  return res.status(404).json({ exists: false });
});

// ─── CLAN BROWSE ─────────────────────────────────────────────────────────────
accountRouter.get("/clans", (req: Request, res: Response) => {
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
  const limit = Math.max(1, parseInt(String(req.query.limit || "20"), 10));
  return res.json(ClanDatabase.getClansBrowse(search, page, limit));
});

// ─── CLAN DETAIL ─────────────────────────────────────────────────────────────
accountRouter.get("/clans/:tag", (req: Request, res: Response) => {
  const clan = ClanDatabase.getClanByTag(getParam(req.params.tag));
  if (!clan) {
    return res.status(404).json({ error: "Clan not found", message: "کلن یافت نشد." });
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
    hardBalance: clan.hardBalance,
  });
});

// ─── CREATE CLAN ─────────────────────────────────────────────────────────────
accountRouter.post("/clans", (req: Request, res: Response) => {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({ message: "برای ایجاد کلن ابتدا وارد حساب خود شوید." });
  }
  const { tag, name, description, isOpen, discordUrl } = req.body || {};
  if (!tag || !name) {
    return res.status(400).json({ message: "تگ و نام کلن الزامی است." });
  }

  const result = ClanDatabase.createClan(user.id, user.username, {
    tag: String(tag),
    name: String(name),
    description: description ? String(description) : "",
    isOpen: isOpen !== false,
    discordUrl: discordUrl ? String(discordUrl) : null,
  });

  if (!result.ok) {
    return res.status(400).json({ message: result.message });
  }

  const c = result.clan!;
  return res.status(201).json({
    name: c.name,
    tag: c.tag,
    description: c.description,
    discordUrl: c.discordUrl ?? null,
    isOpen: c.isOpen,
    createdAt: c.createdAt,
    memberCount: c.members.length,
    softBalance: c.softBalance,
    hardBalance: c.hardBalance,
  });
});

function getCallerClanRole(user: ServerUser, tag: string): "leader" | "officer" | "member" | null {
  const clan = ClanDatabase.getClanByTag(tag);
  if (!clan) return null;
  const m = clan.members.find((member) => member.publicId === user.id);
  return m ? m.role : null;
}

// ─── UPDATE CLAN ─────────────────────────────────────────────────────────────
accountRouter.patch("/clans/:tag", (req: Request, res: Response) => {
  const user = resolveUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized", message: "احراز هویت نشده است." });
  const tag = getParam(req.params.tag);
  const role = getCallerClanRole(user, tag);
  if (role !== "leader" && role !== "officer") {
    return res.status(403).json({ error: "Forbidden", message: "شما دسترسی ویرایش این کلن را ندارید." });
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
    hardBalance: updated.hardBalance,
  });
});

// ─── DISBAND CLAN ────────────────────────────────────────────────────────────
accountRouter.delete("/clans/:tag", (req: Request, res: Response) => {
  const user = resolveUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized", message: "احراز هویت نشده است." });
  const tag = getParam(req.params.tag);
  const role = getCallerClanRole(user, tag);
  if (role !== "leader") {
    return res.status(403).json({ error: "Forbidden", message: "فقط لیدر کلن می‌تواند کلن را منحل کند." });
  }

  const ok = ClanDatabase.disbandClan(tag);
  if (!ok) return res.status(404).json({ error: "Clan not found" });
  return res.json({ success: true });
});

// ─── CLAN MEMBERS ────────────────────────────────────────────────────────────
accountRouter.get("/clans/:tag/members", (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
  const limit = Math.max(1, parseInt(String(req.query.limit || "20"), 10));
  return res.json(ClanDatabase.getMembers(getParam(req.params.tag), page, limit));
});

// ─── JOIN CLAN ───────────────────────────────────────────────────────────────
accountRouter.post("/clans/:tag/join", (req: Request, res: Response) => {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({ error: "unauthorized", message: "برای عضویت در کلن ابتدا وارد حساب خود شوید." });
  }
  const result = ClanDatabase.joinClan(user.id, user.username, getParam(req.params.tag));

  if (result.status === "not_found") {
    return res.status(404).json({ error: "not_found", message: "کلن یافت نشد." });
  }
  if (result.status === "banned") {
    return res.status(403).json({ code: "BANNED", reason: "شما از این کلن بن شده‌اید." });
  }
  if (result.status === "already_member") {
    return res.status(409).json({ message: "already member" });
  }
  return res.json({ status: result.status });
});

// ─── LEAVE CLAN ──────────────────────────────────────────────────────────────
accountRouter.post("/clans/:tag/leave", (req: Request, res: Response) => {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({ error: "unauthorized", message: "ابتدا وارد حساب خود شوید." });
  }
  ClanDatabase.leaveClan(user.id, getParam(req.params.tag));
  return res.json({ success: true });
});

// ─── CLAN MEMBER ACTIONS (Kick, Promote, Demote, Transfer) ────────────────────
accountRouter.post("/clans/:tag/kick", (req: Request, res: Response) => {
  const user = resolveUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const tag = getParam(req.params.tag);
  const role = getCallerClanRole(user, tag);
  if (role !== "leader" && role !== "officer") {
    return res.status(403).json({ error: "Forbidden", message: "شما اجازه اخراج اعضا را ندارید." });
  }
  const { targetPublicId } = req.body || {};
  if (!targetPublicId) return res.status(400).json({ error: "Target required" });
  
  const clan = ClanDatabase.getClanByTag(tag);
  const target = clan?.members.find((m) => m.publicId === String(targetPublicId));
  if (!target) return res.status(404).json({ error: "Member not found" });
  if (target.role === "leader" || (role === "officer" && target.role === "officer")) {
    return res.status(403).json({ error: "Forbidden", message: "نمی‌توانید اعضای هم‌رتبه یا بالاتر را اخراج کنید." });
  }

  ClanDatabase.kickMember(tag, String(targetPublicId));
  return res.json({ success: true });
});

accountRouter.post("/clans/:tag/promote", (req: Request, res: Response) => {
  const user = resolveUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const tag = getParam(req.params.tag);
  if (getCallerClanRole(user, tag) !== "leader") {
    return res.status(403).json({ error: "Forbidden", message: "تنها لیدر کلن می‌تواند اعضا را ارتقا دهد." });
  }
  const { targetPublicId } = req.body || {};
  ClanDatabase.promoteMember(tag, String(targetPublicId));
  return res.json({ success: true });
});

accountRouter.post("/clans/:tag/demote", (req: Request, res: Response) => {
  const user = resolveUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const tag = getParam(req.params.tag);
  if (getCallerClanRole(user, tag) !== "leader") {
    return res.status(403).json({ error: "Forbidden", message: "تنها لیدر کلن می‌تواند اعضا را تنزل دهد." });
  }
  const { targetPublicId } = req.body || {};
  ClanDatabase.demoteMember(tag, String(targetPublicId));
  return res.json({ success: true });
});

accountRouter.post("/clans/:tag/transfer", (req: Request, res: Response) => {
  const user = resolveUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const tag = getParam(req.params.tag);
  if (getCallerClanRole(user, tag) !== "leader") {
    return res.status(403).json({ error: "Forbidden", message: "تنها لیدر کلن می‌تواند رهبری را واگذار کند." });
  }
  const { targetPublicId } = req.body || {};
  ClanDatabase.transferLeadership(tag, String(targetPublicId));
  return res.json({ success: true });
});

// ─── CLAN REQUESTS ───────────────────────────────────────────────────────────
accountRouter.get("/clans/:tag/requests", (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
  const limit = Math.max(1, parseInt(String(req.query.limit || "20"), 10));
  return res.json(ClanDatabase.getRequests(getParam(req.params.tag), page, limit));
});

accountRouter.post("/clans/:tag/requests/approve", (req: Request, res: Response) => {
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

accountRouter.post("/clans/:tag/requests/deny", (req: Request, res: Response) => {
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

accountRouter.post("/clans/:tag/requests/withdraw", (req: Request, res: Response) => {
  const user = resolveUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  ClanDatabase.withdrawRequest(getParam(req.params.tag), user.id);
  return res.json({ success: true });
});

// ─── CLAN BANS ───────────────────────────────────────────────────────────────
accountRouter.get("/clans/:tag/bans", (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
  const limit = Math.max(1, parseInt(String(req.query.limit || "20"), 10));
  return res.json(ClanDatabase.getBans(getParam(req.params.tag), page, limit));
});

accountRouter.post("/clans/:tag/ban", (req: Request, res: Response) => {
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
    reason ? String(reason) : null,
  );
  return res.json({ success: true });
});

accountRouter.post("/clans/:tag/unban", (req: Request, res: Response) => {
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

// ─── CLAN DONATIONS ──────────────────────────────────────────────────────────
accountRouter.post("/clans/:tag/donate", (req: Request, res: Response) => {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({ message: "برای اهدای کمک مالی ابتدا باید وارد حساب خود شوید." });
  }
  const { currencyType, amount } = req.body || {};
  const numAmount = parseInt(String(amount || "0"), 10);

  if (numAmount <= 0) {
    return res.status(400).json({ message: "مبلغ اهدا نامعتبر است." });
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
  AccountDatabase.init(); // ensure persistent
  ClanDatabase.donate(user.id, user.username, getParam(req.params.tag), currencyType || "soft", numAmount);

  return res.status(201).json({ ok: true });
});

accountRouter.get("/clans/:tag/donations", (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
  const limit = Math.max(1, parseInt(String(req.query.limit || "20"), 10));
  return res.json(ClanDatabase.getDonations(getParam(req.params.tag), page, limit));
});

// ─── CLAN GAMES HISTORY ──────────────────────────────────────────────────────
accountRouter.get("/clans/:tag/games", (_req: Request, res: Response) => {
  return res.json({ results: [], nextCursor: null });
});

// ─── PUBLIC PLAYER PROFILE ───────────────────────────────────────────────────
accountRouter.get("/public/player/:publicId", (req: Request, res: Response) => {
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
      eliminations: user.stats.kills,
    },
    recent: {
      games: Math.min(100, user.stats.matchesPlayed),
      wins: Math.min(100, user.stats.wins),
    },
  };

  return res.json({
    createdAt: new Date(user.createdAt).toISOString(),
    username: user.username,
    stats: {
      Public: {
        ffa: { Easy: statsLeaf },
      },
      Ranked: {
        "1v1": statsLeaf,
      },
    },
    clans: userClans,
  });
});

// ─── REGISTER ────────────────────────────────────────────────────────────────
accountRouter.post("/account/register", (req: Request, res: Response) => {
  const { username, password } = req.body || {};
  if (!username) {
    return res.status(400).json({ success: false, message: "نام کاربری الزامی است." });
  }

  const result = AccountDatabase.register(String(username), String(password || ""));
  if (!result.success || !result.user) {
    return res.status(400).json(result);
  }

  const jwt = mintJwt(result.user, req);
  res.setHeader(
    "Set-Cookie",
    `openfront_token=${result.user.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`,
  );

  return res.json({
    success: true,
    message: result.message,
    token: result.token,
    jwt,
    expiresIn: 30 * 24 * 3600,
    user: toPublicUser(result.user),
  });
});

// ─── LOGIN ───────────────────────────────────────────────────────────────────
accountRouter.post("/account/login", (req: Request, res: Response) => {
  const { username, password } = req.body || {};
  if (!username) {
    return res.status(400).json({ success: false, message: "نام کاربری الزامی است." });
  }

  const result = AccountDatabase.login(String(username), String(password || ""));
  if (!result.success || !result.user) {
    return res.status(401).json(result);
  }

  const jwt = mintJwt(result.user, req);
  res.setHeader(
    "Set-Cookie",
    `openfront_token=${result.user.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`,
  );

  return res.json({
    success: true,
    message: result.message,
    token: result.token,
    jwt,
    expiresIn: 30 * 24 * 3600,
    user: toPublicUser(result.user),
  });
});

// ─── GET ME (Account API Legacy / Hybrid) ─────────────────────────────────────
accountRouter.get("/account/me", (req: Request, res: Response) => {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({ success: false, message: "کاربر وارد نشده است." });
  }
  return res.json({ success: true, user: toPublicUser(user) });
});

// ─── UPDATE PROFILE ──────────────────────────────────────────────────────────
accountRouter.post("/account/update", (req: Request, res: Response) => {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({ success: false, message: "احراز هویت نشده است." });
  }
  const result = AccountDatabase.updateProfile(user.id, req.body || {});
  return res.json({ success: result.success, user: result.user ? toPublicUser(result.user) : undefined });
});

// ─── CHANGE PASSWORD ─────────────────────────────────────────────────────────
accountRouter.post("/account/change-password", (req: Request, res: Response) => {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({ success: false, message: "احراز هویت نشده است." });
  }
  const { oldPassword, newPassword } = req.body || {};
  const result = AccountDatabase.changePassword(user.id, String(oldPassword || ""), String(newPassword || ""));
  if (!result.success) {
    return res.status(400).json(result);
  }
  return res.json({ success: true, message: result.message });
});

// ─── CLAIM DAILY REWARD ──────────────────────────────────────────────────────
accountRouter.post("/account/claim-daily", (req: Request, res: Response) => {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({ success: false, message: "برای دریافت جایزه روزانه لطفاً وارد حساب خود شوید." });
  }
  const result = AccountDatabase.claimDaily(user.id);
  if (!result.success) {
    return res.status(400).json(result);
  }
  return res.json({
    ...result,
    user: result.user ? toPublicUser(result.user) : undefined,
  });
});

// ─── BUY SHOP ITEM (Custom / Bundle / Direct) ────────────────────────────────
accountRouter.post("/account/buy", (req: Request, res: Response) => {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({ success: false, message: "برای خرید آیتم ابتدا باید وارد حساب کاربری خود شوید." });
  }
  const { itemId, priceCoins, bundleItems } = req.body || {};
  if (!itemId || typeof priceCoins !== "number") {
    return res.status(400).json({ success: false, message: "شناسه آیتم و قیمت نامعتبر است." });
  }

  const result = AccountDatabase.buyItem(user.id, String(itemId), priceCoins, bundleItems);
  if (!result.success) {
    return res.status(400).json(result);
  }

  return res.json({
    ...result,
    user: result.user ? toPublicUser(result.user) : undefined,
  });
});

// ─── SHOP PURCHASE (Main Game Store Cosmetic API) ────────────────────────────
accountRouter.post("/shop/purchase", (req: Request, res: Response) => {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({ error: "unauthorized", message: "برای خرید آیتم ابتدا باید وارد حساب خود شوید." });
  }

  const { cosmeticType, cosmeticName, currencyType, colorPaletteName } = req.body || {};
  if (!cosmeticType || !cosmeticName || !currencyType) {
    return res.status(400).json({ reason: "Missing required fields" });
  }

  const result = AccountDatabase.purchaseCosmetic(user.id, {
    cosmeticType,
    cosmeticName,
    currencyType,
    colorPaletteName,
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

// ─── SHOP PURCHASE PACK (Bundles & Flare Packs) ──────────────────────────────
accountRouter.post("/shop/purchase/pack", (req: Request, res: Response) => {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({ error: "unauthorized", message: "برای خرید پک ابتدا باید وارد حساب خود شوید." });
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

  const flareNames = (result.items || []).map((it: any) =>
    it.type === "pattern" && it.colorPalette
      ? `pattern:${it.name}:${it.colorPalette}`
      : `${it.type}:${it.name}`,
  );

  return res.json({
    packName,
    currencyType: "hard",
    amount: "50",
    flareNames,
  });
});

const matchRecordCooldown = new Map<string, number>();

// ─── RECORD MATCH OUTCOME ───────────────────────────────────────────────────
accountRouter.post("/account/record-match", (req: Request, res: Response) => {
  const user = resolveUser(req);
  if (!user) {
    return res.json({ success: true, earnedCoins: 0, earnedXp: 0, leveledUp: false, isGuest: true });
  }

  const now = Date.now();
  const lastRecord = matchRecordCooldown.get(user.id) || 0;
  if (now - lastRecord < 15000) {
    return res.status(429).json({ success: false, message: "ارسال بیش از حد سریع نتیجه بازی." });
  }
  matchRecordCooldown.set(user.id, now);

  const { isWin, kills, territoryPercent } = req.body || {};
  const validKills = Math.max(0, Math.min(100, Math.floor(Number(kills) || 0)));
  const validTerritory = Math.max(0, Math.min(100, Math.round(Number(territoryPercent) || 0)));

  const result = AccountDatabase.recordMatch(user.id, {
    isWin: Boolean(isWin),
    kills: validKills,
    territoryPercent: validTerritory,
  });

  return res.json({
    ...result,
    user: result.user ? toPublicUser(result.user) : undefined,
  });
});

// ─── RANKED LEADERBOARD ──────────────────────────────────────────────────────
accountRouter.get("/leaderboard/ranked", (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
  const board = AccountDatabase.getRankedLeaderboard(page, 50);
  res.setHeader("Cache-Control", "public, max-age=10");
  return res.json(board);
});

// ─── RESERVED CLAN TAGS ──────────────────────────────────────────────────────
accountRouter.get("/reserved_clan_tags", (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "public, max-age=60");
  return res.json([]);
});

// ─── COSMETICS JSON ──────────────────────────────────────────────────────────
accountRouter.get("/cosmetics.json", (_req: Request, res: Response) => {
  const cosmeticsPath = path.resolve(process.cwd(), "resources/cosmetics.json");
  if (fs.existsSync(cosmeticsPath)) {
    res.setHeader("Cache-Control", "public, max-age=60");
    return res.sendFile(cosmeticsPath);
  }
  return res.json({ patterns: {}, flags: {}, crowns: {}, effects: {} });
});

// ─── NEWS JSON ───────────────────────────────────────────────────────────────
accountRouter.get("/news.json", (_req: Request, res: Response) => {
  const newsPath = path.resolve(process.cwd(), "resources/news.json");
  if (fs.existsSync(newsPath)) {
    return res.sendFile(newsPath);
  }
  return res.json([]);
});
// Guest accounts are disabled: Guest mode is strictly anonymous/unregistered.
