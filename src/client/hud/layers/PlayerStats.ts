import { customElement } from "lit/decorators.js";
import type { EventBus } from "../../../core/EventBus";
import { type StatsRow, StatsTable } from "../../components/StatsTable";
import { GoToPlayerEvent } from "../../TransformHandler";
import type { GameView } from "../../view";
import { getFirstPlacePlayer } from "../PlayerIcons";
import { type ColumnDef, columnValues } from "./lib/StatsColumns";

@customElement("player-stats")
export class PlayerStats extends StatsTable {
  public eventBus: EventBus | null = null;

  protected readonly tableKind = "player";

  protected buildRows(
    game: GameView,
    columns: readonly ColumnDef[],
  ): StatsRow[] {
    const myPlayer = game.myPlayer();
    const firstPlace = getFirstPlacePlayer(game);

    return game
      .playerViews()
      .filter((player) => player.isAlive())
      .map((player) => {
        const hasCrown =
          Boolean(player.cosmetics?.crown?.url) || player === firstPlace;
        return {
          key: player.id(),
          name: player.name(),
          clanTag: player.clanTag(),
          hasCrown,
          crownUrl: player.cosmetics?.crown?.url ?? null,
          isFirstPlace: player === firstPlace,
          isMyPlayer: player === myPlayer,
          values: columnValues(player, game, columns),
          emphasized:
            myPlayer !== null &&
            (player === myPlayer || player.isOnSameTeam(myPlayer)),
          pinned: player === myPlayer,
          onClick: () => {
            if (this.eventBus !== null) {
              this.eventBus.emit(new GoToPlayerEvent(player));
            }
          },
        };
      });
  }
}
