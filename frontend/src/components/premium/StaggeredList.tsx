import React from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";

interface StaggeredListProps {
  children: React.ReactNode;
  className?: string;
  staggerDelay?: number;
  direction?: "up" | "down" | "left" | "right";
  as?: "div" | "ul" | "tbody";
}

const getVariants = (direction: string): Variants => {
  const offsets: Record<string, { x?: number; y?: number }> = {
    up: { y: 20 },
    down: { y: -20 },
    left: { x: 20 },
    right: { x: -20 },
  };

  const offset = offsets[direction] || { y: 20 };

  return {
    hidden: { opacity: 0, ...offset },
    visible: {
      opacity: 1,
      x: 0,
      y: 0,
      transition: {
        duration: 0.4,
        ease: [0.25, 0.46, 0.45, 0.94],
      },
    },
    exit: {
      opacity: 0,
      ...offset,
      transition: { duration: 0.2 },
    },
  };
};

const containerVariants = (staggerDelay: number): Variants => ({
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: staggerDelay,
      delayChildren: 0.05,
    },
  },
});

export function StaggeredList({
  children,
  className = "",
  staggerDelay = 0.06,
  direction = "up",
  as = "div",
}: StaggeredListProps) {
  const MotionTag = motion[as] as typeof motion.div;

  return (
    <AnimatePresence mode="wait">
      <MotionTag
        key="staggered-container"
        variants={containerVariants(staggerDelay)}
        initial="hidden"
        animate="visible"
        exit="hidden"
        className={className}
      >
        {React.Children.map(children, (child) => {
          if (!React.isValidElement(child)) return child;
          return (
            <motion.div variants={getVariants(direction)} key={child.key}>
              {child}
            </motion.div>
          );
        })}
      </MotionTag>
    </AnimatePresence>
  );
}

/** Individual stagger item — use when you need fine control */
export function StaggerItem({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 16 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
