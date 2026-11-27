import { z } from "zod";
import {
  Difficulty,
  Execution,
  Game,
  Gold,
  Player,
  PlayerID,
  PlayerType,
} from "../game/Game";
import { PseudoRandom } from "../PseudoRandom";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";
import { zNum, zPlayerRef, zRandom } from "../snapshot/SnapshotType";
import { toInt } from "../Util";
import { EmojiExecution } from "./EmojiExecution";
import {
  EMOJI_ASSIST_ACCEPT,
  EMOJI_LOVE,
  EMOJI_DONATION_OK,
  EMOJI_DONATION_TOO_SMALL,
} from "./nation/NationEmojiBehavior";

export class TradeTroopsExecution implements Execution {
  private recipient?: Player;
  private random: PseudoRandom;
  private mg: Game;
  private active = true;

  constructor(
    private sender: Player,
    private action: "buy" | "sell",
    private recipientID: PlayerID | null,
    private troops: number,
    private gold: number,
  ) {}

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  init(mg: Game, ticks: number): void {
    this.mg = mg;
    this.random = new PseudoRandom(mg.ticks());

    if (!this.sender.isAlive()) {
      this.active = false;
      return;
    }

    if (this.recipientID !== null) {
      if (!mg.hasPlayer(this.recipientID)) {
        this.active = false;
        return;
      }
      this.recipient = mg.player(this.recipientID);
      if (!this.recipient.isAlive()) {
        this.active = false;
        return;
      }
      // Check embargo
      if (
        this.sender.hasEmbargoAgainst(this.recipient) ||
        this.recipient.hasEmbargoAgainst(this.sender)
      ) {
        this.active = false;
        return;
      }
    }

    if (this.troops <= 0 || this.gold <= 0) {
      this.active = false;
      return;
    }
  }

