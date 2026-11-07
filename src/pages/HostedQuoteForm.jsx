import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { mergeQuoteFormConfig } from '../utils/quoteFormConfig';
import VerticalQuoteForm from './VerticalQuoteForm';

export default function HostedQuoteForm() {
  const { slug } = useParams();
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const isEmbed = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('embed');

  useEffect(() => {
    let cancelled = false;

    async function fetchConfig() {
      try {
        const res = await fetch(`/api/public/business-config?slug=${encodeURIComponent(slug)}`);
        if (!res.ok) {
          setState({ status: res.status === 404 ? 'not_found' : 'error', data: null, error: null });
          return;
        }
        const data = await res.json();
        if (!cancelled) setState({ status: 'ok', data, error: null });
      } catch {
        if (!cancelled) setState({ status: 'error', data: null, error: 'Failed to load' });
      }
    }

    fetchConfig();
    return () => { cancelled = true; };
  }, [slug]);

  // Embed: render form instantly with defaults, update when config arrives
  if (isEmbed) {
    if (state.status === 'not_found') {
      return <div style={{ padding: 40, textAlign: 'center', background: '#fff' }}>
        <p style={{ color: '#666', fontSize: 14 }}>This form is not available.</p>
      </div>;
    }
    if (state.status === 'error') {
      return <div style={{ padding: 40, textAlign: 'center', background: '#fff' }}>
        <p style={{ color: '#666', fontSize: 14 }}>Something went wrong. Please try again.</p>
      </div>;
    }

    // Use real config if loaded, otherwise fall back to handyman defaults
    const vertical = state.data?.vertical === 'junk_removal' ? 'junk_removal' : 'handyman';
    const mergedConfig = mergeQuoteFormConfig(state.data?.quoteFormConfig || null, vertical);
    const name = state.data?.name || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    if (state.data && !state.data.published) {
      return <div style={{ padding: 40, textAlign: 'center', background: '#fff' }}>
        <p style={{ color: '#666', fontSize: 14 }}>This form is not available yet.</p>
      </div>;
    }

    return (
      <VerticalQuoteForm
        config={mergedConfig}
        businessName={name}
        businessSlug={slug}
      />
    );
  }

  // Full page: keep loading/error states
  if (state.status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="space-y-4 text-center">
          <div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (state.status === 'not_found') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <h1 className="text-3xl font-black text-white mb-4">Business not found</h1>
          <p className="text-gray-400">The business you're looking for doesn't exist or the link may be incorrect.</p>
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <h1 className="text-3xl font-black text-white mb-4">Something went wrong</h1>
          <p className="text-gray-400 mb-6">We couldn't load this page. Please try again.</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-green-500 hover:bg-green-400 text-gray-950 font-bold text-sm px-6 py-3 rounded-xl transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const { name, vertical, published, quoteFormConfig } = state.data;

  if (!published) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <h1 className="text-3xl font-black text-white mb-4">Coming soon</h1>
          <p className="text-gray-400">
            {name}'s quote request form isn't available yet. Check back soon!
          </p>
        </div>
      </div>
    );
  }

  const formVertical = vertical === 'handyman' ? 'handyman' : 'junk_removal';
  const mergedConfig = mergeQuoteFormConfig(quoteFormConfig, formVertical);

  document.title = `${name} - Request a Quote`;

  return (
    <VerticalQuoteForm
      config={mergedConfig}
      businessName={name}
      businessSlug={slug}
    />
  );
}
