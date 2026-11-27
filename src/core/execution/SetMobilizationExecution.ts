import { z } from "zod";
import { Execution, Game, Player } from "../game/Game";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";
import { zPlayerRef } from "../snapshot/SnapshotType";

export class SetMobilizationExecution implements Execution {
  constructor(
    private player: Player,
    private mobilization: boolean,
  ) {}

  init(_mg: Game, _ticks: number): void {
    if (this.player && this.player.isAlive()) {
      this.player.setWarMobilization(this.mobilization);
    }
  }

  tick(_ticks: number): void {
    return;
  }

  isActive(): boolean {
    return false;
  }

  activeDuringSpawnPhase(): boolean {
    return true;
  }

  snapshot(w: SnapshotWriter): ExecRecord {
    return SetMobilizationExecutionSnapshot.write({
      player: w.player(this.player),
      mobilization: this.mobilization,
    });
  }

  restoreSnapshot(s: SetMobilizationState, r: SnapshotReader): void {
    this.player = r.player(s.player);
    this.mobilization = s.mobilization;
  }
}

const SetMobilizationStateSchema = z.object({
  player: zPlayerRef(),
  mobilization: z.boolean(),
});
type SetMobilizationState = z.infer<typeof SetMobilizationStateSchema>;

export const SetMobilizationExecutionSnapshot = execSnapshotType({
  name: "SetMobilization",
  version: 1,
  schema: SetMobilizationStateSchema,
  cls: () => SetMobilizationExecution,
});
