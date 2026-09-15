import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { CheckCircle, Phone, ArrowRight, Home, Trash2, Users, Building2, Package } from "lucide-react";
import CommercialNav from "../../components/commercial/CommercialNav";
import CommercialFooter from "../../components/commercial/CommercialFooter";
import { makeCanonical, makeTitle, SITE_URL, DEFAULT_OG_IMAGE } from "../../utils/seo";
import { trackEvent } from "../../utils/analytics";

const PM_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": ["LocalBusiness", "Organization"],
      "@id": "https://gosquatterz.com/#organization",
      "name": "Squatterz LLC",
      "url": "https://gosquatterz.com",
      "telephone": "+17706282877",
    },
    {
      "@type": "Service",
      "serviceType": "Property Management Cleanup",
      "provider": { "@id": "https://gosquatterz.com/#organization" },
      "areaServed": "Northeast Georgia",
      "name": "Property Management Cleanup Services",
      "url": makeCanonical("/commercial/property-management-cleanup"),
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://gosquatterz.com/" },
        { "@type": "ListItem", "position": 2, "name": "Property Management Cleanup", "item": makeCanonical("/commercial/property-management-cleanup") },
      ],
    },
  ],
};

const SERVICES = [
  {
    icon: Home,
    title: "Apartment Cleanouts",
    desc: "Clear move-out units, abandoned apartments, and turnover debris. Documentation delivered automatically on every job.",
    to: "/commercial/apartment-cleanouts",
  },
  {
    icon: Users,
    title: "Eviction Cleanup",
    desc: "Remove furniture, personal belongings, and debris left after an eviction. Before-and-after photos for property records.",
    to: "/commercial/eviction-cleanup",
  },
  {
    icon: Building2,
    title: "Unit Turnover Cleanout",
    desc: "Get units clear so your maintenance team can assess and your cleaners can start - without waiting on debris removal.",
    to: "/commercial/unit-turnover-cleanout",
  },
  {
    icon: Trash2,
    title: "Bulk Trash Removal",
    desc: "Dumpster overflow, common-area furniture, illegal dumping on lots - removed before code violations or resident complaints escalate.",
    to: "/commercial/bulk-trash-removal",
  },
  {
    icon: Package,
    title: "Recurring Service",
    desc: "High-volume properties can set up recurring work orders through the portal for consistent bulk pickup on a schedule.",
    to: "/portal/start",
  },
];

const ACCOUNT_BENEFITS = [
  "Multi-property account - manage all your locations in one place",
  "Submit work orders in minutes from your phone or desktop",
  "Real-time job status across your entire portfolio",
  "Before-and-after photos and completion notes on every job",
  "Per-unit invoices organized by property for easy recordkeeping",
];

const FAQ = [
  {
    q: "How is pricing determined?",
    a: "We review your work order and send a line-item estimate based on the volume, type of items, and access. You approve before we schedule.",
  },
  {
    q: "Can you coordinate across multiple properties?",
    a: "Yes. Your portal account can hold multiple properties. Submit separate work orders per location and we'll coordinate scheduling.",
  },
  {
    q: "Who do I contact for urgent requests?",
    a: "Call us at (770) 628-2877 or note the urgency in your work order description when submitting through the portal.",
  },
];

const CITIES = [
  "Gainesville", "Hoschton", "Braselton", "Buford",
  "Sugar Hill", "Suwanee", "Winder", "Lawrenceville",
  "Jefferson", "Commerce",
];

