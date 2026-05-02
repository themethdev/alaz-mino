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
const arduino = ports.find(p => ["2341", "2a03"].includes(p.vendorId!) || p.manufacturer?.toLowerCase().includes("arduino"));
const nano = ports.find(p => p.vendorId === "0403");

const logFile = path.join(process.cwd(), "serial-log.txt");
fs.writeFileSync(logFile, "", { flag: "w" });

const arduinoSerial = arduino ? new SerialPort({ path: arduino.path, baudRate: 115200 }) : null;
const nanoSerial = nano ? new SerialPort({ path: nano.path, baudRate: 9600 }) : null;

arduino ? console.log(`Arduino: ${arduino.path}`) : console.warn("Arduino: NULL");
nano ? console.log(`Nano: ${nano.path}`) : console.warn("Nano: NULL");

const arduinoParser = arduinoSerial?.pipe(new ReadlineParser({ delimiter: "\n" }));
const nanoParser = nanoSerial?.pipe(new ReadlineParser({ delimiter: "\n" }));

const io = new Server(http.createServer().listen(8082, () => console.log("Port: 8082")), { cors: { origin: "*" } });
const allMessages: ArduinoMessage[] = [];

function handleData(data: string, source: "arduino" | "nano", path: string) {
  const msg: ArduinoMessage = { createdAt: new Date(), message: data.trim(), source, portPath: path };
  console.log(`[${source.toUpperCase()}] > ${data.trim()}`);
  allMessages.push(msg);
  fs.appendFileSync(logFile, `[${source.toUpperCase()}] ${data}\n`);
  io.emit("serial-data", msg);
}

arduinoParser?.on("data", (line) => handleData(line, "arduino", arduino!.path));
nanoParser?.on("data", (line) => handleData(line, "nano", nano!.path));

io.on("connection", (socket) => {
  console.log("Conn: +");
  allMessages.forEach((msg) => socket.emit("serial-data", msg));

  socket.on("arduino-send", (msg: string) => {
    if (!arduinoSerial?.writable) return;
    arduinoSerial.write(msg + "\n", (err) => err && console.error("A-Write Err:", err.message));
  });

  socket.on("nano-send", (msg: string) => {
    if (!nanoSerial?.writable) return;
    nanoSerial.write(msg + "\n", (err) => err && console.error("N-Write Err:", err.message));
  });

  socket.on("disconnect", () => console.log("Conn: -"));
});