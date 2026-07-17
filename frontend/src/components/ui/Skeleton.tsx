import { cn } from "@/lib/utils";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "line" | "circle" | "rect";
  width?: string | number;
  height?: string | number;
}

export function Skeleton({
  variant = "rect",
  width,
  height,
  className,
  style,
  ...props
}: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse bg-gray-200/80 rounded",
        variant === "circle" && "rounded-full",
        variant === "line" && "rounded h-4",
        className
      )}
      style={{ width, height, ...style }}
      {...props}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-white/30 bg-white/60 backdrop-blur-md shadow-glass p-5 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton variant="circle" width={40} height={40} />
        <div className="flex-1 space-y-1.5">
          <Skeleton variant="line" width="60%" />
          <Skeleton variant="line" width="40%" height={12} />
        </div>
      </div>
      <Skeleton height={12} />
      <Skeleton height={12} width="80%" />
      <Skeleton height={12} width="60%" />
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3 rounded-lg bg-white/40">
          <Skeleton variant="circle" width={32} height={32} />
          <Skeleton variant="line" width="25%" />
          <Skeleton variant="line" width="20%" className="ml-auto" />
          <Skeleton variant="line" width="15%" />
        </div>
      ))}
    </div>
  );
}
