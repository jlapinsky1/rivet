import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

type NavLink = { label: string; href: string; to?: string };

const NAV_LINKS: NavLink[] = [
  { label: 'Product', href: '#product' },
  { label: 'How it works', href: '#how-it-works' },
  { label: "Who it's for", href: '#who-its-for' },
  { label: 'Commercial', href: '#commercial' },
  { label: 'Pricing', href: '/pricing', to: '/pricing' },
  { label: 'FAQ', href: '#faq' },
];

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'border-b border-cream-200 bg-cream-50/85 backdrop-blur-md'
          : 'border-b border-transparent bg-transparent'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
        {/* logo */}
        <Link to="/" className="flex items-center gap-2" aria-label="Rivet home">
          <Logo />
          <span className="font-display text-lg font-bold tracking-tight text-forest-950">
            Rivet
          </span>
        </Link>

        {/* desktop nav */}
        <nav className="hidden items-center gap-7 lg:flex">
          {NAV_LINKS.map((link) =>
            link.to ? (
              <Link
                key={link.href}
                to={link.to}
                className="text-sm font-medium text-forest-600 transition-colors hover:text-forest-950"
              >
                {link.label}
              </Link>
            ) : (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-forest-600 transition-colors hover:text-forest-950"
              >
                {link.label}
              </a>
            )
          )}
        </nav>

        {/* right actions */}
        <div className="hidden items-center gap-3 lg:flex">
          <Link
            to="/login"
            className="text-sm font-medium text-forest-600 transition-colors hover:text-forest-950"
          >
            Log in
          </Link>
          <Link
            to="/signup"
            className="rounded-lg bg-forest-900 px-4 py-2 text-sm font-semibold text-cream-50 transition-all hover:bg-forest-800 hover:shadow-md"
          >
            Start free
          </Link>
        </div>

        {/* mobile menu button */}
        <button
          className="flex h-10 w-10 items-center justify-center rounded-lg text-forest-800 transition-colors hover:bg-cream-100 lg:hidden"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
        >
          <Menu size={22} />
        </button>
      </div>

      {/* mobile menu overlay */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-forest-950/30 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute right-0 top-0 h-full w-72 max-w-[85%] animate-slide-down bg-cream-50 p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <span className="font-display text-lg font-bold text-forest-950">Rivet</span>
              <button
                className="flex h-10 w-10 items-center justify-center rounded-lg text-forest-700 hover:bg-cream-100"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
              >
                <X size={22} />
              </button>
            </div>
            <nav className="mt-8 flex flex-col gap-1">
              {NAV_LINKS.map((link) =>
                link.to ? (
                  <a
                    key={link.href}
                    href={link.to}
                    className="rounded-lg px-3 py-2.5 text-base font-medium text-forest-700 transition-colors hover:bg-cream-100"
                    onClick={(e) => {
                      e.preventDefault();
                      setMenuOpen(false);
                      navigate(link.to!);
                    }}
                  >
                    {link.label}
                  </a>
                ) : (
                  <a
                    key={link.href}
                    href={link.href}
                    className="rounded-lg px-3 py-2.5 text-base font-medium text-forest-700 transition-colors hover:bg-cream-100"
                    onClick={() => setMenuOpen(false)}
                  >
                    {link.label}
                  </a>
                )
              )}
            </nav>
            <div className="mt-6 flex flex-col gap-2 border-t border-cream-200 pt-6">
              <Link
                to="/login"
                className="rounded-lg px-3 py-2.5 text-center text-sm font-medium text-forest-700 transition-colors hover:bg-cream-100"
                onClick={() => setMenuOpen(false)}
              >
                Log in
              </Link>
              <Link
                to="/signup"
                className="rounded-lg bg-forest-900 px-4 py-3 text-center text-sm font-semibold text-cream-50"
                onClick={() => setMenuOpen(false)}
              >
                Start free
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect width="28" height="28" rx="7" fill="#142a20" />
      <path
        d="M9 8.5L9 19.5M9 8.5L16.5 8.5M9 14L14.5 14"
        stroke="#10b981"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="19.5" cy="19.5" r="2" fill="#34d39e" />
    </svg>
  );
}
