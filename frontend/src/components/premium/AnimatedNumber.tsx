import { useEffect, useRef } from "react";
import { useSpring, useMotionValue, useTransform, motion } from "framer-motion";

interface AnimatedNumberProps {
  value: number;
  prefix?: string;
  suffix?: string;
  format?: "currency" | "percent" | "plain" | "compact";
  className?: string;
  duration?: number;
}

function formatValue(num: number, format: string, prefix: string, suffix: string): string {
  let formatted: string;

  switch (format) {
    case "currency":
      if (num >= 100000) {
        formatted = `₹${(num / 100000).toFixed(1)}L`;
      } else if (num >= 1000) {
        formatted = `₹${(num / 1000).toFixed(1)}K`;
      } else {
        formatted = `₹${num.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
      }
      break;
    case "percent":
      formatted = `${num.toFixed(1)}%`;
      break;
    case "compact":
      if (num >= 1000000) {
        formatted = `${(num / 1000000).toFixed(1)}M`;
      } else if (num >= 1000) {
        formatted = `${(num / 1000).toFixed(1)}K`;
      } else {
        formatted = num.toFixed(0);
      }
      break;
    default:
      formatted = num.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  }

  return `${prefix}${formatted}${suffix}`;
}

export function AnimatedNumber({
  value,
  prefix = "",
  suffix = "",
  format = "plain",
  className = "",
  duration = 1.2,
}: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(0);
  const springValue = useSpring(motionValue, {
    damping: 30,
    stiffness: 100,
    duration: duration * 1000,
  });

  const display = useTransform(springValue, (latest) =>
    formatValue(latest, format, prefix, suffix)
  );

  useEffect(() => {
    motionValue.set(value);
  }, [value, motionValue]);

  return (
    <motion.span
      ref={ref}
      className={`tabular-nums ${className}`}
    >
      {display}
    </motion.span>
  );
}
