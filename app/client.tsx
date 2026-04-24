"use client";

import {
  BatteryCharging,
  Globe,
  LaptopMinimal,
  Logs,
  Monitor,
  ShieldCheck,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Socket } from "socket.io";
import io from "socket.io-client";
import { ImRocket } from "react-icons/im";
import { cn } from "@heroui/theme";
import Image from "next/image";

const socket = io({
  path: "/socket.io",
});

function mapToPWM(value: number) {
  return Math.round(1500 + value * 500);
}

function invert(value: number) {
  return 3000 - value;
}

const SIDE_MOTOR_CONFIG = {
  m6: { dir: -1, offset: 0 },
  m7: { dir: 1, offset: 0 },
  m8: { dir: 1, offset: 0 },
  m9: { dir: 1, offset: 0 },
};

const BASE_PIN = 3;
const TOTAL_TORPIDO = 9;
const TORPIDO_PWM_MIN = 1100;
const TORPIDO_PWM_MAX = 2000;
const TORPIDO_PWM_STEP = 50;
const TORPIDO_PWM_DEFAULT = 1600;

const KB_AXIS = 0.8;

const KEY_MAP: Record<string, string> = {
  w: "fwd+",
  s: "fwd-",
  a: "side-",
  d: "side+",
  q: "vert-",
  e: "vert+",
  z: "yaw-",
  x: "yaw+",
};

const KEY_LABELS = [
  { key: "q", label: "Q", action: "Aşağı",  col: 1, row: 1 },
  { key: "w", label: "W", action: "İleri",  col: 2, row: 1 },
  { key: "e", label: "E", action: "Yukarı", col: 3, row: 1 },
  { key: "a", label: "A", action: "Sol",    col: 1, row: 2 },
  { key: "s", label: "S", action: "Geri",   col: 2, row: 2 },
  { key: "d", label: "D", action: "Sağ",    col: 3, row: 2 },
  { key: "z", label: "Z", action: "Sola Dön", col: 1, row: 3 },
  { key: "x", label: "X", action: "Sağa Dön", col: 2, row: 3 },
];

