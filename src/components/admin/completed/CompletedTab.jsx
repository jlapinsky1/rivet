import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getRepo } from '../../../utils/repository';
import CompletedJobCard from './CompletedJobCard';
import CompletedDetail from './CompletedDetail';

const DEBOUNCE_MS = 300;

export default function CompletedTab({ onBack }) {
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [page, setPage] = useState(1);

  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [selected, setSelected] = useState(null);

  const searchDebounce = useRef(null);
  const latestSearchRef = useRef(null);
  const searchMounted = useRef(false);

  const doSearch = useCallback(async ({ search: s, dateFrom: df, dateTo: dt, paymentStatus: ps, page: p }) => {
    const key = JSON.stringify({ s, df, dt, ps, p });
    latestSearchRef.current = key;

    setLoading(true);
    setError(null);
    try {
      const repo = await getRepo();
      const data = await repo.searchCompletedBookings({
        search: s,
        dateFrom: df,
        dateTo: dt,
        paymentStatus: ps,
        page: p,
      });
      // Only apply if this is still the latest request
      if (latestSearchRef.current === key) {
        setResults(data.data || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 0);
      }
    } catch (e) {
      if (latestSearchRef.current === key) {
        setError(e.message || 'Failed to load completed jobs');
      }
    } finally {
      if (latestSearchRef.current === key) {
        setLoading(false);
      }
    }
  }, []);

  // Debounce search input only (skip on initial mount - filter effect handles first load)
  useEffect(() => {
    if (!searchMounted.current) {
      searchMounted.current = true;
      return;
    }
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      setPage(1);
      doSearch({ search, dateFrom, dateTo, paymentStatus, page: 1 });
    }, DEBOUNCE_MS);
    return () => clearTimeout(searchDebounce.current);
  }, [search]);

  // Immediate for filters + page
  useEffect(() => {
    doSearch({ search, dateFrom, dateTo, paymentStatus, page });
  }, [dateFrom, dateTo, paymentStatus, page]);

  function clearFilters() {
    setSearch('');
    setDateFrom('');
    setDateTo('');
    setPaymentStatus('');
    setPage(1);
  }

  const hasActiveFilters = search || dateFrom || dateTo || paymentStatus;

  // Show detail view
  if (selected) {
    return (
      <CompletedDetail
        bookingId={selected}
        onBack={() => setSelected(null)}
      />
    );
  }

  return (
    <div className="space-y-4 pb-8">
      {/* Back to all */}
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          All requests
        </button>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-800">
          Completed Jobs
          {!loading && (
            <span className="ml-2 text-sm font-normal text-gray-500">
              {total} total
            </span>
          )}
        </h2>
      </div>

      {/* Search bar */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Name, address, phone, email, booking ref…"
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        )}
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={paymentStatus}
          onChange={e => { setPaymentStatus(e.target.value); setPage(1); }}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All payments</option>
          <option value="paid">Paid only</option>
          <option value="balance_due">Balance due</option>
        </select>

        <input
          type="date"
          value={dateFrom}
          onChange={e => { setDateFrom(e.target.value); setPage(1); }}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="From"
          title="Completed from"
        />
        <span className="text-gray-400 text-xs">to</span>
        <input
          type="date"
          value={dateTo}
          onChange={e => { setDateTo(e.target.value); setPage(1); }}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="To"
          title="Completed to"
        />

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-xs text-blue-600 hover:text-blue-800 px-2 py-2"
          >
            Clear filters
          </button>
        )}

        {paymentStatus === 'balance_due' && (
          <span className="text-xs text-amber-600 bg-amber-50 px-2.5 py-1.5 rounded-lg border border-amber-200">
            Sorted oldest outstanding first
          </span>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-3 animate-pulse">
          {[1,2,3].map(i => (
            <div key={i} className="bg-white rounded-xl border p-4 h-20" />
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {error}
          <button onClick={() => doSearch({ search, dateFrom, dateTo, paymentStatus, page })} className="ml-3 text-blue-600 hover:text-blue-800">
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && results.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          {hasActiveFilters
            ? <p>No results matching your filters</p>
            : <p>No completed jobs yet</p>
          }
        </div>
      )}

      {/* Results */}
      {!loading && !error && results.length > 0 && (
        <div className="space-y-2">
          {results.map(booking => (
            <CompletedJobCard
              key={booking.id}
              booking={booking}
              onClick={() => setSelected(booking.id)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="text-sm text-gray-600 disabled:text-gray-300 hover:text-gray-900 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="text-sm text-gray-600 disabled:text-gray-300 hover:text-gray-900 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
