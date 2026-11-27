/**
 * Interactive Emoji Reaction Wheel for IronFront.
 * Allows quick banter, taunts, and emoji reactions during matches.
 */

const EMOJIS = [
  { emoji: "😂", title: "خنده و کل‌کل" },
  { emoji: "💀", title: "تهدید به نابودی" },
  { emoji: "🤝", title: "پیشنهاد اتحاد" },
  { emoji: "☢️", title: "تهدید اتمی" },
  { emoji: "👑", title: "پادشاهی" },
  { emoji: "🚩", title: "تسلیم" },
];

class EmojiReactionWheel {
  public init(): void {
    // Remove widget if present in DOM per user request
    const existing = document.getElementById("ironfront-emoji-widget");
    if (existing) {
      existing.remove();
    }
  }

  public toggle(): void {}
  public open(): void {}
  public close(): void {}
  public sendReaction(_emoji: string): void {}
}

export const emojiWheel = new EmojiReactionWheel();
