import { describe, it, expect, beforeEach } from "vitest";
import {
  MilitaryDoctrine,
  DOCTRINES,
  TACTICAL_POWERS,
  getPreferredDoctrine,
  setPreferredDoctrine,
  getDoctrineMode,
  setDoctrineMode,
  getEnforcedDoctrine,
  setEnforcedDoctrine,
  canChangeDoctrineInGame,
  setCanChangeDoctrineInGame,
  getDisabledTacticalPowers,
  setDisabledTacticalPowers,
} from "../src/core/TacticalDoctrine";
import { stealthManager } from "../src/client/view/StealthManager";
import { Cell, UnitType } from "../src/core/game/Game";

describe("TacticalDoctrine system", () => {
  beforeEach(() => {
    setDoctrineMode("free");
    setPreferredDoctrine(MilitaryDoctrine.Blitzkrieg);
    setEnforcedDoctrine(MilitaryDoctrine.Blitzkrieg);
    setCanChangeDoctrineInGame(true);
    setDisabledTacticalPowers([]);
  });

  it("has valid doctrine definitions with buffs and descriptions", () => {
    expect(DOCTRINES[MilitaryDoctrine.Blitzkrieg]).toBeDefined();
    expect(DOCTRINES[MilitaryDoctrine.IronBastion]).toBeDefined();
    expect(DOCTRINES[MilitaryDoctrine.WarEconomy]).toBeDefined();

    for (const doc of Object.values(DOCTRINES)) {
      expect(doc.persianName).toBeTruthy();
      expect(doc.description).toBeTruthy();
      expect(doc.buffs.length).toBeGreaterThan(0);
    }
  });

  it("correctly toggles doctrine selection modes", () => {
    expect(getDoctrineMode()).toBe("free");
    setDoctrineMode("host_enforced");
    expect(getDoctrineMode()).toBe("host_enforced");
  });

  it("handles preferred vs enforced doctrines", () => {
    setPreferredDoctrine(MilitaryDoctrine.WarEconomy);
    expect(getPreferredDoctrine()).toBe(MilitaryDoctrine.WarEconomy);

    setEnforcedDoctrine(MilitaryDoctrine.IronBastion);
    expect(getEnforcedDoctrine()).toBe(MilitaryDoctrine.IronBastion);
  });

  it("correctly handles canChangeDoctrineInGame lock flag", () => {
    expect(canChangeDoctrineInGame()).toBe(true);
    setCanChangeDoctrineInGame(false);
    expect(canChangeDoctrineInGame()).toBe(false);
  });

  it("manages disabled tactical powers correctly", () => {
    expect(getDisabledTacticalPowers()).toEqual([]);
    setDisabledTacticalPowers(["cruise_missile", "emp_strike"]);
    expect(getDisabledTacticalPowers()).toEqual(["cruise_missile", "emp_strike"]);
  });

  it("has costs and cooldowns defined for all tactical powers", () => {
    expect(TACTICAL_POWERS.length).toBe(8);
    for (const power of TACTICAL_POWERS) {
      expect(power.cost).toBeGreaterThan(0n);
      expect(power.cooldownMs).toBeGreaterThan(0);
      expect(power.persianName).toBeTruthy();
    }
  });
});

describe("StealthManager system", () => {
  it("registers stealth units and enforces visibility rules", () => {
    const tile = 450123;
    const cell = new Cell(123, 450);
    const ownerId = 1;
    const enemyId = 2;

    stealthManager.registerStealthUnit(tile, UnitType.MissileSilo, ownerId, cell);

    expect(stealthManager.isStealth(tile)).toBe(true);

    // Owner must always see their own structure
    expect(stealthManager.isVisibleTo(tile, ownerId)).toBe(true);

    // Enemy must NOT see it initially
    expect(stealthManager.isVisibleTo(tile, enemyId)).toBe(false);

    // Scan an area far away -> should NOT reveal it
    const missedScan = stealthManager.scanArea(new Cell(900, 900), 28, 5000);
    expect(missedScan.length).toBe(0);
    expect(stealthManager.isVisibleTo(tile, enemyId)).toBe(false);

    // Scan over the target location (within 28 tiles) -> MUST reveal it
    const hitScan = stealthManager.scanArea(new Cell(125, 452), 28, 5000);
    expect(hitScan.length).toBe(1);
    expect(hitScan[0].tile).toBe(tile);
    expect(stealthManager.isVisibleTo(tile, enemyId)).toBe(true);
  });
});

describe("SelectDoctrineExecution and Gameplay Integration", () => {
  it("changes player doctrine in simulation via SelectDoctrineExecution", async () => {
    const { SelectDoctrineExecution } = await import(
      "../src/core/execution/SelectDoctrineExecution"
    );
    let currentDoctrine = "blitzkrieg";
    const mockPlayer = {
      isAlive: () => true,
      doctrine: () => currentDoctrine,
      setDoctrine: (d: string) => {
        currentDoctrine = d;
      },
    } as any;

    const exec = new SelectDoctrineExecution(mockPlayer, "iron_bastion");
    exec.init({} as any, 10);
    expect(mockPlayer.doctrine()).toBe("iron_bastion");
    expect(exec.isActive()).toBe(false);
  });
});
