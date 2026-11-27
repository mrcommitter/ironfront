import { z } from "zod";
import { Execution, Game, Player } from "../game/Game";
import { TileRef } from "../game/GameMap";
import { buildOilDerrick } from "../game/OilSystem";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";
import { zInt, zPlayerRef } from "../snapshot/SnapshotType";

export class BuildOilDerrickExecution implements Execution {
  constructor(
    private player: Player,
    private tile: TileRef,
  ) {}

  init(mg: Game, _ticks: number): void {
    if (this.player && this.player.isAlive()) {
      buildOilDerrick(mg, this.player, this.tile);
    }
  }

  tick(_ticks: number): void {
    return;
  }

  isActive(): boolean {
    return false;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  snapshot(w: SnapshotWriter): ExecRecord {
    return BuildOilDerrickExecutionSnapshot.write({
      player: w.player(this.player),
      tile: this.tile,
    });
  }

  restoreSnapshot(s: BuildOilDerrickState, r: SnapshotReader): void {
    this.player = r.player(s.player);
    this.tile = s.tile;
  }
}

const BuildOilDerrickStateSchema = z.object({
  player: zPlayerRef(),
  tile: zInt(),
});
type BuildOilDerrickState = z.infer<typeof BuildOilDerrickStateSchema>;

export const BuildOilDerrickExecutionSnapshot = execSnapshotType({
  name: "BuildOilDerrick",
  version: 1,
  schema: BuildOilDerrickStateSchema,
  cls: () => BuildOilDerrickExecution,
});
