import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { CheckCircle, Phone, ArrowRight, ClipboardList, Camera, FileText, Receipt } from "lucide-react";
import CommercialNav from "../../components/commercial/CommercialNav";
import CommercialFooter from "../../components/commercial/CommercialFooter";
import { makeCanonical, makeTitle, SITE_URL, DEFAULT_OG_IMAGE } from "../../utils/seo";
import { trackEvent } from "../../utils/analytics";

const APARTMENT_JSON_LD = {
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
      "serviceType": "Apartment Cleanout",
      "provider": { "@id": "https://gosquatterz.com/#organization" },
      "areaServed": "Northeast Georgia",
      "name": "Apartment Cleanouts for Property Managers and Landlords",
      "url": makeCanonical("/commercial/apartment-cleanouts"),
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://gosquatterz.com/" },
        { "@type": "ListItem", "position": 2, "name": "Apartment Cleanouts", "item": makeCanonical("/commercial/apartment-cleanouts") },
      ],
    },
  ],
};

const ITEMS_REMOVED = [
  "Mattresses and box springs",
  "Furniture (sofas, beds, dressers, tables)",
  "Appliances (refrigerators, washers, dryers, microwaves)",
  "Trash bags and kitchen/bathroom debris",
  "Patio and balcony furniture",
  "Flooring scraps and light renovation debris",
  "Personal items and miscellaneous junk",
  "Boxes, packing materials, and clutter",
];

const STEPS = [
  {
    num: "01",
    title: "Submit a Work Order",
    desc: "Log into your portal, select the property, enter the unit number, describe what needs to go, and add any access details. Attach photos if you have them.",
  },
  {
    num: "02",
    title: "Review and Approve",
    desc: "We review the request and send a line-item estimate. Approve from your phone - no phone calls required.",
  },
  {
    num: "03",
    title: "We Clear the Unit",
    desc: "Our crew arrives during the scheduled window. No one from your team needs to be on-site if access is provided via lockbox or gate code.",
  },
  {
    num: "04",
    title: "Documentation Delivered",
    desc: "Before-and-after photos, completion notes, and an invoice tied to the specific unit land in your portal and email.",
  },
];

const DOC_ITEMS = [
  { icon: Camera, label: "Before-and-after photos of every cleared area" },
  { icon: ClipboardList, label: "Itemized list of items removed" },
  { icon: FileText, label: "Completion notes with unit condition details" },
  { icon: Receipt, label: "Invoice tied to the unit and property" },
];

const FAQ = [
  {
    q: "How long does an apartment cleanout take?",
    a: "A standard one-bedroom or studio unit typically clears in a few hours. Larger units or units with heavy furniture and appliances take longer. We'll give you an estimated window when we confirm your work order.",
  },
  {
    q: "Do I need to be present during the cleanout?",
    a: "In many cases, cleanouts are completed without anyone from management on-site when access is arranged in advance via lockbox, gate code, or key pickup. Note the access details in your work order and we'll confirm the arrangement before scheduling.",
  },
  {
    q: "Can you invoice per unit with the unit number on the invoice?",
    a: "Yes. Every invoice includes the property name and unit number so your records stay organized by property.",
  },
  {
    q: "What items do you not accept?",
    a: "We do not accept hazardous materials, chemicals, biohazards, or sharps. If we encounter these during a job we'll document and contact you for direction.",
  },
];

const CITIES = [
  "Gainesville", "Hoschton", "Braselton", "Buford",
  "Sugar Hill", "Suwanee", "Winder", "Lawrenceville",
];

