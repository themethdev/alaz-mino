import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";
import { Server } from "socket.io";
import http from "http";
import fs from "fs";
import path from "path";
import type { ArduinoMessage } from "../types/global";

const ports = await SerialPort.list();

const arduino = ports.find(
  (p) =>
    p.vendorId === "2341" ||
    p.vendorId === "2a03" ||
    p.manufacturer?.toLowerCase().includes("arduino"),
);

if (!arduino?.path) {
  console.error("Arduino bulunamadı");
  process.exit(1);
}

const serial = new SerialPort({
  path: arduino.path,
  baudRate: 115200,
  highWatermark: 64,
});

const parser = serial.pipe(new ReadlineParser({ delimiter: "\n" }));

const httpServer = http.createServer();
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

const arduinoMessages: ArduinoMessage[] = [];

const logFilePath = path.join(process.cwd(), "arduino-log.txt");
fs.writeFileSync(logFilePath, "", { flag: "w" });

let arduinoReady = false;

const lastSendTimes: Record<string, number> = {};
const MIN_SEND_INTERVAL = 5;

io.on("connection", (socket) => {
  console.log("✓ Client connected");

  arduinoMessages.forEach((msg) => {
    socket.emit("arduino-data", msg);
  });

  const onData = (data: any) => {
    const line = data.toString().trim();

    if (line.includes('"status":"ready"')) {
      arduinoReady = true;
      console.log("arduino tamam");
    }

    console.log("← Arduino:", line);

    const processedData: ArduinoMessage = {
      createdAt: new Date(),
      message: line,
      arduino: arduino,
    };

    arduinoMessages.push(processedData);
    fs.appendFileSync(logFilePath, line + "\n");

    io.emit("arduino-data", processedData);
  };

  parser.on("data", onData);

  socket.on("arduino-send", (msg: string) => {
    if (!arduinoReady) {
      socket.emit("arduino-error", {
        error: "arduino baglanti hata",
      });
      return;
    }

    let action = "unknown";
    let port = "";
    try {
      const parsed = JSON.parse(msg);
      action = parsed.action || "unknown";
      if (parsed.port) port = `_${parsed.port}`;
    } catch (e) {
  
    }

    const throttleKey = action + port;
    const now = Date.now();
    const lastTime = lastSendTimes[throttleKey] || 0;

    if (now - lastTime < MIN_SEND_INTERVAL) {
      console.log(`Throttled: ${throttleKey}`);
      return;
    }

    lastSendTimes[throttleKey] = now;

    serial.write(msg + "\n", (err) => {
      if (err) {
        console.error("err:", err);
        socket.emit("arduino-error", {
          error: "err",
        });
      } else {
        console.log(`→ Arduino [${action}]:`, msg);
      }
    });
  });

  socket.on("disconnect", () => {
    console.log("client gg");
    parser.removeListener("data", onData);
  });
});

serial.on("open", () => {
  console.log("baglandi", arduino.path);
});

serial.on("error", (err) => {
  console.error("err arduino:", err.message);
});

process.on("SIGINT", () => {
  serial.close(() => {
    process.exit(0);
  });
});

httpServer.listen(8082, () => {
});
