import { motion } from "framer-motion";

type PulseColor = "green" | "amber" | "red" | "blue" | "violet" | "cyan";

interface StatusPulseProps {
  color?: PulseColor;
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
}

const colorMap: Record<PulseColor, { dot: string; ring: string }> = {
  green: { dot: "bg-emerald-400", ring: "bg-emerald-400/40" },
  amber: { dot: "bg-amber-400", ring: "bg-amber-400/40" },
  red: { dot: "bg-rose-400", ring: "bg-rose-400/40" },
  blue: { dot: "bg-blue-400", ring: "bg-blue-400/40" },
  violet: { dot: "bg-violet-400", ring: "bg-violet-400/40" },
  cyan: { dot: "bg-cyan-400", ring: "bg-cyan-400/40" },
};

const sizeMap = {
  sm: { dot: "w-1.5 h-1.5", ring: "w-3 h-3" },
  md: { dot: "w-2 h-2", ring: "w-4 h-4" },
  lg: { dot: "w-2.5 h-2.5", ring: "w-5 h-5" },
};

export function StatusPulse({
  color = "green",
  size = "md",
  label,
  className = "",
}: StatusPulseProps) {
  const colors = colorMap[color];
  const sizes = sizeMap[size];

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="relative flex items-center justify-center">
        {/* Pulsing ring */}
        <motion.div
          className={`absolute ${sizes.ring} rounded-full ${colors.ring}`}
          animate={{
            scale: [1, 1.8, 1],
            opacity: [0.6, 0, 0.6],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        {/* Solid dot */}
        <div className={`${sizes.dot} rounded-full ${colors.dot} relative z-10`} />
      </div>
      {label && (
        <span className="text-xs text-zinc-400 font-medium">{label}</span>
      )}
    </div>
  );
}