function Client({ ips }: { ips: string[] }) {
  const [count, setCount] = useState(0);
  const [gimbalFire, setGimbalFire] = useState(0);
  const [pwmValues, setPwmValues] = useState({
    horizontalForwardPWM: 1500,
    horizontalHorizontalPWM: 1500,
    verticalForwardPWM: 1500,
  });

  const keysHeld = useRef<Set<string>>(new Set());
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());
  const socketRef = useRef<Socket | null>(null);
  const rafRef = useRef<number | null>(null);

  const lastSentTime = useRef(0);
  const lastPayloadRef = useRef<string>("");

  const lastSent = useRef({
    leftArm: 1000,
    rightArm: 1000,
  });

  const torpidoFireRef = useRef<{ port: number; pwm: number }>({
    port: BASE_PIN,
    pwm: 1000,
  });

  // ── Torpedo target PWM (ayarlanabilir) ────────────────────────────────────
  const torpidoTargetPwmRef = useRef<number>(TORPIDO_PWM_DEFAULT);
  const [torpidoTargetPwm, setTorpidoTargetPwm] = useState<number>(TORPIDO_PWM_DEFAULT);

  const gimbalPwmRef = useRef(1500);
  const torpidoSlot = useRef(1);
  const [activeTorpidoSlot, setActiveTorpidoSlot] = useState(1);
  const [firePulse, setFirePulse] = useState(0);

  const prevButtons = useRef({
    fireBtnPressed: false,
    slotBtnPressed: false,
    gimbalBtnPressed: false,
  });

  const sendToArduino = (payload: object) => {
    socketRef.current?.emit("arduino-send", JSON.stringify(payload));
  };

  const sendToNano = (port: number, pwm: number) => {
    socketRef.current?.emit("nano-send", JSON.stringify({ port, pwm }));
  };

  // ─── Klavye Dinleyiciler ───────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (["Space", " ", "ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
      }

      if (!e.repeat) {
        if (e.key === "ArrowRight") {
          const nextSlot = (torpidoSlot.current % TOTAL_TORPIDO) + 1;
          torpidoSlot.current = nextSlot;
          setActiveTorpidoSlot(nextSlot);
        } else if (e.key === "ArrowLeft") {
          const prevSlot = torpidoSlot.current === 1 ? TOTAL_TORPIDO : torpidoSlot.current - 1;
          torpidoSlot.current = prevSlot;
          setActiveTorpidoSlot(prevSlot);
        } else if (e.key === "ArrowUp") {
          // PWM artır
          const next = Math.min(torpidoTargetPwmRef.current + TORPIDO_PWM_STEP, TORPIDO_PWM_MAX);
          torpidoTargetPwmRef.current = next;
          setTorpidoTargetPwm(next);
        } else if (e.key === "ArrowDown") {
          // PWM azalt
          const next = Math.max(torpidoTargetPwmRef.current - TORPIDO_PWM_STEP, TORPIDO_PWM_MIN);
          torpidoTargetPwmRef.current = next;
          setTorpidoTargetPwm(next);
        } else if (e.key === " " || e.key === "Spacebar") {
          const slot = torpidoSlot.current;
          const pin = BASE_PIN + (slot - 1);
          torpidoFireRef.current = {
            port: pin,
            pwm: torpidoFireRef.current.pwm === 1000 ? torpidoTargetPwmRef.current : 1000,
          };
          setFirePulse((p) => p + 1);
        }
      }

      const key = e.key.toLowerCase();
      if (KEY_MAP[key] && !keysHeld.current.has(key)) {
        keysHeld.current.add(key);
        setActiveKeys(new Set(keysHeld.current));
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (KEY_MAP[key]) {
        keysHeld.current.delete(key);
        setActiveKeys(new Set(keysHeld.current));
      }
    };

    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);
    
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const getKeyboardAxes = () => {
    const keys = keysHeld.current;
    let fwd  = 0;
    let side = 0;
    let vert = 0;
    let yaw = 0;
    
    if (keys.has("w")) fwd  -= KB_AXIS;
    if (keys.has("s")) fwd  += KB_AXIS;
    if (keys.has("d")) side += KB_AXIS;
    if (keys.has("a")) side -= KB_AXIS;
    if (keys.has("q")) vert += KB_AXIS;
    if (keys.has("e")) vert -= KB_AXIS;
    if (keys.has("z")) yaw -= KB_AXIS;
    if (keys.has("x")) yaw += KB_AXIS;
    
    return { fwd, side, vert, yaw };
  };

  // ─── Ana Döngü ────────────────────────────────────────────────────────────
  const readGamepad = () => {
    const now = Date.now();
    const gamepads = navigator.getGamepads();
    const hasKeyboardInput = keysHeld.current.size > 0;
    
    const gamepad = !hasKeyboardInput
      ? gamepads.find((g) => g !== null) ?? null
      : null;

    const deadzone = 0.1;
    const kb = getKeyboardAxes();

    let fwd  = kb.fwd;
    let side = kb.side;
    let vert = kb.vert;
    let yaw = kb.yaw;

    if (gamepad) {
      const gFwd  = Math.abs(gamepad.axes[1]) > deadzone ? -gamepad.axes[1] : 0;
      const gSide = Math.abs(gamepad.axes[0]) > deadzone ?  gamepad.axes[0] : 0;
      const gVert = Math.abs(gamepad.axes[3]) > deadzone ?  gamepad.axes[3] : 0;
      fwd  = fwd  || gFwd;
      side = side || gSide;
      vert = vert || gVert;
    }

    const limit = (val: number) => Math.max(-1, Math.min(1, val));

    const horizontalForwardPWM = invert(mapToPWM(vert));
 
    let s6 = mapToPWM(limit((fwd + side) * SIDE_MOTOR_CONFIG.m6.dir));
    let s7 = mapToPWM(limit((fwd - side) * SIDE_MOTOR_CONFIG.m7.dir));
    let s8 = mapToPWM(limit((fwd + side) * SIDE_MOTOR_CONFIG.m8.dir));
    let s9 = mapToPWM(limit((fwd - side) * SIDE_MOTOR_CONFIG.m9.dir));

    if (gamepad) {
      const yawInput = Math.abs(gamepad.axes[2]) > deadzone ? gamepad.axes[2] : 0;
      const yawPWM = mapToPWM(limit(yawInput));
      if (yawPWM > 1520 || yawPWM < 1480) {
        s6 = invert(yawPWM);
        s7 = yawPWM;
        s8 = invert(yawPWM);
        s9 = invert(yawPWM);
      }
    } else {
      if (Math.abs(yaw) > 0.1) {
        const yawPWM = mapToPWM(limit(yaw));
        s6 = invert(yawPWM);
        s7 = yawPWM;
        s8 = invert(yawPWM);
        s9 = invert(yawPWM);
      }
    }

    if (fwd > 0.4) {
      s6 = invert(s6);
      s7 = invert(s7);
      s8 = invert(s8);
      s9 = invert(s9);
    }

    const currentPayloadStr = JSON.stringify({
      forward: horizontalForwardPWM,
      action: "COMBINED",
      p6: s6,
      p7: s7,
      p8: s8,
      p9: s9,
    });

    if (currentPayloadStr !== lastPayloadRef.current || now - lastSentTime.current > 100) {
      socketRef.current?.emit("arduino-send", currentPayloadStr);
      lastPayloadRef.current = currentPayloadStr;
      lastSentTime.current = now;

      setPwmValues({
        horizontalForwardPWM,
        horizontalHorizontalPWM: s6,
        verticalForwardPWM: s7,
      });
    }

    if (gamepad) {
      if (gamepad.buttons[5]?.value === 1 && lastSent.current.rightArm > 600)
        lastSent.current.rightArm -= 200;
      if (gamepad.buttons[7]?.value === 1 && lastSent.current.rightArm < 1800)
        lastSent.current.rightArm += 200;
      if (gamepad.buttons[4]?.value === 1 && lastSent.current.leftArm > 600)
        lastSent.current.leftArm -= 200;
      if (gamepad.buttons[6]?.value === 1 && lastSent.current.leftArm < 1800)
        lastSent.current.leftArm += 200;

      const slotBtnPressed = gamepad.buttons[0]?.value === 1;
      if (slotBtnPressed && !prevButtons.current.slotBtnPressed) {
        const nextSlot = (torpidoSlot.current % TOTAL_TORPIDO) + 1;
        torpidoSlot.current = nextSlot;
        setActiveTorpidoSlot(nextSlot);
      }
      prevButtons.current.slotBtnPressed = slotBtnPressed;

      const fireBtnPressed = gamepad.buttons[1]?.value === 1;
      if (fireBtnPressed && !prevButtons.current.fireBtnPressed) {
        const slot = torpidoSlot.current;
        const pin = BASE_PIN + (slot - 1);
        torpidoFireRef.current = {
          port: pin,
          pwm: torpidoFireRef.current.pwm === 1000 ? torpidoTargetPwmRef.current : 1000,
        };
        setFirePulse((p) => p + 1);
      }
      prevButtons.current.fireBtnPressed = fireBtnPressed;

      const gimbalBtnPressed = gamepad.buttons[2]?.value === 1;
      if (gimbalBtnPressed && !prevButtons.current.gimbalBtnPressed) {
        if (gimbalPwmRef.current === 2000) gimbalPwmRef.current = 1000;
        else gimbalPwmRef.current = gimbalPwmRef.current + 250;
        setGimbalFire((p) => p + 1);
      }
      prevButtons.current.gimbalBtnPressed = gimbalBtnPressed;
    }

    rafRef.current = requestAnimationFrame(readGamepad);
  };

  // ─── Soket ve Effect Bağlantıları ────────────────────────────────────────
  useEffect(() => {
    if (gimbalFire === 0) return;
    sendToNano(6, gimbalPwmRef.current);
  }, [gimbalFire]); 
  
  useEffect(() => {
    if (firePulse === 0) return;
    const { port, pwm } = torpidoFireRef.current;
    sendToNano(port, pwm);
  }, [firePulse]);

  useEffect(() => {
    socket.emit("join", "alaz");
    socket.on("online", (data: number) => {
      setCount(data);
    });

    rafRef.current = requestAnimationFrame(readGamepad);

    return () => {
      socket.emit("leave");
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    const s = io("http://localhost:8082") as unknown as Socket;
    socketRef.current = s;

    s.on("connect", () => {
      console.log("Connected to Arduino WS bridge");
    });

    s.on("arduino-data", (data: unknown) => {
      console.log("arduino-data:", data);
    });

    return () => {
      s.disconnect();
    };
  }, []);

  // PWM bar yüzdesi (1000–2000 arası)
  const pwmPercent = Math.round(
    ((torpidoTargetPwm - TORPIDO_PWM_MIN) / (TORPIDO_PWM_MAX - TORPIDO_PWM_MIN)) * 100
  );

  return (
    <main className="grid grid-cols-6 grid-rows-5 gap-10 p-12 w-screen h-screen *:relative *:overflow-hidden *:transition-colors *:hover:bg-gray-100/30">
      {/* ── Kamera ───────────────────────────────────────────────────────────── */}
      <div className="border border-gray-300 rounded-2xl col-span-4 row-span-3">
        <iframe src="http://192.168.10.2/cam1" className="w-full h-full" />

        <div className="absolute right-5 bottom-5 flex flex-col items-end gap-2">
          <div className="flex gap-3">
            {Array.from({ length: TOTAL_TORPIDO }, (_, i) => i + 1).map((i) => (
              <div
                key={i}
                className={cn(
                  "size-6 transition-all duration-200",
                  i === activeTorpidoSlot
                    ? "text-rose-500 scale-125 drop-shadow-[0_0_8px_rgba(244,63,94,0.8)]"
                    : "text-gray-300",
                )}
              >
                <ImRocket className="w-full h-full" />
              </div>
            ))}
          </div>

          {/* PWM Ayar Göstergesi */}
          <div className="bg-black/60 backdrop-blur-sm border border-gray-600 rounded-xl px-4 py-2.5 flex flex-col items-end gap-1.5 min-w-[180px]">
            <div className="flex items-center justify-between w-full gap-3">
              <div className="flex items-center gap-1 text-gray-400 text-xs font-mono">
                <span className="text-gray-500">↑↓</span>
                <span>PWM</span>
              </div>
              <span
                className={cn(
                  "text-lg font-bold font-mono tabular-nums leading-none transition-colors",
                  torpidoTargetPwm >= 1800
                    ? "text-rose-400"
                    : torpidoTargetPwm >= 1500
                    ? "text-amber-400"
                    : "text-emerald-400",
                )}
              >
                {torpidoTargetPwm}
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-150",
                  torpidoTargetPwm >= 1800
                    ? "bg-rose-500"
                    : torpidoTargetPwm >= 1500
                    ? "bg-amber-400"
                    : "bg-emerald-400",
                )}
                style={{ width: `${pwmPercent}%` }}
              />
            </div>

            <div className="flex justify-between w-full text-[9px] text-gray-600 font-mono">
              <span>{TORPIDO_PWM_MIN}</span>
              <span>{TORPIDO_PWM_MAX}</span>
            </div>
          </div>
        </div>

        <div className="absolute left-5 bottom-5 select-none">
          <div className="flex gap-1 mb-1">
            {KEY_LABELS.filter((k) => k.row === 1).map(({ key, label, action }) => (
              <KeyCap key={key} label={label} action={action} active={activeKeys.has(key)} />
            ))}
          </div>
          <div className="flex gap-1 mb-1">
            {KEY_LABELS.filter((k) => k.row === 2).map(({ key, label, action }) => (
              <KeyCap key={key} label={label} action={action} active={activeKeys.has(key)} />
            ))}
          </div>
          <div className="flex gap-1">
            {KEY_LABELS.filter((k) => k.row === 3).map(({ key, label, action }) => (
              <KeyCap key={key} label={label} action={action} active={activeKeys.has(key)} />
            ))}
          </div>
        </div>
      </div>

      <div className="border border-gray-300 rounded-2xl col-span-2 row-span-3 flex flex-col items-center justify-center">
        <Image src="/image.png" width={800} height={1200} alt="" className="w-full h-[85%] object-cover" />
      </div>

      {/* ── Alt panel ────────────────────────────────────────────────────────── */}
      <div
        onClick={() => console.log(navigator.getGamepads())}
        className="border border-gray-300 rounded-2xl col-span-4 row-span-2 grid grid-cols-3 divide-x
        divide-gray-300 *:px-12 *:flex *:flex-col *:items-center *:justify-center *:transition-colors
        *:hover:bg-gray-300/30 *:cursor-pointer *:text-gray-400 *:hover:text-gray-700"
      >
        <div className="rounded-l-2xl">
          <Monitor className="size-20 mb-3" />
          <p className="text-2xl">Seri Monitör</p>
        </div>
        <div>
          <Logs className="size-20 mb-3" />
          <p className="text-2xl">Konsol Kayıtları</p>
        </div>
        <div className="rounded-r-2xl">
          <LaptopMinimal className="size-20 mb-3" />
          <p className="text-2xl">RPi Bağlantısı</p>
        </div>
      </div>

      {/* ── Bağlantılar ──────────────────────────────────────────────────────── */}
      <div className="border border-gray-300 rounded-2xl col-span-2 row-span-2">
        <div className="relative z-10 h-full flex flex-col">
          <p className="text-4xl text-right">Bağlantılar</p>
          <p className="text-lg text-gray-500 text-right">
            {ips?.join(",")} adreslerinden bağlanın
          </p>
          <p className="mt-auto ml-auto flex items-center gap-2">
            <span className="bg-success-500 w-2 h-2 rounded-full" />
            {count} kullanıcı bağlandı
          </p>
        </div>
        <Globe className="size-80 text-gray-100 absolute -left-[15%] -bottom-[30%] z-0" />
      </div>
    </main>
  );
}

// ── KeyCap bileşeni ─────────────────────────────────────────────────────────
function KeyCap({
  label,
  action,
  active,
}: {
  label: string;
  action: string;
  active: boolean;
}) {
  return (
    <div
      className={cn(
        "w-14 h-14 rounded-lg border-2 flex flex-col items-center justify-center gap-0.5",
        "text-xs font-mono transition-all duration-75 select-none",
        active
          ? "bg-cyan-500/90 border-cyan-300 text-white shadow-lg shadow-cyan-500/40 scale-95"
          : "bg-black/50 border-gray-600 text-gray-400 backdrop-blur-sm",
      )}
    >
      <span className={cn("text-base font-bold leading-none", active && "text-white")}>
        {label}
      </span>
      <span className={cn("text-[9px] leading-none", active ? "text-cyan-100" : "text-gray-500")}>
        {action}
      </span>
    </div>
  );
}

export default dynamic(() => Promise.resolve(Client), {
  ssr: false,
});