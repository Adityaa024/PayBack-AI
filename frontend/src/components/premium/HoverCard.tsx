import React, { useRef, useCallback, useState } from "react";
import { motion } from "framer-motion";

interface HoverCardProps {
  children: React.ReactNode;
  className?: string;
  glowColor?: string;
  borderOnHover?: boolean;
}

export function HoverCard({
  children,
  className = "",
  glowColor = "rgba(99, 102, 241, 0.08)",
  borderOnHover = true,
}: HoverCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!cardRef.current) return;
      const rect = cardRef.current.getBoundingClientRect();
      setMousePos({
        x: ((e.clientX - rect.left) / rect.width) * 100,
        y: ((e.clientY - rect.top) / rect.height) * 100,
      });
    },
    []
  );

  return (
    <motion.div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative overflow-hidden rounded-xl transition-colors duration-200 ${
        borderOnHover && isHovered
          ? "border-zinc-700/80"
          : "border-zinc-800/60"
      } border ${className}`}
      style={{ background: "rgba(15, 16, 17, 0.4)" }}
    >
      {/* Spotlight gradient following mouse */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-300 z-0"
        style={{
          opacity: isHovered ? 1 : 0,
          background: `radial-gradient(400px circle at ${mousePos.x}% ${mousePos.y}%, ${glowColor}, transparent 60%)`,
        }}
      />
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}
