"use client";

import { AnimatePresence, motion } from "framer-motion";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import { Socket } from "socket.io";
import { cn } from "@heroui/theme";
import { ImRocket } from "react-icons/im";
import { MdLightbulb, MdOutlineCameraswitch } from "react-icons/md";
import { Gamepad2 } from "lucide-react";
import Pointer from "@/components/Pointer";
import { PiHandGrabbingFill } from "react-icons/pi";

const msock = io({ path: "/socket.io" });

const toPWM = (v: number) => Math.round(1500 + v * 500);
const inv = (v: number) => 3000 - v;
const clamp = (v: number) => Math.max(-1, Math.min(1, v));

const BASE = 3;
const TN = 9;
const TMIN = 1100;
const TMAX = 2000;
const TSTEP = 50;
const TDEF = 1600;
const KBV = 0.8;

const KMAP: Record<string, true> = {
  w: true,
  s: true,
  a: true,
  d: true,
  q: true,
  e: true,
  z: true,
  x: true,
};

const KL = [
  { k: "q", lb: "Q", ac: "Aşağı", r: 1, c: 1 },
  { k: "w", lb: "W", ac: "İleri", r: 1, c: 2 },
  { k: "e", lb: "E", ac: "Yukarı", r: 1, c: 3 },
  { k: "a", lb: "A", ac: "Sol", r: 2, c: 1 },
  { k: "s", lb: "S", ac: "Geri", r: 2, c: 2 },
  { k: "d", lb: "D", ac: "Sağ", r: 2, c: 3 },
  { k: "z", lb: "Z", ac: "⟲", r: 3, c: 1 },
  { k: "x", lb: "X", ac: "⟳", r: 3, c: 2 },
];

