"use client";

import { useEffect, useRef, useState } from "react";

export type GamepadState = {
  axes: number[];
  buttons: boolean[];
  connected: boolean;
};

export function useGamepad(index = 0) {
  const [state, setState] = useState<GamepadState>({
    axes: [],
    buttons: [],
    connected: false,
  });

  const raf = useRef<number>(null);

  useEffect(() => {
    function update() {
      const pads = navigator.getGamepads();
      const gp = pads[index];

      if (gp) {
        setState({
          axes: gp.axes.slice(),
          buttons: gp.buttons.map(b => b.pressed),
          connected: true,
        });
      } else {
        setState(s => ({ ...s, connected: false }));
      }

      raf.current = requestAnimationFrame(update);
    }

    update();
    return () => raf.current && cancelAnimationFrame(raf.current);
  }, [index]);

  return state;
}
