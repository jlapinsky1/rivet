import { ArrowUpRight } from 'lucide-react';
import { Reveal } from './Reveal';
import { DecisionEngineCard } from './ProductUI';

export function DecisionEngine() {
  return (
    <section id="decision-engine" className="bg-forest-950 py-20 text-cream-50 sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <Reveal>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest2 text-emerald-400">
              <span className="h-px w-6 bg-emerald-500" />
              The decision engine
            </div>
            <h2 className="mt-5 font-display text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
              Know what the job is really worth.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-forest-200">
              Rivet looks at the details so you don't have to. You see the answer in plain English,
              with the numbers that matter right beside it.
            </p>
            <a
              href="#how-it-works"
              className="group mt-8 inline-flex items-center gap-2 text-sm font-semibold text-emerald-400 transition-colors hover:text-emerald-300"
            >
              See how Rivet thinks
              <ArrowUpRight size={16} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
          </Reveal>

          <Reveal delay={1}>
            <DecisionEngineCard />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
