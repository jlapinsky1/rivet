import { ArrowRight, Building2, Home, ListChecks } from 'lucide-react';
import { Reveal } from './Reveal';
import { WorkOrderCard } from './ProductUI';

export function CommercialSection() {
  return (
    <section id="commercial" className="py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
          <Reveal>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest2 text-emerald-600">
              <Building2 size={15} />
              A stronger pipeline
            </div>
            <h2 className="mt-5 font-display text-3xl font-bold tracking-tight text-forest-950 sm:text-4xl lg:text-5xl">
              Residential work when you want it. Commercial work when it scales.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-forest-600">
              Commercial customers can submit work orders without back-and-forth emails, while Rivet keeps the operational and economic decision on your side.
            </p>

            {/* relationship flow */}
            <div className="mt-9 flex flex-wrap items-center gap-2.5 text-sm">
              <FlowPill icon={Building2} label="Property manager" />
              <ArrowRight size={15} className="text-forest-300" />
              <FlowPill icon={Home} label="Property" />
              <ArrowRight size={15} className="text-forest-300" />
              <FlowPill icon={ListChecks} label="Work order" />
            </div>

            <p className="mt-8 border-l-2 border-emerald-500 pl-4 text-sm leading-relaxed text-forest-600">
              Commercial clients see the request and status, never your internal profit, margin, weekly goal, or decision data.
            </p>
          </Reveal>

          <Reveal delay={1}>
            <WorkOrderCard />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function FlowPill({ icon: Icon, label }: { icon: typeof Building2; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-lg border border-cream-300 bg-cream-50 px-3 py-2 font-medium text-forest-700">
      <Icon size={15} className="text-forest-400" />
      {label}
    </span>
  );
}
