import { Brush, Car, Droplets, Hammer, Home, Leaf, Paintbrush, Sparkles } from 'lucide-react';
import { Reveal } from './Reveal';

const VERTICALS = [
  { label: 'Handyman', icon: Hammer },
  { label: 'Junk removal', icon: Car },
  { label: 'Pressure washing', icon: Droplets },
  { label: 'Mobile detailing', icon: Sparkles },
  { label: 'Cleaning', icon: Brush },
  { label: 'Landscaping', icon: Leaf },
  { label: 'Painting', icon: Paintbrush },
  { label: 'Moving', icon: Home },
];

export function ServiceBusinesses() {
  return (
    <section id="who-its-for" className="border-y border-cream-200 bg-cream-100 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal className="max-w-3xl">
          <h2 className="font-display text-3xl font-bold tracking-tight text-forest-950 sm:text-4xl lg:text-5xl">
            Built for businesses where your time matters.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-forest-600">
            Whether it is a side gig on top of your full-time job or you are branching out on your own and growing, Rivet is built for owner-operated service businesses.
          </p>
        </Reveal>

        <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {VERTICALS.map((v, i) => (
            <Reveal key={v.label} delay={((i % 4) + 1) as 1 | 2 | 3 | 4}>
              <div className="flex items-center gap-3 rounded-xl border border-cream-200 bg-white p-4 transition-all hover:border-forest-200 hover:shadow-sm">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-forest-50 text-forest-600">
                  <v.icon size={18} />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-forest-900">{v.label}</div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
