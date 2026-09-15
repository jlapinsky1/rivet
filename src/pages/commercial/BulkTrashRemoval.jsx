import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Phone, ArrowRight, Trash2, AlertTriangle, RefreshCw, Package } from "lucide-react";
import CommercialNav from "../../components/commercial/CommercialNav";
import CommercialFooter from "../../components/commercial/CommercialFooter";
import { makeCanonical, makeTitle, SITE_URL, DEFAULT_OG_IMAGE } from "../../utils/seo";
import { trackEvent } from "../../utils/analytics";

const BULK_JSON_LD = {
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
      "serviceType": "Bulk Trash Removal",
      "provider": { "@id": "https://gosquatterz.com/#organization" },
      "areaServed": "Northeast Georgia",
      "name": "Bulk Trash Removal for Apartments and Commercial Properties",
      "url": makeCanonical("/commercial/bulk-trash-removal"),
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://gosquatterz.com/" },
        { "@type": "ListItem", "position": 2, "name": "Bulk Trash Removal", "item": makeCanonical("/commercial/bulk-trash-removal") },
      ],
    },
  ],
};

const SCENARIOS = [
  {
    icon: Trash2,
    title: "Dumpster Overflow",
    desc: "Tenants pile furniture and large items beside the dumpster enclosure when municipal collection won't take them. We remove the overflow before it becomes a code violation or resident complaint.",
  },
  {
    icon: Package,
    title: "Hallway and Common-Area Furniture",
    desc: "Mattresses, sofas, and appliances left in stairwells, breezeways, or parking lots create liability and look unprofessional. We clear common areas fast.",
  },
  {
    icon: AlertTriangle,
    title: "Illegal Dumping on Lots",
    desc: "Outside parties dump on your property without permission. We remove it, document what was there, and clear the area so it's less of a target.",
    to: "/commercial/illegal-dumping-removal",
  },
  {
    icon: RefreshCw,
    title: "Recurring Bulk Pickup",
    desc: "Properties with frequent bulk item accumulation benefit from a recurring arrangement. Submit a standing request in your portal and we'll schedule accordingly.",
  },
];

const FAQ = [
  {
    q: "What counts as bulk trash?",
    a: "Any large item that municipal collection won't take - mattresses, sofas, appliances, televisions, exercise equipment, and similar items. We also remove piles of general junk and debris that exceed normal collection limits.",
  },
  {
    q: "Can you set up recurring bulk pickups for my property?",
    a: "Yes. If your property regularly accumulates bulk items, note in your work order that you're interested in a recurring schedule and we'll discuss options when we confirm your first request.",
  },
  {
    q: "Do you remove items from inside units, or only common areas?",
    a: "Both. We can clear common areas, dumpster enclosures, parking lots, and individual units - submit a single work order and describe all the locations that need attention.",
  },
];

