import { describe, expect, it } from "vitest";
import { TradeTroopsExecution } from "../src/core/execution/TradeTroopsExecution";
import { Player, PlayerType } from "../src/core/game/Game";

describe("TradeTroopsExecution", () => {
  it("buys troops from a bot nation successfully", () => {
    let senderGold = 100_000n;
    let senderTroops = 1_000;
    let botGold = 5_000n;
    let botTroops = 50_000;
    let relationUpdated = 0;

    const mockSender = {
      id: () => "sender_1",
      isAlive: () => true,
      gold: () => senderGold,
      troops: () => senderTroops,
      removeGold: (amt: bigint) => {
        senderGold -= amt;
      },
      addTroops: (amt: number) => {
        senderTroops += amt;
      },
      hasEmbargoAgainst: () => false,
    } as unknown as Player;

    const mockBot = {
      id: () => "bot_1",
      type: () => PlayerType.Nation,
      isAlive: () => true,
      gold: () => botGold,
      troops: () => botTroops,
      addGold: (amt: bigint) => {
        botGold += amt;
      },
      removeTroops: (amt: number) => {
        botTroops -= amt;
      },
      hasEmbargoAgainst: () => false,
      updateRelation: (_other: Player, pts: number) => {
        relationUpdated += pts;
      },
      canSendEmoji: () => false,
    } as unknown as Player;

    const mockGame = {
      ticks: () => 10,
      hasPlayer: (id: string) => id === "bot_1",
      player: (id: string) => (id === "bot_1" ? mockBot : mockSender),
      config: () => ({
        maxTroops: () => 200_000,
      }),
      addExecution: () => {},
    };

    const exec = new TradeTroopsExecution(
      mockSender,
      "buy",
      "bot_1",
      5_000,
      12_500,
    );

    exec.init(mockGame as any, 10);
    exec.tick(10);

    expect(senderGold).toBe(87_500n); // 100,000 - 12,500
    expect(botGold).toBe(17_500n); // 5,000 + 12,500
    expect(senderTroops).toBe(6_000); // 1,000 + 5,000
    expect(botTroops).toBe(45_000); // 50,000 - 5,000
    expect(relationUpdated).toBeGreaterThan(0);
  });

  it("sells troops to a bot nation successfully", () => {
    let senderGold = 10_000n;
    let senderTroops = 20_000;
    let botTroops = 5_000;
    let relationUpdated = 0;

    const mockSender = {
      id: () => "sender_1",
      isAlive: () => true,
      gold: () => senderGold,
      troops: () => senderTroops,
      removeTroops: (amt: number) => {
        senderTroops -= amt;
      },
      addGold: (amt: bigint) => {
        senderGold += amt;
      },
      hasEmbargoAgainst: () => false,
    } as unknown as Player;

    const mockBot = {
      id: () => "bot_1",
      type: () => PlayerType.Nation,
      isAlive: () => true,
      troops: () => botTroops,
      addTroops: (amt: number) => {
        botTroops += amt;
      },
      hasEmbargoAgainst: () => false,
      updateRelation: (_other: Player, pts: number) => {
        relationUpdated += pts;
      },
      canSendEmoji: () => false,
    } as unknown as Player;

    const mockGame = {
      ticks: () => 15,
      hasPlayer: (id: string) => id === "bot_1",
      player: () => mockBot,
      config: () => ({
        maxTroops: () => 200_000,
      }),
      addExecution: () => {},
    };

    const exec = new TradeTroopsExecution(
      mockSender,
      "sell",
      "bot_1",
      4_000,
      6_000,
    );

    exec.init(mockGame as any, 15);
    exec.tick(15);

    expect(senderTroops).toBe(16_000); // 20,000 - 4,000
    expect(senderGold).toBe(16_000n); // 10,000 + 6,000
    expect(botTroops).toBe(9_000); // 5,000 + 4,000
    expect(relationUpdated).toBeGreaterThan(0);
  });

  it("buys troops from the open mercenary market without a recipient", () => {
    let senderGold = 50_000n;
    let senderTroops = 500;

    const mockSender = {
      id: () => "sender_1",
      isAlive: () => true,
      gold: () => senderGold,
      troops: () => senderTroops,
      removeGold: (amt: bigint) => {
        senderGold -= amt;
      },
      addTroops: (amt: number) => {
        senderTroops += amt;
      },
      hasEmbargoAgainst: () => false,
    } as unknown as Player;

    const mockGame = {
      ticks: () => 20,
      config: () => ({
        maxTroops: () => 100_000,
      }),
    };

    const exec = new TradeTroopsExecution(
      mockSender,
      "buy",
      null,
      2_000,
      5_000,
    );

    exec.init(mockGame as any, 20);
    exec.tick(20);

    expect(senderGold).toBe(45_000n);
    expect(senderTroops).toBe(2_500);
  });

  it("aborts trade if embargo is in effect", () => {
    const senderGold = 50_000n;
    const mockSender = {
      id: () => "sender_1",
      isAlive: () => true,
      gold: () => senderGold,
      troops: () => 1000,
      hasEmbargoAgainst: () => true, // EMBARGO!
    } as unknown as Player;

    const mockBot = {
      id: () => "bot_1",
      isAlive: () => true,
      hasEmbargoAgainst: () => false,
    } as unknown as Player;

    const mockGame = {
      ticks: () => 20,
      hasPlayer: () => true,
      player: () => mockBot,
    };

    const exec = new TradeTroopsExecution(
      mockSender,
      "buy",
      "bot_1",
      2_000,
      5_000,
    );

    exec.init(mockGame as any, 20);
    exec.tick(20);

    // Gold untouched because embargo aborted trade
    expect(senderGold).toBe(50_000n);
  });

  it("caps seller troops at 80% when buying from a target", () => {
    let senderGold = 100_000n;
    let senderTroops = 1_000;
    let sellerGold = 2_000n;
    let sellerTroops = 10_000; // 80% = 8,000 max

    const mockSender = {
      id: () => "sender_1",
      isAlive: () => true,
      gold: () => senderGold,
      troops: () => senderTroops,
      removeGold: (amt: bigint) => {
        senderGold -= amt;
      },
      addTroops: (amt: number) => {
        senderTroops += amt;
      },
      hasEmbargoAgainst: () => false,
    } as unknown as Player;

    const mockSeller = {
      id: () => "seller_1",
      type: () => PlayerType.Human,
      isAlive: () => true,
      gold: () => sellerGold,
      troops: () => sellerTroops,
      addGold: (amt: bigint) => {
        sellerGold += amt;
      },
      removeTroops: (amt: number) => {
        sellerTroops -= amt;
      },
      hasEmbargoAgainst: () => false,
    } as unknown as Player;

    const mockGame = {
      ticks: () => 30,
      hasPlayer: () => true,
      player: () => mockSeller,
      config: () => ({
        maxTroops: () => 500_000,
      }),
    };

    // Buyer attempts to buy all 10,000 troops
    const exec = new TradeTroopsExecution(
      mockSender,
      "buy",
      "seller_1",
      10_000,
      25_000,
    );

    exec.init(mockGame as any, 30);
    exec.tick(30);

    // Exactly 8,000 troops transferred (80% of 10,000)
    expect(sellerTroops).toBe(2_000); // 10,000 - 8,000 (20% retained for defense)
    expect(senderTroops).toBe(9_000); // 1,000 + 8,000
    // Proportional gold: (25,000 * 8,000) / 10,000 = 20,000
    expect(senderGold).toBe(80_000n);
    expect(sellerGold).toBe(22_000n);
  });

  it("aborts buy if buyer does not have sufficient gold", () => {
    let senderGold = 100n; // Only 100 gold
    let senderTroops = 1_000;
    let sellerGold = 2_000n;
    let sellerTroops = 10_000;

    const mockSender = {
      id: () => "sender_1",
      isAlive: () => true,
      gold: () => senderGold,
      troops: () => senderTroops,
      removeGold: (amt: bigint) => {
        senderGold -= amt;
      },
      addTroops: (amt: number) => {
        senderTroops += amt;
      },
      hasEmbargoAgainst: () => false,
    } as unknown as Player;

    const mockSeller = {
      id: () => "seller_1",
      type: () => PlayerType.Human,
      isAlive: () => true,
      gold: () => sellerGold,
      troops: () => sellerTroops,
      addGold: (amt: bigint) => {
        sellerGold += amt;
      },
      removeTroops: (amt: number) => {
        sellerTroops -= amt;
      },
      hasEmbargoAgainst: () => false,
    } as unknown as Player;

    const mockGame = {
      ticks: () => 30,
      hasPlayer: () => true,
      player: () => mockSeller,
      config: () => ({
        maxTroops: () => 500_000,
      }),
    };

    // Buyer tries to buy 5,000 troops for 12,500 gold, but only has 100 gold
    const exec = new TradeTroopsExecution(
      mockSender,
      "buy",
      "seller_1",
      5_000,
      12_500,
    );

    exec.init(mockGame as any, 30);
    exec.tick(30);

    // Aborted! Balances completely untouched
    expect(senderGold).toBe(100n);
    expect(senderTroops).toBe(1_000);
    expect(sellerGold).toBe(2_000n);
    expect(sellerTroops).toBe(10_000);
  });
});
