import { describe, expect, it } from "vitest";
import {
  buildOilDerrick,
  checkAndConsumeMissileFuel,
  getDepositOwner,
  getOilDeposits,
  OIL_DERRICK_COST_GOLD,
  OilDeposit,
  purchaseStrategicFuel,
  STRATEGIC_FUEL_BUY_AMOUNT,
  STRATEGIC_FUEL_BUY_COST_GOLD,
  tickOilSystem,
} from "../src/core/game/OilSystem";
import { BuildOilDerrickExecution } from "../src/core/execution/BuildOilDerrickExecution";
import { PurchaseFuelExecution } from "../src/core/execution/PurchaseFuelExecution";
import { OilTankerExecution } from "../src/core/execution/OilTankerExecution";
import { OilSystemExecution } from "../src/core/execution/OilSystemExecution";
import { Difficulty, Game, GameMapSize, GameMapType, GameMode, GameType, Player, UnitType } from "../src/core/game/Game";
import { Config } from "../src/core/configuration/Config";
import { GameConfig } from "../src/core/Schemas";

describe("HOI4 Oil & Fuel Strategic System", () => {
  const baseConfig: GameConfig = {
    gameMap: GameMapType.World,
    difficulty: Difficulty.Easy,
    donateGold: false,
    donateTroops: false,
    gameType: GameType.Singleplayer,
    gameMode: GameMode.FFA,
    gameMapSize: GameMapSize.Normal,
    nations: "default",
    bots: 10,
    infiniteGold: false,
    infiniteTroops: false,
    instantBuild: false,
    randomSpawn: false,
    grandStrategy: {
      enabled: true,
      supplyLines: true,
      frontlineAssault: true,
      terrainModifiers: true,
      warMobilization: true,
      airSupport: true,
      oilEconomy: true,
    },
  };

  const createMockGame = () => {
    const config = new Config(baseConfig, null, false);
    const mockTiles = new Map<number, { isLand: boolean; owner: Player | null }>();
    const addedExecutions: any[] = [];

    for (let i = 0; i < 10000; i++) {
      mockTiles.set(i, {
        isLand: i % 2 === 0,
        owner: null,
      });
    }

    const game = {
      config: () => config,
      width: () => 100,
      height: () => 100,
      numTiles: () => 10000,
      isLand: (t: number) => mockTiles.get(t)?.isLand ?? true,
      isWater: (t: number) => !(mockTiles.get(t)?.isLand ?? true),
      isImpassable: (_t: number) => false,
      ref: (x: number, y: number) => y * 100 + x,
      tileRef: (x: number, y: number) => y * 100 + x,
      cell: (t: number) => ({ x: t % 100, y: Math.floor(t / 100) }),
      owner: (t: number) => mockTiles.get(t)?.owner ?? null,
      hasOwner: (t: number) => {
        const o = mockTiles.get(t)?.owner;
        return o !== null && o !== undefined;
      },
      setTileOwner: (t: number, owner: Player | null) => {
        const item = mockTiles.get(t);
        if (item) item.owner = owner;
      },
      setTileIsLand: (t: number, isLand: boolean) => {
        const item = mockTiles.get(t);
        if (item) item.isLand = isLand;
      },
      isValidRef: (t: number) => t >= 0 && t < 10000,
      players: () => [] as Player[],
      getWaterComponent: (_t: number) => 1,
      hasWaterComponent: (_t: number, _c: number) => true,
      manhattanDist: (a: number, b: number) => {
        const ax = a % 100, ay = Math.floor(a / 100);
        const bx = b % 100, by = Math.floor(b / 100);
        return Math.abs(ax - bx) + Math.abs(ay - by);
      },
      addExecution: (...execs: any[]) => {
        addedExecutions.push(...execs);
      },
      getAddedExecutions: () => addedExecutions,
      nextShipStagger: () => 0,
      displayMessage: () => {},
      waterGraphVersion: () => 1,
    };

    return game;
  };

  const createMockPlayer = (
    id: string,
    initialGold: bigint = 100_000n,
    clientID: string | null = "HUMAN_1",
  ) => {
    let gold = initialGold;
    let fuel = 100;
    let fuelCap = 500;
    let fuelRate = 0;
    const unitsList: any[] = [];

    const player = {
      id: () => id,
      clientID: () => clientID,
      name: () => `General_${id}`,
      isAlive: () => true,
      gold: () => gold,
      addGold: (amt: bigint) => {
        gold += amt;
      },
      fuel: () => fuel,
      fuelCap: () => fuelCap,
      fuelRate: () => fuelRate,
      addFuel: (amt: number) => {
        fuel = Math.min(fuelCap, fuel + amt);
      },
      consumeFuel: (amt: number) => {
        fuel = Math.max(0, fuel - amt);
      },
      setFuelCap: (cap: number) => {
        fuelCap = cap;
      },
      setFuelRate: (rate: number) => {
        fuelRate = rate;
      },
      units: (type?: UnitType) => {
        if (!type) return unitsList;
        return unitsList.filter((u) => u.type() === type);
      },
      addMockWarship: (active: boolean = true) => {
        unitsList.push({
          type: () => UnitType.Warship,
          isActive: () => active,
        });
      },
      addMockPort: (tile: number = 0, active: boolean = true) => {
        const port = {
          type: () => UnitType.Port,
          tile: () => tile,
          isActive: () => active,
          isUnderConstruction: () => false,
          isMarkedForDeletion: () => false,
        };
        unitsList.push(port);
        return port;
      },
      buildUnit: (type: UnitType, tile: number, params: any) => {
        const u = {
          type: () => type,
          tile: () => tile,
          owner: () => player,
          isActive: () => true,
          delete: () => {},
          setSafeFromPirates: () => {},
          move: () => {},
        };
        unitsList.push(u);
        return u;
      },
    } as unknown as Player & {
      addMockWarship: (active?: boolean) => void;
      addMockPort: (tile?: number, active?: boolean) => any;
    };

    return player;
  };

  it("generates deterministic oil deposits on land and offshore", () => {
    const game = createMockGame();
    const deposits1 = getOilDeposits(game as any);
    const deposits2 = getOilDeposits(game as any);

    expect(deposits1.length).toBeGreaterThan(0);
    expect(deposits1).toBe(deposits2); // Cached weakmap

    const hasLand = deposits1.some((d) => !d.isOffshore);
    const hasOffshore = deposits1.some((d) => d.isOffshore);
    expect(hasLand).toBe(true);
    expect(hasOffshore).toBe(true);
  });

  it("builds an oil derrick on a controlled field with sufficient gold", () => {
    const game = createMockGame();
    const player = createMockPlayer("p1", 50_000n);
    const deposits = getOilDeposits(game as any);
    const targetDeposit = deposits[0];

    // Assign tile to player
    (game as any).setTileOwner(targetDeposit.tile, player);

    // Initial state
    expect(targetDeposit.hasDerrick).toBe(false);
    expect(player.fuelCap()).toBe(500);

    // Construct derrick
    const result = buildOilDerrick(game as any, player, targetDeposit.tile);
    expect(result.success).toBe(true);
    expect(targetDeposit.hasDerrick).toBe(true);
    expect(player.gold()).toBe(50_000n - OIL_DERRICK_COST_GOLD);
    expect(player.fuelCap()).toBe(750); // Base 500 + 250
  });

  it("prevents building derrick if player does not own territory or lacks gold", () => {
    const game = createMockGame();
    const deposits = getOilDeposits(game as any);
    const targetDeposit = deposits[0];

    // Case 1: Not owner
    const poorPlayer = createMockPlayer("p2", 100_000n);
    const resultNotOwner = buildOilDerrick(game as any, poorPlayer, targetDeposit.tile);
    expect(resultNotOwner.success).toBe(false);
    expect(resultNotOwner.reason).toContain("مالک");

    // Case 2: Owner but insufficient gold
    (game as any).setTileOwner(targetDeposit.tile, poorPlayer);
    poorPlayer.addGold(-100_000n); // 0 gold
    const resultNoGold = buildOilDerrick(game as any, poorPlayer, targetDeposit.tile);
    expect(resultNoGold.success).toBe(false);
    expect(resultNoGold.reason).toContain("طلا کافی نیست");
  });

  it("allows purchasing emergency fuel with civilian treasury gold", () => {
    const player = createMockPlayer("p1", 30_000n);
    const initialFuel = player.fuel();

    const result = purchaseStrategicFuel(player, STRATEGIC_FUEL_BUY_AMOUNT);
    expect(result.success).toBe(true);
    expect(player.gold()).toBe(30_000n - STRATEGIC_FUEL_BUY_COST_GOLD);
    expect(player.fuel()).toBe(initialFuel + STRATEGIC_FUEL_BUY_AMOUNT);
  });

  it("ticks oil system: produces fuel from derricks and drains for warships", () => {
    const game = createMockGame();
    const player = createMockPlayer("p1", 100_000n);
    (game as any).players = () => [player];

    const deposits = getOilDeposits(game as any);
    const d1 = deposits[0];
    const d2 = deposits[1];
    (game as any).setTileOwner(d1.tile, player);
    (game as any).setTileOwner(d2.tile, player);

    // Build derrick on d1
    d1.hasDerrick = true;

    // Add 2 active warships (drain 1 fuel/sec)
    player.addMockWarship(true);
    player.addMockWarship(true);

    const initialFuel = player.fuel();

    // Tick system at 10 ticks (1 second)
    tickOilSystem(game as any, 10);

    // Production: d1 with derrick (12 or 15) + d2 richness (3 or 4) = >= 15
    // Warships consumption: 2 * 0.5 = 1 fuel/sec
    // Net rate >= 14 fuel/sec
    expect(player.fuelRate()).toBeGreaterThanOrEqual(14);
    expect(player.fuel()).toBeGreaterThan(initialFuel);
  });

  it("enforces fuel requirements for missile and nuclear launches", () => {
    const game = createMockGame();
    const player = createMockPlayer("p1");

    // Give player exactly 30 fuel
    player.consumeFuel(player.fuel());
    player.addFuel(30);

    // Cruise missile requires 25 fuel -> allowed
    const cruiseRes = checkAndConsumeMissileFuel(game as any, player, "cruise_missile", 1);
    expect(cruiseRes.allowed).toBe(true);
    expect(player.fuel()).toBe(5);

    // Atom Bomb requires 50 fuel -> blocked (only 5 left)
    const nukeRes = checkAndConsumeMissileFuel(game as any, player, UnitType.AtomBomb, 1);
    expect(nukeRes.allowed).toBe(false);
    expect(player.fuel()).toBe(5); // Not consumed
  });

  it("handles BuildOilDerrickExecution and PurchaseFuelExecution intents properly", () => {
    const game = createMockGame();
    const player = createMockPlayer("p1", 50_000n);
    (game as any).players = () => [player];

    const deposits = getOilDeposits(game as any);
    const target = deposits[0];
    (game as any).setTileOwner(target.tile, player);

    const buildExec = new BuildOilDerrickExecution(player, target.tile);
    buildExec.init(game as any, 10);
    expect(target.hasDerrick).toBe(true);
    expect(buildExec.isActive()).toBe(false);

    const buyExec = new PurchaseFuelExecution(player, 50);
    const fuelBefore = player.fuel();
    buyExec.init(game as any, 11);
    expect(player.fuel()).toBe(fuelBefore + 50);
  });

  it("determines offshore oil field ownership from coastal shore conquest", () => {
    const game = createMockGame();
    const player = createMockPlayer("p1", 50_000n);
    const deposits = getOilDeposits(game as any);
    const offshore = deposits.find((d) => d.isOffshore);
    expect(offshore).toBeDefined();

    if (!offshore) return;

    // Offshore tile is water
    (game as any).setTileIsLand(offshore.tile, false);
    (game as any).setTileOwner(offshore.tile, null);

    // Initially unowned
    expect(getDepositOwner(game as any, offshore)).toBeNull();

    // Player conquers the adjacent coast (radius 2 tiles from offshore deposit)
    const shoreTile = game.ref(offshore.cell.x + 1, offshore.cell.y);
    (game as any).setTileIsLand(shoreTile, true);
    (game as any).setTileOwner(shoreTile, player);

    // Now player controls the continental shelf!
    const owner = getDepositOwner(game as any, offshore);
    expect(owner).not.toBeNull();
    expect(owner?.id()).toBe(player.id());

    // Building derrick on this conquered offshore platform now succeeds!
    const result = buildOilDerrick(game as any, player, offshore.tile);
    expect(result.success).toBe(true);
    expect(offshore.hasDerrick).toBe(true);
  });

  it("dispatches Oil Tankers from offshore derricks to ports when ticking", () => {
    const game = createMockGame();
    const player = createMockPlayer("p1", 50_000n);
    (game as any).players = () => [player];

    const deposits = getOilDeposits(game as any);
    const offshore = deposits.find((d) => d.isOffshore)!;

    // Player controls adjacent shore
    const shoreTile = game.ref(offshore.cell.x + 1, offshore.cell.y);
    (game as any).setTileIsLand(shoreTile, true);
    (game as any).setTileOwner(shoreTile, player);

    // Construct derrick
    buildOilDerrick(game as any, player, offshore.tile);
    expect(offshore.hasDerrick).toBe(true);

    // Case 1: Player has NO port -> No tanker can be dispatched
    tickOilSystem(game as any, 100);
    expect((game as any).getAddedExecutions().length).toBe(0);

    // Case 2: Player has an active Port -> Tanker dispatched on tick 100!
    player.addMockPort(shoreTile, true);
    tickOilSystem(game as any, 100);

    const executions = (game as any).getAddedExecutions();
    expect(executions.length).toBe(1);
    expect(executions[0]).toBeInstanceOf(OilTankerExecution);

    // Complete tanker delivery
    const tanker = executions[0] as OilTankerExecution;
    tanker.init(game as any, 100);
    const fuelBefore = player.fuel();
    (tanker as any).complete();
    expect(player.fuel()).toBe(fuelBefore + 50);
  });

  it("persists constructed derricks in OilSystemExecution snapshot across save/reload", () => {
    const game = createMockGame();
    const deposits = getOilDeposits(game as any);
    deposits[0].hasDerrick = true;
    deposits[2].hasDerrick = true;

    const oilExec = new OilSystemExecution();
    oilExec.init(game as any, 1);

    const snapshot = oilExec.snapshot({} as any);
    expect(snapshot.t).toBe("OilSystem");
    const data = snapshot.d as { derricks: number[] };
    expect(data.derricks).toEqual([deposits[0].id, deposits[2].id]);

    // Fresh game context with unbuilt deposits
    const game2 = createMockGame();
    const deposits2 = getOilDeposits(game2 as any);
    expect(deposits2[0].hasDerrick).toBe(false);
    expect(deposits2[2].hasDerrick).toBe(false);

    const oilExec2 = new OilSystemExecution();
    oilExec2.restoreSnapshot(data, { game: game2 } as any);

    expect(deposits2[0].hasDerrick).toBe(true);
    expect(deposits2[2].hasDerrick).toBe(true);
    expect(deposits2[1].hasDerrick).toBe(false);
  });

  it("enables AI bots to autonomously construct derricks and purchase emergency fuel", () => {
    const game = createMockGame();
    // Bot player has clientID === null and surplus gold
    const bot = createMockPlayer("bot_general", 100_000n, null);
    (game as any).players = () => [bot];

    const deposits = getOilDeposits(game as any);
    const botDeposit = deposits.find((d) => !d.isOffshore)!;
    (game as any).setTileOwner(botDeposit.tile, bot);
    expect(botDeposit.hasDerrick).toBe(false);

    // Tick at tick 50 (when bot AI economic check runs)
    tickOilSystem(game as any, 50);

    expect(botDeposit.hasDerrick).toBe(true);
    expect(bot.gold()).toBe(100_000n - OIL_DERRICK_COST_GOLD);
  });
});
