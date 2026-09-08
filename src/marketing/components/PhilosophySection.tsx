import { ArrowRight, Check } from 'lucide-react';
import { Reveal } from './Reveal';
import { VerdictBadge } from './ProductUI';

export function PhilosophySection() {
  return (
    <section className="border-y border-cream-200 bg-forest-50 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_0.9fr] lg:gap-20">
          <Reveal>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest2 text-emerald-700">
              <span className="h-px w-6 bg-emerald-500" />
              The Rivet approach
            </div>
            <h2 className="mt-5 font-display text-3xl font-bold tracking-tight text-forest-950 sm:text-4xl lg:text-5xl">
              Complex engine.
              <br />
              Simple answer.
            </h2>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-forest-600">
              Rivet looks at the details so you don't have to. You get the decision, the reason, and the price that makes the job worth doing.
            </p>
          </Reveal>

          <Reveal delay={1}>
            <div className="rounded-2xl border border-forest-200 bg-white p-6 shadow-sm sm:p-8">
              <div className="text-2xs font-semibold uppercase tracking-widest2 text-forest-400">Every request ends here</div>
              <div className="mt-6 grid gap-3">
                <DecisionLine verdict="take" reason="Strong profit for your available time" />
                <DecisionLine verdict="review" reason="Close call, check the price" />
                <DecisionLine verdict="pass" reason="Not a good fit for this week" />
              </div>
              <div className="mt-6 flex items-center gap-2 border-t border-cream-200 pt-5 text-sm text-forest-500">
                <Check size={16} className="text-emerald-600" />
                <span>Clear reasoning. No black box.</span>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function DecisionLine({ verdict, reason }: { verdict: 'take' | 'review' | 'pass'; reason: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-cream-50 px-3.5 py-3">
      <VerdictBadge verdict={verdict} size="sm" />
      <span className="text-right text-xs text-forest-600">{reason}</span>
    </div>
  );
}
