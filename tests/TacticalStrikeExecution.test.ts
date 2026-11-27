import { describe, expect, it } from "vitest";
import { TacticalStrikeExecution } from "../src/core/execution/TacticalStrikeExecution";
import { Player, UnitType } from "../src/core/game/Game";

describe("TacticalStrikeExecution", () => {
  it("initializes and executes cruise missile precision strike", () => {
    let playerGold = 2_000_000n;
    const mockPlayer = {
      displayName: () => "Striker",
      id: () => "p1",
      isAlive: () => true,
      gold: () => playerGold,
      removeGold: (amt: bigint) => {
        playerGold -= amt;
      },
      isFriendly: () => false,
      outgoingAttacks: () => [],
    } as unknown as Player;

    const exec = new TacticalStrikeExecution(mockPlayer, "cruise_missile", 100);
    expect(exec.isActive()).toBe(true);

    let unitDeleted = false;
    const mockSamUnit = {
      isActive: () => true,
      owner: () => ({ id: () => "enemy1" }),
      type: () => UnitType.SAMLauncher,
      delete: () => {
        unitDeleted = true;
      },
    };

    let troopsRemoved = 0;
    const mockEnemyPlayer = {
      isPlayer: () => true,
      troops: () => 20000,
      removeTroops: (amount: number) => {
        troopsRemoved += amount;
      },
      updateRelation: () => {},
      outgoingAttacks: () => [],
      relinquish: () => {},
    };

    const mockGame = {
      nearbyUnits: () => [{ unit: mockSamUnit }],
      x: () => 10,
      y: () => 10,
      isValidCoord: () => true,
      ref: () => 100,
      owner: () => mockEnemyPlayer,
      queueNukeImpact: () => {},
    } as any;

    exec.init(mockGame, 10);
    exec.tick(10);

    expect(exec.isActive()).toBe(false);
    expect(playerGold).toBe(800_000n); // 1.2M deducted
    expect(unitDeleted).toBe(true);
    expect(troopsRemoved).toBeGreaterThan(0);
  });

  it("executes EMP strike and locks enemy SAM queues", () => {
    let playerGold = 2_000_000n;
    const mockPlayer = {
      displayName: () => "Striker",
      id: () => "p1",
      isAlive: () => true,
      gold: () => playerGold,
      removeGold: (amt: bigint) => {
        playerGold -= amt;
      },
      isFriendly: () => false,
      outgoingAttacks: () => [],
    } as unknown as Player;

    const samQueue: number[] = [];
    const mockEnemySam = {
      isActive: () => true,
      owner: () => ({ id: () => "enemy1" }),
      type: () => UnitType.SAMLauncher,
      level: () => 2,
      missileTimerQueue: () => samQueue,
    };

    const mockGame = {
      nearbyUnits: () => [{ unit: mockEnemySam }],
      ticks: () => 50,
    } as any;

    const exec = new TacticalStrikeExecution(mockPlayer, "emp_strike", 100);
    exec.init(mockGame, 50);
    exec.tick(50);

    expect(playerGold).toBe(500_000n); // 1.5M deducted
    expect(samQueue.length).toBe(2);
    expect(samQueue[0]).toBeGreaterThan(50); // Locked in future cooldown
    expect(exec.isActive()).toBe(false);
  });

  it("executes Iron Dome and intercepts hostile incoming nukes", () => {
    let playerGold = 2_000_000n;
    const mockPlayer = {
      displayName: () => "Defender",
      id: () => "p1",
      isAlive: () => true,
      gold: () => playerGold,
      removeGold: (amt: bigint) => {
        playerGold -= amt;
      },
      isFriendly: () => false,
      outgoingAttacks: () => [],
    } as unknown as Player;

    let nukeIntercepted = false;
    let nukeActive = true;
    const mockHostileNuke = {
      isActive: () => nukeActive,
      owner: () => ({ id: () => "aggressor" }),
      type: () => UnitType.AtomBomb,
      targetPlayer: () => mockPlayer,
      targetTile: () => 200,
      tile: () => 150,
      delete: () => {
        nukeIntercepted = true;
        nukeActive = false;
      },
    };

    const mockGame = {
      units: () => [mockHostileNuke],
      owner: () => mockPlayer,
      stats: () => ({ bombIntercept: () => {} }),
    } as any;

    const exec = new TacticalStrikeExecution(mockPlayer, "iron_dome", 0);
    exec.init(mockGame, 100);
    exec.tick(100);

    expect(playerGold).toBe(200_000n); // 1.8M deducted
    expect(nukeIntercepted).toBe(true);
    expect(exec.isActive()).toBe(true); // Active defense dome remains active (with 1 intercept remaining)
  });

  it("matures War Bonds investment and pays out principal plus profit", () => {
    let playerGold = 2_000_000n;
    const mockPlayer = {
      displayName: () => "Investor",
      id: () => "p1",
      isAlive: () => true,
      gold: () => playerGold,
      removeGold: (amt: bigint) => {
        playerGold -= amt;
      },
      addGold: (amt: bigint) => {
        playerGold += amt;
      },
      isFriendly: () => false,
      outgoingAttacks: () => [],
    } as unknown as Player;

    const mockGame = {} as any;
    const exec = new TacticalStrikeExecution(mockPlayer, "war_bonds", 0);
    exec.init(mockGame, 10);
    expect(playerGold).toBe(1_000_000n); // 1M invested

    // Advance 450 ticks (45s duration)
    for (let t = 0; t < 450; t++) {
      exec.tick(10 + t);
    }

    expect(playerGold).toBe(2_300_000n); // 1M returned + 1.3M payout (+300K pure profit!)
    expect(exec.isActive()).toBe(false);
  });

  it("executes stealth_sam and constructs SAM launcher in game", async () => {
    const { setup } = await import("./util/Setup");
    const { PlayerInfo, PlayerType, GameType } = await import(
      "../src/core/game/Game"
    );
    const game = await setup(
      "ocean_and_land",
      { gameType: GameType.Singleplayer, instantBuild: false },
      [],
      undefined,
      undefined,
      false,
    );
    const playerInfo = new PlayerInfo(
      "player1",
      PlayerType.Human,
      null,
      "player1_id",
    );
    game.addPlayer(playerInfo);
    const player = game.player("player1_id")!;

    let landTile = 0;
    for (let y = 0; y < game.map().height(); y++) {
      for (let x = 0; x < game.map().width(); x++) {
        const t = game.ref(x, y);
        if (game.isLand(t)) {
          landTile = t;
          break;
        }
      }
      if (landTile !== 0) break;
    }

    player.conquer(landTile);
    game.endSpawnPhase();
    player.addGold(10_000_000n);

    const exec = new TacticalStrikeExecution(player, "stealth_sam", landTile);
    game.addExecution(exec);

    for (let i = 0; i < 25; i++) {
      game.executeNextTick();
    }

    const sams = player.units(UnitType.SAMLauncher);
    expect(sams.length).toBe(1);
    expect(player.gold()).toBe(7_200_000n); // 2.8M gold deducted
  });

  it("executes stealth_silo and constructs Missile Silo in game", async () => {
    const { setup } = await import("./util/Setup");
    const { PlayerInfo, PlayerType, GameType } = await import(
      "../src/core/game/Game"
    );
    const game = await setup(
      "ocean_and_land",
      { gameType: GameType.Singleplayer, instantBuild: false },
      [],
      undefined,
      undefined,
      false,
    );
    const playerInfo = new PlayerInfo(
      "player1",
      PlayerType.Human,
      null,
      "player1_id",
    );
    game.addPlayer(playerInfo);
    const player = game.player("player1_id")!;

    let landTile = 0;
    for (let y = 0; y < game.map().height(); y++) {
      for (let x = 0; x < game.map().width(); x++) {
        const t = game.ref(x, y);
        if (game.isLand(t)) {
          landTile = t;
          break;
        }
      }
      if (landTile !== 0) break;
    }

    player.conquer(landTile);
    game.endSpawnPhase();
    player.addGold(10_000_000n);

    const exec = new TacticalStrikeExecution(player, "stealth_silo", landTile);
    game.addExecution(exec);

    for (let i = 0; i < 25; i++) {
      game.executeNextTick();
    }

    const silos = player.units(UnitType.MissileSilo);
    expect(silos.length).toBe(1);
    expect(player.gold()).toBe(8_000_000n); // 2.0M gold deducted
  });

  it("executes recon_drone and scans area to reveal hidden units", async () => {
    const { stealthManager } = await import("../src/core/StealthManager");
    const { Cell } = await import("../src/core/game/Game");
    stealthManager.clear();

    const hiddenTile = 555;
    const targetCell = new Cell(50, 50);
    stealthManager.registerStealthUnit(
      hiddenTile,
      UnitType.SAMLauncher,
      2, // enemy
      targetCell,
    );

    expect(stealthManager.isVisibleTo(hiddenTile, 1, 2)).toBe(false);

    let playerGold = 1_000_000n;
    const mockPlayer = {
      displayName: () => "ReconCmd",
      id: () => "p1",
      smallID: () => 1,
      isAlive: () => true,
      gold: () => playerGold,
      removeGold: (amt: bigint) => {
        playerGold -= amt;
      },
      isFriendly: () => false,
      outgoingAttacks: () => [],
    } as unknown as Player;

    const mockGame = {
      cell: (_tile: number) => targetCell,
    } as any;

    const exec = new TacticalStrikeExecution(mockPlayer, "recon_drone", hiddenTile);
    exec.init(mockGame, 10);
    exec.tick(10);

    expect(playerGold).toBe(600_000n); // 400K deducted
    expect(exec.isActive()).toBe(false);
    expect(stealthManager.isVisibleTo(hiddenTile, 1, 2)).toBe(true);
  });
});

