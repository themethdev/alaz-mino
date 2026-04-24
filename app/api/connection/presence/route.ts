import { Server as IOServer } from "socket.io";
import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!res.socket.server.io) {
    console.log("🟢 Socket.io server başlatılıyor");

    const io = new IOServer(res.server.server, {
      path: "/api/socket",
    });

    let onlineCount = 0;

    io.on("connection", (socket) => {
      onlineCount++;
      io.emit("online-count", onlineCount);

      socket.on("disconnect", () => {
        onlineCount--;
        io.emit("online-count", onlineCount);
      });
    });

    res.socket.server.io = io;
  }

  res.end();
}
