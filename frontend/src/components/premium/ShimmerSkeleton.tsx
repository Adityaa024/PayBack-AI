interface ShimmerSkeletonProps {
  variant?: "text" | "card" | "table-row" | "chart" | "circle";
  width?: string;
  height?: string;
  className?: string;
  count?: number;
}

function SingleSkeleton({
  variant = "text",
  width,
  height,
  className = "",
}: Omit<ShimmerSkeletonProps, "count">) {
  const baseClass = "shimmer";

  switch (variant) {
    case "card":
      return (
        <div className={`${baseClass} rounded-xl ${className}`} style={{ width: width || "100%", height: height || "120px" }} />
      );
    case "table-row":
      return (
        <div className={`flex items-center gap-3 py-3 ${className}`}>
          <div className={`${baseClass} rounded-full`} style={{ width: "32px", height: "32px" }} />
          <div className="flex-1 space-y-2">
            <div className={`${baseClass} rounded`} style={{ width: "60%", height: "12px" }} />
            <div className={`${baseClass} rounded`} style={{ width: "40%", height: "10px" }} />
          </div>
          <div className={`${baseClass} rounded`} style={{ width: "80px", height: "12px" }} />
        </div>
      );
    case "chart":
      return (
        <div className={`${baseClass} rounded-xl ${className}`} style={{ width: width || "100%", height: height || "200px" }} />
      );
    case "circle":
      return (
        <div className={`${baseClass} rounded-full ${className}`} style={{ width: width || "40px", height: height || "40px" }} />
      );
    default: // text
      return (
        <div className={`${baseClass} rounded ${className}`} style={{ width: width || "100%", height: height || "14px" }} />
      );
  }
}

export function ShimmerSkeleton({
  variant = "text",
  width,
  height,
  className = "",
  count = 1,
}: ShimmerSkeletonProps) {
  if (count === 1) {
    return <SingleSkeleton variant={variant} width={width} height={height} className={className} />;
  }

  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <SingleSkeleton key={i} variant={variant} width={width} height={height} className={className} />
      ))}
    </div>
  );
}
