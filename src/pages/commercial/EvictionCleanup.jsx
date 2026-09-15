import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { CheckCircle, Phone, ArrowRight } from "lucide-react";
import CommercialNav from "../../components/commercial/CommercialNav";
import CommercialFooter from "../../components/commercial/CommercialFooter";
import { makeCanonical, makeTitle, SITE_URL, DEFAULT_OG_IMAGE } from "../../utils/seo";
import { trackEvent } from "../../utils/analytics";

const EVICTION_JSON_LD = {
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
      "serviceType": "Eviction Cleanup",
      "provider": { "@id": "https://gosquatterz.com/#organization" },
      "areaServed": "Northeast Georgia",
      "name": "Eviction Cleanup and Abandoned-Property Removal",
      "url": makeCanonical("/commercial/eviction-cleanup"),
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://gosquatterz.com/" },
        { "@type": "ListItem", "position": 2, "name": "Eviction Cleanup", "item": makeCanonical("/commercial/eviction-cleanup") },
      ],
    },
  ],
};

const ITEMS_HANDLED = [
  "Furniture left behind by former tenants",
  "Personal belongings and clothing",
  "Trash bags, food waste, and kitchen debris",
  "Appliances (refrigerators, washers, microwaves)",
  "Mattresses and box springs",
  "Patio furniture and outdoor items",
  "Miscellaneous junk and accumulated clutter",
];

const DOC_ITEMS = [
  "Before-and-after photos of every area cleared",
  "Itemized list of items removed",
  "Completion notes with access and condition details",
  "Invoice tied to the specific unit and property",
];

const FAQ = [
  {
    q: "How quickly can you complete an eviction cleanout?",
    a: "Turnaround depends on the volume of items, access arrangements, and current scheduling availability. Once your work order is submitted, we'll confirm timing during our review.",
  },
  {
    q: "Can you provide documentation for our records?",
    a: "Yes. Every job includes before-and-after photos, an itemized removal list, and completion notes - useful for property records, insurance purposes, or tenant dispute documentation.",
  },
  {
    q: "Do you serve my area?",
    a: "We serve property managers across Northeast Georgia including Gainesville, Hoschton, Braselton, Buford, Lawrenceville, and surrounding areas. Submit a request through the portal and we'll confirm coverage.",
  },
];

