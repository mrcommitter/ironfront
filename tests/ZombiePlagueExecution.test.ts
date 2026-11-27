import { describe, expect, it } from "vitest";
import { ZombiePlagueExecution } from "../src/core/execution/ZombiePlagueExecution";
import { PlayerType } from "../src/core/game/Game";

describe("ZombiePlagueExecution", () => {
  it("initializes and reports active status", () => {
    const exec = new ZombiePlagueExecution();
    expect(exec.isActive()).toBe(true);
    expect(exec.activeDuringSpawnPhase()).toBe(false);
  });

  it("triggers outbreak at tick 120 and spawns patient zero", () => {
    const exec = new ZombiePlagueExecution();

    let plaguePlayerCreated: any = null;
    let outbreakAnnounced = false;

    const mockVictim = {
      isAlive: () => true,
      numTilesOwned: () => 5,
      type: () => PlayerType.Nation,
      borderTiles: () => new Set([101, 102]),
    };

    const mockGame = {
      players: () => [mockVictim],
      addPlayer: (info: any) => {
        let troops = 0;
        const owned = new Set<number>();
        plaguePlayerCreated = {
          id: () => "zombie_plague_patient_zero",
          isAlive: () => true,
          numTilesOwned: () => owned.size,
          troops: () => troops,
          addTroops: (amt: number) => {
            troops += amt;
          },
          conquer: (t: number) => {
            owned.add(t);
          },
          borderTiles: () => owned,
        };
        return plaguePlayerCreated;
      },
      displayMessage: (key: string) => {
        if (key === "events_display.zombie_outbreak") {
          outbreakAnnounced = true;
        }
      },
    } as any;

    exec.init(mockGame, 0);

    // Before tick 120 -> no outbreak
    exec.tick(50);
    expect(plaguePlayerCreated).toBeNull();

    // At tick 120 -> Patient Zero emerges!
    exec.tick(120);
    expect(plaguePlayerCreated).not.toBeNull();
    expect(plaguePlayerCreated.troops()).toBe(50_000);
    expect(plaguePlayerCreated.numTilesOwned()).toBe(2); // Inoculated from victim border
    expect(outbreakAnnounced).toBe(true);
  });

  it("expands to adjacent non-plague land and converts victims into zombies", () => {
    const exec = new ZombiePlagueExecution();

    let troops = 50_000;
    const owned = new Set<number>([100]);
    const mockPlaguePlayer = {
      id: () => "zombie_plague",
      isAlive: () => true,
      numTilesOwned: () => owned.size,
      troops: () => troops,
      addTroops: (amt: number) => {
        troops += amt;
      },
      conquer: (t: number) => {
        owned.add(t);
      },
      borderTiles: () => owned,
    };

    const mockHumanVictim = {
      isPlayer: () => true,
    };

    const mockGame = {
      players: () => [mockPlaguePlayer],
      neighbors: (t: number) => (t === 100 ? [101, 102, 103, 104, 105] : []),
      isLand: (_t: number) => true,
      isImpassable: (_t: number) => false,
      owner: (_t: number) => mockHumanVictim,
      displayMessage: () => {},
    } as any;

    exec.init(mockGame, 0);
    // Force outbreak start
    (exec as any).outbreakStarted = true;
    (exec as any).plaguePlayer = mockPlaguePlayer;

    // Trigger mutation expansion at tick 15
    exec.tick(15);

    expect(owned.size).toBeGreaterThan(1);
    expect(troops).toBeGreaterThan(50_000); // Infected human victims yielded bonus zombies!
  });

  it("announces eradication when all plague tiles are cleared", () => {
    const exec = new ZombiePlagueExecution();
    let eradicationAnnounced = false;

    const mockPlaguePlayer = {
      id: () => "zombie_plague",
      isAlive: () => false,
      numTilesOwned: () => 0, // Cleared!
    };

    const mockGame = {
      displayMessage: (key: string) => {
        if (key === "events_display.zombie_eradicated") {
          eradicationAnnounced = true;
        }
      },
    } as any;

    exec.init(mockGame, 0);
    (exec as any).outbreakStarted = true;
    (exec as any).plaguePlayer = mockPlaguePlayer;

    exec.tick(200);

    expect(eradicationAnnounced).toBe(true);
    expect(exec.isActive()).toBe(false);
  });
});
