import { EventBus } from "../../../core/EventBus";
import { GameView, PlayerView } from "../../view";
import { ChatModal } from "./ChatModal";
import { MenuElement } from "./RadialMenuElements";

export class ChatIntegration {
  private ctModal: ChatModal;

  constructor(
    private game: GameView,
    private eventBus: EventBus,
  ) {
    this.ctModal = document.querySelector("chat-modal") as ChatModal;

    if (!this.ctModal) {
      throw new Error(
        "Chat modal element not found. Ensure chat-modal element exists in DOM before initializing ChatIntegration",
      );
    }
  }

  setupChatModal(sender: PlayerView, recipient: PlayerView) {
    this.ctModal.setSender(sender);
    this.ctModal.setRecipient(recipient);
  }

  createQuickChatMenu(_recipient: PlayerView): MenuElement[] {
    return [];
  }



  shortenText(text: string, maxLength = 15): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + "...";
  }
}
