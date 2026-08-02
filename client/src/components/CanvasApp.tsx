"use client";

import { useCanvas } from "@/hooks/useCanvas";
import Canvas from "./Canvas";

export default function CanvasApp() {
  const api = useCanvas();
  return <Canvas api={api} />;
}
