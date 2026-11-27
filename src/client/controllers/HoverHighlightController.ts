/**
 * HoverHighlightController — pushes the cursor's tile-owner to the WebGL
 * view so the territory + border passes can highlight the hovered player.
 *
 * Replaces the hover path inside the renderer's MapInteraction class (which
 * was bound to the WebGL canvas; that canvas has pointer-events: none in the
 * current input architecture so its listeners never fired). All input flows
 * through InputHandler → MouseMoveEvent on the EventBus, so we just listen.
 */

import { EventBus } from "../../core/EventBus";
import { UnitType } from "../../core/game/Game";
import { Controller } from "../Controller";
import { MouseMoveEvent } from "../InputHandler";
import { MapRenderer } from "../render/gl";
import { OWNER_MASK } from "../render/gl/utils/TileCodec";
import { TransformHandler } from "../TransformHandler";
import { GameView, UnitView } from "../view";
import { showSAMRadarDome, showStealthSiloIndicator } from "../view/CombatVFX";
import { stealthManager } from "../view/StealthManager";

export class HoverHighlightController implements Controller {
  private lastOwnerID = 0;
  private lastRef = -1;

  constructor(
    private game: GameView,
    private eventBus: EventBus,
    private transformHandler: TransformHandler,
    private view: MapRenderer,
  ) {}

  init() {
    this.eventBus.on(MouseMoveEvent, (e) => this.onMouseMove(e));
  }

  private navalHighlightEnabled(): boolean {
    // getSettings() returns {} while the renderer is absent (before init, or
    // after a lost WebGL context), so mapOverlay may be missing.
    return this.view.getSettings().mapOverlay?.navalHighlight ?? false;
  }

  private onMouseMove(e: MouseMoveEvent): void {
    const world = this.transformHandler.screenToWorldCoordinatesFloat(e.x, e.y);
    this.view.setMouseWorldPos(world.x, world.y);

    const cell = this.transformHandler.screenToWorldCoordinates(e.x, e.y);
    if (!this.game.isValidCoord(cell.x, cell.y)) {
      if (this.lastOwnerID !== 0) {
        this.lastOwnerID = 0;
        this.view.setHighlightOwner(0);
      }
      this.lastRef = -1;
      showSAMRadarDome(0, 0, 0, false);
      return;
    }

    const ref = this.game.ref(cell.x, cell.y);
    if (ref === this.lastRef) {
      return;
    }
    this.lastRef = ref;

    let ownerID = 0;
    if (this.game.isLand(ref)) {
      ownerID = this.game.tileState(ref) & OWNER_MASK;
    } else if (this.navalHighlightEnabled()) {
      // Avoid square root for performance; 50 tile radius = 2500 tiles²
      let closestUnit: UnitView | null = null;
      let closestDistSquared = 2500;
      for (const u of this.game.units(
        UnitType.Warship,
        UnitType.TradeShip,
        UnitType.TransportShip,
      )) {
        const distSquared = this.game.euclideanDistSquared(ref, u.tile());
        if (distSquared < closestDistSquared) {
          closestDistSquared = distSquared;
          closestUnit = u;
        }
      }
      if (closestUnit !== null) {
        ownerID = closestUnit.owner().smallID();
      }
    }

    // Check if hovering near any SAM launcher to display tactical radar dome
    let hoveredSAM: UnitView | null = null;
    const myId = typeof this.game.myPlayer === "function" ? this.game.myPlayer()?.smallID() ?? 0 : 0;
    for (const sam of this.game.units(UnitType.SAMLauncher)) {
      const isFriendly =
        myId !== 0 &&
        (sam.owner().smallID() === myId ||
          Boolean(this.game.myPlayer()?.isAlliedWith(sam.owner())));
      if (
        sam.isActive() &&
        (isFriendly ||
          stealthManager.isVisibleTo(
            sam.tile(),
            myId,
            sam.owner().smallID(),
          )) &&
        this.game.euclideanDistSquared(ref, sam.tile()) <= 4
      ) {
        hoveredSAM = sam;
        break;
      }
    }
    if (hoveredSAM) {
      const samScreen = this.transformHandler.worldToScreenCoordinates(this.game.cell(hoveredSAM.tile()));
      const samRangePx = 75 * this.transformHandler.scale;
      const isStealth = stealthManager.isStealth(hoveredSAM.tile());
      showSAMRadarDome(samScreen.x, samScreen.y, samRangePx, true, isStealth);
    } else {
      showSAMRadarDome(0, 0, 0, false);
    }

    // Check if hovering near a stealth silo to display stealth status tooltip
    let hoveredSilo: UnitView | null = null;
    for (const silo of this.game.units(UnitType.MissileSilo)) {
      const isFriendly =
        myId !== 0 &&
        (silo.owner().smallID() === myId ||
          Boolean(this.game.myPlayer()?.isAlliedWith(silo.owner())));
      if (
        silo.isActive() &&
        (isFriendly ||
          stealthManager.isVisibleTo(
            silo.tile(),
            myId,
            silo.owner().smallID(),
          )) &&
        stealthManager.isStealth(silo.tile()) &&
        this.game.euclideanDistSquared(ref, silo.tile()) <= 4
      ) {
        hoveredSilo = silo;
        break;
      }
    }
    if (hoveredSilo) {
      const siloScreen = this.transformHandler.worldToScreenCoordinates(
        this.game.cell(hoveredSilo.tile()),
      );
      showStealthSiloIndicator(siloScreen.x, siloScreen.y, true);
    } else {
      showStealthSiloIndicator(0, 0, false);
    }

    if (ownerID === this.lastOwnerID) return;
    this.lastOwnerID = ownerID;
    this.view.setHighlightOwner(ownerID);
  }
}