export default function BulkTrashRemoval() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0a0f0d] text-white">
      <Helmet>
        <title>{makeTitle("Bulk Trash Removal for Property Managers")}</title>
        <meta
          name="description"
          content="Bulk trash removal for apartments and commercial properties in Northeast Georgia. Dumpster overflow, illegal dumping, hallway furniture - cleared fast."
        />
        <link rel="canonical" href={makeCanonical("/commercial/bulk-trash-removal")} />
        <meta property="og:title" content="Bulk Trash Removal for Property Managers | Squatterz" />
        <meta
          property="og:description"
          content="Dumpster overflow, common-area furniture, illegal dumping - we remove bulk trash from apartment communities and commercial properties across Northeast Georgia."
        />
        <meta property="og:url" content={makeCanonical("/commercial/bulk-trash-removal")} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={`${SITE_URL}${DEFAULT_OG_IMAGE}`} />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json">{JSON.stringify(BULK_JSON_LD)}</script>
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
            <span className="text-white/60">Bulk Trash Removal</span>
          </nav>
        </div>

        {/* Hero */}
        <div className="max-w-4xl mx-auto px-5 mb-16">
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 mb-6">
            <span className="text-[#22c55e] text-xs font-semibold uppercase tracking-widest">Commercial Services</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black leading-tight mb-6">
            Bulk Trash Removal for{" "}
            <span className="text-[#22c55e]">Apartments and Commercial Properties</span>
          </h1>
          <p className="text-white/60 text-lg leading-relaxed max-w-2xl mb-8">
            Dumpster overflow, furniture piled in common areas, illegal dumping on your lot - these problems show up without warning and create code violations, resident complaints, and liability if left unresolved. We remove bulk items from your property, document the job, and clear the area so it doesn't become a recurring issue.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => {
                trackEvent("commercial_onboarding_start", { location: "bulk_hero" });
                navigate("/portal/start");
              }}
              className="bg-[#22c55e] hover:bg-[#16a34a] text-black font-bold text-sm px-6 py-3 rounded-full transition-colors flex items-center gap-2"
            >
              Request an Estimate <ArrowRight className="w-4 h-4" />
            </button>
            <a
              href="tel:7706282877"
              onClick={() => trackEvent("commercial_phone_click", { location: "bulk_hero" })}
              className="flex items-center gap-2 border border-white/15 hover:border-white/30 text-white font-bold text-sm px-6 py-3 rounded-full transition-colors"
            >
              <Phone className="w-4 h-4 text-[#22c55e]" />
              (770) 628-2877
            </a>
          </div>
        </div>

        {/* Scenarios */}
        <section className="max-w-4xl mx-auto px-5 mb-16">
          <h2 className="text-2xl font-black mb-2">Common Scenarios We Handle</h2>
          <p className="text-white/50 text-sm mb-8">
            Bulk trash shows up in different ways at different properties. We handle all of them.
          </p>
          <div className="grid md:grid-cols-2 gap-5">
            {SCENARIOS.map(({ icon: Icon, title, desc, to }) => (
              <div key={title} className="bg-white/[0.03] border border-white/8 rounded-xl p-6">
                <div className="w-10 h-10 rounded-full bg-[#22c55e]/10 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-[#22c55e]" />
                </div>
                <h3 className="font-bold text-white mb-2">{title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{desc}</p>
                {to && (
                  <Link
                    to={to}
                    className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#22c55e] hover:text-white transition-colors"
                  >
                    Learn more <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Recurring */}
        <section className="max-w-4xl mx-auto px-5 mb-16">
          <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-8">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-[#22c55e]/10 flex items-center justify-center flex-shrink-0">
                <RefreshCw className="w-5 h-5 text-[#22c55e]" />
              </div>
              <div>
                <h2 className="text-xl font-black mb-2">Recurring Service for High-Volume Properties</h2>
                <p className="text-white/55 text-sm leading-relaxed">
                  Some properties - large apartment communities, HOAs near move-in/move-out peaks, commercial lots subject to ongoing dumping - generate bulk trash on a predictable schedule. After your first work order, let us know if you'd like to discuss a recurring arrangement. We'll work with your portal account to set up regular requests so you're not resubmitting the same order every month.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="max-w-4xl mx-auto px-5 mb-16">
          <p className="text-sm text-white/45 mb-6">
            Need help with items dumped by outside parties? See our{" "}
            <Link to="/commercial/illegal-dumping-removal" className="text-[#22c55e] hover:text-white font-medium transition-colors">
              illegal dumping removal page
            </Link>
            .
          </p>
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
            <h2 className="text-2xl font-black mb-3">Need Bulk Items Removed?</h2>
            <p className="text-white/55 text-sm mb-8 max-w-md mx-auto">
              Create a portal account, add the property, and describe what needs to go. We'll review and reach out to confirm scheduling.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => {
                  trackEvent("commercial_onboarding_start", { location: "bulk_cta" });
                  navigate("/portal/start");
                }}
                className="bg-[#22c55e] hover:bg-[#16a34a] text-black font-bold text-sm px-8 py-3.5 rounded-full transition-colors"
              >
                Request an Estimate
              </button>
              <a
                href="tel:7706282877"
                onClick={() => trackEvent("commercial_phone_click", { location: "bulk_cta" })}
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
