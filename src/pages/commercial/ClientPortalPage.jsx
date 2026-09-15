import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  Phone, ArrowRight, Building2, ClipboardList, BarChart3,
  Camera, Receipt, CheckCircle, Clock, Truck, CircleCheck,
} from "lucide-react";
import CommercialNav from "../../components/commercial/CommercialNav";
import CommercialFooter from "../../components/commercial/CommercialFooter";
import { makeCanonical, makeTitle, SITE_URL, DEFAULT_OG_IMAGE } from "../../utils/seo";
import { trackEvent } from "../../utils/analytics";

const PORTAL_JSON_LD = {
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
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://gosquatterz.com/" },
        { "@type": "ListItem", "position": 2, "name": "Client Portal", "item": makeCanonical("/commercial/client-portal") },
      ],
    },
  ],
};

const FEATURES = [
  {
    icon: Building2,
    title: "Multi-Property Account Management",
    desc: "Add every property you manage to a single account. Each property has its own name, address, contact details, and job history. No separate login for each location - one account, one view.",
  },
  {
    icon: ClipboardList,
    title: "Work Order Submission",
    desc: "Submit a cleanup request in minutes from your phone or desktop. Describe what needs to go, attach photos, note the unit and access details, and set a preferred date. We review and send a line-item estimate before scheduling anything.",
  },
  {
    icon: BarChart3,
    title: "Portfolio-Wide Job Visibility",
    desc: "See the status of every active and past job across all your properties in one view. Jobs move through statuses - Requested, Under Review, Scheduled, In Progress, Completed - and you're notified at each step.",
  },
  {
    icon: Camera,
    title: "Completion Documentation",
    desc: "Every completed job includes before-and-after photos, itemized removal notes, and access details. Documentation is stored in the portal and emailed automatically - no chasing down records.",
  },
  {
    icon: Receipt,
    title: "Invoice Management",
    desc: "Invoices are tied to the specific property and unit, organized in your portal by date and status. Paid and outstanding invoices are clearly labeled so your accounting stays clean.",
  },
];

const ONBOARDING_STEPS = [
  { num: "1", title: "Create your account", desc: "Enter your name, company, email, and phone. Takes about 90 seconds." },
  { num: "2", title: "Add your first property", desc: "Property name, address, and onsite contact details. Add more properties any time." },
  { num: "3", title: "Submit a work order", desc: "Describe the cleanup needed, attach photos if you have them, and set a preferred date." },
  { num: "4", title: "Review and submit", desc: "Confirm the details, submit, and we'll reach out to confirm scheduling." },
  { num: "5", title: "You're in", desc: "Your property and job are visible in the portal. Repeat requests take only a few clicks." },
];

const MOCK_PROPERTIES = [
  {
    name: "Oakwood Ridge Apartments",
    address: "1240 Ridge Blvd, Oakwood, GA 30566",
    jobs: 4,
    lastJob: "Unit 14B Cleanout",
    status: "completed",
  },
  {
    name: "Braselton Commons",
    address: "850 Braselton Hwy, Braselton, GA 30517",
    jobs: 2,
    lastJob: "Dumpster Area Overflow",
    status: "in_progress",
  },
  {
    name: "Commerce Street Townhomes",
    address: "320 Commerce St, Commerce, GA 30529",
    jobs: 1,
    lastJob: "Unit 7 Eviction Cleanout",
    status: "scheduled",
  },
];

const MOCK_JOBS = [
  { id: "A1B2C3D4", property: "Oakwood Ridge", unit: "Unit 14B", service: "Apartment Cleanout", status: "completed", statusColor: "text-[#22c55e]", statusBg: "bg-[#22c55e]/10" },
  { id: "E5F6G7H8", property: "Braselton Commons", unit: "Dumpster Area", service: "Bulk Trash Removal", status: "in_progress", statusColor: "text-blue-400", statusBg: "bg-blue-400/10" },
  { id: "I9J0K1L2", property: "Commerce Street", unit: "Unit 7", service: "Eviction Cleanup", status: "scheduled", statusColor: "text-yellow-400", statusBg: "bg-yellow-400/10" },
  { id: "M3N4O5P6", property: "Oakwood Ridge", unit: "Unit 22A", service: "Unit Turnover", status: "under_review", statusColor: "text-white/60", statusBg: "bg-white/5" },
];

const STATUS_LABEL = {
  completed: "Completed",
  in_progress: "In Progress",
  scheduled: "Scheduled",
  under_review: "Under Review",
};

