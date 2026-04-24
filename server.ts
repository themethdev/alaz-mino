import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { pubClient, subClient } from "./lib/redis";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = 3000;

const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(handler);

  const io = new Server(httpServer, {
    cors: { origin: "*" },
    path: "/socket.io"
  });

  io.adapter(createAdapter(pubClient, subClient));

  io.on("connection", (socket) => {
    socket.on("join", async (page: string) => {
      socket.join(page);
      const room = io.sockets.adapter.rooms.get(page);
      const count = room?.size ?? 0;
      io.to(page).emit("online", count);
    });

    socket.on("leave", (page: string) => {
      socket.leave(page);
      const room = io.sockets.adapter.rooms.get(page);
      const count = room?.size ?? 0;
      io.to(page).emit("online", count);
    });

    socket.on("disconnect", () => {

    });
  });

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
