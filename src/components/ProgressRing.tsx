interface ProgressRingProps {
  pct: number;
}

const SIZE = 72;
const STROKE = 7;

export default function ProgressRing({ pct }: ProgressRingProps) {
  const r = (SIZE - STROKE) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, pct));
  const off = c - (clamped / 100) * c;
  return (
    <div className="progress-ring">
      <svg
        width={SIZE}
        height={SIZE}
        style={{ display: "block", transform: "rotate(-90deg)" }}
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={r}
          fill="none"
          stroke="#DDD5C2"
          strokeWidth={STROKE}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={r}
          fill="none"
          stroke="var(--sage)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          style={{ transition: "stroke-dashoffset 0.4s ease" }}
        />
      </svg>
      <div className="progress-ring-label">{pct}%</div>
    </div>
  );
}