function Client({ ips }: { ips: string[] }) {
  const [users, setUsers] = useState(0);
  const [activeKeys, setActiveKeys] = useState(new Set<string>());
  const [trpSlot, setTrpSlot] = useState(1);
  const [trpPwm, setTrpPwm] = useState(TDEF);
  const [firePulse, setFirePulse] = useState(0);
  const [gimbalFire, setGimbalFire] = useState(0);
  const [spd, setSpd] = useState(0);
  const [lightOn, setLightOn] = useState(false);
  const [gimbalPwm, setGimbalPwm] = useState(1500);
  const [armOpen, setArmOpen] = useState(false);
  const [gpHint, setGpHint] = useState<string | null>(null);

  const held = useRef(new Set<string>());
  const sockRef = useRef<Socket | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastPld = useRef("");
  const lastT = useRef(0);
  const bnoRef = useRef(1);
  const slotRef = useRef(1);
  const tpwmRef = useRef(TDEF);
  const fireRef = useRef({ port: BASE, pwm: 1000 });
  const gimRef = useRef(1500);
  const lightRef = useRef(false);
  const armRef = useRef(false);
  const prevBtn = useRef({
    fire: false,
    slot: false,
    gim: false,
    light: false,
    arm: false,
  });
  const gpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendA = (p: object) =>
    sockRef.current?.emit("arduino-send", JSON.stringify(p));
  const sendN = (port: number, pwm: number) =>
    sockRef.current?.emit("nano-send", JSON.stringify({ port, pwm }));

  const hint = (msg: string) => {
    setGpHint(msg);
    if (gpTimer.current) clearTimeout(gpTimer.current);
    gpTimer.current = setTimeout(() => setGpHint(null), 1800);
  };

  const kbAxes = () => {
    const k = held.current;
    return {
      fwd: (k.has("w") ? -KBV : 0) + (k.has("s") ? KBV : 0),
      side: (k.has("d") ? KBV : 0) + (k.has("a") ? -KBV : 0),
      vert: (k.has("q") ? KBV : 0) + (k.has("e") ? -KBV : 0),
      yaw: (k.has("z") ? -KBV : 0) + (k.has("x") ? KBV : 0),
    };
  };

  const tick = () => {
    const now = Date.now();
    const gps = navigator.getGamepads();
    const gp =
      held.current.size === 0 ? (gps.find((g) => g !== null) ?? null) : null;
    const dz = 0.1;
    const ax = kbAxes();

    let fwd = ax.fwd;
    let side = ax.side;
    let vert = ax.vert;
    let yaw = ax.yaw;

    if (gp) {
      fwd = fwd || (Math.abs(gp.axes[1]) > dz ? -gp.axes[1] : 0);
      side = side || (Math.abs(gp.axes[0]) > dz ? gp.axes[0] : 0);
      vert = vert || (Math.abs(gp.axes[3]) > dz ? gp.axes[3] : 0);
    }

    const vPWM = inv(toPWM(vert));
    let s6 = toPWM(clamp((fwd + side) * -1));
    let s7 = toPWM(clamp((fwd - side) * 1));
    let s8 = toPWM(clamp((fwd + side) * 1));
    let s9 = toPWM(clamp((fwd - side) * 1));

    const yawI = gp ? (Math.abs(gp.axes[2]) > dz ? gp.axes[2] : 0) : yaw;
    if (Math.abs(yawI) > 0.1) {
      const yPWM = toPWM(clamp(yawI));
      s6 = inv(yPWM);
      s7 = yPWM;
      s8 = inv(yPWM);
      s9 = inv(yPWM);
    }

    if (fwd > 0.4) {
      s6 = inv(s6);
      s7 = inv(s7);
      s8 = inv(s8);
      s9 = inv(s9);
    }
        const dev =
      [s6, s7, s8, s9, vPWM].reduce((a, v) => a + Math.abs(v - 1500), 0) / 5;
    setSpd(Math.round((dev / 500) * 100));

    const pld = JSON.stringify({
      forward: vPWM,
      action: "COMBINED",
      p6: s6,
      p7: s7,
      p8: s8,
      p9: s9,
      bno: bnoRef.current,
    });

    if (pld !== lastPld.current || now - lastT.current > 100) {
      sockRef.current?.emit("arduino-send", pld);
      lastPld.current = pld;
      lastT.current = now;
    }

    if (gp) {
      const slotB = gp.buttons[0]?.value === 1;
      if (slotB && !prevBtn.current.slot) {
        const next = (slotRef.current % TN) + 1;
        slotRef.current = next;
        setTrpSlot(next);
        hint(`Slot ${next}`);
      }
      prevBtn.current.slot = slotB;

      const fireB = gp.buttons[1]?.value === 1;
      if (fireB && !prevBtn.current.fire) {
        const pin = BASE + (slotRef.current - 1);
        fireRef.current = {
          port: pin,
          pwm: fireRef.current.pwm === 1000 ? tpwmRef.current : 1000,
        };
        setFirePulse((p) => p + 1);
        hint("🚀 Ateş");
      }
      prevBtn.current.fire = fireB;

      const gimB = gp.buttons[2]?.value === 1;
      if (gimB && !prevBtn.current.gim) {
        gimRef.current = gimRef.current === 2000 ? 1000 : gimRef.current + 250;
        setGimbalPwm(gimRef.current);
        setGimbalFire((p) => p + 1);
        hint("📷 Gimbal");
      }
      prevBtn.current.gim = gimB;

      const lightB = gp.buttons[3]?.value === 1;
      if (lightB && !prevBtn.current.light) {
        lightRef.current = !lightRef.current;
        setLightOn(lightRef.current);
        sendN(4, lightRef.current ? 2000 : 1000);
        hint("💡 Işık");
      }
      prevBtn.current.light = lightB;

      const armB = gp.buttons[4]?.value === 1 || gp.buttons[5]?.value === 1;
      if (armB && !prevBtn.current.arm) {
        armRef.current = !armRef.current;
        setArmOpen(armRef.current);
        sendN(9, armRef.current ? 2000 : 1000);
        hint("🦾 Kol");
      }
      prevBtn.current.arm = armB;
    }

    rafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    if (firePulse === 0) return;
    const { port, pwm } = fireRef.current;
    if (port === 3) {
      bnoRef.current = bnoRef.current === 1 ? 0 : 1;
      return;
    }
    sendN(port, pwm);
  }, [firePulse]);

  useEffect(() => {
    if (gimbalFire === 0) return;
    sendN(6, gimRef.current);
  }, [gimbalFire]);

  useEffect(() => {
    tick()
    const onDown = (e: KeyboardEvent) => {
      if (
        [" ", "ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(e.key)
      )
        e.preventDefault();

      if (!e.repeat) {
        if (e.key === "ArrowRight") {
          const n = (slotRef.current % TN) + 1;
          slotRef.current = n;
          setTrpSlot(n);
        } else if (e.key === "ArrowLeft") {
          const n = slotRef.current === 1 ? TN : slotRef.current - 1;
          slotRef.current = n;
          setTrpSlot(n);
        } else if (e.key === "ArrowUp") {
          const n = Math.min(tpwmRef.current + TSTEP, TMAX);
          tpwmRef.current = n;
          setTrpPwm(n);
        } else if (e.key === "ArrowDown") {
          const n = Math.max(tpwmRef.current - TSTEP, TMIN);
          tpwmRef.current = n;
          setTrpPwm(n);
        } else if (e.key === " ") {
          const pin = BASE + (slotRef.current - 1);
          fireRef.current = {
            port: pin,
            pwm: fireRef.current.pwm === 1000 ? tpwmRef.current : 1000,
          };
          setFirePulse((p) => p + 1);
        } else if (e.key.toLowerCase() === "l") {
          lightRef.current = !lightRef.current;
          setLightOn(lightRef.current);
          sendN(4, lightRef.current ? 2000 : 1000);
        } else if (e.key === "[") {
          const n = Math.max(gimRef.current - 250, 1000);
          gimRef.current = n;
          setGimbalPwm(n);
          setGimbalFire((p) => p + 1);
        } else if (e.key === "]") {
          const n = Math.min(gimRef.current + 250, 2000);
          gimRef.current = n;
          setGimbalPwm(n);
          setGimbalFire((p) => p + 1);
        } else if (e.key.toLowerCase() === "c") {
          armRef.current = !armRef.current;
          setArmOpen(armRef.current);
          sendN(9, armRef.current ? 2000 : 1000);
        }
      }

      const k = e.key.toLowerCase();
      if (KMAP[k] && !held.current.has(k)) {
        held.current.add(k);
        setActiveKeys(new Set(held.current));
      }
    };

    const onUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (KMAP[k]) {
        held.current.delete(k);
        setActiveKeys(new Set(held.current));
      }
    };

    window.addEventListener("keydown", onDown, { passive: false });
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    const s = io("http://localhost:8082") as unknown as Socket;
    sockRef.current = s;
    s.on("connect", () => console.log("Bridge OK"));
    s.on("arduino-data", (d: unknown) => console.log("Arduino:", d));
    return () => {
      s.disconnect();
    };
  }, []);

  useEffect(() => {
    setTimeout(() => setGimbalFire(0), 4000);
  }, [gimbalFire]);

  const tpct = Math.round(((trpPwm - TMIN) / (TMAX - TMIN)) * 100);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black select-none">
      <iframe
        src="http://192.168.10.2:8889/cam1"
        className="absolute inset-0 w-full h-full border-none"
      />

      <Pointer />

      <div className="absolute bottom-20 left-8 pointer-events-none">
        {[1, 2, 3].map((row) => (
          <div key={row} className="flex gap-1.5 mb-1.5 h-[60px]">
            {KL.filter((kl) => kl.r === row).map(({ k, lb, ac }) => (
              <div key={k} className="w-[60px] h-[60px] flex-shrink-0">
                <AnimatePresence>
                  {activeKeys.has(k) && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.4, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.4, y: 10 }}
                      transition={{ duration: 0.09, ease: "backOut" }}
                      className="w-[60px] h-[60px] rounded-2xl border-2 border-gray-300 bg-white
                        flex flex-col items-center justify-center gap-0.5 shadow-2xl shadow-black/40"
                    >
                      <span className="text-lg font-black text-gray-900 leading-none">
                        {lb}
                      </span>
                      <span className="text-[9px] font-medium text-gray-500 leading-none">
                        {ac}
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="absolute right-5 top-1/2 -translate-y-1/2 flex flex-col gap-2.5 pointer-events-none">
        <motion.div
          animate={{
            x: lightOn ? 0 : 200,
            opacity: lightOn ? 1 : 0,
            filter: lightOn ? "blur(0px)" : "blur(20px)",
          }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className={cn(
            "w-20 h-20 rounded-2xl flex flex-col items-center justify-center bg-white border border-gray-300",
          )}
        >
          <MdLightbulb className="size-9 text-amber-300" />
        </motion.div>

        <motion.div
          animate={{
            x: gimbalFire > 0 ? 0 : 200,
            opacity: gimbalFire > 0 ? 1 : 0,
            filter: gimbalFire > 0 ? "blur(0px)" : "blur(20px)",
          }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className={cn(
            "w-20 h-20 rounded-2xl flex flex-col items-center justify-center bg-white border border-gray-300",
          )}
        >
          <MdOutlineCameraswitch className="size-7 mb-1.5 text-gray-900" />
          <span className="text-md mt-1 font-medium text-gray-900 leading-none">
            {((gimRef.current / 1500) * 100).toFixed(2)}%
          </span>
        </motion.div>

        <motion.div
          animate={{
            x: armOpen ? 0 : 200,
            opacity: armOpen ? 1 : 0,
            filter: armOpen ? "blur(0px)" : "blur(20px)",
          }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className={cn(
            "w-20 h-20 rounded-2xl flex flex-col items-center justify-center bg-white border border-gray-300",
          )}
        >
          <PiHandGrabbingFill className="size-9 mb-1 text-gray-900" />
        </motion.div>
      </div>

      <div className="absolute bottom-0 right-5 flex flex-col items-end gap-2 pointer-events-none">
        <div className="flex gap-1.5">
          {Array.from({ length: TN }, (_, i) => i + 1).map((i) => (
            <div
              key={i}
              className={cn(
                "size-4 transition-all duration-150",
                i === trpSlot
                  ? "text-rose-400 scale-125 drop-shadow-[0_0_6px_rgba(251,113,133,0.8)]"
                  : "text-white 15",
              )}
            >
              <ImRocket className="w-full h-full" />
            </div>
          ))}
        </div
        >
        <div className="bg-black/50 backdrop-blur-xl border border-white/12 rounded-2xl px-4 py-2.5 min-w-[165px]">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-[9px] font-mono tracking-widest text-white/30 uppercase">
              PWM
            </span>
            <span
              className={cn(
                "text-sm font-black font-mono tabular-nums",
                trpPwm >= 1800
                  ? "text-rose-400"
                  : trpPwm >= 1500
                    ? "text-amber-300"
                    : "text-emerald-400",
              )}
            >
              {trpPwm}
            </span>
          </div>
          <div className="w-full h-[3px] bg-white/8 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-100",
                trpPwm >= 1800
                  ? "bg-rose-400"
                  : trpPwm >= 1500
                    ? "bg-amber-300"
                    : "bg-emerald-400",
              )}
              style={{ width: `${tpct}%` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[7px] text-white/15 font-mono">{TMIN}</span>
            <span className="text-[7px] text-white/15 font-mono">{TMAX}</span>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {gpHint && (
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.15 }}
            className="absolute top-5 right-5 bg-white/95 backdrop-blur-xl rounded-2xl px-4 py-2.5
              flex items-center gap-2 shadow-2xl shadow-black/30"
          >
            <Gamepad2 className="size-4 text-gray-400 flex-shrink-0" />
            <span className="text-gray-800 text-sm font-mono font-semibold">
              {gpHint}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className="absolute bottom-0 left-0 right-0 h-24 bg-white rounded-t-3xl backdrop-blur-2xl border-t border-gray-300
        flex justify-center items-center"
      >

        <div className="flex mx-auto w-min items-center gap-2">
          <div className="w-240 h-3 rounded-full overflow-hidden">
            <motion.div
              className="h-3 bg-red-500 rounded-full absolute left-1/2 -translate-x-1/2"
              animate={{ width: `${spd * 4.8}px` }}
              transition={{ duration: 0.15 }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default dynamic(() => Promise.resolve(Client), { ssr: false });