export default function PropertyManagementCleanup() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0a0f0d] text-white">
      <Helmet>
        <title>{makeTitle("Property Management Cleanup Services Northeast GA")}</title>
        <meta
          name="description"
          content="Cleanup services for property managers across Northeast Georgia. Apartment cleanouts, eviction debris, unit turnovers, and bulk trash - documented on every job."
        />
        <link rel="canonical" href={makeCanonical("/commercial/property-management-cleanup")} />
        <meta property="og:title" content="Property Management Cleanup Services | Squatterz Northeast GA" />
        <meta
          property="og:description"
          content="One cleanup partner for every property you manage. Turnovers, eviction debris, bulk trash, and recurring service - Northeast Georgia property managers."
        />
        <meta property="og:url" content={makeCanonical("/commercial/property-management-cleanup")} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={`${SITE_URL}${DEFAULT_OG_IMAGE}`} />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json">{JSON.stringify(PM_JSON_LD)}</script>
      </Helmet>

      <CommercialNav />

      <main className="pt-24 pb-20">
        {/* Breadcrumb */}
        <div className="max-w-4xl mx-auto px-5 mb-8">
          <nav className="flex items-center gap-2 text-xs text-white/35">
            <Link to="/" className="hover:text-white/60 transition-colors">Home</Link>
            <span>/</span>
            <Link to="/" className="hover:text-white/60 transition-colors">Home</Link>
            <span>/</span>
            <span className="text-white/60">Property Management Cleanup</span>
          </nav>
        </div>

        {/* Hero */}
        <div className="max-w-4xl mx-auto px-5 mb-16">
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 mb-6">
            <span className="text-[#22c55e] text-xs font-semibold uppercase tracking-widest">Commercial Services</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black leading-tight mb-6">
            Property Management Cleanup Services -{" "}
            <span className="text-[#22c55e]">Northeast Georgia</span>
          </h1>
          <p className="text-white/60 text-lg leading-relaxed max-w-2xl mb-8">
            Property managers deal with a steady stream of cleanup problems - units full of furniture after move-outs, eviction debris that needs to be cleared before inspections, bulk trash piling up around dumpster enclosures, and illegal dumping on lots. We handle all of it, with documentation on every job, through a portal your whole team can use.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => {
                trackEvent("commercial_onboarding_start", { location: "pm_hero" });
                navigate("/portal/start");
              }}
              className="bg-[#22c55e] hover:bg-[#16a34a] text-black font-bold text-sm px-6 py-3 rounded-full transition-colors flex items-center gap-2"
            >
              Request an Estimate <ArrowRight className="w-4 h-4" />
            </button>
            <a
              href="tel:7706282877"
              onClick={() => trackEvent("commercial_phone_click", { location: "pm_hero" })}
              className="flex items-center gap-2 border border-white/15 hover:border-white/30 text-white font-bold text-sm px-6 py-3 rounded-full transition-colors"
            >
              <Phone className="w-4 h-4 text-[#22c55e]" />
              (770) 628-2877
            </a>
          </div>
        </div>

        {/* Services Hub */}
        <section className="max-w-4xl mx-auto px-5 mb-16">
          <h2 className="text-2xl font-black mb-2">Our Services for Property Managers</h2>
          <p className="text-white/50 text-sm mb-8">
            Each service is available on-demand through your portal account - no retainer, no minimum commitment.
          </p>
          <div className="grid md:grid-cols-2 gap-5">
            {SERVICES.map(({ icon: Icon, title, desc, to }) => (
              <Link
                key={title}
                to={to}
                className="group bg-white/[0.03] hover:bg-white/[0.05] border border-white/8 hover:border-white/15 rounded-xl p-6 transition-all"
              >
                <div className="w-10 h-10 rounded-full bg-[#22c55e]/10 flex items-center justify-center mb-4 group-hover:bg-[#22c55e]/15 transition-colors">
                  <Icon className="w-5 h-5 text-[#22c55e]" />
                </div>
                <h3 className="font-bold text-white mb-2 group-hover:text-[#22c55e] transition-colors">{title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{desc}</p>
                <div className="mt-4 text-[#22c55e] text-xs font-semibold flex items-center gap-1">
                  Learn more <ArrowRight className="w-3 h-3" />
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Portal Benefits */}
        <section className="max-w-4xl mx-auto px-5 mb-16">
          <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-8">
            <h2 className="text-2xl font-black mb-2">Your Commercial Portal Account</h2>
            <p className="text-white/50 text-sm mb-6">
              Everything runs through the portal - one account for all your properties, all your jobs, all your documentation.
            </p>
            <ul className="space-y-3">
              {ACCOUNT_BENEFITS.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <CheckCircle className="w-4 h-4 text-[#22c55e] mt-0.5 flex-shrink-0" />
                  <span className="text-white/80 text-sm">{item}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 pt-6 border-t border-white/8">
              <Link
                to="/commercial/client-portal"
                onClick={() => trackEvent("portal_demo_click", { location: "pm_portal_section" })}
                className="text-[#22c55e] text-sm font-semibold hover:underline"
              >
                See how the portal works →
              </Link>
            </div>
          </div>
        </section>

        {/* Service Area */}
        <section className="max-w-4xl mx-auto px-5 mb-16">
          <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-8">
            <h2 className="text-2xl font-black mb-2">Service Area</h2>
            <p className="text-white/50 text-sm mb-6">
              We serve property managers with properties across Northeast Georgia.
            </p>
            <div className="flex flex-wrap gap-2 mb-4">
              {CITIES.map((city) => (
                <span key={city} className="bg-white/5 border border-white/10 rounded-full px-3 py-1 text-xs text-white/70">
                  {city}, GA
                </span>
              ))}
            </div>
            <Link
              to="/commercial/service-area"
              className="text-[#22c55e] text-sm font-semibold hover:underline"
            >
              View full service area →
            </Link>
          </div>
        </section>

        {/* FAQ */}
        <section className="max-w-4xl mx-auto px-5 mb-16">
          <h2 className="text-2xl font-black mb-6">Common Questions</h2>
          <div className="space-y-4">
            {FAQ.map(({ q, a }) => (
              <div key={q} className="bg-white/[0.03] border border-white/8 rounded-xl p-6">
                <h3 className="font-bold text-white mb-2">{q}</h3>
                <p className="text-white/55 text-sm leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="max-w-4xl mx-auto px-5">
          <div className="bg-[#22c55e]/8 border border-[#22c55e]/20 rounded-2xl p-10 text-center">
            <h2 className="text-2xl font-black mb-3">Ready to Get Started?</h2>
            <p className="text-white/55 text-sm mb-8 max-w-md mx-auto">
              Create your commercial account, add your first property, and submit a work order. Future requests take only a few clicks.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => {
                  trackEvent("commercial_onboarding_start", { location: "pm_cta" });
                  navigate("/portal/start");
                }}
                className="bg-[#22c55e] hover:bg-[#16a34a] text-black font-bold text-sm px-8 py-3.5 rounded-full transition-colors"
              >
                Request an Estimate
              </button>
              <a
                href="tel:7706282877"
                onClick={() => trackEvent("commercial_phone_click", { location: "pm_cta" })}
                className="flex items-center gap-2 text-white/70 hover:text-white text-sm font-medium transition-colors"
              >
                <Phone className="w-4 h-4 text-[#22c55e]" />
                (770) 628-2877
              </a>
            </div>
          </div>
        </section>
      </main>

      <CommercialFooter />
    </div>
  );
}
