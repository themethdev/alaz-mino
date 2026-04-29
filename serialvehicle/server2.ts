import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";
import { Server } from "socket.io";
import http from "http";
import fs from "fs";
import path from "path";

interface ArduinoMessage {
  createdAt: Date;
  message: string;
  source: "arduino" | "nano";
  portPath: string;
}

const ports = await SerialPort.list();

const arduino = ports.find((p) => {
  console.log("Serial port detected:", p);
  return (
    ["2341", "2a03"].includes(p.vendorId) ||
    p.manufacturer?.toLowerCase().includes("arduino")
  );
});

const nano = ports.find((p) => p.vendorId === "0403");
console.log("Nano port detected:", nano);

const logFile = path.join(process.cwd(), "serial-log.txt");
fs.writeFileSync(logFile, "", { flag: "w" });

let arduinoSerial: SerialPort | null = null;
if (arduino?.path) {
  arduinoSerial = new SerialPort({ path: arduino.path, baudRate: 115200 });
  console.log("Arduino found at:", arduino.path);
} else console.warn("Arduino not found");

let nanoSerial: SerialPort | null = null;
if (nano?.path) {
  nanoSerial = new SerialPort({ path: nano.path, baudRate: 9600 });
  console.log("Nano found at:", nano.path);
} else console.warn("Nano not found");

const arduinoParser = arduinoSerial?.pipe(
  new ReadlineParser({ delimiter: "\n" }),
);
const nanoParser = nanoSerial?.pipe(new ReadlineParser({ delimiter: "\n" }));

const httpServer = http.createServer();
const io = new Server(httpServer, { cors: { origin: "*" } });

const allMessages: ArduinoMessage[] = [];

function handleSerialData(
  data: string,
  source: "arduino" | "nano",
  portPath: string,
) {
  const msg: ArduinoMessage = {
    createdAt: new Date(),
    message: data.trim(),
    source,
    portPath,
  };
  console.log(`${source === "arduino" ? "Arduino" : "Nano"} says`, data);
  allMessages.push(msg);
  fs.appendFileSync(logFile, `[${source.toUpperCase()}] ${data}\n`);
  io.emit("serial-data", msg);
}

arduinoParser?.on("data", (line) =>
  handleSerialData(line, "arduino", arduino.path!),
);
nanoParser?.on("data", (line) => handleSerialData(line, "nano", nano.path!));

let lastNanoSend = 0;
const NANO_THROTTLE_MS = 300;
io.on("connection", (socket) => {
  console.log("Client connected");
  allMessages.forEach((msg) => socket.emit("serial-data", msg));

  socket.on("arduino-send", (msg: string) => {
    console.log("Sending to Arduino:", msg);
    if (!arduinoSerial?.writable) return;
    arduinoSerial.write(msg + "\n", (err) => {
      if (err) console.error("Arduino write error:", err.message);
    });
  });

  socket.on("nano-send", (msg: string) => {
    console.log("Sending to Nano:", msg);
    if (!nanoSerial?.writable) return;
    nanoSerial.write(msg + "\n", (err) => {
      if (err) console.error("Nano write error:", err.message);
    });
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

httpServer.listen(8082, () => console.log("Server is running on port 8082"));
