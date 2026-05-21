import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";

export type Bucket = { hour: string; completed: number; failed: number; total: number };

export function ActivitySparkline({
  buckets,
  successRate,
  total,
  completed,
}: {
  buckets: Bucket[];
  successRate: number | null;
  total: number;
  completed: number;
}) {
  const max = Math.max(1, ...buckets.map((b) => b.total));
  const W = 600;
  const H = 60;
  const barW = W / buckets.length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4" /> 24h activity
            </CardTitle>
            <CardDescription>
              {total} job(s) · {completed} completed ·{" "}
              {successRate !== null ? `${successRate.toFixed(0)}% success` : "—"}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <svg viewBox={`0 0 ${W} ${H + 14}`} className="h-20 w-full" preserveAspectRatio="none">
          {buckets.map((b, i) => {
            const okH = (b.completed / max) * H;
            const failH = (b.failed / max) * H;
            const x = i * barW;
            return (
              <g key={b.hour}>
                <rect
                  x={x + 1}
                  y={H - okH}
                  width={Math.max(1, barW - 2)}
                  height={okH}
                  fill="hsl(var(--primary))"
                  opacity={0.85}
                />
                <rect
                  x={x + 1}
                  y={H - okH - failH}
                  width={Math.max(1, barW - 2)}
                  height={failH}
                  fill="hsl(var(--destructive))"
                  opacity={0.85}
                />
              </g>
            );
          })}
          <line x1={0} y1={H} x2={W} y2={H} stroke="hsl(var(--border))" strokeWidth={0.5} />
        </svg>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>24h ago</span>
          <span>now</span>
        </div>
      </CardContent>
    </Card>
  );
}
