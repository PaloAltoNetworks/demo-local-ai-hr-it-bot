"use client";

import { cn } from "@/lib/utils";
import {
  RuntimeLoader,
  useRive,
  useStateMachineInput,
  useViewModel,
  useViewModelInstance,
  useViewModelInstanceColor,
} from "@rive-app/react-webgl2";
import { memo, useEffect, useState } from "react";

/**
 * Self-hosted Rive WASM runtime; @rive-app otherwise fetches rive.wasm from a CDN at runtime.
 */
RuntimeLoader.setWasmUrl("/rive/rive.wasm");

/**
 * Delays Rive initialization by one frame so that React Strict Mode's
 * immediate unmount cycle never creates a WebGL2 context. Only the
 * second (real) mount will initialise, avoiding context exhaustion.
 */
const useStrictModeSafeInit = () => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => {
      cancelAnimationFrame(id);
      setReady(false);
    };
  }, []);

  return ready;
};

export type PersonaState = "idle" | "thinking" | "speaking";

interface PersonaProps {
  state: PersonaState;
  className?: string;
  /** Hex color ("#RRGGBB" or "#RGB") that tints the orb. */
  color: string;
}

/**
 * Parses "#RRGGBB" / "#RGB" into [r,g,b]; null if unparseable.
 */
const hexToRgb = (hex: string): [number, number, number] | null => {
  const h = hex.trim().replace(/^#/, "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
};

/** State machine name shared by the Elements AI Rive visuals. */
const stateMachine = "default";

/**
 * Halo orb (self-hosted `/rive/halo.riv`), tinted through the riv's `color` view-model property.
 */
export const Persona = memo(({ state = "idle", className, color }: PersonaProps) => {
  const ready = useStrictModeSafeInit();

  const { rive, RiveComponent } = useRive(
    ready
      ? { autoplay: true, src: "/rive/halo.riv", stateMachines: stateMachine }
      : null
  );

  const viewModel = useViewModel(rive, { useDefault: true });
  const viewModelInstance = useViewModelInstance(viewModel, { rive, useDefault: true });
  const colorProperty = useViewModelInstanceColor("color", viewModelInstance);

  useEffect(() => {
    const rgb = hexToRgb(color);
    if (colorProperty && rgb) {
      colorProperty.setRgb(...rgb);
    }
  }, [colorProperty, color]);

  const thinkingInput = useStateMachineInput(rive, stateMachine, "thinking");
  const speakingInput = useStateMachineInput(rive, stateMachine, "speaking");

  /**
   * Rive state machine inputs are mutable objects set by direct assignment (the Rive API).
   */
  useEffect(() => {
    if (thinkingInput) {
      thinkingInput.value = state === "thinking";
    }
    if (speakingInput) {
      speakingInput.value = state === "speaking";
    }
  }, [state, thinkingInput, speakingInput]);

  return <RiveComponent className={cn("size-16 shrink-0", className)} />;
});

Persona.displayName = "Persona";
