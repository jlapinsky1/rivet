import { type ReactNode } from 'react';

// ─── Decision verdict badge ─────────────────────────────────────
export type Verdict = 'take' | 'review' | 'pass';

const verdictStyles: Record<Verdict, { bg: string; text: string; label: string }> = {
  take: { bg: 'bg-emerald-500', text: 'text-forest-950', label: 'TAKE THIS JOB' },
  review: { bg: 'bg-amber-400', text: 'text-forest-950', label: 'REVIEW' },
  pass: { bg: 'bg-rust-500', text: 'text-white', label: 'PASS' },
};

export function VerdictBadge({ verdict, size = 'md' }: { verdict: Verdict; size?: 'sm' | 'md' | 'lg' }) {
  const s = verdictStyles[verdict];
  const sizeClasses =
    size === 'lg'
      ? 'px-5 py-2 text-sm'
      : size === 'sm'
        ? 'px-2.5 py-1 text-2xs'
        : 'px-3.5 py-1.5 text-xs';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md font-display font-bold uppercase tracking-widest2 ${s.bg} ${s.text} ${sizeClasses}`}
    >
      {s.label}
    </span>
  );
}

// ─── Stat row ───────────────────────────────────────────────────
export function Stat({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <div className="text-2xs font-medium uppercase tracking-widest2 text-forest-500">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-semibold text-forest-900">{value}</div>
    </div>
  );
}

// ─── Hero decision card ─────────────────────────────────────────
export function HeroDecisionCard() {
  return (
    <div className="w-full rounded-2xl border border-cream-300 bg-white p-5 shadow-[0_2px_8px_rgba(20,42,32,0.06),0_24px_48px_rgba(20,42,32,0.08)]">
      {/* customer request header */}
      <div className="flex items-center justify-between">
        <span className="text-2xs font-semibold uppercase tracking-widest2 text-forest-400">
          Customer Request
        </span>
        <span className="rounded-full bg-cream-100 px-2.5 py-0.5 text-2xs font-medium text-forest-500">
          New
        </span>
      </div>

      <h3 className="mt-2 font-display text-lg font-semibold leading-tight text-forest-950">
        Build a 12 × 10 ft deck
      </h3>
      <div className="mt-1 flex items-center gap-2 text-xs text-forest-500">
        <span className="font-medium text-forest-700">Maya Thompson</span>
        <span className="text-cream-300">·</span>
        <span>18 min away</span>
      </div>

      {/* divider */}
      <div className="my-4 h-px bg-cream-200" />

      {/* verdict */}
      <div className="flex items-center gap-2">
        <VerdictBadge verdict="take" size="md" />
        <span className="text-xs text-forest-500">Worth about $65/hr to you</span>
      </div>

      {/* stats grid */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <Stat label="Est. profit" value="$620" />
        <Stat label="Time" value="14–18 hrs" />
        <Stat label="Confidence" value="72%" />
      </div>

      {/* create quote button */}
      <button className="mt-4 flex w-full items-center justify-between rounded-lg bg-forest-900 px-4 py-3 text-sm font-medium text-cream-50 transition-colors hover:bg-forest-800">
        <span>Create Quote</span>
        <span className="font-mono font-semibold text-emerald-400">$1,480</span>
      </button>
    </div>
  );
}

// ─── Decision engine showcase card ──────────────────────────────
export function DecisionEngineCard() {
  return (
    <div className="w-full rounded-2xl border border-cream-300 bg-white shadow-[0_2px_8px_rgba(20,42,32,0.06),0_24px_48px_rgba(20,42,32,0.08)]">
      {/* recommended label */}
      <div className="flex items-center justify-between border-b border-cream-200 px-6 py-3">
        <span className="text-2xs font-semibold uppercase tracking-widest2 text-emerald-600">
          Recommended
        </span>
        <span className="text-2xs font-medium uppercase tracking-widest2 text-forest-400">
          Job #4821
        </span>
      </div>

      {/* verdict */}
      <div className="px-6 pt-6 pb-4">
        <VerdictBadge verdict="take" size="lg" />
        <p className="mt-2 text-sm text-forest-500">Worth about $65/hr to you.</p>
      </div>

      {/* stats grid */}
      <div className="grid grid-cols-2 gap-px bg-cream-200 sm:grid-cols-4">
        <div className="bg-white px-5 py-4">
          <div className="text-2xs font-medium uppercase tracking-widest2 text-forest-400">Est. profit</div>
          <div className="mt-1 font-mono text-2xl font-bold text-forest-950">$620</div>
        </div>
        <div className="bg-white px-5 py-4">
          <div className="text-2xs font-medium uppercase tracking-widest2 text-forest-400">Profit / hr</div>
          <div className="mt-1 font-mono text-2xl font-bold text-emerald-600">$65/hr</div>
        </div>
        <div className="bg-white px-5 py-4">
          <div className="text-2xs font-medium uppercase tracking-widest2 text-forest-400">Est. time</div>
          <div className="mt-1 font-mono text-2xl font-bold text-forest-950">14–18<span className="text-sm font-medium text-forest-400"> hrs</span></div>
        </div>
        <div className="bg-white px-5 py-4">
          <div className="text-2xs font-medium uppercase tracking-widest2 text-forest-400">Travel</div>
          <div className="mt-1 font-mono text-2xl font-bold text-forest-950">18<span className="text-sm font-medium text-forest-400"> min</span></div>
        </div>
      </div>

      {/* why rivet likes it */}
      <div className="border-t border-cream-200 px-6 py-5">
        <div className="text-2xs font-semibold uppercase tracking-widest2 text-forest-400">
          Why Rivet likes it
        </div>
        <ul className="mt-3 space-y-2.5">
          <ReasonRow icon="check" text="Strong profit for the time" />
          <ReasonRow icon="check" text="Fits your available capacity" />
          <ReasonRow icon="check" text="Keeps you on pace for your weekly goal" />
          <ReasonRow icon="warn" text="Material estimate has moderate uncertainty" />
        </ul>
      </div>
    </div>
  );
}

function ReasonRow({ icon, text }: { icon: 'check' | 'warn'; text: string }) {
  return (
    <li className="flex items-start gap-2.5 text-sm">
      {icon === 'check' ? (
        <span className="mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full bg-emerald-100">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 5l2 2 4-4" stroke="#059669" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      ) : (
        <span className="mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full bg-amber-100">
          <span className="text-amber-600 text-xs font-bold">!</span>
        </span>
      )}
      <span className={icon === 'warn' ? 'text-forest-600' : 'text-forest-800'}>{text}</span>
    </li>
  );
}

// ─── Price state card ───────────────────────────────────────────
export function PriceStateCard({
  price,
  verdict,
  note,
  icon,
}: {
  price: string;
  verdict: Verdict;
  note: string;
  icon: ReactNode;
}) {
  const borderColor =
    verdict === 'take'
      ? 'border-emerald-400'
      : verdict === 'review'
        ? 'border-amber-400'
        : 'border-rust-400';

  return (
    <div className={`rounded-xl border-2 ${borderColor} bg-white p-5 shadow-sm transition-transform hover:-translate-y-0.5`}>
      <div className="flex items-center justify-between">
        <span className="font-display text-2xl font-bold text-forest-950">{price}</span>
        <span className="text-forest-400">{icon}</span>
      </div>
      <div className="mt-3">
        <VerdictBadge verdict={verdict} size="sm" />
      </div>
      <p className="mt-2 text-xs text-forest-500">{note}</p>
    </div>
  );
}

// ─── Weekly goal card ───────────────────────────────────────────
export function WeeklyGoalCard() {
  return (
    <div className="w-full rounded-2xl border border-cream-300 bg-white p-6 shadow-[0_2px_8px_rgba(20,42,32,0.06),0_24px_48px_rgba(20,42,32,0.08)]">
      <div className="flex items-center justify-between">
        <span className="text-2xs font-semibold uppercase tracking-widest2 text-forest-400">
          This week
        </span>
        <span className="text-2xs font-medium text-forest-400">Week 37</span>
      </div>

      {/* progress */}
      <div className="mt-4">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-2xl font-bold text-forest-950">$875</span>
          <span className="font-mono text-sm text-forest-400">/ $2,500</span>
        </div>
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-cream-200">
          <div
            className="h-full rounded-full bg-emerald-500"
            style={{ width: '35%', animation: 'growWidth 1.2s ease-out forwards' }}
          />
        </div>
        <div className="mt-1.5 text-xs text-forest-500">35% of weekly goal</div>
      </div>

      <div className="my-5 h-px bg-cream-200" />

      {/* remaining hours */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-2xs font-medium uppercase tracking-widest2 text-forest-400">
            Hours remaining
          </div>
          <div className="mt-1 font-mono text-lg font-semibold text-forest-900">12 hrs</div>
        </div>
        <div>
          <div className="text-2xs font-medium uppercase tracking-widest2 text-forest-400">
            Needed per hour
          </div>
          <div className="mt-1 font-mono text-lg font-semibold text-emerald-600">$68/hr</div>
        </div>
      </div>

      <div className="my-5 h-px bg-cream-200" />

      {/* job comparison */}
      <div className="text-2xs font-semibold uppercase tracking-widest2 text-forest-400">
        In your queue
      </div>
      <div className="mt-3 space-y-2.5">
        <JobRow name="Job A" rate="$40/hr" verdict="review" />
        <JobRow name="Job B" rate="$92/hr" verdict="take" />
      </div>
    </div>
  );
}

function JobRow({ name, rate, verdict }: { name: string; rate: string; verdict: Verdict }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-cream-50 px-3.5 py-2.5">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-forest-800">{name}</span>
        <span className="font-mono text-sm text-forest-500">{rate}</span>
      </div>
      <VerdictBadge verdict={verdict} size="sm" />
    </div>
  );
}

// ─── Commercial work order card ──────────────────────────────────
export function WorkOrderCard() {
  return (
    <div className="w-full rounded-2xl border border-cream-300 bg-white p-5 shadow-[0_2px_8px_rgba(20,42,32,0.06),0_24px_48px_rgba(20,42,32,0.08)]">
      <div className="flex items-center justify-between">
        <span className="text-2xs font-semibold uppercase tracking-widest2 text-forest-400">
          Work Order
        </span>
        <span className="rounded-full bg-cream-100 px-2.5 py-0.5 text-2xs font-medium text-forest-500">
          Commercial
        </span>
      </div>

      <h3 className="mt-2 font-display text-base font-semibold leading-tight text-forest-950">
        Unit 22B Move-Out Cleanout
      </h3>
      <div className="mt-1 flex flex-col gap-0.5 text-xs text-forest-500">
        <span className="font-medium text-forest-700">Oakwood Ridge Apartments</span>
        <span>Lapinsky Property Group</span>
      </div>

      <div className="my-4 h-px bg-cream-200" />

      <div className="flex items-center gap-2">
        <VerdictBadge verdict="take" size="sm" />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Stat label="Profit" value="$365" />
        <Stat label="Rate" value="$91/hr" />
        <Stat label="Time" value="4 hrs" />
      </div>
    </div>
  );
}
