import { z } from "zod";
import {
  Cell,
  Execution,
  Game,
  Player,
  Structures,
  UnitType,
} from "../game/Game";
import { TileRef } from "../game/GameMap";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";
import { zInt, zPlayerRef, zRef } from "../snapshot/SnapshotType";
import { stealthManager } from "../StealthManager";
import { ConstructionExecution } from "./ConstructionExecution";

const POWER_COSTS: Record<string, bigint> = {
  cruise_missile: 1_200_000n,
  emp_strike: 1_500_000n,
  iron_dome: 1_800_000n,
  war_bonds: 1_000_000n,
  war_surge: 700_000n,
  recon_drone: 400_000n,
  stealth_silo: 2_000_000n,
  stealth_sam: 2_800_000n,
};

export class TacticalStrikeExecution implements Execution {
  private active = true;
  private mg: Game;
  private ticksRemaining: number = 0;
  private interceptsRemaining: number = 2;

  constructor(
    private player: Player,
    private powerId: string,
    private tile: TileRef,
  ) {}

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  init(mg: Game, _ticks: number): void {
    this.mg = mg;

    // Verify player is alive and has enough gold
    if (!this.player.isAlive()) {
      this.active = false;
      return;
    }

    const cost = POWER_COSTS[this.powerId] ?? 0n;
    if (this.player.gold() < cost) {
      this.active = false;
      return;
    }

    if (this.powerId === "cruise_missile") {
      const gs = this.mg.config ? this.mg.config().grandStrategyConfig() : null;
      if (gs?.enabled && gs.oilEconomy) {
        if (this.player.fuel() < 25) {
          console.warn("insufficient fuel for cruise missile strike");
          this.active = false;
          return;
        }
        this.player.consumeFuel(25);
      }
    }

    this.player.removeGold(cost);

    if (this.powerId === "iron_dome") {
      this.ticksRemaining = 150; // 15 seconds active defense shield
      this.interceptsRemaining = 2; // Up to 2 warhead intercepts
      // Immediate intercept scan for any current threats
      this.executeIronDomeIntercept();
    } else if (this.powerId === "war_bonds") {
      this.ticksRemaining = 450; // 45 seconds investment maturity
    } else if (this.powerId === "war_surge") {
      this.ticksRemaining = 150; // 15 seconds blitz speed boost
      // Immediate assault reinforcement to active frontlines
      const attacks = this.player.outgoingAttacks();
      if (attacks.length > 0) {
        const bonusPerAttack = Math.min(
          2_000,
          Math.floor(6_000 / attacks.length),
        );
        for (const atk of attacks) {
          atk.setTroops(atk.troops() + bonusPerAttack);
        }
      }
    } else if (this.powerId === "stealth_silo") {
      const resolved = this.player.canBuild(
        UnitType.MissileSilo,
        this.tile,
        null,
        true,
      );
      const chosenTile = resolved !== false ? resolved : this.tile;
      stealthManager.registerStealthUnit(
        chosenTile,
        UnitType.MissileSilo,
        this.player.smallID(),
        this.mg.cell(chosenTile),
      );
      this.mg.addExecution(
        new ConstructionExecution(
          this.player,
          UnitType.MissileSilo,
          chosenTile,
          undefined,
          undefined,
          true,
        ),
      );
      this.active = false;
    } else if (this.powerId === "stealth_sam") {
      const resolved = this.player.canBuild(
        UnitType.SAMLauncher,
        this.tile,
        null,
        true,
      );
      const chosenTile = resolved !== false ? resolved : this.tile;
      stealthManager.registerStealthUnit(
        chosenTile,
        UnitType.SAMLauncher,
        this.player.smallID(),
        this.mg.cell(chosenTile),
      );
      this.mg.addExecution(
        new ConstructionExecution(
          this.player,
          UnitType.SAMLauncher,
          chosenTile,
          undefined,
          undefined,
          true,
        ),
      );
      this.active = false;
    }
  }

