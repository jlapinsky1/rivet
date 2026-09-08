import { ArrowRight, PlayCircle } from 'lucide-react';
import { HeroDecisionCard } from './ProductUI';

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-28 pb-16 sm:pt-32 sm:pb-24">
      {/* subtle background texture */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-cream-100 via-cream-50 to-cream-50" />
        <div className="absolute right-0 top-0 h-[500px] w-[500px] rounded-full bg-emerald-500/5 blur-3xl" />
        <div className="absolute -left-20 top-40 h-[400px] w-[400px] rounded-full bg-forest-500/5 blur-3xl" />
      </div>

      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* left: copy */}
          <div className="animate-fade-up">
            {/* eyebrow */}
            <div className="inline-flex items-center gap-2 rounded-full border border-cream-300 bg-cream-50 px-3.5 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="text-xs font-medium text-forest-600">
                For owner-operated service businesses
              </span>
            </div>

            {/* headline */}
            <h1 className="mt-6 font-display text-5xl font-bold leading-[1.05] tracking-tightest text-forest-950 sm:text-6xl lg:text-7xl">
              Better jobs.
              <br />
              Better margins.
            </h1>

            {/* supporting copy */}
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-forest-600">
              Rivet helps service businesses know what to charge, which jobs to take,
              and whether the work is worth their time before they commit.
            </p>

            {/* CTAs */}
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href="/signup"
                className="group inline-flex items-center justify-center gap-2 rounded-xl bg-forest-900 px-6 py-3.5 text-base font-semibold text-cream-50 transition-all hover:bg-forest-800 hover:shadow-lg"
              >
                Start free
                <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />
              </a>
              <a
                href="#how-it-works"
                className="group inline-flex items-center justify-center gap-2 rounded-xl border border-cream-300 bg-white px-6 py-3.5 text-base font-semibold text-forest-800 transition-all hover:border-forest-300 hover:bg-cream-50"
              >
                <PlayCircle size={18} className="text-emerald-600" />
                See how it works
              </a>
            </div>

            {/* trust line */}
            <p className="mt-6 text-sm text-forest-400">
              No credit card. No contract. Set up in minutes.
            </p>
          </div>

          {/* right: product UI */}
          <div className="animate-scale-in lg:pl-4">
            <div className="relative">
              {/* floating accent */}
              <div className="absolute -right-3 -top-3 z-10 hidden rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-forest-950 shadow-lg sm:block">
                Worth $65/hr
              </div>
              <HeroDecisionCard />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
