import { io, Socket } from "socket.io-client";
import type { ClientToServer, LobbyState, ServerToClient, GameSnapshot } from "../../shared/types";

type Handlers = {
  onWelcome?: (msg: Extract<ServerToClient, { type: "welcome" }>) => void;
  onLobby?: (state: LobbyState) => void;
  onSnapshot?: (state: GameSnapshot) => void;
  onError?: (message: string) => void;
};

export class Net {
  socket: Socket;
  socketId: string | null = null;
  isLocalHost = false;

  constructor(private handlers: Handlers) {
    this.socket = io({
      transports: ["websocket"],
      autoConnect: true,
    });

    this.socket.on("message", (msg: ServerToClient) => {
      switch (msg.type) {
        case "welcome":
          this.socketId = msg.socketId;
          this.isLocalHost = msg.isLocalHost;
          this.handlers.onWelcome?.(msg);
          this.handlers.onLobby?.(msg.state);
          break;
        case "lobby":
          this.handlers.onLobby?.(msg.state);
          break;
        case "snapshot":
          this.handlers.onSnapshot?.(msg.state);
          break;
        case "error":
          this.handlers.onError?.(msg.message);
          break;
      }
    });
  }

  send(msg: ClientToServer): void {
    // Reliable delivery — dropped turn edges feel like sticky/laggy steering on Wi‑Fi
    this.socket.emit("message", msg);
  }
}
