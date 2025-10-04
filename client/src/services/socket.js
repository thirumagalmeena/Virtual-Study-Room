import { io } from "socket.io-client";

let socket;

export function initSocket() {
  if (!socket) {
    const token = localStorage.getItem("token");
    const username = localStorage.getItem("username");

    socket = io("http://localhost:5000", {
      autoConnect: false,
      transports: ["websocket", "polling"],
      auth: { token, username },
    });
  }
  return socket;
}

export function getSocket() {
  return socket;
}
