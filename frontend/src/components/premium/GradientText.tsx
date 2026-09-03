import React from "react";

interface GradientTextProps {
  children: React.ReactNode;
  variant?: "default" | "accent" | "emerald" | "amber" | "rose";
  as?: "span" | "h1" | "h2" | "h3" | "h4" | "p";
  className?: string;
}

const gradientMap: Record<string, string> = {
  default: "from-zinc-100 via-zinc-400 to-zinc-100",
  accent: "from-indigo-400 via-violet-400 to-purple-400",
  emerald: "from-emerald-300 via-emerald-400 to-teal-400",
  amber: "from-amber-300 via-orange-400 to-amber-300",
  rose: "from-rose-300 via-pink-400 to-rose-300",
};

export function GradientText({
  children,
  variant = "default",
  as: Tag = "span",
  className = "",
}: GradientTextProps) {
  const gradient = gradientMap[variant] || gradientMap.default;

  return (
    <Tag
      className={`bg-gradient-to-r ${gradient} bg-clip-text text-transparent ${className}`}
    >
      {children}
    </Tag>
  );
}
