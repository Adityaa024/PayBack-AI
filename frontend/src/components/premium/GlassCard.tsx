import React, { useRef, useCallback } from "react";
import { motion } from "framer-motion";

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  hoverGlow?: boolean;
  hoverScale?: boolean;
  spotlight?: boolean;
  delay?: number;
  onClick?: () => void;
}

export function GlassCard({
  children,
  className = "",
  hoverGlow = true,
  hoverScale = true,
  spotlight = false,
  delay = 0,
  onClick,
}: GlassCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!spotlight || !cardRef.current) return;
      const rect = cardRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      cardRef.current.style.setProperty("--mouse-x", `${x}%`);
      cardRef.current.style.setProperty("--mouse-y", `${y}%`);
    },
    [spotlight]
  );

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        delay,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      whileHover={
        hoverScale
          ? {
              scale: 1.015,
              transition: { type: "spring", stiffness: 400, damping: 25 },
            }
          : undefined
      }
      onMouseMove={handleMouseMove}
      onClick={onClick}
      className={`
        glass-card rounded-xl
        ${spotlight ? "spotlight-card" : ""}
        ${hoverGlow ? "hover:shadow-[0_0_40px_rgba(99,102,241,0.06)]" : ""}
        ${onClick ? "cursor-pointer" : ""}
        ${className}
      `}
    >
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}
