import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Trash2, Phone } from "lucide-react";
import { trackEvent } from "../../utils/analytics";

export default function CommercialFooter() {
  const navigate = useNavigate();
  return (
    <footer className="border-t border-white/5 py-14 bg-[#0a0f0d]">
      <div className="max-w-7xl mx-auto px-5">
        <div className="grid md:grid-cols-3 gap-10 mb-10">
          {/* Col 1 - Brand */}
          <div className="space-y-4">
            <Link to="/" className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center">
                <Trash2 className="w-4 h-4 text-[#0a0f0d]" />
              </div>
              <span className="font-black tracking-widest text-xs uppercase text-white">
                Squatterz
              </span>
            </Link>
            <p className="text-xs text-white/40 leading-relaxed max-w-xs">
              Commercial property cleanup for Northeast Georgia property managers.
            </p>
            <a
              href="tel:7706282877"
              onClick={() => trackEvent("commercial_phone_click", { location: "footer" })}
              className="flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors w-fit"
            >
              <Phone className="w-4 h-4 text-[#22c55e]" />
              <span className="font-medium">(770) 628-2877</span>
            </a>
          </div>

          {/* Col 2 - Commercial Services */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#22c55e] mb-4">
              Commercial Services
            </p>
            <ul className="space-y-2.5">
              {[
                { label: "Apartment & Unit Cleanouts", to: "/commercial/apartment-cleanouts" },
                { label: "Eviction Cleanup", to: "/commercial/eviction-cleanup" },
                { label: "Unit Turnover Cleanout", to: "/commercial/unit-turnover-cleanout" },
                { label: "Bulk Trash Removal", to: "/commercial/bulk-trash-removal" },
                { label: "Illegal Dumping Removal", to: "/commercial/illegal-dumping-removal" },
                { label: "Recurring Property Cleanup", to: "/commercial/property-management-cleanup" },
                { label: "Client Portal", to: "/commercial/client-portal" },
              ].map(({ label, to }) => (
                <li key={to}>
                  <Link to={to} className="text-xs text-white/45 hover:text-white/80 transition-colors">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 3 - Company */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#22c55e] mb-4">
              Company
            </p>
            <ul className="space-y-2.5">
              <li>
                <Link to="/" className="text-xs text-white/45 hover:text-white/80 transition-colors">
                  Commercial Services
                </Link>
              </li>
              <li>
                <Link to="/commercial/client-portal" className="text-xs text-white/45 hover:text-white/80 transition-colors">
                  Client Portal
                </Link>
              </li>
              <li>
                <Link to="/commercial/service-area" className="text-xs text-white/45 hover:text-white/80 transition-colors">
                  Service Area
                </Link>
              </li>
              <li>
                <button
                  onClick={() => {
                    trackEvent("commercial_onboarding_start", { location: "footer" });
                    navigate("/portal/start");
                  }}
                  className="text-xs text-white/45 hover:text-white/80 transition-colors"
                >
                  Request an Estimate
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/5 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-white/25">
            &copy; {new Date().getFullYear()} Squatterz LLC &middot; Braselton, GA &middot; All rights reserved
          </p>
          <div className="flex gap-6 text-xs text-white/30">
            <Link to="/" className="hover:text-white/60 transition-colors">Home</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
