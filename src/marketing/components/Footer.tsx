import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';

type FooterLink = { label: string; href: string; to?: string };

const FOOTER_LINKS: FooterLink[] = [
  { label: 'Product', href: '#product' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Commercial', href: '#commercial' },
  { label: 'Pricing', href: '/pricing', to: '/pricing' },
  { label: 'FAQ', href: '#faq' },
];

export function Footer() {
  return (
    <footer className="bg-forest-975 text-forest-300">
      <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="flex flex-col justify-between gap-10 sm:flex-row">
          <div>
            <Link to="/" className="flex items-center gap-2 text-cream-50" aria-label="Rivet home">
              <FooterLogo />
              <span className="font-display text-lg font-bold tracking-tight">Rivet</span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-forest-400">
              Better decisions for the work that keeps your business moving.
            </p>
          </div>

          <nav className="grid grid-cols-2 gap-x-12 gap-y-3 sm:flex sm:gap-8">
            {FOOTER_LINKS.map((link) =>
              link.to ? (
                <Link key={link.href} to={link.to} className="group inline-flex items-center gap-1 text-sm text-forest-300 transition-colors hover:text-emerald-400">
                  {link.label}
                  <ArrowUpRight size={12} className="opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              ) : (
                <a key={link.href} href={link.href} className="group inline-flex items-center gap-1 text-sm text-forest-300 transition-colors hover:text-emerald-400">
                  {link.label}
                  <ArrowUpRight size={12} className="opacity-0 transition-opacity group-hover:opacity-100" />
                </a>
              )
            )}
          </nav>
        </div>

        <div className="mt-12 flex flex-col justify-between gap-4 border-t border-forest-800 pt-6 text-xs text-forest-500 sm:flex-row sm:items-center">
          <span>&copy; {new Date().getFullYear()} Rivet. All rights reserved.</span>
          <div className="flex gap-5">
            <a href="#" className="transition-colors hover:text-forest-300">Privacy</a>
            <a href="#" className="transition-colors hover:text-forest-300">Terms</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterLogo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect width="28" height="28" rx="7" fill="#234536" />
      <path d="M9 8.5L9 19.5M9 8.5L16.5 8.5M9 14L14.5 14" stroke="#34d39e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="19.5" cy="19.5" r="2" fill="#10b981" />
    </svg>
  );
}