const MOCK_INVOICES = [
  { id: "INV-2024-041", property: "Oakwood Ridge", unit: "Unit 14B", amount: "$285.00", status: "paid", statusColor: "text-[#22c55e]" },
  { id: "INV-2024-038", property: "Braselton Commons", unit: "Dumpster Area", amount: "$195.00", status: "outstanding", statusColor: "text-yellow-400" },
];

const FAQ = [
  {
    q: "Who can use the portal?",
    a: "Any property manager, landlord, HOA manager, or commercial property operator who needs recurring cleanup services. There's no minimum number of properties or jobs required to create an account.",
  },
  {
    q: "Is there a cost to create an account?",
    a: "No. Creating an account and submitting work orders is free. You only pay for the jobs you approve.",
  },
  {
    q: "How do I add a second property?",
    a: "After your account is set up, you can add additional properties at any time from your portal dashboard. Each property gets its own work order history and documentation.",
  },
];

export default function ClientPortalPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0a0f0d] text-white">
      <Helmet>
        <title>{makeTitle("Property Management Cleanup Portal")}</title>
        <meta
          name="description"
          content="The Squatterz client portal for property managers - one dashboard for all your properties, work orders, documentation, and invoices."
        />
        <link rel="canonical" href={makeCanonical("/commercial/client-portal")} />
        <meta property="og:title" content="Property Management Cleanup Portal | Squatterz" />
        <meta
          property="og:description"
          content="Submit cleanup requests, track job status, access before-and-after photos, and manage invoices - all from one portal built for property managers."
        />
        <meta property="og:url" content={makeCanonical("/commercial/client-portal")} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={`${SITE_URL}${DEFAULT_OG_IMAGE}`} />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json">{JSON.stringify(PORTAL_JSON_LD)}</script>
      </Helmet>

      <CommercialNav />

      <main className="pt-24 pb-20">
        {/* Breadcrumb */}
        <div className="max-w-5xl mx-auto px-5 mb-8">
          <nav className="flex items-center gap-2 text-xs text-white/35">
            <Link to="/" className="hover:text-white/60 transition-colors">Home</Link>
            <span>/</span>
            <Link to="/" className="hover:text-white/60 transition-colors">Home</Link>
            <span>/</span>
            <span className="text-white/60">Client Portal</span>
          </nav>
        </div>

        {/* Hero */}
        <div className="max-w-5xl mx-auto px-5 mb-16">
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 mb-6">
            <span className="text-[#22c55e] text-xs font-semibold uppercase tracking-widest">Client Portal</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black leading-tight mb-6">
            The Squatterz Client Portal{" "}
            <span className="text-[#22c55e]">for Property Managers</span>
          </h1>
          <p className="text-white/60 text-lg leading-relaxed max-w-2xl mb-8">
            One dashboard for every property and every work order. Submit cleanup requests, track job status, access documentation, and manage invoices - without email chains or phone calls for routine requests.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => {
                trackEvent("commercial_onboarding_start", { location: "portal_page_hero" });
                navigate("/portal/start");
              }}
              className="bg-[#22c55e] hover:bg-[#16a34a] text-black font-bold text-sm px-6 py-3 rounded-full transition-colors flex items-center gap-2"
            >
              Request an Estimate <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate("/portal/login")}
              className="border border-white/15 hover:border-white/30 text-white font-bold text-sm px-6 py-3 rounded-full transition-colors"
            >
              Client Login
            </button>
          </div>
        </div>

        {/* Features */}
        <section className="max-w-5xl mx-auto px-5 mb-16">
          <h2 className="text-2xl font-black mb-8">What's in the Portal</h2>
          <div className="space-y-4">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-5 bg-white/[0.03] border border-white/8 rounded-xl p-6">
                <div className="w-10 h-10 rounded-full bg-[#22c55e]/10 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-[#22c55e]" />
                </div>
                <div>
                  <h3 className="font-bold text-white mb-1">{title}</h3>
                  <p className="text-white/55 text-sm leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Mock UI */}
        <section className="max-w-5xl mx-auto px-5 mb-16">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-black">Example Portfolio</h2>
            <span className="text-xs text-white/30 bg-white/5 border border-white/10 rounded-full px-3 py-1">
              Example data - not real customer information
            </span>
          </div>

          {/* Mock Properties */}
          <div className="bg-[#0d1410] border border-white/10 rounded-2xl overflow-hidden mb-4">
            <div className="px-5 py-3 border-b border-white/8 flex items-center justify-between">
              <span className="text-xs font-semibold text-white/40 uppercase tracking-widest">Properties</span>
              <span className="text-xs text-white/25">3 properties</span>
            </div>
            <div className="divide-y divide-white/5">
              {MOCK_PROPERTIES.map((p) => (
                <div key={p.name} className="px-5 py-4 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-sm text-white">{p.name}</div>
                    <div className="text-white/35 text-xs mt-0.5">{p.address}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-white/50 text-xs">{p.jobs} jobs</div>
                    <div className="text-white/30 text-xs mt-0.5">{p.lastJob}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Mock Job Board */}
          <div className="bg-[#0d1410] border border-white/10 rounded-2xl overflow-hidden mb-4">
            <div className="px-5 py-3 border-b border-white/8 flex items-center justify-between">
              <span className="text-xs font-semibold text-white/40 uppercase tracking-widest">Active & Recent Jobs</span>
              <span className="text-xs text-white/25">4 jobs</span>
            </div>
            <div className="divide-y divide-white/5">
              {MOCK_JOBS.map((job) => (
                <div key={job.id} className="px-5 py-4 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-white truncate">{job.service}</span>
                    </div>
                    <div className="text-white/35 text-xs mt-0.5">{job.property} · {job.unit}</div>
                  </div>
                  <span className={`text-xs font-semibold px-3 py-1 rounded-full flex-shrink-0 ${job.statusBg} ${job.statusColor}`}>
                    {STATUS_LABEL[job.status]}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Mock Invoices */}
          <div className="bg-[#0d1410] border border-white/10 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-white/8 flex items-center justify-between">
              <span className="text-xs font-semibold text-white/40 uppercase tracking-widest">Invoices</span>
              <span className="text-xs text-white/25">2 invoices</span>
            </div>
            <div className="divide-y divide-white/5">
              {MOCK_INVOICES.map((inv) => (
                <div key={inv.id} className="px-5 py-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="font-mono text-xs text-white/50">{inv.id}</div>
                    <div className="text-white/35 text-xs mt-0.5">{inv.property} · {inv.unit}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-sm text-white">{inv.amount}</div>
                    <div className={`text-xs font-semibold mt-0.5 ${inv.statusColor}`}>
                      {inv.status === "paid" ? "Paid" : "Outstanding"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Onboarding Scenario */}
        <section className="max-w-5xl mx-auto px-5 mb-16">
          <h2 className="text-2xl font-black mb-2">Get Set Up Today</h2>
          <p className="text-white/50 text-sm mb-8">
            Creating your account and submitting your first work order follows a simple 5-step flow.
          </p>
          <div className="grid md:grid-cols-5 gap-4">
            {ONBOARDING_STEPS.map(({ num, title, desc }) => (
              <div key={num} className="bg-white/[0.03] border border-white/8 rounded-xl p-5 text-center">
                <div className="w-8 h-8 rounded-full bg-[#22c55e]/10 text-[#22c55e] font-black text-sm flex items-center justify-center mx-auto mb-3">
                  {num}
                </div>
                <h3 className="font-bold text-sm text-white mb-1">{title}</h3>
                <p className="text-white/45 text-xs leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 text-center">
            <button
              onClick={() => {
                trackEvent("commercial_onboarding_start", { location: "portal_page_onboarding" });
                navigate("/portal/start");
              }}
              className="bg-[#22c55e] hover:bg-[#16a34a] text-black font-bold text-sm px-8 py-3.5 rounded-full transition-colors"
            >
              Start the Setup Flow
            </button>
          </div>
        </section>

        {/* FAQ */}
        <section className="max-w-5xl mx-auto px-5 mb-16">
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
        <section className="max-w-5xl mx-auto px-5">
          <div className="bg-[#22c55e]/8 border border-[#22c55e]/20 rounded-2xl p-10 text-center">
            <h2 className="text-2xl font-black mb-3">Ready to Set Up Your Account?</h2>
            <p className="text-white/55 text-sm mb-8 max-w-md mx-auto">
              Create your commercial portal account, add your first property, and submit your first cleanup request.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => {
                  trackEvent("commercial_onboarding_start", { location: "portal_page_cta" });
                  navigate("/portal/start");
                }}
                className="bg-[#22c55e] hover:bg-[#16a34a] text-black font-bold text-sm px-8 py-3.5 rounded-full transition-colors"
              >
                Request an Estimate
              </button>
              <button
                onClick={() => navigate("/portal/login")}
                className="border border-white/20 hover:border-white/35 text-white font-bold text-sm px-8 py-3.5 rounded-full transition-colors"
              >
                Client Login
              </button>
            </div>
          </div>
        </section>
      </main>

      <CommercialFooter />
    </div>
  );
}