export default function ApartmentCleanouts() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0a0f0d] text-white">
      <Helmet>
        <title>{makeTitle("Apartment Cleanout Service for Property Managers")}</title>
        <meta
          name="description"
          content="Apartment cleanout service for property managers and landlords in Northeast Georgia. Move-outs, turnovers, abandoned units - documented on every job."
        />
        <link rel="canonical" href={makeCanonical("/commercial/apartment-cleanouts")} />
        <meta property="og:title" content="Apartment Cleanout Service for Property Managers | Squatterz" />
        <meta
          property="og:description"
          content="Clear move-out units, abandoned apartments, and turnover debris fast. Before-and-after photos and per-unit invoices on every job. Northeast Georgia."
        />
        <meta property="og:url" content={makeCanonical("/commercial/apartment-cleanouts")} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={`${SITE_URL}${DEFAULT_OG_IMAGE}`} />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json">{JSON.stringify(APARTMENT_JSON_LD)}</script>
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
            <span className="text-white/60">Apartment Cleanouts</span>
          </nav>
        </div>

        {/* Hero */}
        <div className="max-w-4xl mx-auto px-5 mb-16">
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 mb-6">
            <span className="text-[#22c55e] text-xs font-semibold uppercase tracking-widest">Commercial Services</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black leading-tight mb-6">
            Apartment Cleanouts for{" "}
            <span className="text-[#22c55e]">Property Managers and Landlords</span>
          </h1>
          <p className="text-white/60 text-lg leading-relaxed max-w-2xl mb-8">
            Move-outs leave behind furniture, appliances, trash, and everything in between. Whether it's a voluntary move-out, an eviction, or an abandoned unit, we clear the space so your maintenance team can assess and prepare it for the next tenant.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => {
                trackEvent("commercial_onboarding_start", { location: "apt_hero" });
                navigate("/portal/start");
              }}
              className="bg-[#22c55e] hover:bg-[#16a34a] text-black font-bold text-sm px-6 py-3 rounded-full transition-colors flex items-center gap-2"
            >
              Request an Estimate <ArrowRight className="w-4 h-4" />
            </button>
            <a
              href="tel:7706282877"
              onClick={() => trackEvent("commercial_phone_click", { location: "apt_hero" })}
              className="flex items-center gap-2 border border-white/15 hover:border-white/30 text-white font-bold text-sm px-6 py-3 rounded-full transition-colors"
            >
              <Phone className="w-4 h-4 text-[#22c55e]" />
              (770) 628-2877
            </a>
          </div>
        </div>

        {/* Items Removed */}
        <section className="max-w-4xl mx-auto px-5 mb-16">
          <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-8">
            <h2 className="text-2xl font-black mb-2">Common Items We Remove</h2>
            <p className="text-white/50 text-sm mb-6">
              No sorting required on your end. We load everything that needs to go.
            </p>
            <ul className="grid md:grid-cols-2 gap-3">
              {ITEMS_REMOVED.map((item) => (
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
          <h2 className="text-2xl font-black mb-2">How It Works</h2>
          <p className="text-white/50 text-sm mb-8">
            Every cleanout goes through the same process - submit, approve, we clear, you get documentation.
          </p>
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

        {/* Documentation */}
        <section className="max-w-4xl mx-auto px-5 mb-16">
          <h2 className="text-2xl font-black mb-2">What's Included on Every Job</h2>
          <p className="text-white/50 text-sm mb-6">
            Documentation delivered to your portal and inbox automatically when the job is marked complete.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            {DOC_ITEMS.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-start gap-3 bg-white/[0.03] border border-white/8 rounded-xl p-4">
                <Icon className="w-4 h-4 text-[#22c55e] mt-0.5 flex-shrink-0" />
                <span className="text-white/80 text-sm">{label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Service Area */}
        <section className="max-w-4xl mx-auto px-5 mb-16">
          <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-8">
            <h2 className="text-2xl font-black mb-2">Service Area</h2>
            <p className="text-white/50 text-sm mb-6">
              We serve apartment communities and rental properties across Northeast Georgia.
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
            <h2 className="text-2xl font-black mb-3">Ready to Clear the Unit?</h2>
            <p className="text-white/55 text-sm mb-8 max-w-md mx-auto">
              Create a portal account, add your property, and submit a work order. Future requests take only a few clicks.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => {
                  trackEvent("commercial_onboarding_start", { location: "apt_cta" });
                  navigate("/portal/start");
                }}
                className="bg-[#22c55e] hover:bg-[#16a34a] text-black font-bold text-sm px-8 py-3.5 rounded-full transition-colors"
              >
                Request an Estimate
              </button>
              <a
                href="tel:7706282877"
                onClick={() => trackEvent("commercial_phone_click", { location: "apt_cta" })}
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
