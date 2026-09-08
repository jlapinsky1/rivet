import { Clock, DollarSign, CalendarX } from 'lucide-react';
import { Reveal } from './Reveal';

const PROBLEMS = [
  {
    icon: Clock,
    title: 'Too much time',
    body: 'A job can pay well and still be a poor use of your limited hours.',
  },
  {
    icon: DollarSign,
    title: 'Too little margin',
    body: 'Revenue means nothing if materials, travel, and labor eat the job alive.',
  },
  {
    icon: CalendarX,
    title: 'Wrong job, wrong week',
    body: 'A job that makes sense Monday might be a terrible fit when your schedule is nearly full.',
  },
];

export function ProblemSection() {
  return (
    <section id="product" className="py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal className="max-w-3xl">
          <h2 className="font-display text-3xl font-bold tracking-tight text-forest-950 sm:text-4xl lg:text-5xl">
            A profitable job can still be a bad job.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-forest-600">
            A job might look fine on paper and still waste your best hours, pull you off pace,
            or leave you underpaid.
          </p>
          <p className="mt-3 text-lg leading-relaxed text-forest-600">
            Most service software tells you what happened <span className="font-semibold text-forest-900">after</span> the job.
            Rivet helps you decide <span className="font-semibold text-forest-900">before</span> you say yes.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-5 sm:grid-cols-3">
          {PROBLEMS.map((p, i) => (
            <Reveal key={p.title} delay={(i + 1) as 1 | 2 | 3}>
              <div className="group h-full rounded-2xl border border-cream-200 bg-white p-7 transition-all hover:border-forest-200 hover:shadow-md">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-forest-50 text-forest-700 transition-colors group-hover:bg-forest-900 group-hover:text-emerald-400">
                  <p.icon size={22} />
                </div>
                <h3 className="mt-5 font-display text-xl font-semibold text-forest-950">
                  {p.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-forest-500">{p.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