  tick(ticks: number): void {
    if (!this.active) return;
    const goldBig = toInt(this.gold);

    if (this.action === "buy") {
      // SENDER BUYS TROOPS (Buyer = sender, Seller = recipient or open market)
      if (this.recipient) {
        // Seller cannot sell more than 80% of their troops
        const sellerTroops = this.recipient.troops();
        const maxSellerTroops = Math.floor(sellerTroops * 0.8);
        if (maxSellerTroops <= 0) {
          this.active = false;
          return;
        }

        const maxTroopsCap =
          this.mg.config().maxTroops(this.sender) - this.sender.troops();
        if (maxTroopsCap <= 0) {
          this.active = false;
          return;
        }

        const requestedTroops = Math.min(this.troops, maxTroopsCap);
        const actualTroops = Math.min(requestedTroops, maxSellerTroops);
        if (actualTroops <= 0) {
          this.active = false;
          return;
        }

        const proportionalGold = toInt(
          Math.max(1, Math.round((this.gold * actualTroops) / this.troops)),
        );
        // Buyer must have sufficient gold to afford the purchase
        if (this.sender.gold() < proportionalGold) {
          this.active = false;
          return;
        }

        // --- BOT BRAIN & GREED EVALUATION ---
        // When seller is a Bot / Nation, they have a brain and evaluate if the offer is high enough
        const goldPerTroop = (Number(proportionalGold) * 10) / actualTroops;
        if (goldPerTroop < 10) {
          // Minimum floor rate for buying troops
          this.active = false;
          return;
        }

        if (
          this.recipient.type() === PlayerType.Nation ||
          this.recipient.type() === PlayerType.Bot
        ) {
          // Baseline price: minimum 10 gold per troop
          let minAcceptableRate = 10;
          const isAlly =
            typeof this.recipient.isAlliedWith === "function"
              ? this.recipient.isAlliedWith(this.sender)
              : false;
          const relation =
            typeof this.recipient.relation === "function"
              ? this.recipient.relation(this.sender)
              : 0;

          if (isAlly) {
            minAcceptableRate = 12;
          } else if (relation > 60) {
            minAcceptableRate = 15;
          } else {
            minAcceptableRate = 18;
          }

          // Dynamic Bot Greed:
          // Bot commanders get greedy ~55% of the time based on tick and smallID seed
          // When greedy, they demand premium / expensive rates (25 to 40 gold per troop)
          const smallId =
            typeof this.recipient.smallID === "function"
              ? this.recipient.smallID()
              : 1;
          const greedSeed =
            (smallId * 37 + Math.floor(this.mg.ticks() / 150)) %
            100;
          const isGreedy = greedSeed < 30;

          if (isGreedy) {
            const greedyDemand = 20 + (greedSeed % 5); // 20 to 24
            minAcceptableRate = Math.max(minAcceptableRate, greedyDemand);
          }

          // If bot's army is critically low (< 20,000 engine troops), their troops are precious
          if (this.recipient.troops() < 20000) {
            minAcceptableRate += 10;
          }

          // Reject cheap offers if greed threshold is not met:
          if (goldPerTroop < minAcceptableRate) {
            if (this.recipient.canSendEmoji(this.sender)) {
              this.mg.addExecution(
                new EmojiExecution(
                  this.recipient,
                  this.sender.id(),
                  this.random.randElement(EMOJI_DONATION_TOO_SMALL),
                ),
              );
            }
            this.active = false;
            return;
          }
        }

        // Gold: Buyer pays, Seller receives
        this.sender.removeGold(proportionalGold);
        this.recipient.addGold(proportionalGold);
        // Troops: Seller delivers, Buyer receives
        this.recipient.removeTroops(actualTroops);
        this.sender.addTroops(actualTroops);

        if (this.recipient.type() === PlayerType.Nation) {
          // Diplomatic friendship improvement (higher bonus for expensive generous purchases)
          const relationBoost = Math.min(50, Math.round(goldPerTroop * 1.2));
          this.recipient.updateRelation(this.sender, relationBoost);
          if (this.recipient.canSendEmoji(this.sender)) {
            const emojis =
              goldPerTroop >= 35 ? EMOJI_LOVE : EMOJI_ASSIST_ACCEPT;
            this.mg.addExecution(
              new EmojiExecution(
                this.recipient,
                this.sender.id(),
                this.random.randElement(emojis),
              ),
            );
          }
        }
      } else {
        // Open Mercenary Market (no specific recipient required)
        const maxTroopsCap =
          this.mg.config().maxTroops(this.sender) - this.sender.troops();
        const actualTroops = Math.min(this.troops, Math.max(0, maxTroopsCap));
        if (actualTroops <= 0) {
          this.active = false;
          return;
        }

        let proportionalGold = toInt(
          Math.max(1, Math.round((this.gold * actualTroops) / this.troops)),
        );
        // Enforce baseline market rate so client cannot buy infinite troops for 1 gold
        const minMarketGold = toInt(Math.round(actualTroops * 2.5));
        if (proportionalGold < minMarketGold) {
          proportionalGold = minMarketGold;
        }

        if (this.sender.gold() < proportionalGold) {
          this.active = false;
          return;
        }

        this.sender.removeGold(proportionalGold);
        this.sender.addTroops(actualTroops);
      }
    } else {
      // SENDER SELLS TROOPS (Seller = sender, Buyer = recipient or open market)
      const senderTroops = this.sender.troops();
      // Seller cannot sell more than 80% of their troops
      const maxSellerTroops = Math.floor(senderTroops * 0.8);
      if (maxSellerTroops <= 0) {
        this.active = false;
        return;
      }

      const actualTroops = Math.min(this.troops, maxSellerTroops);
      if (actualTroops <= 0) {
        this.active = false;
        return;
      }

      const proportionalGold = toInt(
        Math.max(1, Math.round((this.gold * actualTroops) / this.troops)),
      );

      if (this.recipient) {
        // Recipient is the buyer; verify buyer has sufficient gold
        const hasGoldFn = typeof this.recipient.gold === "function";
        const buyerGold = hasGoldFn
          ? this.recipient.gold()
          : proportionalGold;
        if (buyerGold < proportionalGold) {
          this.active = false;
          return;
        }

        const goldPerTroop = (Number(proportionalGold) * 10) / actualTroops;
        // Rate exploit prevention: seller cannot force buyer to overpay (> 30 gold/UI troop)
        if (goldPerTroop > 30) {
          this.active = false;
          return;
        }

        // Bot intelligence: bot won't accept overpriced troops (> 25 gold/troop) or spend > 50% of treasury
        if (
          this.recipient.type() === PlayerType.Nation ||
          this.recipient.type() === PlayerType.Bot
        ) {
          if (
            goldPerTroop > 25 ||
            (hasGoldFn && Number(proportionalGold) > Number(buyerGold) * 0.5)
          ) {
            if (this.recipient.canSendEmoji(this.sender)) {
              this.mg.addExecution(
                new EmojiExecution(
                  this.recipient,
                  this.sender.id(),
                  this.random.randElement(EMOJI_DONATION_TOO_SMALL),
                ),
              );
            }
            this.active = false;
            return;
          }
        }

        // Gold: Buyer pays, Seller receives
        if (typeof this.recipient.removeGold === "function") {
          this.recipient.removeGold(proportionalGold);
        }
        this.sender.addGold(proportionalGold);
        // Troops: Seller delivers, Buyer receives
        this.sender.removeTroops(actualTroops);
        this.recipient.addTroops(actualTroops);

        if (this.recipient.type() === PlayerType.Nation) {
          // Diplomatic relation improvement
          this.recipient.updateRelation(this.sender, 25);
          if (this.recipient.canSendEmoji(this.sender)) {
            this.mg.addExecution(
              new EmojiExecution(
                this.recipient,
                this.sender.id(),
                this.random.randElement(EMOJI_DONATION_OK),
              ),
            );
          }
        }
      } else {
        // Open Mercenary Market (demobilize troops for treasury gold)
        // Cap demobilization payout to prevent infinite gold exploit
        const maxDemobilizeGold = toInt(Math.round(actualTroops * 1.5));
        const actualGold =
          proportionalGold > maxDemobilizeGold
            ? maxDemobilizeGold
            : proportionalGold;
        this.sender.removeTroops(actualTroops);
        this.sender.addGold(actualGold);
      }
    }

    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }

