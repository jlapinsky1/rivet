import { Inbox, BrainCircuit, Check } from 'lucide-react';
import { Reveal } from './Reveal';
import { VerdictBadge, type Verdict } from './ProductUI';

const STEPS = [
  {
    icon: Inbox,
    step: '1',
    title: 'Work comes in',
    body: 'Customers send a request, upload photos, or submit a commercial work order.',
  },
  {
    icon: BrainCircuit,
    step: '2',
    title: 'Rivet evaluates it',
    body: 'Rivet looks at time, travel, costs, expected profit, your weekly goal, remaining capacity, and estimate confidence.',
  },
];

const VERDICTS: { verdict: Verdict; desc: string }[] = [
  { verdict: 'take', desc: 'Worth your time. Strong profit for the hours.' },
  { verdict: 'review', desc: 'Borderline. Check the price before committing.' },
  { verdict: 'pass', desc: 'Not worth it. Your time is better used elsewhere.' },
];

export function HowItWorks() {
  return (
    <section className="border-y border-cream-200 bg-cream-100 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal className="max-w-3xl">
          <h2 className="font-display text-3xl font-bold tracking-tight text-forest-950 sm:text-4xl lg:text-5xl">
            Rivet turns every request into a decision.
          </h2>
        </Reveal>

        {/* flow diagram */}
        <div className="mt-14 grid gap-6 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:items-stretch">
          {/* step 1 */}
          <Reveal>
            <FlowCard icon={Inbox} step="1" title="Work comes in" body="Customers send a request, upload photos, or submit a commercial work order." />
          </Reveal>

          <FlowArrow className="hidden lg:flex" />

          {/* step 2 */}
          <Reveal delay={1}>
            <FlowCard icon={BrainCircuit} step="2" title="Rivet evaluates it" body="Rivet looks at time, travel, costs, expected profit, your weekly goal, remaining capacity, and estimate confidence." />
          </Reveal>

          <FlowArrow className="hidden lg:flex" />

          {/* step 3 */}
          <Reveal delay={2}>
            <div className="flex h-full flex-col rounded-2xl border border-cream-200 bg-white p-7">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500 text-forest-950">
                <Check size={22} />
              </div>
              <h3 className="mt-5 font-display text-xl font-semibold text-forest-950">
                You get a simple answer
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-forest-500">
                Plus a recommended price and a clear reason why.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <VerdictBadge verdict="take" size="sm" />
                <VerdictBadge verdict="review" size="sm" />
                <VerdictBadge verdict="pass" size="sm" />
              </div>
            </div>
          </Reveal>
        </div>

        {/* mobile flow arrows */}
        <div className="mt-4 flex flex-col items-center gap-2 lg:hidden">
          <DownArrow />
          <DownArrow />
        </div>

        {/* verdict explanations */}
        <div className="mt-16 grid gap-4 sm:grid-cols-3">
          {VERDICTS.map((v, i) => (
            <Reveal key={v.verdict} delay={(i + 1) as 1 | 2 | 3}>
              <div className="rounded-xl border border-cream-200 bg-white p-5">
                <VerdictBadge verdict={v.verdict} size="md" />
                <p className="mt-3 text-sm text-forest-600">{v.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function FlowCard({ icon: Icon, step, title, body }: { icon: typeof Inbox; step: string; title: string; body: string }) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-cream-200 bg-white p-7">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-forest-50 text-forest-700">
          <Icon size={22} />
        </div>
        <span className="font-mono text-sm font-semibold text-forest-300">{step}</span>
      </div>
      <h3 className="mt-5 font-display text-xl font-semibold text-forest-950">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-forest-500">{body}</p>
    </div>
  );
}

function FlowArrow({ className = '' }: { className?: string }) {
  return (
    <div className={`items-center justify-center ${className}`}>
      <svg width="32" height="24" viewBox="0 0 32 24" fill="none" aria-hidden="true">
        <path d="M2 12h26M20 4l8 8-8 8" stroke="#5c8f6e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function DownArrow() {
  return (
    <svg width="24" height="32" viewBox="0 0 24 32" fill="none" aria-hidden="true">
      <path d="M12 2v26M4 20l8 8 8-8" stroke="#5c8f6e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
