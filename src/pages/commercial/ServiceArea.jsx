import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Phone, ArrowRight, MapPin } from "lucide-react";
import CommercialNav from "../../components/commercial/CommercialNav";
import CommercialFooter from "../../components/commercial/CommercialFooter";
import { makeCanonical, makeTitle, SITE_URL, DEFAULT_OG_IMAGE } from "../../utils/seo";
import { trackEvent } from "../../utils/analytics";

const SERVICE_AREA_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": ["LocalBusiness", "Organization"],
      "@id": "https://gosquatterz.com/#organization",
      "name": "Squatterz LLC",
      "url": "https://gosquatterz.com",
      "telephone": "+17706282877",
      "areaServed": [
        { "@type": "City", "name": "Hoschton", "containedIn": { "@type": "State", "name": "Georgia" } },
        { "@type": "City", "name": "Braselton", "containedIn": { "@type": "State", "name": "Georgia" } },
        { "@type": "City", "name": "Gainesville", "containedIn": { "@type": "State", "name": "Georgia" } },
        { "@type": "City", "name": "Buford", "containedIn": { "@type": "State", "name": "Georgia" } },
        { "@type": "City", "name": "Sugar Hill", "containedIn": { "@type": "State", "name": "Georgia" } },
        { "@type": "City", "name": "Suwanee", "containedIn": { "@type": "State", "name": "Georgia" } },
        { "@type": "City", "name": "Winder", "containedIn": { "@type": "State", "name": "Georgia" } },
        { "@type": "City", "name": "Lawrenceville", "containedIn": { "@type": "State", "name": "Georgia" } },
        { "@type": "City", "name": "Jefferson", "containedIn": { "@type": "State", "name": "Georgia" } },
        { "@type": "City", "name": "Commerce", "containedIn": { "@type": "State", "name": "Georgia" } },
        { "@type": "City", "name": "Oakwood", "containedIn": { "@type": "State", "name": "Georgia" } },
        { "@type": "City", "name": "Flowery Branch", "containedIn": { "@type": "State", "name": "Georgia" } },
        { "@type": "City", "name": "Cumming", "containedIn": { "@type": "State", "name": "Georgia" } },
        { "@type": "City", "name": "Dawsonville", "containedIn": { "@type": "State", "name": "Georgia" } },
      ],
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://gosquatterz.com/" },
        { "@type": "ListItem", "position": 2, "name": "Service Area", "item": makeCanonical("/commercial/service-area") },
      ],
    },
  ],
};

const CITIES = [
  { name: "Hoschton", county: "Jackson County" },
  { name: "Braselton", county: "Jackson / Gwinnett" },
  { name: "Gainesville", county: "Hall County" },
  { name: "Buford", county: "Gwinnett / Hall" },
  { name: "Sugar Hill", county: "Gwinnett County" },
  { name: "Suwanee", county: "Gwinnett County" },
  { name: "Winder", county: "Barrow County" },
  { name: "Lawrenceville", county: "Gwinnett County" },
  { name: "Jefferson", county: "Jackson County" },
  { name: "Commerce", county: "Jackson County" },
  { name: "Oakwood", county: "Hall County" },
  { name: "Flowery Branch", county: "Hall County" },
  { name: "Cumming", county: "Forsyth County" },
  { name: "Dawsonville", county: "Dawson County" },
];

const SERVICES = [
  { label: "Apartment Cleanouts", to: "/commercial/apartment-cleanouts" },
  { label: "Eviction Cleanup", to: "/commercial/eviction-cleanup" },
  { label: "Unit Turnover Cleanout", to: "/commercial/unit-turnover-cleanout" },
  { label: "Bulk Trash Removal", to: "/commercial/bulk-trash-removal" },
  { label: "Illegal Dumping Removal", to: "/commercial/illegal-dumping-removal" },
  { label: "Property Management Cleanup", to: "/commercial/property-management-cleanup" },
];

