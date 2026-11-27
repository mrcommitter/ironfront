import { z } from "zod";
import {
  Execution,
  Game,
  MessageType,
  Player,
  Unit,
  UnitType,
} from "../game/Game";
import { TileRef } from "../game/GameMap";
import { WaterPathFinder } from "../pathfinding/PathFinder";
import { PathStatus } from "../pathfinding/types";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import {
  restoreWaterPathFinder,
  WaterPathFinderSchema,
  waterPathFinderState,
} from "../snapshot/PathfinderSnapshots";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";
import { zInt, zPlayerRef, zRef, zTile } from "../snapshot/SnapshotType";
import { findClosestBy } from "../Util";

/**
 * Executes naval transportation of strategic crude oil extracted from offshore
 * platforms / continental shelves (فلات قاره نفتی) by oil tanker to a player's port.
 */
export class OilTankerExecution implements Execution {
  private active = true;
  private mg!: Game;
  private tankerShip: Unit | undefined;
  private wasCaptured = false;
  private pathFinder!: WaterPathFinder;
  private tilesTraveled = 0;
  private motionPlanId = 1;
  private motionPlanDst: TileRef | null = null;

  constructor(
    private player: Player,
    private spawnTile: TileRef,
    private dstPort: Unit,
    private fuelCargo: number = 50,
    private depositId: number = 0,
  ) {}

  init(mg: Game, _ticks: number): void {
    this.mg = mg;
    const stagger =
      typeof mg.nextShipStagger === "function"
        ? mg.nextShipStagger("tradeShip")
        : 0;
    if (typeof (mg as any).miniWaterHPA === "function") {
      this.pathFinder = new WaterPathFinder(mg, stagger, false);
    }
  }

  tick(ticks: number): void {
    if (this.pathFinder && this.pathFinder.rebuilt) {
      this.motionPlanDst = null;
    }

    if (this.tankerShip === undefined) {
      if (!this.player.isAlive()) {
        this.active = false;
        return;
      }
      this.tankerShip = this.player.buildUnit(
        UnitType.TradeShip,
        this.spawnTile,
        {
          targetUnit: this.dstPort,
          lastSetSafeFromPirates: ticks,
        },
        true,
      );
    }

    if (!this.tankerShip.isActive()) {
      this.active = false;
      return;
    }

    const currentOwner = this.tankerShip.owner();
    if (this.wasCaptured !== true && this.player !== currentOwner) {
      this.wasCaptured = true;
      this.mg?.displayMessage?.(
        "events_display.oil_tanker_captured",
        MessageType.UNIT_DESTROYED,
        this.player.id(),
        undefined,
        {
          name: currentOwner.displayName(),
          amount: `${this.fuelCargo}`,
        },
        this.tankerShip.id(),
        currentOwner.id(),
      );
    }

    // If destination port is dead or invalid, attempt retargeting to another friendly port
    if (!this.dstPort || !this.dstPort.isActive() || this.dstPort.isMarkedForDeletion()) {
      const curTile = this.tankerShip.tile();
      const myWaterComp = this.mg.getWaterComponent(curTile);
      const friendlyPorts = currentOwner
        .units(UnitType.Port)
        .filter((p) => p.isActive() && !p.isMarkedForDeletion());

      const nextPort = findClosestBy(
        friendlyPorts,
        (port) => this.mg.manhattanDist(port.tile(), curTile),
        (port) =>
          myWaterComp !== null &&
          this.mg.hasWaterComponent(port.tile(), myWaterComp),
      );

      if (nextPort) {
        this.dstPort = nextPort;
        this.tankerShip.setTargetUnit(this.dstPort);
        this.tankerShip.touch();
      } else {
        // No ports reachable by water
        this.tankerShip.delete(false);
        this.active = false;
        return;
      }
    }

    const curTile = this.tankerShip.tile();
    if (curTile === this.dstPort.tile()) {
      this.complete();
      return;
    }

    if (!this.pathFinder) {
      this.complete();
      return;
    }

    const dst = this.dstPort.tile();
    const result = this.pathFinder.next(curTile, dst);

    switch (result.status) {
      case PathStatus.NEXT:
        if (dst !== this.motionPlanDst) {
          this.motionPlanId++;
          const from = result.node;
          const path = this.pathFinder.pathForTraversal(from, dst);

          this.mg.recordMotionPlan({
            kind: "grid",
            unitId: this.tankerShip.id(),
            planId: this.motionPlanId,
            startTick: ticks + 1,
            ticksPerStep: 1,
            path,
          });
          this.motionPlanDst = dst;
        }

        if (this.mg.isWater(result.node) && this.mg.isShoreline(result.node)) {
          this.tankerShip.setSafeFromPirates();
        }

        this.tankerShip.move(result.node);
        this.tilesTraveled++;
        break;

      case PathStatus.COMPLETE:
        this.complete();
        return;

      case PathStatus.NOT_FOUND:
        if (this.tankerShip.isActive()) {
          this.tankerShip.delete(false);
        }
        this.active = false;
        return;
    }
  }