  tick(_ticks: number): void {
    if (!this.active || !this.mg) return;

    if (this.powerId === "cruise_missile") {
      this.executeCruiseMissile();
      this.active = false;
      return;
    }

    if (this.powerId === "emp_strike") {
      this.executeEMPStrike();
      this.active = false;
      return;
    }

    if (this.powerId === "recon_drone") {
      this.executeReconDrone();
      this.active = false;
      return;
    }

    if (this.powerId === "iron_dome") {
      this.executeIronDomeIntercept();
      this.ticksRemaining--;
      if (this.ticksRemaining <= 0 || this.interceptsRemaining <= 0) {
        this.active = false;
      }
      return;
    }

    if (this.powerId === "war_bonds") {
      this.ticksRemaining--;
      if (this.ticksRemaining <= 0) {
        // Payout principal + 30% profit (1,300,000 gold)
        this.player.addGold(1_300_000n);
        this.active = false;
      }
      return;
    }

    if (this.powerId === "war_surge") {
      this.executeWarSurgeTick();
      this.ticksRemaining--;
      if (this.ticksRemaining <= 0) {
        this.active = false;
      }
      return;
    }
  }

  private executeReconDrone(): void {
    if (this.mg && this.tile !== undefined) {
      const center =
        typeof this.mg.cell === "function"
          ? this.mg.cell(this.tile)
          : new Cell(this.mg.x(this.tile), this.mg.y(this.tile));
      stealthManager.scanArea(center, 28, 60_000);
    }
  }

  private executeCruiseMissile(): void {
    if (this.mg && this.tile !== undefined) {
      const center =
        typeof this.mg.cell === "function"
          ? this.mg.cell(this.tile)
          : new Cell(this.mg.x(this.tile), this.mg.y(this.tile));
      stealthManager.scanArea(center, 12, 45_000);
    }
    // 1. Surgical strike against closest high-value enemy structure or warship
    const strikeRange = 3;
    const targetUnits = this.mg.nearbyUnits(
      this.tile,
      strikeRange,
      [
        UnitType.SAMLauncher,
        UnitType.MissileSilo,
        UnitType.DefensePost,
        UnitType.Factory,
        UnitType.City,
        UnitType.Port,
        UnitType.Warship,
        UnitType.TransportShip,
      ],
      undefined,
      true,
    );

    let structureDestroyed = false;
    for (const { unit } of targetUnits) {
      if (!unit.isActive()) continue;
      const owner = unit.owner();
      if (owner === this.player || this.player.isFriendly(owner, true)) {
        continue;
      }

      if (Structures.has(unit.type())) {
        unit.delete(true, this.player);
        structureDestroyed = true;
        break; // Precision missile destroys 1 primary target structure
      } else if (unit.type() === UnitType.Warship) {
        unit.modifyHealth(-300, this.player);
        structureDestroyed = true;
        break;
      } else if (unit.type() === UnitType.TransportShip) {
        unit.delete(true, this.player);
        structureDestroyed = true;
        break;
      }
    }

    // 2. Focused blast wave against local ground troops in the immediate target tile
    const gm = this.mg;
    const targetOwner = gm.owner(this.tile);
    if (
      targetOwner.isPlayer() &&
      targetOwner !== this.player &&
      !this.player.isFriendly(targetOwner, true)
    ) {
      const currentTroops = targetOwner.troops();
      if (currentTroops > 0) {
        // Targeted casualties capped at 15,000 troops (not an entire army)
        const casualties = Math.min(
          currentTroops,
          Math.min(15_000, Math.max(3_000, Math.floor(currentTroops * 0.08))),
        );
        targetOwner.removeTroops(casualties);
      }
      targetOwner.updateRelation(this.player, -60);
      gm.queueNukeImpact(this.tile);
      if (!structureDestroyed) {
        targetOwner.relinquish(this.tile);
      }
    }
  }

