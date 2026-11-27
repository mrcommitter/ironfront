import { z } from "zod";
import {
  Execution,
  Game,
  MessageType,
  Player,
  PlayerInfo,
  PlayerType,
} from "../game/Game";
import { TileRef } from "../game/GameMap";
import { PseudoRandom } from "../PseudoRandom";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";
import { zInt, zPlayerRef, zRandom } from "../snapshot/SnapshotType";

export class ZombiePlagueExecution implements Execution {
  private active = true;
  private mg!: Game;
  private random: PseudoRandom | null = null;
  private plaguePlayer: Player | null = null;
  private outbreakStarted = false;
  private outbreakEradicated = false;
  private lastExpansionTick = 0;
  private outbreakTick = 120; // 12 seconds after match start

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  init(mg: Game, _ticks: number): void {
    this.mg = mg;
    this.random = new PseudoRandom(1337);
  }

  tick(ticks: number): void {
    if (!this.active || !this.mg || this.random === null) return;
    const mg = this.mg;

    // Trigger Patient Zero outbreak
    if (!this.outbreakStarted && ticks >= this.outbreakTick) {
      this.startOutbreak(mg);
      return;
    }

    if (!this.outbreakStarted || this.outbreakEradicated || !this.plaguePlayer) {
      return;
    }

    // Check if humanity eradicated the plague!
    if (this.plaguePlayer.numTilesOwned() === 0) {
      this.outbreakEradicated = true;
      this.active = false;
      this.announceEradication();
      return;
    }

    // Every 15 ticks (1.5 seconds), the plague mutates and infects adjacent lands
    if (ticks - this.lastExpansionTick >= 15) {
      this.lastExpansionTick = ticks;
      this.expandPlague(mg);
    }
  }

  private startOutbreak(mg: Game): void {
    if (this.random === null) return;
    this.outbreakStarted = true;

    const info = new PlayerInfo(
      "☣️ طاعون زامبی (Zombie Plague)",
      PlayerType.Nation,
      null,
      "zombie_plague_patient_zero",
      false,
      null,
      [],
      null,
      "skull",
    );
    this.plaguePlayer = mg.addPlayer(info);
    this.plaguePlayer.addTroops(50000);

    // Pick an existing bot or nation near the edge as Patient Zero host
    const candidates = mg
      .players()
      .filter(
        (p) =>
          p.isAlive() &&
          p.numTilesOwned() > 0 &&
          p.type() !== PlayerType.Human &&
          p !== this.plaguePlayer,
      );

    if (candidates.length > 0) {
      const victim = candidates[this.random.nextInt(0, candidates.length)];
      const victimTiles = Array.from(victim.borderTiles());
      for (const t of victimTiles) {
        this.plaguePlayer.conquer(t);
      }
    } else {
      const seedTile = this.findEdgeLandTile(mg);
      if (seedTile !== null) {
        this.plaguePlayer.conquer(seedTile);
      }
    }

    this.announceOutbreak();
  }

  private findEdgeLandTile(mg: Game): TileRef | null {
    const width = mg.width();
    const height = mg.height();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!mg.isValidCoord(x, y)) continue;
        const ref = mg.ref(x, y);
        if (mg.isLand(ref) && !mg.isImpassable(ref)) {
          return ref;
        }
      }
    }
    return null;
  }

  private expandPlague(mg: Game): void {
    if (!this.plaguePlayer || this.random === null) return;
    const borderTiles = this.plaguePlayer.borderTiles();
    if (borderTiles.size === 0) return;

    // Find all valid non-plague land neighbours without duplicates
    const candidateSet = new Set<TileRef>();
    borderTiles.forEach((b) => {
      for (const n of mg.neighbors(b)) {
        if (!mg.isLand(n) || mg.isImpassable(n)) continue;
        if (mg.owner(n) === this.plaguePlayer) continue;
        candidateSet.add(n);
      }
    });

    if (candidateSet.size === 0) return;
    const candidates = Array.from(candidateSet);

    // Shuffle and infect 4 to 8 tiles per wave
    const countToInfect = Math.min(
      candidates.length,
      this.random.nextInt(4, 9),
    );
    const toInfect = this.random.shuffleArray(candidates).slice(0, countToInfect);

    for (const target of toInfect) {
      const victim = mg.owner(target);
      if (victim.isPlayer()) {
        // Turning victim casualties into fresh zombies!
        this.plaguePlayer.addTroops(80);
      } else {
        this.plaguePlayer.addTroops(20);
      }
      this.plaguePlayer.conquer(target);
    }
  }

  private announceOutbreak(): void {
    if (this.mg && this.plaguePlayer) {
      this.mg.displayMessage(
        "events_display.zombie_outbreak",
        MessageType.CONQUERED_PLAYER,
        this.plaguePlayer.id(),
      );
    }
  }

  private announceEradication(): void {
    if (this.mg && this.plaguePlayer) {
      this.mg.displayMessage(
        "events_display.zombie_eradicated",
        MessageType.CONQUERED_PLAYER,
        this.plaguePlayer.id(),
      );
    }
  }

  snapshot(w: SnapshotWriter): ExecRecord {
    return ZombiePlagueExecutionSnapshot.write({
      active: this.active,
      outbreakStarted: this.outbreakStarted,
      outbreakEradicated: this.outbreakEradicated,
      lastExpansionTick: this.lastExpansionTick,
      plaguePlayer: this.plaguePlayer ? w.player(this.plaguePlayer) : null,
      random: this.random ? w.random(this.random) : null,
    });
  }

  restoreSnapshot(s: ZombiePlagueState, r: SnapshotReader): void {
    this.active = s.active;
    this.outbreakStarted = s.outbreakStarted;
    this.outbreakEradicated = s.outbreakEradicated;
    this.lastExpansionTick = s.lastExpansionTick;
    this.plaguePlayer = s.plaguePlayer !== null ? r.player(s.plaguePlayer) : null;
    this.mg = r.game;
    this.random = s.random !== null ? r.random(s.random) : new PseudoRandom(1337);
  }
}

const ZombiePlagueStateSchema = z.object({
  active: z.boolean(),
  outbreakStarted: z.boolean(),
  outbreakEradicated: z.boolean(),
  lastExpansionTick: zInt(),
  plaguePlayer: zPlayerRef().nullable(),
  random: zRandom().nullable(),
});
type ZombiePlagueState = z.infer<typeof ZombiePlagueStateSchema>;

export const ZombiePlagueExecutionSnapshot = execSnapshotType({
  name: "ZombiePlague",
  version: 1,
  schema: ZombiePlagueStateSchema,
  cls: () => ZombiePlagueExecution,
});
