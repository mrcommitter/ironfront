import { z } from "zod";
import { Execution, Game } from "../game/Game";
import { getOilDeposits, tickOilSystem } from "../game/OilSystem";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";
import { zInt } from "../snapshot/SnapshotType";

export class OilSystemExecution implements Execution {
  private mg!: Game;

  init(mg: Game, _ticks: number): void {
    this.mg = mg;
  }

  tick(ticks: number): void {
    tickOilSystem(this.mg, ticks);
  }

  isActive(): boolean {
    return true;
  }

  activeDuringSpawnPhase(): boolean {
    return true;
  }

  snapshot(_w: SnapshotWriter): ExecRecord {
    const deposits = this.mg ? getOilDeposits(this.mg) : [];
    const derricks = deposits.filter((d) => d.hasDerrick).map((d) => d.id);
    return OilSystemExecutionSnapshot.write({ derricks });
  }

  restoreSnapshot(s: OilSystemState, r: SnapshotReader): void {
    this.mg = r.game;
    const deposits = getOilDeposits(r.game);
    const derrickSet = new Set(s.derricks ?? []);
    for (const d of deposits) {
      if (derrickSet.has(d.id)) {
        d.hasDerrick = true;
      }
    }
  }
}

const OilSystemStateSchema = z.object({
  derricks: z.array(zInt()).optional().default([]),
});
type OilSystemState = z.infer<typeof OilSystemStateSchema>;

export const OilSystemExecutionSnapshot = execSnapshotType({
  name: "OilSystem",
  version: 1,
  schema: OilSystemStateSchema,
  cls: () => OilSystemExecution,
});
