import { describe, expect, it } from "vitest";
import { Config, GRAND_STRATEGY_DEFAULTS } from "../src/core/configuration/Config";
import { SetMobilizationExecution } from "../src/core/execution/SetMobilizationExecution";
import { PlayerExecution } from "../src/core/execution/PlayerExecution";
import { AttackExecution } from "../src/core/execution/AttackExecution";
import { Difficulty, GameMapSize, GameMapType, GameMode, GameType, Player } from "../src/core/game/Game";
import { GameConfig } from "../src/core/Schemas";

describe("Grand Strategy (Hearts of Iron Mode)", () => {
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
  };

  it("defaults grandStrategy to completely disabled", () => {
    const config = new Config(baseConfig, null, false);
    const gs = config.grandStrategyConfig();
    expect(gs.enabled).toBe(false);
    expect(gs.supplyLines).toBe(false);
    expect(gs.frontlineAssault).toBe(false);
    expect(gs.terrainModifiers).toBe(false);
    expect(gs.warMobilization).toBe(false);
    expect(gs.airSupport).toBe(false);
    expect(gs.oilEconomy).toBe(false);
  });

  it("activates grandStrategy when toggled on", () => {
    const config = new Config(
      {
        ...baseConfig,
        grandStrategy: {
          enabled: true,
          supplyLines: true,
          frontlineAssault: true,
          terrainModifiers: true,
          warMobilization: true,
          airSupport: true,
          oilEconomy: true,
        },
      },
      null,
      false,
    );
    const gs = config.grandStrategyConfig();
    expect(gs.enabled).toBe(true);
    expect(gs.supplyLines).toBe(true);
    expect(gs.frontlineAssault).toBe(true);
    expect(gs.terrainModifiers).toBe(true);
    expect(gs.warMobilization).toBe(true);
    expect(gs.airSupport).toBe(true);
    expect(gs.oilEconomy).toBe(true);
  });

  it("SetMobilizationExecution properly updates player war mobilization state", () => {
    let mobilized = false;
    const mockPlayer = {
      isAlive: () => true,
      warMobilization: () => mobilized,
      setWarMobilization: (val: boolean) => {
        mobilized = val;
      },
    } as unknown as Player;

    const exec = new SetMobilizationExecution(mockPlayer, true);
    exec.init({} as any, 0);
    expect(mobilized).toBe(true);

    const execOff = new SetMobilizationExecution(mockPlayer, false);
    execOff.init({} as any, 1);
    expect(mobilized).toBe(false);
  });

  it("applies war mobilization bonuses during player tick in HoI4 mode", () => {
    let troopsAdded = 0;
    let goldAdded = 0n;
    let mobilized = true;

    const mockPlayer = {
      id: () => "p1",
      name: () => "Commander",
      isAlive: () => true,
      units: () => [],
      alliances: () => [],
      getEmbargoes: () => [],
      decayRelations: () => {},
      doctrine: () => "none",
      warMobilization: () => mobilized,
      numTilesOwned: () => 150,
      lastTileChange: () => 0,
      addTroops: (amt: number) => {
        troopsAdded += amt;
      },
      addGold: (amt: bigint) => {
        goldAdded += amt;
      },
    } as unknown as Player;

    const config = new Config(
      {
        ...baseConfig,
        grandStrategy: {
          enabled: true,
          supplyLines: true,
          frontlineAssault: true,
          terrainModifiers: true,
          warMobilization: true,
          airSupport: true,
          oilEconomy: true,
        },
      },
      null,
      false,
    );

    // Mock config rates
    (config as any).troopIncreaseRate = () => 1000;
    (config as any).goldAdditionRate = () => 1000n;

    const mockGame = {
      config: () => config,
      map: () => ({}),
      ticks: () => 10,
      stats: () => ({ goldWork: () => {} }),
    };

    const playerExec = new PlayerExecution(mockPlayer);
    (playerExec as any).mg = mockGame;
    (playerExec as any).map = mockGame.map();
    (playerExec as any).config = config;

    playerExec.tick(10);

    // With mobilization: 1000 * 125 / 100 = 1250 troops, 1000 * 75 / 100 = 750 gold
    expect(troopsAdded).toBe(1250);
    expect(goldAdded).toBe(750n);
  });

  it("identifies isolated pockets without ports as encircled", () => {
    const mockDefender = {
      id: () => "def1",
      smallID: () => 2,
    } as unknown as Player;

    const mockAttacker = {
      id: () => "atk1",
      smallID: () => 1,
      isFriendly: () => false,
      doctrine: () => "none",
      warMobilization: () => false,
      conquer: () => {},
    } as unknown as Player;

    const exec = new AttackExecution(1000, mockAttacker, "def1", 10);
    const mockMap = {
      ownerID: (t: number) => (t === 10 ? 2 : 1),
      neighbors4: (_t: number, out: number[]) => {
        out[0] = 11;
        out[1] = 12;
        out[2] = 13;
        out[3] = 14;
        return 4;
      },
      terrainType: () => 0,
      isLand: () => true,
      isImpassable: () => false,
    };
    const mockGame = {
      config: () => ({
        grandStrategyConfig: () => ({
          enabled: true,
          supplyLines: true,
          terrainModifiers: true,
          warMobilization: true,
        }),
        defensePostRange: () => 30,
      }),
      map: () => mockMap,
      hasUnitNearby: () => false,
    };
    (exec as any).mg = mockGame;
    (exec as any).map = mockMap;
    (exec as any).nbuf = [0, 0, 0, 0];

    const isEncircled = (exec as any).isPocketEncircled(10, mockDefender);
    expect(isEncircled).toBe(true);
  });
});
