import { ArrowRight } from 'lucide-react';
import { Reveal } from './Reveal';

export function FinalCTA() {
  return (
    <section className="relative overflow-hidden bg-forest-950 py-20 text-cream-50 sm:py-28">
      <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full border border-emerald-500/10" />
      <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full border border-emerald-500/10" />
      <div className="relative mx-auto max-w-3xl px-5 text-center sm:px-8">
        <Reveal>
          <h2 className="font-display text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Better jobs.
            <br />
            Better margins.
          </h2>
          <p className="mx-auto mt-5 max-w-lg text-lg leading-relaxed text-forest-200">
            Stop guessing which work is worth taking.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="/signup"
              className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3.5 text-base font-semibold text-forest-950 transition-all hover:bg-emerald-400 hover:shadow-lg hover:shadow-emerald-500/20 sm:w-auto"
            >
              Start free
              <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />
            </a>
            <a
              href="/login"
              className="inline-flex w-full items-center justify-center rounded-xl border border-forest-700 px-6 py-3.5 text-base font-semibold text-cream-50 transition-colors hover:border-forest-500 hover:bg-forest-900 sm:w-auto"
            >
              Log in
            </a>
          </div>
          <p className="mt-6 text-sm text-forest-400">No credit card. No contract.</p>
        </Reveal>
      </div>
    </section>
  );
}
