// apps/host/src/net/socket.js
import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL;

// Singleton socket instance so everyone shares the same connection
let socketInstance = null;

export function createSocket() {
  if (socketInstance) return socketInstance;

  const socket = io(SOCKET_URL, { transports: ["websocket"] });

  socket.on("connect", () => {
    console.log("🔌 Connected to server:", socket.id);
  });

  socket.on("disconnect", () => {
    console.log("❌ Disconnected from server");
  });

  socketInstance = socket;
  return socketInstance;
}

export function getSocket() {
  if (!socketInstance) {
    console.warn("⚠️ getSocket() called before createSocket(); creating now.");
    return createSocket();
  }
  return socketInstance;
}