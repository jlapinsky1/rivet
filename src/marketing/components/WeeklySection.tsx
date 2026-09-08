import { Target } from 'lucide-react';
import { Reveal } from './Reveal';
import { WeeklyGoalCard } from './ProductUI';

export function WeeklySection() {
  return (
    <section className="bg-cream-100 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
          <Reveal>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500 text-forest-950">
              <Target size={22} />
            </div>
            <h2 className="mt-5 font-display text-3xl font-bold tracking-tight text-forest-950 sm:text-4xl lg:text-5xl">
              Rivet understands your week, not just the job.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-forest-600">
              Tell Rivet what you want to earn and how much time you have. It helps you understand what each remaining hour needs to be worth.
            </p>
          </Reveal>

          <Reveal delay={1}>
            <WeeklyGoalCard />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
