import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { CheckCircle, Phone, ArrowRight } from "lucide-react";
import CommercialNav from "../../components/commercial/CommercialNav";
import CommercialFooter from "../../components/commercial/CommercialFooter";
import { makeCanonical, makeTitle, SITE_URL, DEFAULT_OG_IMAGE } from "../../utils/seo";
import { trackEvent } from "../../utils/analytics";

const TURNOVER_JSON_LD = {
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
      "serviceType": "Unit Turnover Cleanout",
      "provider": { "@id": "https://gosquatterz.com/#organization" },
      "areaServed": "Northeast Georgia",
      "name": "Unit Turnover Cleanout Service for Property Managers",
      "url": makeCanonical("/commercial/unit-turnover-cleanout"),
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://gosquatterz.com/" },
        { "@type": "ListItem", "position": 2, "name": "Unit Turnover Cleanout", "item": makeCanonical("/commercial/unit-turnover-cleanout") },
      ],
    },
  ],
};

const WHAT_INCLUDED = [
  "Furniture, mattresses, and large items removed",
  "Appliances hauled if not staying with the unit",
  "Trash, bags, and general debris cleared",
  "Patio and balcony items removed",
  "Before-and-after photos delivered automatically",
  "Itemized removal list for property records",
  "Invoice with unit number and property name",
];

const STEPS = [
  {
    num: "01",
    title: "Submit the Work Order",
    desc: "Log into your portal, select the property, enter the unit, describe what needs to go. If you have a batch of units turning over, submit one work order per unit.",
  },
  {
    num: "02",
    title: "Review and Approve",
    desc: "We send a line-item estimate based on the scope. Approve from your phone or portal - no calls back and forth.",
  },
  {
    num: "03",
    title: "We Clear the Unit",
    desc: "Crew arrives during the scheduled window. When access is arranged via lockbox or gate code, we confirm the details before starting.",
  },
  {
    num: "04",
    title: "Records in Your Inbox",
    desc: "Before-and-after photos, completion notes, and invoice delivered automatically when the job is marked complete.",
  },
];

const FAQ = [
  {
    q: "Can you handle multiple units turning over at the same time?",
    a: "Yes. Submit a separate work order for each unit in the portal and we'll coordinate scheduling to minimize disruption. For properties with frequent turnover, we can discuss recurring service arrangements.",
  },
  {
    q: "Do you do any cleaning, painting, or repairs?",
    a: "No - our service is junk and debris removal only. We clear the space so your maintenance and cleaning vendors can work without obstacles.",
  },
  {
    q: "What if the previous tenant left items they want back?",
    a: "We remove what's in the work order. If you need items held or inventoried before removal, note that in the work order description and we'll confirm the approach before starting.",
  },
];

export default function UnitTurnoverCleanout() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0a0f0d] text-white">
      <Helmet>
        <title>{makeTitle("Unit Turnover Cleanout Service for Property Managers")}</title>
        <meta
          name="description"
          content="Unit turnover cleanout for apartment managers and landlords in Northeast Georgia. Furniture, appliances, and debris removed - documentation on every job."
        />
        <link rel="canonical" href={makeCanonical("/commercial/unit-turnover-cleanout")} />
        <meta property="og:title" content="Unit Turnover Cleanout Service | Squatterz Northeast GA" />
        <meta
          property="og:description"
          content="Clear turnover units fast. Submit a work order, approve the estimate, and we'll handle the rest - with photos and invoice included."
        />
        <meta property="og:url" content={makeCanonical("/commercial/unit-turnover-cleanout")} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={`${SITE_URL}${DEFAULT_OG_IMAGE}`} />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json">{JSON.stringify(TURNOVER_JSON_LD)}</script>
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
            <span className="text-white/60">Unit Turnover Cleanout</span>
          </nav>
        </div>

        {/* Hero */}
        <div className="max-w-4xl mx-auto px-5 mb-16">
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 mb-6">
            <span className="text-[#22c55e] text-xs font-semibold uppercase tracking-widest">Commercial Services</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black leading-tight mb-6">
            Unit Turnover Cleanout{" "}
            <span className="text-[#22c55e]">for Property Managers</span>
          </h1>
          <p className="text-white/60 text-lg leading-relaxed max-w-2xl mb-8">
            Every unit turn creates a cleanup need - furniture left behind, appliances that aren't staying, piles of bags and boxes from move-out. We clear the space quickly so your maintenance team can assess damage, your cleaners can start, and the unit can be re-listed without unnecessary delay.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => {
                trackEvent("commercial_onboarding_start", { location: "turnover_hero" });
                navigate("/portal/start");
              }}
              className="bg-[#22c55e] hover:bg-[#16a34a] text-black font-bold text-sm px-6 py-3 rounded-full transition-colors flex items-center gap-2"
            >
              Request an Estimate <ArrowRight className="w-4 h-4" />
            </button>
            <a
              href="tel:7706282877"
              onClick={() => trackEvent("commercial_phone_click", { location: "turnover_hero" })}
              className="flex items-center gap-2 border border-white/15 hover:border-white/30 text-white font-bold text-sm px-6 py-3 rounded-full transition-colors"
            >
              <Phone className="w-4 h-4 text-[#22c55e]" />
              (770) 628-2877
            </a>
          </div>
        </div>

        {/* What's Included */}
        <section className="max-w-4xl mx-auto px-5 mb-16">
          <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-8">
            <h2 className="text-2xl font-black mb-2">What's Included</h2>
            <p className="text-white/50 text-sm mb-6">
              Each cleanout covers removal and documentation - no sorting or prep needed on your end.
            </p>
            <ul className="grid md:grid-cols-2 gap-3">
              {WHAT_INCLUDED.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <CheckCircle className="w-4 h-4 text-[#22c55e] mt-0.5 flex-shrink-0" />
                  <span className="text-white/80 text-sm">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* How It Works */}
        <section className="max-w-4xl mx-auto px-5 mb-16">
          <h2 className="text-2xl font-black mb-8">How It Works</h2>
          <div className="grid md:grid-cols-2 gap-5">
            {STEPS.map(({ num, title, desc }) => (
              <div key={num} className="bg-white/[0.03] border border-white/8 rounded-xl p-6">
                <div className="text-[#22c55e] font-black text-2xl mb-3">{num}</div>
                <h3 className="font-bold text-white mb-2">{title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
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
            <h2 className="text-2xl font-black mb-3">Get the Unit Ready Faster</h2>
            <p className="text-white/55 text-sm mb-8 max-w-md mx-auto">
              Create a portal account, add your property, and submit the first work order. Repeat requests for future turns take only a few clicks.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => {
                  trackEvent("commercial_onboarding_start", { location: "turnover_cta" });
                  navigate("/portal/start");
                }}
                className="bg-[#22c55e] hover:bg-[#16a34a] text-black font-bold text-sm px-8 py-3.5 rounded-full transition-colors"
              >
                Request an Estimate
              </button>
              <a
                href="tel:7706282877"
                onClick={() => trackEvent("commercial_phone_click", { location: "turnover_cta" })}
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
