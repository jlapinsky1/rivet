import { Clock3, DollarSign, MapPin, Target, Wrench } from 'lucide-react';
import { Reveal } from './Reveal';

const QUESTIONS = [
  { icon: Target, text: 'How much do you want to earn per week?' },
  { icon: Clock3, text: 'How many hours do you normally work?' },
  { icon: Wrench, text: 'What is the smallest job worth doing?' },
  { icon: DollarSign, text: 'What does your time need to be worth?' },
  { icon: MapPin, text: 'What service area do you cover?' },
];

export function OnboardingSection() {
  return (
    <section id="how-it-works" className="py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-5 sm:px-8">
        <Reveal className="text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight text-forest-950 sm:text-4xl lg:text-5xl">
            Set it up in minutes.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-forest-600">
            Tell Rivet what matters to your business. It handles the math from there.
          </p>
        </Reveal>

        <div className="mx-auto mt-12 max-w-2xl overflow-hidden rounded-2xl border border-cream-300 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-cream-200 bg-cream-50 px-6 py-4">
            <span className="text-2xs font-semibold uppercase tracking-widest2 text-forest-500">
              Your business basics
            </span>
            <span className="font-mono text-xs text-forest-400">1 of 5</span>
          </div>
          <div className="p-4 sm:p-6">
            <div className="space-y-2">
              {QUESTIONS.map((q, i) => (
                <Reveal key={q.text} delay={((i % 4) + 1) as 1 | 2 | 3 | 4}>
                  <div className="group flex items-center gap-3 rounded-xl border border-cream-200 px-4 py-3.5 transition-colors hover:border-forest-200 hover:bg-cream-50">
                    <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-forest-50 text-forest-500 transition-colors group-hover:bg-emerald-100 group-hover:text-emerald-700">
                      <q.icon size={17} />
                    </div>
                    <span className="text-sm font-medium text-forest-700">{q.text}</span>
                  </div>
                </Reveal>
              ))}
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-cream-200 pt-5">
              <span className="text-xs text-forest-400">You can change these anytime.</span>
              <span className="rounded-lg bg-forest-900 px-4 py-2 text-xs font-semibold text-cream-50">Continue</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