  private complete(): void {
    this.active = false;
    if (this.tankerShip && this.tankerShip.isActive()) {
      this.tankerShip.delete(false);
    }

    const recipient = this.tankerShip?.owner() ?? this.player;
    if (recipient && recipient.isAlive()) {
      recipient.addFuel(this.fuelCargo);

      this.mg?.displayMessage?.(
        "events_display.oil_tanker_arrived",
        MessageType.DONATION_RECEIVED,
        recipient.id(),
        undefined,
        {
          amount: `${this.fuelCargo}`,
          name: typeof recipient.displayName === "function" ? recipient.displayName() : recipient.name(),
        },
      );
    }
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  snapshot(w: SnapshotWriter): ExecRecord {
    return OilTankerExecutionSnapshot.write({
      active: this.active,
      initialized: this.mg !== undefined,
      tankerShip: this.tankerShip === undefined ? null : w.unit(this.tankerShip),
      wasCaptured: this.wasCaptured,
      pathFinder:
        this.pathFinder === undefined
          ? null
          : waterPathFinderState(this.pathFinder),
      tilesTraveled: this.tilesTraveled,
      motionPlanId: this.motionPlanId,
      motionPlanDst: this.motionPlanDst,
      player: w.player(this.player),
      spawnTile: this.spawnTile,
      dstPort: w.unit(this.dstPort),
      fuelCargo: this.fuelCargo,
      depositId: this.depositId,
    });
  }

  restoreSnapshot(s: OilTankerExecutionState, r: SnapshotReader): void {
    this.active = s.active;
    if (s.initialized) this.mg = r.game;
    this.tankerShip = s.tankerShip === null ? undefined : r.unit(s.tankerShip);
    this.wasCaptured = s.wasCaptured;
    if (s.pathFinder !== null) {
      this.pathFinder = restoreWaterPathFinder(r.game, s.pathFinder);
    }
    this.tilesTraveled = s.tilesTraveled;
    this.motionPlanId = s.motionPlanId;
    this.motionPlanDst = s.motionPlanDst;
    this.player = r.player(s.player);
    this.spawnTile = s.spawnTile;
    this.dstPort = r.unit(s.dstPort);
    this.fuelCargo = s.fuelCargo;
    this.depositId = s.depositId;
  }
}

const OilTankerExecutionStateSchema = z.object({
  active: z.boolean(),
  initialized: z.boolean(),
  tankerShip: zRef().nullable(),
  wasCaptured: z.boolean(),
  pathFinder: WaterPathFinderSchema.nullable(),
  tilesTraveled: zInt(),
  motionPlanId: zInt(),
  motionPlanDst: zTile().nullable(),
  player: zPlayerRef(),
  spawnTile: zTile(),
  dstPort: zRef(),
  fuelCargo: zInt(),
  depositId: zInt(),
});

type OilTankerExecutionState = z.infer<typeof OilTankerExecutionStateSchema>;

export const OilTankerExecutionSnapshot = execSnapshotType({
  name: "OilTanker",
  version: 1,
  schema: OilTankerExecutionStateSchema,
  cls: () => OilTankerExecution,
});
