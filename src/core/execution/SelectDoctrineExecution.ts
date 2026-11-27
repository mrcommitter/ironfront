import { z } from "zod";
import { Execution, Game, Player } from "../game/Game";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";
import { zPlayerRef } from "../snapshot/SnapshotType";

export class SelectDoctrineExecution implements Execution {
  constructor(
    private player: Player,
    private doctrine: string,
  ) {}

  init(_mg: Game, _ticks: number): void {
    if (this.player && this.player.isAlive()) {
      this.player.setDoctrine(this.doctrine);
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
    return SelectDoctrineExecutionSnapshot.write({
      player: w.player(this.player),
      doctrine: this.doctrine,
    });
  }

  restoreSnapshot(s: SelectDoctrineState, r: SnapshotReader): void {
    this.player = r.player(s.player);
    this.doctrine = s.doctrine;
  }
}

const SelectDoctrineStateSchema = z.object({
  player: zPlayerRef(),
  doctrine: z.string(),
});
type SelectDoctrineState = z.infer<typeof SelectDoctrineStateSchema>;

export const SelectDoctrineExecutionSnapshot = execSnapshotType({
  name: "SelectDoctrine",
  version: 1,
  schema: SelectDoctrineStateSchema,
  cls: () => SelectDoctrineExecution,
});