export default function ServiceArea() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0a0f0d] text-white">
      <Helmet>
        <title>{makeTitle("Service Area - Northeast Georgia Junk Removal")}</title>
        <meta
          name="description"
          content="Squatterz serves property managers across Northeast Georgia - Gainesville, Hoschton, Braselton, Buford, Lawrenceville, and surrounding communities."
        />
        <link rel="canonical" href={makeCanonical("/commercial/service-area")} />
        <meta property="og:title" content="Service Area - Northeast Georgia Junk Removal | Squatterz" />
        <meta
          property="og:description"
          content="Commercial junk removal and property cleanup serving Hall, Jackson, Gwinnett, Barrow, Forsyth, and Dawson counties in Northeast Georgia."
        />
        <meta property="og:url" content={makeCanonical("/commercial/service-area")} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={`${SITE_URL}${DEFAULT_OG_IMAGE}`} />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json">{JSON.stringify(SERVICE_AREA_JSON_LD)}</script>
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
            <span className="text-white/60">Service Area</span>
          </nav>
        </div>

        {/* Hero */}
        <div className="max-w-4xl mx-auto px-5 mb-16">
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 mb-6">
            <MapPin className="w-3.5 h-3.5 text-[#22c55e]" />
            <span className="text-[#22c55e] text-xs font-semibold uppercase tracking-widest">Service Area</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black leading-tight mb-6">
            Junk Removal Service Area -{" "}
            <span className="text-[#22c55e]">Northeast Georgia</span>
          </h1>
          <p className="text-white/60 text-lg leading-relaxed max-w-2xl mb-8">
            We're based in Braselton, GA and serve commercial properties within approximately 50 miles. Availability depends on your address, the scope of the job, scheduling, and disposal requirements for the items being removed. If you're unsure whether we cover your property, create a portal account and we'll confirm coverage when we review your first request.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => {
                trackEvent("commercial_onboarding_start", { location: "service_area_hero" });
                navigate("/portal/start");
              }}
              className="bg-[#22c55e] hover:bg-[#16a34a] text-black font-bold text-sm px-6 py-3 rounded-full transition-colors flex items-center gap-2"
            >
              Request an Estimate <ArrowRight className="w-4 h-4" />
            </button>
            <a
              href="tel:7706282877"
              onClick={() => trackEvent("commercial_phone_click", { location: "service_area_hero" })}
              className="flex items-center gap-2 border border-white/15 hover:border-white/30 text-white font-bold text-sm px-6 py-3 rounded-full transition-colors"
            >
              <Phone className="w-4 h-4 text-[#22c55e]" />
              (770) 628-2877
            </a>
          </div>
        </div>

        {/* Cities Grid */}
        <section className="max-w-4xl mx-auto px-5 mb-16">
          <h2 className="text-2xl font-black mb-2">Priority Service Cities</h2>
          <p className="text-white/50 text-sm mb-8">
            The communities below are within our primary service range. We serve Hall, Jackson, Gwinnett, Barrow, Forsyth, and Dawson counties.
          </p>
          <div className="grid md:grid-cols-2 gap-3">
            {CITIES.map(({ name, county }) => (
              <div key={name} className="flex items-center justify-between bg-white/[0.03] border border-white/8 rounded-xl px-5 py-4">
                <div className="flex items-center gap-3">
                  <MapPin className="w-3.5 h-3.5 text-[#22c55e] flex-shrink-0" />
                  <span className="font-semibold text-sm text-white">{name}, GA</span>
                </div>
                <span className="text-white/35 text-xs">{county}</span>
              </div>
            ))}
          </div>
          <p className="text-white/30 text-xs mt-4">
            Properties outside these cities may still be within our range. Submit a request and we'll confirm.
          </p>
        </section>

        {/* Services Available */}
        <section className="max-w-4xl mx-auto px-5 mb-16">
          <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-8">
            <h2 className="text-2xl font-black mb-2">Services Available in This Area</h2>
            <p className="text-white/50 text-sm mb-6">
              All commercial cleanup services are available across our service area, subject to scheduling and item disposal requirements.
            </p>
            <ul className="space-y-2">
              {SERVICES.map(({ label, to }) => (
                <li key={label}>
                  <Link
                    to={to}
                    className="flex items-center gap-2 text-sm text-white/70 hover:text-[#22c55e] transition-colors py-1"
                  >
                    <ArrowRight className="w-3.5 h-3.5 text-[#22c55e]" />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ZIP / Coverage Question */}
        <section className="max-w-4xl mx-auto px-5 mb-16">
          <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-8">
            <h2 className="text-2xl font-black mb-3">Not Sure if We Cover Your ZIP?</h2>
            <p className="text-white/55 text-sm leading-relaxed mb-6">
              Call us at{" "}
              <a
                href="tel:7706282877"
                onClick={() => trackEvent("commercial_phone_click", { location: "service_area_zip_check" })}
                className="text-[#22c55e] font-semibold hover:underline"
              >
                (770) 628-2877
              </a>{" "}
              or create a portal account and submit your first request. When we review it, we'll confirm whether your property is within our service area. If it's not, we'll let you know right away so you're not waiting on a job that can't be scheduled.
            </p>
            <button
              onClick={() => {
                trackEvent("commercial_onboarding_start", { location: "service_area_zip_check" });
                navigate("/portal/start");
              }}
              className="bg-[#22c55e] hover:bg-[#16a34a] text-black font-bold text-sm px-6 py-3 rounded-full transition-colors"
            >
              Create a Portal Account
            </button>
          </div>
        </section>

        {/* Disposal Note */}
        <section className="max-w-4xl mx-auto px-5 mb-16">
          <div className="border border-white/8 rounded-xl p-5">
            <p className="text-white/40 text-xs leading-relaxed">
              <strong className="text-white/60">Note on disposal:</strong> Certain items and materials require specific disposal facilities - appliances with refrigerants, electronics, tires, and similar items. Availability may vary depending on current facility capacity and regulations in your area. We'll note any limitations when reviewing your work order.
            </p>
          </div>
        </section>

        {/* CTA */}
        <section className="max-w-4xl mx-auto px-5">
          <div className="bg-[#22c55e]/8 border border-[#22c55e]/20 rounded-2xl p-10 text-center">
            <h2 className="text-2xl font-black mb-3">Ready to Get Started?</h2>
            <p className="text-white/55 text-sm mb-8 max-w-md mx-auto">
              Create your commercial account and submit your first cleanup request. We'll confirm coverage and scheduling when we review it.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => {
                  trackEvent("commercial_onboarding_start", { location: "service_area_cta" });
                  navigate("/portal/start");
                }}
                className="bg-[#22c55e] hover:bg-[#16a34a] text-black font-bold text-sm px-8 py-3.5 rounded-full transition-colors"
              >
                Request an Estimate
              </button>
              <a
                href="tel:7706282877"
                onClick={() => trackEvent("commercial_phone_click", { location: "service_area_cta" })}
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
