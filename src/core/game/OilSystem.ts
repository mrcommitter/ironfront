import { Cell, Game, Player, UnitType } from "./Game";
import { GameMap, TileRef } from "./GameMap";
import { PseudoRandom } from "../PseudoRandom";
import { simpleHash, findClosestBy } from "../Util";
import { OilTankerExecution } from "../execution/OilTankerExecution";

export interface OilDeposit {
  id: number;
  tile: TileRef;
  cell: Cell;
  isOffshore: boolean;
  richness: number;    // Base barrels/sec (e.g. 3)
  hasDerrick: boolean; // Triples extraction rate to 12 barrels/sec and adds +250 cap
  ownerId: string | null;
}

export interface OilGameContext extends GameMap {
  owner(ref: TileRef): { id(): string | null } | null | undefined;
}

const gameOilDeposits = new WeakMap<object, OilDeposit[]>();

/**
 * Deterministically generates or retrieves strategic oil deposits on the map.
 * Ensures consistent locations on server, client, and across game ticks.
 */
export function getOilDeposits(game: OilGameContext): OilDeposit[] {
  const existing = gameOilDeposits.get(game as object);
  if (existing) {
    return existing;
  }

  const width = game.width();
  const height = game.height();

  // Target count: between 16 and 36 deposits based on map dimensions
  const depositCount = Math.max(16, Math.min(36, Math.round((width * height) / 45000)));

  const seed = simpleHash(`oil_wells_${width}_${height}`);
  const rng = new PseudoRandom(seed);

  const deposits: OilDeposit[] = [];
  const minDistanceSq = 25 * 25; // Minimum spacing between oil deposits

  // Collect candidate tiles (both land and coastal water)
  const landCandidates: TileRef[] = [];
  const offshoreCandidates: TileRef[] = [];

  // Sample grid to gather candidates efficiently
  const step = Math.max(3, Math.floor(Math.min(width, height) / 80));
  for (let y = step; y < height - step; y += step) {
    for (let x = step; x < width - step; x += step) {
      const tile = game.ref(x, y);
      if (!game.isValidRef(tile)) continue;

      const isLandTile = game.isLand(tile);
      if (isLandTile) {
        // Only select plains / light hills (avoid steep mountain peaks where nothing can build)
        if (!game.isImpassable(tile)) {
          landCandidates.push(tile);
        }
      } else {
        // Coastal water: check if adjacent to land within 2 tiles
        let nearCoast = false;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const nt = game.ref(nx, ny);
              if (game.isValidRef(nt) && game.isLand(nt)) {
                nearCoast = true;
                break;
              }
            }
          }
          if (nearCoast) break;
        }
        if (nearCoast) {
          offshoreCandidates.push(tile);
        }
      }
    }
  }

  // Shuffle candidates deterministically
  function shuffle(arr: TileRef[]) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = rng.nextInt(0, i + 1);
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
  }

  shuffle(landCandidates);
  shuffle(offshoreCandidates);

  let idCounter = 1;

  // Add Land deposits
  const targetLand = Math.ceil(depositCount * 0.6);
  for (const t of landCandidates) {
    if (deposits.length >= targetLand) break;
    const c = game.cell(t);
    const tooClose = deposits.some((d) => {
      const dx = d.cell.x - c.x;
      const dy = d.cell.y - c.y;
      return dx * dx + dy * dy < minDistanceSq;
    });
    if (!tooClose) {
      deposits.push({
        id: idCounter++,
        tile: t,
        cell: c,
        isOffshore: false,
        richness: 3,
        hasDerrick: false,
        ownerId: game.owner(t)?.id() ?? null,
      });
    }
  }

  // Add Offshore deposits
  for (const t of offshoreCandidates) {
    if (deposits.length >= depositCount) break;
    const c = game.cell(t);
    const tooClose = deposits.some((d) => {
      const dx = d.cell.x - c.x;
      const dy = d.cell.y - c.y;
      return dx * dx + dy * dy < minDistanceSq;
    });
    if (!tooClose) {
      deposits.push({
        id: idCounter++,
        tile: t,
        cell: c,
        isOffshore: true,
        richness: 4, // Offshore fields are richer
        hasDerrick: false,
        ownerId: game.owner(t)?.id() ?? null,
      });
    }
  }

  gameOilDeposits.set(game as object, deposits);
  return deposits;
}

export const OIL_DERRICK_COST_GOLD = 35_000n;
export const STRATEGIC_FUEL_BUY_AMOUNT = 50;
export const STRATEGIC_FUEL_BUY_COST_GOLD = 15_000n;

/**
 * Determines the rightful owner of an oil deposit.
 * - For land deposits, this is whoever owns the land tile.
 * - For offshore continental shelves (فلات قاره نفتی), the deposit sits in coastal water.
 *   Ownership is held by whichever player controls the adjacent shoreline territory.
 */