export default function EvictionCleanup() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0a0f0d] text-white">
      <Helmet>
        <title>{makeTitle("Eviction Cleanup for Property Managers")}</title>
        <meta
          name="description"
          content="Fast, documented eviction cleanup and abandoned-property removal for property managers in Northeast Georgia. No on-site presence required."
        />
        <link rel="canonical" href={makeCanonical("/commercial/eviction-cleanup")} />
        <meta property="og:title" content="Eviction Cleanup for Property Managers | Squatterz" />
        <meta
          property="og:description"
          content="Eviction debris removed fast. Before-and-after photos, itemized removal list, and invoice included on every job. Northeast Georgia property managers."
        />
        <meta property="og:url" content={makeCanonical("/commercial/eviction-cleanup")} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={`${SITE_URL}${DEFAULT_OG_IMAGE}`} />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json">{JSON.stringify(EVICTION_JSON_LD)}</script>
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
            <span className="text-white/60">Eviction Cleanup</span>
          </nav>
        </div>

        {/* Hero */}
        <div className="max-w-4xl mx-auto px-5 mb-16">
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 mb-6">
            <span className="text-[#22c55e] text-xs font-semibold uppercase tracking-widest">Commercial Services</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black leading-tight mb-6">
            Eviction Cleanup and{" "}
            <span className="text-[#22c55e]">Abandoned-Property Removal</span>
          </h1>
          <p className="text-white/60 text-lg leading-relaxed max-w-2xl mb-8">
            After an eviction, the unit needs to be cleared quickly so you can assess damage, begin repairs, and get back to generating rental income. Every day the unit sits occupied by debris is revenue lost. We remove everything left behind, document what we find, and give you the records you need.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => {
                trackEvent("commercial_onboarding_start", { location: "eviction_hero" });
                navigate("/portal/start");
              }}
              className="bg-[#22c55e] hover:bg-[#16a34a] text-black font-bold text-sm px-6 py-3 rounded-full transition-colors flex items-center gap-2"
            >
              Request an Estimate <ArrowRight className="w-4 h-4" />
            </button>
            <a
              href="tel:7706282877"
              onClick={() => trackEvent("commercial_phone_click", { location: "eviction_hero" })}
              className="flex items-center gap-2 border border-white/15 hover:border-white/30 text-white font-bold text-sm px-6 py-3 rounded-full transition-colors"
            >
              <Phone className="w-4 h-4 text-[#22c55e]" />
              (770) 628-2877
            </a>
          </div>
        </div>

        {/* Items We Handle */}
        <section className="max-w-4xl mx-auto px-5 mb-16">
          <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-8">
            <h2 className="text-2xl font-black mb-2">What We Remove</h2>
            <p className="text-white/50 text-sm mb-6">
              Former tenants leave behind a wide range of items. We handle all of it - no sorting, no partial loads.
            </p>
            <ul className="grid md:grid-cols-2 gap-3">
              {ITEMS_HANDLED.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <CheckCircle className="w-4 h-4 text-[#22c55e] mt-0.5 flex-shrink-0" />
                  <span className="text-white/80 text-sm">{item}</span>
                </li>
              ))}
            </ul>
            <p className="text-white/35 text-xs mt-6 pt-6 border-t border-white/8">
              We do not handle hazardous materials (chemicals, biohazards, sharps). If you encounter these, we can advise on next steps.
            </p>
          </div>
        </section>

        {/* Documentation */}
        <section className="max-w-4xl mx-auto px-5 mb-16">
          <h2 className="text-2xl font-black mb-2">What You Receive</h2>
          <p className="text-white/50 text-sm mb-6">
            Documentation matters after an eviction - for insurance, property records, and potential tenant disputes. Every job includes:
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            {DOC_ITEMS.map((item) => (
              <div key={item} className="flex items-start gap-3 bg-white/[0.03] border border-white/8 rounded-xl p-4">
                <CheckCircle className="w-4 h-4 text-[#22c55e] mt-0.5 flex-shrink-0" />
                <span className="text-white/80 text-sm">{item}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Access & Coordination */}
        <section className="max-w-4xl mx-auto px-5 mb-16">
          <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-8">
            <h2 className="text-2xl font-black mb-6">Access and Coordination</h2>
            <div className="space-y-6">
              <div>
                <h3 className="font-bold text-white mb-2">Do I need to be on-site?</h3>
                <p className="text-white/55 text-sm leading-relaxed">
                  No. Most eviction cleanouts are completed without anyone from management present. You provide access via a key, lockbox code, or gate code when submitting the work order. We document the unit before touching anything and notify you when the job is complete.
                </p>
              </div>
              <div className="border-t border-white/8 pt-6">
                <h3 className="font-bold text-white mb-2">How do you handle access to the property?</h3>
                <p className="text-white/55 text-sm leading-relaxed">
                  Access details are included in your work order submission - lockbox codes, gate codes, or key pickup arrangements. We keep that information confidential and return or dispose of temporary access as you specify.
                </p>
              </div>
              <div className="border-t border-white/8 pt-6">
                <h3 className="font-bold text-white mb-2">What if there are hazardous materials?</h3>
                <p className="text-white/55 text-sm leading-relaxed">
                  We do not handle chemicals, biohazards, or sharps. If we encounter these during a job, we stop work, photograph the items, and contact you immediately. We can point you toward appropriate licensed contractors for those items.
                </p>
              </div>
            </div>
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
            <h2 className="text-2xl font-black mb-3">Ready to Clear the Unit?</h2>
            <p className="text-white/55 text-sm mb-8 max-w-md mx-auto">
              Create a portal account, add the property, and submit the work order. We'll review and reach out to confirm scheduling.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => {
                  trackEvent("commercial_onboarding_start", { location: "eviction_cta" });
                  navigate("/portal/start");
                }}
                className="bg-[#22c55e] hover:bg-[#16a34a] text-black font-bold text-sm px-8 py-3.5 rounded-full transition-colors"
              >
                Request an Estimate
              </button>
              <a
                href="tel:7706282877"
                onClick={() => trackEvent("commercial_phone_click", { location: "eviction_cta" })}
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
