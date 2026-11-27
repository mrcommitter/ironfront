import { jwtVerify } from "jose";
import { z } from "zod";
import {
  TokenPayload,
  TokenPayloadSchema,
  UserMeResponse,
  UserMeResponseSchema,
} from "../core/ApiSchemas";
import { CloseCode, CloseReason } from "../core/CloseCodes";
import { GameEnv } from "../core/configuration/Config";
import { PersistentIdSchema } from "../core/Schemas";
import { ServerEnv } from "./ServerEnv";

type TokenVerificationResult =
  | {
      type: "success";
      persistentId: string;
      claims: TokenPayload | null;
    }
  | { type: "error"; message: string };

import crypto from "crypto";
import { AccountDatabase } from "./database/AccountDatabase";
import { uuidToBase64url } from "../core/Base64";

const DEV_DEFAULT_SECRET = "openfront_secret_jwt_key_2026";
const RUNTIME_PRODUCTION_SECRET = crypto.randomBytes(32).toString("hex");
const JWT_SECRET =
  process.env.JWT_SECRET ??
  (process.env.NODE_ENV === "production"
    ? RUNTIME_PRODUCTION_SECRET
    : DEV_DEFAULT_SECRET);

export async function verifyClientToken(
  token: string,
): Promise<TokenVerificationResult> {
  // 1. Direct tok_... database tokens
  if (token.startsWith("tok_")) {
    AccountDatabase.init();
    const user = AccountDatabase.getUserByToken(token);
    if (user) {
      const sub = uuidToBase64url(user.uuid);
      return {
        type: "success",
        persistentId: sub,
        claims: {
          sub,
          jti: crypto.randomUUID(),
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
          iss: ServerEnv.jwtIssuer(),
          aud: ServerEnv.jwtAudience(),
          role: "player",
        },
      };
    }
    return { type: "error", message: "Invalid account token" };
  }

  // 2. HS256 JWT minted by our server
  if (token.includes(".")) {
    const parts = token.split(".");
    if (parts.length === 3) {
      try {
        const [sHeader, sPayload, sSignature] = parts;
        const expectedSig = crypto
          .createHmac("sha256", JWT_SECRET)
          .update(`${sHeader}.${sPayload}`)
          .digest("base64url");
        const sigBuf = Buffer.from(sSignature);
        const expBuf = Buffer.from(expectedSig);
        if (
          sigBuf.length === expBuf.length &&
          crypto.timingSafeEqual(sigBuf, expBuf)
        ) {
          const payload = JSON.parse(
            Buffer.from(sPayload, "base64url").toString("utf-8"),
          );
          const now = Math.floor(Date.now() / 1000);
          if (typeof payload.exp === "number" && now > payload.exp) {
            return { type: "error", message: "JWT token expired" };
          }
          const sub = String(payload.sub ?? "");
          return {
            type: "success",
            persistentId: sub,
            claims: {
              sub,
              jti: String(payload.jti ?? crypto.randomUUID()),
              iat: Number(payload.iat ?? now),
              exp: Number(payload.exp ?? now + 3600),
              iss: String(payload.iss ?? ServerEnv.jwtIssuer()),
              aud: String(payload.aud ?? ServerEnv.jwtAudience()),
              role: payload.role ?? "player",
            },
          };
        }
      } catch {
        // Fall through to EdDSA
      }
    }
  }

  // 3. Persistent ID for guests
  if (PersistentIdSchema.safeParse(token).success) {
    return { type: "success", persistentId: token, claims: null };
  }
  try {
    const issuer = ServerEnv.jwtIssuer();
    const audience = ServerEnv.jwtAudience();
    const key = await ServerEnv.jwkPublicKey();
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["EdDSA"],
      issuer,
      audience,
    });
    const result = TokenPayloadSchema.safeParse(payload);
    if (!result.success) {
      return {
        type: "error",
        message: z.prettifyError(result.error),
      };
    }
    const claims = result.data;
    const persistentId = claims.sub;
    return { type: "success", persistentId, claims };
  } catch (e) {
    const message =
      e instanceof Error
        ? e.message
        : typeof e === "string"
          ? e
          : "An unknown error occurred";

    return { type: "error", message };
  }
}

// status is the API's HTTP status; unset for network and parse failures.
export type UserMeError = { type: "error"; status?: number; message: string };

export async function getUserMe(
  token: string,
): Promise<{ type: "success"; response: UserMeResponse } | UserMeError> {
  try {
    // Get the user object
    const response = await fetch(ServerEnv.jwtIssuer() + "/users/@me", {
      headers: {
        authorization: `Bearer ${token}`,
        "x-api-key": ServerEnv.apiKey(),
      },
    });
    if (response.status !== 200) {
      return {
        type: "error",
        status: response.status,
        message: `Failed to fetch user me: ${response.statusText}`,
      };
    }
    const body = await response.json();
    const result = UserMeResponseSchema.safeParse(body);
    if (!result.success) {
      return {
        type: "error",
        message: `Invalid response: ${z.prettifyError(result.error)}`,
      };
    }
    return { type: "success", response: result.data };
  } catch (e) {
    return {
      type: "error",
      message: `Failed to fetch user me: ${e}`,
    };
  }
}

// How a join closes when /users/@me fails. A 401/403 is the API rejecting the
// session itself: retrying with the same token cannot succeed, so close with a
// terminal code and let the client send the player back to log in. Anything
// else (5xx, network, bad body) may be transient and stays retryable.
export function userMeFailureClose(error: UserMeError): {
  code: CloseCode;
  reason: CloseReason;
} {
  if (error.status === 401 || error.status === 403) {
    return { code: CloseCode.Unauthorized, reason: CloseReason.InvalidToken };
  }
  return {
    code: CloseCode.InternalError,
    reason: CloseReason.AccountLookupFailed,
  };
}
