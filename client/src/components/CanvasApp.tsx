"use client";

import { AuthProvider } from "./AuthProvider";
import { useCanvas } from "@/hooks/useCanvas";
import Canvas from "./Canvas";

export default function CanvasApp() {
  return (
    <AuthProvider>
      <Inner />
    </AuthProvider>
  );
}

function Inner() {
  const api = useCanvas();
  return <Canvas api={api} />;
}
