import { useState } from 'react';
import { ArrowRight, TrendingUp } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Reveal } from './Reveal';

const MIN_MONTHLY = 99;
const PERCENT = 1;
const SLIDER_MIN = 9900;
const SLIDER_MAX = 200000;
const SLIDER_STEP = 100;
const DEFAULT_REVENUE = 25000;

function formatCurrency(value: number): string {
  return '$' + value.toLocaleString('en-US');
}

export function PricingPage() {
  const [revenue, setRevenue] = useState(DEFAULT_REVENUE);
  const navigate = useNavigate();
  const rivetCost = Math.max(MIN_MONTHLY, Math.round((revenue * PERCENT) / 100));
  const uplift = Math.round(revenue * 0.02);

  return (
    <div className="min-h-screen overflow-x-hidden">
      {/* Hero */}
      <section className="relative overflow-hidden pt-28 pb-16 sm:pt-36 sm:pb-24">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-b from-cream-100 via-cream-50 to-cream-50" />
          <div className="absolute right-0 top-0 h-[500px] w-[500px] rounded-full bg-emerald-500/5 blur-3xl" />
        </div>

        <div className="mx-auto max-w-4xl px-5 text-center sm:px-8">
          <div className="animate-fade-up">
            <div className="inline-flex items-center gap-2 rounded-full border border-cream-300 bg-cream-50 px-3.5 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="text-xs font-medium text-forest-600">Simple, honest pricing</span>
            </div>

            <h1 className="mt-6 font-display text-4xl font-bold leading-[1.05] tracking-tightest text-forest-950 sm:text-5xl lg:text-6xl">
              One price.
              <br />
              Everything included.
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-forest-600">
              Rivet costs 1% of the work you run through it. No feature tiers. No complicated seat
              pricing. No paying more just to unlock the tools that help you make better decisions.
            </p>

            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                to="/signup"
                className="group inline-flex items-center justify-center gap-2 rounded-xl bg-forest-900 px-6 py-3.5 text-base font-semibold text-cream-50 transition-all hover:bg-forest-800 hover:shadow-lg"
              >
                Start free
                <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
              <span className="text-sm text-forest-400">$99/month minimum</span>
            </div>
          </div>
        </div>
      </section>

      {/* Scaling section */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-4xl px-5 sm:px-8">
          <Reveal>
            <div className="rounded-2xl border border-cream-200 bg-white p-8 sm:p-12">
              <h2 className="font-display text-2xl font-bold tracking-tight text-forest-950 sm:text-3xl">
                When you grow, we grow.
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-forest-600">
                A solo operator shouldn't pay what a $2M service business pays. And a growing
                business shouldn't have to upgrade to arbitrary software tiers just to unlock
                features.
              </p>
              <p className="mt-3 text-lg leading-relaxed text-forest-600">
                Rivet scales with the amount of business you actually run through it.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Calculator */}
      <section className="bg-forest-950 py-20 text-cream-50 sm:py-28">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <Reveal className="text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
              See what Rivet costs
            </h2>
          </Reveal>

          <Reveal delay={1}>
            <div className="mt-12 rounded-2xl border border-forest-800 bg-forest-900 p-6 sm:p-10">
              <label htmlFor="revenue-slider" className="block text-sm font-medium text-forest-300">
                Monthly revenue managed through Rivet
              </label>

              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-mono text-3xl font-bold text-cream-50 sm:text-4xl">
                  {formatCurrency(revenue)}
                </span>
              </div>

              <input
                id="revenue-slider"
                type="range"
                min={SLIDER_MIN}
                max={SLIDER_MAX}
                step={SLIDER_STEP}
                value={revenue}
                onChange={(e) => setRevenue(Number(e.target.value))}
                className="mt-6 w-full cursor-pointer appearance-none rounded-full bg-forest-800 accent-emerald-500"
                aria-label="Monthly revenue managed through Rivet"
              />

              <div className="mt-2 flex justify-between text-xs text-forest-400">
                <span>$9,900</span>
                <span>$200,000</span>
              </div>

              <div className="mt-8 border-t border-forest-800 pt-8">
                <div className="text-2xs font-semibold uppercase tracking-widest2 text-forest-400">
                  Your Rivet bill
                </div>
                <div className="mt-2 font-mono text-4xl font-bold text-emerald-400 sm:text-5xl">
                  {formatCurrency(rivetCost)}
                  <span className="text-lg font-medium text-forest-400">/month</span>
                </div>
                {rivetCost === MIN_MONTHLY && (
                  <p className="mt-2 text-xs text-forest-400">
                    {formatCurrency(MIN_MONTHLY)}/month minimum applies
                  </p>
                )}
              </div>
            </div>
          </Reveal>

          <Reveal delay={2}>
            <div className="mt-8 flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
              <TrendingUp size={20} className="mt-0.5 flex-none text-emerald-400" />
              <p className="text-sm leading-relaxed text-forest-200">
                If Rivet helps you improve that {formatCurrency(revenue)} by just 2%, that's{' '}
                <span className="font-semibold text-emerald-400">{formatCurrency(uplift)}</span> of
                additional revenue, before considering jobs you avoided, hours you saved, or margins
                you protected.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-2xl px-5 text-center sm:px-8">
          <Reveal>
            <h2 className="font-display text-2xl font-bold tracking-tight text-forest-950 sm:text-3xl">
              Ready to take better jobs?
            </h2>
            <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                to="/signup"
                className="group inline-flex items-center justify-center gap-2 rounded-xl bg-forest-900 px-6 py-3.5 text-base font-semibold text-cream-50 transition-all hover:bg-forest-800 hover:shadow-lg"
              >
                Start free
                <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
              <button
                onClick={() => navigate('/')}
                className="inline-flex items-center justify-center rounded-xl border border-cream-300 bg-white px-6 py-3.5 text-base font-semibold text-forest-800 transition-all hover:border-forest-300 hover:bg-cream-50"
              >
                Back to home
              </button>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