  snapshot(w: SnapshotWriter): ExecRecord {
    return TradeTroopsExecutionSnapshot.write({
      active: this.active,
      initialized: this.mg !== undefined,
      recipient:
        this.recipient === undefined ? null : w.player(this.recipient),
      random: this.random === undefined ? null : w.random(this.random),
      sender: w.player(this.sender),
      action: this.action,
      recipientID: this.recipientID,
      troops: this.troops,
      gold: this.gold,
    });
  }

  restoreSnapshot(s: TradeTroopsState, r: SnapshotReader): void {
    this.active = s.active;
    if (s.initialized) this.mg = r.game;
    if (s.recipient !== null) this.recipient = r.player(s.recipient);
    if (s.random !== null) this.random = r.random(s.random);
    this.sender = r.player(s.sender);
    this.action = s.action;
    this.recipientID = s.recipientID;
    this.troops = s.troops;
    this.gold = s.gold;
  }
}

const TradeTroopsStateSchema = z.object({
  active: z.boolean(),
  initialized: z.boolean(),
  recipient: zPlayerRef().nullable(),
  random: zRandom().nullable(),
  sender: zPlayerRef(),
  action: z.enum(["buy", "sell"]),
  recipientID: z.string().nullable(),
  troops: zNum(),
  gold: zNum(),
});
type TradeTroopsState = z.infer<typeof TradeTroopsStateSchema>;

export const TradeTroopsExecutionSnapshot = execSnapshotType({
  name: "TradeTroops",
  version: 1,
  schema: TradeTroopsStateSchema,
  cls: () => TradeTroopsExecution,
});
