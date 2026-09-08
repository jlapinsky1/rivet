import { Check, TriangleAlert, X } from 'lucide-react';
import { PriceStateCard } from './ProductUI';
import { Reveal } from './Reveal';

export function PriceSection() {
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-5 sm:px-8">
        <Reveal className="text-center">
          <div className="mx-auto flex w-fit items-center gap-2 text-xs font-semibold uppercase tracking-widest2 text-emerald-600">
            <span className="h-px w-6 bg-emerald-500" />
            Price with confidence
            <span className="h-px w-6 bg-emerald-500" />
          </div>
          <h2 className="mt-5 font-display text-3xl font-bold tracking-tight text-forest-950 sm:text-4xl lg:text-5xl">
            See what happens when the price changes.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-forest-600">
            Rivet doesn't just estimate the job. It shows you the price where the job starts to make sense.
          </p>
        </Reveal>

        <div className="relative mt-14">
          {/* connector */}
          <div className="absolute left-[16.66%] right-[16.66%] top-1/2 hidden h-px bg-cream-300 sm:block" />
          <div className="relative grid gap-4 sm:grid-cols-3">
            <Reveal>
              <PriceStateCard
                price="$1,480"
                verdict="take"
                note="Good use of your time"
                icon={<Check size={21} className="text-emerald-600" />}
              />
            </Reveal>
            <Reveal delay={1}>
              <PriceStateCard
                price="$1,250"
                verdict="review"
                note="Below your target earnings rate"
                icon={<TriangleAlert size={21} className="text-amber-600" />}
              />
            </Reveal>
            <Reveal delay={2}>
              <PriceStateCard
                price="$1,050"
                verdict="pass"
                note="Not worth the time"
                icon={<X size={21} className="text-rust-500" />}
              />
            </Reveal>
          </div>
        </div>

        <Reveal delay={3} className="mt-10 text-center">
          <p className="text-base text-forest-500">
            Change the price. See the decision change with it.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
