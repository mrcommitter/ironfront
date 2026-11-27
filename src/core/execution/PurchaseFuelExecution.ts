import { z } from "zod";
import { Execution, Game, Player } from "../game/Game";
import { purchaseStrategicFuel } from "../game/OilSystem";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";
import { zInt, zPlayerRef } from "../snapshot/SnapshotType";

export class PurchaseFuelExecution implements Execution {
  constructor(
    private player: Player,
    private amount: number = 50,
  ) {}

  init(_mg: Game, _ticks: number): void {
    if (this.player && this.player.isAlive()) {
      purchaseStrategicFuel(this.player, this.amount);
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
    return PurchaseFuelExecutionSnapshot.write({
      player: w.player(this.player),
      amount: this.amount,
    });
  }

  restoreSnapshot(s: PurchaseFuelState, r: SnapshotReader): void {
    this.player = r.player(s.player);
    this.amount = s.amount;
  }
}

const PurchaseFuelStateSchema = z.object({
  player: zPlayerRef(),
  amount: zInt(),
});
type PurchaseFuelState = z.infer<typeof PurchaseFuelStateSchema>;

export const PurchaseFuelExecutionSnapshot = execSnapshotType({
  name: "PurchaseFuel",
  version: 1,
  schema: PurchaseFuelStateSchema,
  cls: () => PurchaseFuelExecution,
});
