import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { mergeQuoteFormConfig } from '../utils/quoteFormConfig';
import VerticalQuoteForm from './VerticalQuoteForm';

export default function HostedQuoteForm() {
  const { slug } = useParams();
  const [state, setState] = useState({ status: 'loading', data: null, error: null });

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

  // Loading
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

  // Not found
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

  // Error
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

  // Unpublished
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

  // Merge saved config with defaults
  const mergedConfig = mergeQuoteFormConfig(quoteFormConfig, vertical || 'junk_removal');

  // Set page title
  document.title = `${name} — Request a Quote`;

  return (
    <VerticalQuoteForm
      config={mergedConfig}
      businessName={name}
      businessSlug={slug}
    />
  );
}
