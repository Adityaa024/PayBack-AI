import { DotLottieReact } from "@lottiefiles/dotlottie-react";

type LottiePreset = "loading" | "success" | "error" | "empty" | "rocket" | "sync" | "celebration" | "search";

interface LottieIconProps {
  preset?: LottiePreset;
  src?: string;
  size?: number;
  loop?: boolean;
  autoplay?: boolean;
  className?: string;
}

// Free LottieFiles CDN URLs for common icons
const presetUrls: Record<LottiePreset, string> = {
  loading: "https://lottie.host/4db68bbd-31f6-4cd8-84eb-189de081159a/IGmMCqhzpt.lottie",
  success: "https://lottie.host/2a6c1f56-faf1-4ada-85ed-0a0a83eada80/TqdO5CiIhB.lottie",
  error: "https://lottie.host/68c61207-2985-4f63-8e6d-37269a79731f/FYSNtXcVJh.lottie",
  empty: "https://lottie.host/2d113236-4ae0-4845-a498-ec153e18bd5b/t0weYDGJHj.lottie",
  rocket: "https://lottie.host/9e2b3e8a-64a0-49e4-9e0b-1bfaa6b10c47/8Qi3PcVCca.lottie",
  sync: "https://lottie.host/4db68bbd-31f6-4cd8-84eb-189de081159a/IGmMCqhzpt.lottie",
  celebration: "https://lottie.host/7fc16c55-e8c4-45ea-a1e6-3319e76e5cf9/7IaZLhTiYb.lottie",
  search: "https://lottie.host/d7779a89-beef-49b3-833a-ec6c tried-0bfc3c1/eLr0dHVf7d.lottie",
};

export function LottieIcon({
  preset,
  src,
  size = 120,
  loop = true,
  autoplay = true,
  className = "",
}: LottieIconProps) {
  const url = src || (preset ? presetUrls[preset] : "");

  if (!url) return null;

  return (
    <div className={`flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <DotLottieReact
        src={url}
        loop={loop}
        autoplay={autoplay}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
