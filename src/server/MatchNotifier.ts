/**
 * Match notification webhook for IronFront.
 * Sends alerts to Discord or Telegram when a new game lobby is created.
 */
import { ServerEnv } from "./ServerEnv";

export async function notifyNewMatch(gameId: string, mapName?: string): Promise<void> {
  const domain = process.env.DOMAIN ?? "ironfront.ir";
  const gameUrl = `https://${domain}/#game=${gameId}`;
  const mapStr = mapName ? ` (نقشه: ${mapName})` : "";
  const message = `⚔️ **لابی جدید در IronFront ایجاد شد!**${mapStr}\nبرای پیوستن به نبرد کلیک کنید:\n${gameUrl}`;

  // Discord Webhook
  const discordWebhook = process.env.DISCORD_WEBHOOK_URL;
  if (discordWebhook && discordWebhook.startsWith("http")) {
    try {
      await fetch(discordWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: message,
          username: "IronFront Bot",
        }),
      });
    } catch (err) {
      console.warn("Failed to send Discord webhook:", err);
    }
  }

  // Telegram Bot
  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  const tgChatId = process.env.TELEGRAM_CHAT_ID;
  if (tgToken && tgChatId) {
    try {
      const tgUrl = `https://api.telegram.org/bot${tgToken}/sendMessage`;
      await fetch(tgUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: tgChatId,
          text: `⚔️ لابی جدید در IronFront ایجاد شد!${mapStr}\n\nورود به بازی:\n${gameUrl}`,
        }),
      });
    } catch (err) {
      console.warn("Failed to send Telegram notification:", err);
    }
  }
}