  private executeEMPStrike(): void {
    // Paralyze enemy SAM launchers & Missile silos in area (radius 8) for 12 seconds (120 ticks)
    const affectedUnits = this.mg.nearbyUnits(
      this.tile,
      8,
      [UnitType.SAMLauncher, UnitType.MissileSilo],
      undefined,
      true,
    );
    for (const { unit } of affectedUnits) {
      const owner = unit.owner();
      if (owner !== this.player && !this.player.isFriendly(owner, true)) {
        const queue = unit.missileTimerQueue();
        queue.length = 0;
        for (let i = 0; i < unit.level(); i++) {
          // 120 ticks = 12 seconds blackout window
          queue.push(this.mg.ticks() + 30);
        }
      }
    }
  }

  private executeIronDomeIntercept(): void {
    if (this.interceptsRemaining <= 0) {
      this.active = false;
      return;
    }
    const nukeTypes = [
      UnitType.AtomBomb,
      UnitType.HydrogenBomb,
      UnitType.MIRVWarhead,
      UnitType.MIRV,
    ];
    for (const type of nukeTypes) {
      for (const nuke of this.mg.units(type)) {
        if (!nuke.isActive()) continue;
        const owner = nuke.owner();
        if (owner === this.player || this.player.isFriendly(owner, true)) {
          continue;
        }

        const targetTile = nuke.targetTile();
        const targetPlayer = nuke.targetPlayer();
        const isTargetingPlayer =
          targetPlayer === this.player ||
          (targetTile !== undefined && this.mg.owner(targetTile) === this.player);

        const currentPos = nuke.tile();
        const isOverPlayerTerritory = this.mg.owner(currentPos) === this.player;

        if (isTargetingPlayer || isOverPlayerTerritory) {
          nuke.delete(true, this.player);
          this.mg.stats().bombIntercept(this.player, type as any, 1);
          this.interceptsRemaining--;
          if (this.interceptsRemaining <= 0) {
            this.active = false;
            return;
          }
        }
      }
    }
  }

  private executeWarSurgeTick(): void {
    // Accelerate frontline conquest and fortify ongoing attacks
    for (const atk of this.player.outgoingAttacks()) {
      if (atk.isActive() && !atk.retreated() && !atk.retreating()) {
        if (this.ticksRemaining % 10 === 0) {
          atk.setTroops(atk.troops() + 50);
        }
      }
    }
  }

  isActive(): boolean {
    return this.active;
  }

  snapshot(w: SnapshotWriter): ExecRecord {
    return TacticalStrikeExecutionSnapshot.write({
      active: this.active,
      initialized: this.mg !== undefined,
      player: w.player(this.player),
      powerId: this.powerId,
      tile: this.tile,
      ticksRemaining: this.ticksRemaining,
      interceptsRemaining: this.interceptsRemaining,
    });
  }

  restoreSnapshot(s: TacticalStrikeState, r: SnapshotReader): void {
    this.active = s.active;
    if (s.initialized) this.mg = r.game;
    this.player = r.player(s.player);
    this.powerId = s.powerId;
    this.tile = s.tile;
    this.ticksRemaining = s.ticksRemaining;
    this.interceptsRemaining = s.interceptsRemaining ?? 2;
  }
}

const TacticalStrikeStateSchema = z.object({
  active: z.boolean(),
  initialized: z.boolean(),
  player: zPlayerRef(),
  powerId: z.string(),
  tile: zRef(),
  ticksRemaining: zInt(),
  interceptsRemaining: zInt().optional(),
});
type TacticalStrikeState = z.infer<typeof TacticalStrikeStateSchema>;

export const TacticalStrikeExecutionSnapshot = execSnapshotType({
  name: "TacticalStrike",
  version: 1,
  schema: TacticalStrikeStateSchema,
  cls: () => TacticalStrikeExecution,
});