export function getDepositOwner(
  game: OilGameContext,
  deposit: OilDeposit,
): Player | null {
  if (!deposit.isOffshore) {
    const direct = game.owner(deposit.tile);
    if (direct && typeof (direct as any).isPlayer === "function" && (direct as any).isPlayer()) {
      return direct as Player;
    }
    if (direct && direct.id && direct.id() !== null) {
      return direct as Player;
    }
  }

  // Continental shelf (فلات قاره): coastal water zone is controlled by the nation
  // that holds the adjacent coastline / nearest shore
  const width = game.width();
  const height = game.height();
  const cx = deposit.cell.x;
  const cy = deposit.cell.y;
  const maxRadius = deposit.isOffshore ? 6 : 3;

  const playerTileCounts = new Map<
    string,
    { player: Player; count: number; minDist: number }
  >();

  for (let dy = -maxRadius; dy <= maxRadius; dy++) {
    for (let dx = -maxRadius; dx <= maxRadius; dx++) {
      const distSq = dx * dx + dy * dy;
      if (distSq > maxRadius * maxRadius) continue;
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || x >= width || y < 0 || y >= height) continue;

      const tile = game.ref(x, y);
      if (!game.isValidRef(tile)) continue;

      if (game.hasOwner(tile)) {
        const owner = game.owner(tile);
        if (owner && owner.id && owner.id() !== null) {
          const pid = owner.id()!;
          const current = playerTileCounts.get(pid) ?? {
            player: owner as Player,
            count: 0,
            minDist: Infinity,
          };
          current.count++;
          if (distSq < current.minDist) current.minDist = distSq;
          playerTileCounts.set(pid, current);
        }
      }
    }
  }

  if (playerTileCounts.size === 0) return null;

  // Pick player with closest shore (highest score)
  let bestPlayer: Player | null = null;
  let bestScore = -Infinity;
  for (const info of playerTileCounts.values()) {
    const score = 1000 - info.minDist * 15 + info.count * 2;
    if (score > bestScore) {
      bestScore = score;
      bestPlayer = info.player;
    }
  }

  return bestPlayer;
}

/**
 * Constructs an Oil Derrick or Offshore Rig on a player-controlled oil deposit.
 */
export function buildOilDerrick(
  game: Game,
  player: Player,
  tile: TileRef,
): { success: boolean; reason?: string } {
  const gs = game.config().grandStrategyConfig();
  if (!gs.enabled || !gs.oilEconomy) {
    return { success: false, reason: "سامانه اقتصاد نفت در این مسابقه فعال نیست" };
  }

  const deposits = getOilDeposits(game);
  // Find deposit on tile or within 1 tile Manhattan distance
  const deposit = deposits.find((d) => {
    if (d.tile === tile) return true;
    const c = game.cell(tile);
    return Math.abs(d.cell.x - c.x) <= 1 && Math.abs(d.cell.y - c.y) <= 1;
  });

  if (!deposit) {
    return { success: false, reason: "در این مختصات هیچ میدان نفتی وجود ندارد" };
  }

  if (deposit.hasDerrick) {
    return { success: false, reason: "روی این میدان نفتی از قبل دکل احداث شده است" };
  }

  // Check deposit ownership (considers coastal dominance for offshore platforms)
  const owner = getDepositOwner(game, deposit);
  if (!owner || owner.id() !== player.id()) {
    return {
      success: false,
      reason: deposit.isOffshore
        ? "برای احداث دکل فلات قاره ابتدا باید ساحل مجاور این منطقه را فتح کنید"
        : "شما مالک این میدان نفتی نیستید",
    };
  }

  // Check gold
  if ((player.gold() ?? 0n) < OIL_DERRICK_COST_GOLD) {
    return {
      success: false,
      reason: `طلا کافی نیست (احداث دکل نیاز به ${OIL_DERRICK_COST_GOLD} طلا دارد)`,
    };
  }

  // Deduct gold & build
  player.addGold(-OIL_DERRICK_COST_GOLD);
  deposit.hasDerrick = true;
  deposit.ownerId = player.id();

  // Boost fuel cap by +250
  player.setFuelCap(player.fuelCap() + 250);

  return { success: true };
}

/**
 * Allows a player to purchase strategic emergency fuel using civilian treasury gold (HOI4 trade).
 */
export function purchaseStrategicFuel(
  player: Player,
  amount: number = STRATEGIC_FUEL_BUY_AMOUNT,
): { success: boolean; reason?: string } {
  if ((player.gold() ?? 0n) < STRATEGIC_FUEL_BUY_COST_GOLD) {
    return {
      success: false,
      reason: `طلا کافی نیست (خرید سوخت نیاز به ${STRATEGIC_FUEL_BUY_COST_GOLD} طلا دارد)`,
    };
  }

  player.addGold(-STRATEGIC_FUEL_BUY_COST_GOLD);
  player.addFuel(amount);
  return { success: true };
}

