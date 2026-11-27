import { Cell, UnitType } from "./game/Game";
import { TileRef } from "./game/GameMap";

export interface StealthUnit {
  id: string;
  type: UnitType.MissileSilo | UnitType.SAMLauncher;
  tile: TileRef;
  cell: Cell;
  ownerSmallId: number;
  revealedUntilMs: number; // 0 if completely hidden
  registeredAtMs: number;
}

export interface ScannedZone {
  center: Cell;
  radiusTiles: number;
  expiryTime: number;
}

export class StealthSystem {
  private stealthUnits: Map<TileRef, StealthUnit> = new Map();
  private scannedZones: ScannedZone[] = [];

  /**
   * Register a stealth structure when built by a player.
   */
  public registerStealthUnit(
    tile: TileRef,
    type: UnitType.MissileSilo | UnitType.SAMLauncher,
    ownerSmallId: number,
    cell: Cell,
    currentTimeMs?: number,
  ): void {
    const id = `stealth_${type}_${tile}`;
    this.stealthUnits.set(tile, {
      id,
      type,
      tile,
      cell,
      ownerSmallId,
      revealedUntilMs: 0,
      registeredAtMs: currentTimeMs ?? Date.now(),
    });
  }

  public isStealth(tile: TileRef): boolean {
    return this.stealthUnits.has(tile);
  }

  public getStealthUnit(tile: TileRef): StealthUnit | undefined {
    return this.stealthUnits.get(tile);
  }

  public getAllStealthUnits(): StealthUnit[] {
    return Array.from(this.stealthUnits.values());
  }

  public unregisterStealthUnit(tile: TileRef): void {
    this.stealthUnits.delete(tile);
  }

  public clear(): void {
    this.stealthUnits.clear();
    this.scannedZones = [];
  }

  /**
   * Whether a stealth structure is visible to the given viewer player.
   * Owner always sees their own structures. Enemies only see it if revealed by Recon Drone or Cruise strike.
   */
  public isVisibleTo(
    tile: TileRef,
    viewerSmallId: number,
    unitOwnerId?: number,
    currentTimeMs?: number,
  ): boolean {
    // Owner always sees their own structures!
    if (
      unitOwnerId !== undefined &&
      viewerSmallId !== 0 &&
      unitOwnerId === viewerSmallId
    ) {
      return true;
    }
    const s = this.stealthUnits.get(tile);
    if (!s) return true; // Normal structure -> visible to everyone
    if (viewerSmallId !== 0 && s.ownerSmallId === viewerSmallId) return true; // Owner always sees it
    const now = currentTimeMs ?? Date.now();
    return now < s.revealedUntilMs;
  }

  /**
   * Deploy Recon Drone scan over an area (Hydrogen Bomb size radius).
   * Reveals all enemy stealth silos and SAM launchers in that radius!
   */
  public scanArea(
    center: Cell,
    radiusTiles: number = 28,
    durationMs: number = 60_000,
    currentTimeMs?: number,
  ): StealthUnit[] {
    const now = currentTimeMs ?? Date.now();
    this.scannedZones.push({
      center,
      radiusTiles,
      expiryTime: now + durationMs,
    });

    const discovered: StealthUnit[] = [];
    const radSq = radiusTiles * radiusTiles;

    for (const unit of this.stealthUnits.values()) {
      const dx = center.x - unit.cell.x;
      const dy = center.y - unit.cell.y;
      if (dx * dx + dy * dy <= radSq) {
        unit.revealedUntilMs = now + durationMs;
        discovered.push(unit);
      }
    }

    return discovered;
  }
}

export const stealthManager = new StealthSystem();
