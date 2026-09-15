import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabaseClient';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidZip(zip) {
  return /^\d{5}$/.test((zip || '').trim());
}

function parseZipInput(raw) {
  return [...new Set(
    raw.split(/[\s,]+/)
      .map(z => z.trim())
      .filter(z => isValidZip(z))
  )];
}

function rejectInvalidZips(raw) {
  return raw.split(/[\s,]+/)
    .map(z => z.trim())
    .filter(z => z.length > 0 && !isValidZip(z));
}

async function getAuthHeader() {
  if (!supabase) return {};
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ZipChip({ zip, label, onRemove, variant = 'default' }) {
  const colors = {
    default: 'bg-blue-100 text-blue-800 border-blue-200',
    unavailable: 'bg-amber-100 text-amber-800 border-amber-200',
    excluded: 'bg-red-100 text-red-800 border-red-200',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-mono font-semibold ${colors[variant]}`}>
      {zip}
      {label && <span className="text-[10px] font-normal ml-0.5 opacity-70">{label}</span>}
      {onRemove && (
        <button
          onClick={() => onRemove(zip)}
          className="ml-0.5 hover:opacity-70 transition-opacity leading-none"
          aria-label={`Remove ${zip}`}
        >
          x
        </button>
      )}
    </span>
  );
}

function AddZipInput({ onAdd, placeholder = 'Enter ZIP code(s)' }) {
  const [raw, setRaw] = useState('');
  const [error, setError] = useState('');

  function handleAdd() {
    const valid = parseZipInput(raw);
    const invalid = rejectInvalidZips(raw);
    if (invalid.length > 0) {
      setError(`Invalid: ${invalid.join(', ')} (must be 5 digits)`);
      return;
    }
    if (valid.length === 0) {
      setError('Enter at least one five-digit ZIP code.');
      return;
    }
    setError('');
    onAdd(valid);
    setRaw('');
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          type="text"
          value={raw}
          onChange={e => { setRaw(e.target.value); setError(''); }}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
          placeholder={placeholder}
          className="flex-1 border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
          maxLength={100}
        />
        <button
          onClick={handleAdd}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Add
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function ZipTestPanel({ config }) {
  const [testZip, setTestZip] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  async function runTest() {
    const z = testZip.trim();
    if (!isValidZip(z)) {
      setResult({ status: 'invalid', message: 'Not a valid five-digit ZIP code.' });
      return;
    }

    if (config.mode === 'radius') {
      // Radius mode requires the ZIP database on the server - call the API
      setLoading(true);
      setResult(null);
      try {
        const res = await fetch('/api/check-service-area', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ zip: z }),
        });
        const data = await res.json();
        if (data.serviceable) {
          const dist = data.distanceMiles != null ? ` · ${data.distanceMiles} mi from your center ZIP` : '';
          setResult({ status: 'serviceable', message: `${z} is within your service area${dist}. Customers here can book.` });
        } else if (data.reason === 'excluded') {
          setResult({ status: 'excluded', message: `${z} is on the excluded list. Customers in this ZIP will be rejected.` });
        } else if (data.reason === 'unavailable') {
          setResult({ status: 'unavailable', message: `${z} is temporarily unavailable. Customers will see a "check back soon" message.` });
        } else if (data.reason === 'invalid_zip' || data.reason === 'unknown_zip') {
          setResult({ status: 'invalid', message: `${z} was not recognized as a valid ZIP code.` });
        } else {
          const dist = data.distanceMiles != null ? ` (${data.distanceMiles} mi away)` : '';
          setResult({ status: 'outside', message: `${z} is outside your ${config.radiusMiles}-mile radius${dist}. Customers here will see the out-of-area message.` });
        }
      } catch (e) {
        setResult({ status: 'invalid', message: `Error: ${e.message}` });
      } finally {
        setLoading(false);
      }
      return;
    }

    // ZIP list mode - local check against current (unsaved) config
    if (config.excludedZips.includes(z)) {
      setResult({ status: 'excluded', message: `${z} is on the excluded list. Customers in this ZIP will be rejected.` });
    } else if (config.unavailableZips.includes(z)) {
      setResult({ status: 'unavailable', message: `${z} is temporarily unavailable. Customers will see a "check back soon" message.` });
    } else if (config.serviceableZips.includes(z)) {
      setResult({ status: 'serviceable', message: `${z} is serviceable. Customers here can book.` });
    } else if (config.serviceableZips.length === 0 && config.excludedZips.length === 0) {
      setResult({ status: 'unconfigured', message: 'No ZIP codes configured yet. All ZIPs will be accepted until you add at least one.' });
    } else {
      setResult({ status: 'outside', message: `${z} is not in the serviceable list. Customers here will see the out-of-area message.` });
    }
  }

  const statusColors = {
    serviceable: 'text-green-700 bg-green-50 border-green-200',
    outside: 'text-orange-700 bg-orange-50 border-orange-200',
    unavailable: 'text-amber-700 bg-amber-50 border-amber-200',
    excluded: 'text-red-700 bg-red-50 border-red-200',
    invalid: 'text-gray-700 bg-gray-50 border-gray-200',
    unconfigured: 'text-blue-700 bg-blue-50 border-blue-200',
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={testZip}
          onChange={e => { setTestZip(e.target.value); setResult(null); }}
          onKeyDown={e => { if (e.key === 'Enter') runTest(); }}
          placeholder="Enter a ZIP to test"
          className="flex-1 border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
          maxLength={5}
        />
        <button
          onClick={runTest}
          disabled={loading}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-800 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
        >
          {loading ? 'Checking...' : 'Test'}
        </button>
      </div>
      {config.mode === 'radius' && (
        <p className="text-xs text-gray-400">Tests the currently saved configuration. Save changes first if you've adjusted your radius or center ZIP.</p>
      )}
      {result && (
        <p className={`text-sm px-3 py-2 rounded-lg border ${statusColors[result.status] || statusColors.invalid}`}>
          {result.message}
        </p>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ServiceAreaAdmin() {
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState(null); // null | 'saving' | 'saved' | 'error'
  const [fetchError, setFetchError] = useState(null);

  const [config, setConfig] = useState({
    mode: 'zip-list',
    serviceableZips: [],
    excludedZips: [],
    unavailableZips: [],
    radiusMiles: 30,
    centerZip: '',
    updatedAt: '',
    updatedBy: '',
  });

  // Load on mount
  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const headers = await getAuthHeader();
      const res = await fetch('/api/admin/service-area', { headers });
      if (!res.ok) {
        setFetchError(`Failed to load configuration (${res.status})`);
        return;
      }
      const data = await res.json();
      setConfig(c => ({
        ...c,
        mode: data.mode || 'zip-list',
        serviceableZips: data.serviceableZips || [],
        excludedZips: data.excludedZips || [],
        unavailableZips: data.unavailableZips || [],
        radiusMiles: data.radiusMiles ?? 30,
        centerZip: data.centerZip || '',
        updatedAt: data.updatedAt || '',
        updatedBy: data.updatedBy || '',
      }));
    } catch (e) {
      setFetchError(e.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Zip list operations
  function addToList(list, zips) {
    setConfig(c => ({
      ...c,
      [list]: [...new Set([...c[list], ...zips])],
    }));
    setSaveState(null);
  }

  function removeFromList(list, zip) {
    setConfig(c => ({
      ...c,
      [list]: c[list].filter(z => z !== zip),
    }));
    setSaveState(null);
  }

  // Move between serviceable and unavailable (toggle temporary disable)
  function toggleUnavailable(zip) {
    setConfig(c => {
      if (c.unavailableZips.includes(zip)) {
        return {
          ...c,
          unavailableZips: c.unavailableZips.filter(z => z !== zip),
          serviceableZips: [...new Set([...c.serviceableZips, zip])],
        };
      }
      return {
        ...c,
        serviceableZips: c.serviceableZips.filter(z => z !== zip),
        unavailableZips: [...new Set([...c.unavailableZips, zip])],
      };
    });
    setSaveState(null);
  }

  async function handleSave() {
    if (config.mode === 'radius' && !isValidZip(config.centerZip)) {
      setSaveState('error');
      return;
    }
    setSaveState('saving');
    try {
      const headers = {
        ...(await getAuthHeader()),
        'Content-Type': 'application/json',
      };
      const res = await fetch('/api/admin/service-area', {
        method: 'PUT',
        headers,
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server returned ${res.status}`);
      }
      const { config: saved } = await res.json();
      setConfig(c => ({ ...c, updatedAt: saved.updatedAt, updatedBy: saved.updatedBy }));
      setSaveState('saved');
      setTimeout(() => setSaveState(null), 3000);
    } catch (e) {
      console.error('Save error:', e);
      setSaveState('error');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        <svg className="animate-spin w-6 h-6 mr-2" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading service area configuration...
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="text-center py-16 space-y-3">
        <p className="text-red-600 font-medium">{fetchError}</p>
        <button onClick={load} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm">
          Try again
        </button>
      </div>
    );
  }

  const isRadiusMode = config.mode === 'radius';
  const totalServiceable = config.serviceableZips.length + config.unavailableZips.length;

  const statusSummary = isRadiusMode
    ? config.centerZip
      ? `Radius mode · ZIPs within ${config.radiusMiles} miles of ${config.centerZip}`
      : 'Radius mode · Set a center ZIP to activate'
    : totalServiceable === 0
      ? 'No ZIP codes configured. All areas will be accepted until you add at least one.'
      : `${config.serviceableZips.length} active, ${config.unavailableZips.length} temporarily unavailable, ${config.excludedZips.length} excluded`;

  return (
    <div className="space-y-4 pb-8">

      {/* Header / status */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-bold text-gray-800 text-lg">Service Area</h2>
            <p className="text-sm text-gray-500 mt-0.5">{statusSummary}</p>
          </div>
          {config.updatedAt && (
            <p className="text-xs text-gray-400">
              Last saved {new Date(config.updatedAt).toLocaleString()} by {config.updatedBy}
            </p>
          )}
        </div>
      </div>

      {/* Mode selector */}
      <div className="bg-white rounded-xl border p-4 space-y-3">
        <h3 className="font-bold text-gray-800">Coverage Mode</h3>
        <div className="space-y-3">
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="radio"
              name="mode"
              value="radius"
              checked={isRadiusMode}
              onChange={() => { setConfig(c => ({ ...c, mode: 'radius' })); setSaveState(null); }}
              className="mt-0.5"
            />
            <div>
              <div className="font-medium text-gray-800 text-sm group-hover:text-blue-700 transition-colors">Radius Mode</div>
              <div className="text-xs text-gray-500 mt-0.5">
                Automatically serve every ZIP code within a set distance of your base location.
                No need to list ZIPs manually - you'll never miss one.
              </div>
            </div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="radio"
              name="mode"
              value="zip-list"
              checked={!isRadiusMode}
              onChange={() => { setConfig(c => ({ ...c, mode: 'zip-list' })); setSaveState(null); }}
              className="mt-0.5"
            />
            <div>
              <div className="font-medium text-gray-800 text-sm group-hover:text-blue-700 transition-colors">ZIP List Mode</div>
              <div className="text-xs text-gray-500 mt-0.5">
                Manually specify every ZIP code you service. Use when your coverage isn't a simple circle
                (e.g., you only serve certain corridors or municipalities).
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* Radius settings - only in radius mode */}
      {isRadiusMode && (
        <div className="bg-white rounded-xl border p-4 space-y-4">
          <div>
            <h3 className="font-bold text-gray-800">Radius Settings</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Any ZIP code whose centroid falls within the radius will be accepted.
              Use the exclusion list below to block specific ZIPs inside your radius.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Center ZIP <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                maxLength={5}
                value={config.centerZip}
                onChange={e => { setConfig(c => ({ ...c, centerZip: e.target.value.replace(/\D/g, '').slice(0, 5) })); setSaveState(null); }}
                placeholder="30548"
                className={`w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                  isRadiusMode && config.centerZip && !isValidZip(config.centerZip) ? 'border-red-400' : ''
                }`}
              />
              <p className="text-xs text-gray-400 mt-1">Your base / dispatch location ZIP.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Radius (miles)</label>
              <input
                type="number"
                min="1"
                max="500"
                value={config.radiusMiles}
                onChange={e => { setConfig(c => ({ ...c, radiusMiles: Number(e.target.value) })); setSaveState(null); }}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <p className="text-xs text-gray-400 mt-1">How far out you'll travel.</p>
            </div>
          </div>
          {isValidZip(config.centerZip) && config.radiusMiles > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
              Serving all ZIP codes within <strong>{config.radiusMiles} miles</strong> of <strong>{config.centerZip}</strong>.
              Excluded ZIPs below will still be blocked even if they're inside this radius.
            </div>
          )}
        </div>
      )}

      {/* Active ZIP codes - only in zip-list mode */}
      {!isRadiusMode && (
        <div className="bg-white rounded-xl border p-4 space-y-3">
          <h3 className="font-bold text-gray-800">Active ZIP Codes</h3>
          <p className="text-sm text-gray-500">
            Customers in these ZIPs can submit booking requests.
          </p>

          {config.serviceableZips.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {config.serviceableZips.sort().map(zip => (
                <div key={zip} className="inline-flex items-center gap-1">
                  <ZipChip
                    zip={zip}
                    variant="default"
                    onRemove={z => removeFromList('serviceableZips', z)}
                  />
                  <button
                    onClick={() => toggleUnavailable(zip)}
                    title="Temporarily disable this ZIP"
                    className="text-xs text-amber-600 hover:text-amber-800 transition-colors px-1 py-0.5 rounded border border-amber-200 hover:bg-amber-50"
                  >
                    Pause
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">No active ZIP codes yet.</p>
          )}

          <AddZipInput
            placeholder="30301, 30302, 30303 ..."
            onAdd={zips => addToList('serviceableZips', zips)}
          />
        </div>
      )}

      {/* Temporarily unavailable */}
      <div className="bg-white rounded-xl border p-4 space-y-3">
        <h3 className="font-bold text-gray-800">Temporarily Unavailable</h3>
        <p className="text-sm text-gray-500">
          {isRadiusMode
            ? 'ZIPs within your radius that you\'re temporarily not servicing. Customers see a "check back soon" message.'
            : 'These ZIPs are known service areas but are paused. Customers see a "check back soon" message instead of the out-of-area message.'}
        </p>

        {config.unavailableZips.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {config.unavailableZips.sort().map(zip => (
              <div key={zip} className="inline-flex items-center gap-1">
                <ZipChip zip={zip} variant="unavailable" />
                {!isRadiusMode && (
                  <button
                    onClick={() => toggleUnavailable(zip)}
                    title="Re-enable this ZIP"
                    className="text-xs text-blue-600 hover:text-blue-800 transition-colors px-1 py-0.5 rounded border border-blue-200 hover:bg-blue-50"
                  >
                    Resume
                  </button>
                )}
                <button
                  onClick={() => removeFromList('unavailableZips', zip)}
                  className="text-xs text-red-500 hover:text-red-700 px-1"
                  title="Remove entirely"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">None currently paused.</p>
        )}

        <AddZipInput
          placeholder="Enter ZIP(s) to pause ..."
          onAdd={zips => addToList('unavailableZips', zips)}
        />
      </div>

      {/* Excluded ZIPs */}
      <div className="bg-white rounded-xl border p-4 space-y-3">
        <h3 className="font-bold text-gray-800">Excluded ZIP Codes</h3>
        <p className="text-sm text-gray-500">
          {isRadiusMode
            ? 'Customers in these ZIPs are permanently rejected even if they fall inside your radius. Use for areas that are logistically impractical.'
            : 'Customers in these ZIPs are rejected even if they would otherwise fall inside the service area. Use for areas that are logistically impractical.'}
        </p>

        {config.excludedZips.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {config.excludedZips.sort().map(zip => (
              <ZipChip
                key={zip}
                zip={zip}
                variant="excluded"
                onRemove={z => removeFromList('excludedZips', z)}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">No excluded ZIP codes.</p>
        )}

        <AddZipInput
          placeholder="Enter ZIP(s) to exclude ..."
          onAdd={zips => addToList('excludedZips', zips)}
        />
      </div>

      {/* Test a ZIP */}
      <div className="bg-white rounded-xl border p-4 space-y-3">
        <h3 className="font-bold text-gray-800">Test a ZIP Code</h3>
        <p className="text-sm text-gray-500">
          {isRadiusMode
            ? 'Check whether a ZIP falls inside your radius. Tests the saved configuration.'
            : 'Check how a specific ZIP would be handled with the current (unsaved) configuration.'}
        </p>
        <ZipTestPanel config={config} />
      </div>

      {/* Save */}
      <div className="space-y-2">
        {saveState === 'error' && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            {isRadiusMode && !isValidZip(config.centerZip)
              ? 'Center ZIP is required and must be a valid five-digit ZIP code.'
              : 'Save failed. Your previous settings are still active. Check your connection and try again.'}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saveState === 'saving'}
          className={`w-full py-3 rounded-xl font-bold text-white transition-colors ${
            saveState === 'saved'
              ? 'bg-green-500'
              : saveState === 'error'
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-blue-600 hover:bg-blue-700 disabled:opacity-60'
          }`}
        >
          {saveState === 'saving'
            ? 'Saving...'
            : saveState === 'saved'
            ? 'Saved!'
            : 'Save Service Area'}
        </button>
      </div>
    </div>
  );
}
