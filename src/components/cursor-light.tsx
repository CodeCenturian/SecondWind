"use client";

import { useEffect, useState } from "react";

export function CursorLight() {
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: -1000, y: -1000 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    function handleMouseMove(e: MouseEvent) {
      setPos({ x: e.clientX, y: e.clientY });
    }

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  if (!mounted) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "240px",
        height: "240px",
        borderRadius: "50%",
        pointerEvents: "none",
        zIndex: 9999,
        transform: `translate3d(${pos.x - 120}px, ${pos.y - 120}px, 0)`,
        background: "radial-gradient(circle, rgba(16, 185, 129, 0.25) 0%, rgba(234, 179, 8, 0.12) 30%, rgba(16, 185, 129, 0.04) 55%, transparent 70%)",
        transition: "transform 0.03s linear",
        willChange: "transform",
      }}
    />
  );
}