/**
 * Periodic tick for the Oil & Fuel Economy.
 * - Land fields: deliver steady fuel via pipeline directly into player's stockpile.
 * - Offshore fields: require an Oil Derrick and active Port. Dispatches Oil Tanker
 *   ships across the sea to deliver batches of crude oil to ports.
 */
export function tickOilSystem(game: Game, ticks: number): void {
  const gs = game.config().grandStrategyConfig();
  if (!gs.enabled || !gs.oilEconomy) return;

  // Process once per second (10 ticks)
  if (ticks % 10 !== 0) return;

  const deposits = getOilDeposits(game);

  // Update ownership of all deposits
  for (const d of deposits) {
    d.ownerId = getDepositOwner(game, d)?.id() ?? null;
  }

  for (const player of game.players()) {
    if (!player.isAlive()) continue;

    const myDeposits = deposits.filter((d) => d.ownerId === player.id());

    let production = 0;
    let derrickCount = 0;

    for (const d of myDeposits) {
      if (d.isOffshore) {
        if (d.hasDerrick) {
          derrickCount++;
          // Offshore rigs extract crude and dispatch oil tankers to ports every 100 ticks (~10s)
          if (ticks % 100 === 0) {
            const ports = player
              .units(UnitType.Port)
              .filter(
                (p) =>
                  p.isActive() &&
                  !p.isUnderConstruction() &&
                  !p.isMarkedForDeletion(),
              );

            if (ports.length > 0 && player.units(UnitType.TradeShip).length < 25) {
              const myWaterComp = game.getWaterComponent(d.tile);
              const reachablePorts = ports.filter(
                (p) =>
                  myWaterComp !== null &&
                  game.hasWaterComponent(p.tile(), myWaterComp),
              );
              const eligiblePorts =
                reachablePorts.length > 0 ? reachablePorts : ports;

              const targetPort = findClosestBy(eligiblePorts, (p) =>
                game.manhattanDist(p.tile(), d.tile),
              );

              if (targetPort) {
                game.addExecution(
                  new OilTankerExecution(player, d.tile, targetPort, 50, d.id),
                );
              }
            }
          }
        }
      } else {
        // Land deposits: pipeline extraction
        if (d.hasDerrick) {
          production += 12;
          derrickCount++;
        } else {
          production += d.richness;
        }
      }
    }

    // Warship consumption: 0.5 fuel/sec per active warship
    const activeWarships = player
      .units(UnitType.Warship)
      .filter((w) => w.isActive()).length;
    const warshipConsumption = Math.ceil(activeWarships * 0.5);

    const netRate = production - warshipConsumption;

    // Base capacity 500 + 250 per derrick
    const targetCap = 500 + derrickCount * 250;
    player.setFuelCap(targetCap);
    player.setFuelRate(netRate);

    if (netRate > 0) {
      player.addFuel(netRate);
    } else if (netRate < 0) {
      player.consumeFuel(Math.abs(netRate));
    }

    // AI Bot economic management: bots construct derricks on their controlled deposits
    if (
      player.clientID?.() === null &&
      ticks % 50 === 0 &&
      (player.gold() ?? 0n) >= OIL_DERRICK_COST_GOLD * 2n
    ) {
      const candidate = myDeposits.find((d) => !d.hasDerrick);
      if (candidate) {
        buildOilDerrick(game, player, candidate.tile);
      }
    }

    // AI Bot emergency fuel purchase if running low with active warships
    if (
      player.clientID?.() === null &&
      activeWarships > 0 &&
      (player.fuel?.() ?? 0) < 20 &&
      (player.gold() ?? 0n) >= STRATEGIC_FUEL_BUY_COST_GOLD * 3n
    ) {
      purchaseStrategicFuel(player);
    }
  }
}

/**
 * Checks fuel requirements for launching rockets/missiles and consumes fuel if available.
 */
export function checkAndConsumeMissileFuel(
  game: Game,
  player: Player,
  type: UnitType | string,
  amount: number = 1,
): { allowed: boolean; fuelCost: number } {
  const gs = game.config().grandStrategyConfig();
  if (!gs.enabled || !gs.oilEconomy) {
    return { allowed: true, fuelCost: 0 };
  }

  let unitCost = 25; // Default for cruise missiles
  if (
    type === UnitType.AtomBomb ||
    type === UnitType.HydrogenBomb ||
    type === UnitType.MIRV
  ) {
    unitCost = 50;
  }

  const totalCost = unitCost * amount;
  if (player.fuel() < totalCost) {
    return { allowed: false, fuelCost: totalCost };
  }

  player.consumeFuel(totalCost);
  return { allowed: true, fuelCost: totalCost };
}
