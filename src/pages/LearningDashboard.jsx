import React, { useState, useEffect } from 'react';
import { getRepo } from '../utils/repository';
import { getSettings } from '../utils/storage';
import { aggregateVarianceMetrics, VARIANCE_FIELDS } from '../utils/varianceAnalysis';
import { SIMILARITY_DIMENSIONS, groupJobsByDimension } from '../utils/similarityGroups';
import { generateCalibrationSuggestions } from '../utils/calibrationEngine';
import { computeMetrics } from '../utils/varianceAnalysis';

function fmt(n, decimals = 0) {
  if (n == null) return '-';
  return Number(n).toFixed(decimals);
}

function pct(n) {
  if (n == null) return '-';
  return (n * 100).toFixed(0) + '%';
}

// ── Accuracy Summary ──

function AccuracySummary({ metrics }) {
  const fields = Object.entries(VARIANCE_FIELDS);
  return (
    <div className="bg-white rounded-xl border p-5">
      <h3 className="font-bold text-gray-900 mb-3">Overall Accuracy</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 border-b">
              <th className="text-left py-2 pr-4">Metric</th>
              <th className="text-right py-2 px-2">Sample</th>
              <th className="text-right py-2 px-2">Avg Error</th>
              <th className="text-right py-2 px-2">Signed Bias</th>
              <th className="text-right py-2 px-2">MAPE</th>
              <th className="text-right py-2 px-2">Over-est</th>
              <th className="text-right py-2 px-2">Under-est</th>
            </tr>
          </thead>
          <tbody>
            {fields.map(([key, field]) => {
              const m = metrics[key];
              if (!m) return (
                <tr key={key} className="border-b">
                  <td className="py-2 pr-4 text-gray-600">{field.label}</td>
                  <td className="text-right px-2 text-gray-400" colSpan={6}>Insufficient data</td>
                </tr>
              );
              return (
                <tr key={key} className="border-b">
                  <td className="py-2 pr-4 text-gray-700 font-medium">{field.label}</td>
                  <td className="text-right px-2">{m.sampleSize}</td>
                  <td className="text-right px-2">{fmt(m.absAvgError, 1)} {field.unit}</td>
                  <td className={`text-right px-2 font-medium ${m.signedAvgError > 0 ? 'text-amber-600' : m.signedAvgError < 0 ? 'text-blue-600' : ''}`}>
                    {m.signedAvgError > 0 ? '+' : ''}{fmt(m.signedAvgError, 1)} {field.unit}
                  </td>
                  <td className="text-right px-2">{pct(m.mape)}</td>
                  <td className="text-right px-2">{pct(m.overestimateRate)}</td>
                  <td className="text-right px-2">{pct(m.underestimateRate)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Per-Dimension View ──

function DimensionView({ completedBookings }) {
  const [selectedDim, setSelectedDim] = useState('accessType');
  const [selectedField, setSelectedField] = useState('cashProfit');

  const groups = groupJobsByDimension(completedBookings, selectedDim);
  const field = VARIANCE_FIELDS[selectedField];

  const groupData = [];
  for (const [groupValue, jobs] of groups) {
    const pairs = [];
    for (const b of jobs) {
      const pair = field.extract(b);
      if (pair) pairs.push(pair);
    }
    const metrics = computeMetrics(pairs, field.minDenominator || 10);
    groupData.push({ groupValue, count: jobs.length, metrics });
  }

  groupData.sort((a, b) => b.count - a.count);

  return (
    <div className="bg-white rounded-xl border p-5">
      <h3 className="font-bold text-gray-900 mb-3">Accuracy by Group</h3>
      <div className="flex gap-3 mb-4">
        <select value={selectedDim} onChange={e => setSelectedDim(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm">
          {Object.entries(SIMILARITY_DIMENSIONS).map(([k, d]) => (
            <option key={k} value={k}>{d.label}</option>
          ))}
        </select>
        <select value={selectedField} onChange={e => setSelectedField(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm">
          {Object.entries(VARIANCE_FIELDS).map(([k, f]) => (
            <option key={k} value={k}>{f.label}</option>
          ))}
        </select>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-500 border-b">
            <th className="text-left py-2 pr-4">Group</th>
            <th className="text-right py-2 px-2">Jobs</th>
            <th className="text-right py-2 px-2">Avg Error</th>
            <th className="text-right py-2 px-2">Signed Bias</th>
            <th className="text-right py-2 px-2">Direction</th>
          </tr>
        </thead>
        <tbody>
          {groupData.map(({ groupValue, count, metrics }) => (
            <tr key={groupValue} className="border-b">
              <td className="py-2 pr-4 text-gray-700">{groupValue}</td>
              <td className="text-right px-2">{count}</td>
              {metrics ? (
                <>
                  <td className="text-right px-2">{fmt(metrics.absAvgError, 1)}</td>
                  <td className={`text-right px-2 ${metrics.signedAvgError > 0 ? 'text-amber-600' : metrics.signedAvgError < 0 ? 'text-blue-600' : ''}`}>
                    {metrics.signedAvgError > 0 ? '+' : ''}{fmt(metrics.signedAvgError, 1)}
                  </td>
                  <td className="text-right px-2 text-xs">
                    {metrics.underestimateRate > 0.6 ? 'Under-est' : metrics.overestimateRate > 0.6 ? 'Over-est' : 'Mixed'}
                  </td>
                </>
              ) : (
                <td className="text-right px-2 text-gray-400" colSpan={3}>Insufficient data</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Calibration Suggestions ──

const CONFIDENCE_BADGE = {
  weak: 'bg-yellow-100 text-yellow-800',
  strong: 'bg-blue-100 text-blue-800',
  very_strong: 'bg-green-100 text-green-800',
};

function CalibrationPanel({ suggestions, onDecision }) {
  const pending = suggestions.filter(s => !s._decided);

  if (!pending.length) {
    return (
      <div className="bg-white rounded-xl border p-5">
        <h3 className="font-bold text-gray-900 mb-2">Calibration Suggestions</h3>
        <p className="text-sm text-gray-500">No pending calibration suggestions. Need more completed jobs or estimates are already accurate.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border p-5 space-y-3">
      <h3 className="font-bold text-gray-900">Calibration Suggestions</h3>
      {pending.map((s, i) => (
        <div key={i} className="border rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-medium text-gray-800">
              {VARIANCE_FIELDS[s.metric]?.label || s.metric}
              {s.dimensionValue !== 'all' && (
                <span className="text-gray-500 font-normal"> - {s.dimensionValue}</span>
              )}
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CONFIDENCE_BADGE[s.confidence]}`}>
              {s.confidence.replace('_', ' ')} ({s.sampleSize} jobs)
            </span>
          </div>
          <div className="text-sm text-gray-600">{s.reasoning}</div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-500">Current: <strong>{fmt(s.currentValue, 1)}</strong></span>
            <span className="text-gray-900">Suggested: <strong>{fmt(s.suggestedValue, 1)}</strong></span>
            <span className={`text-xs ${s.direction === 'increase' ? 'text-amber-600' : 'text-blue-600'}`}>
              {s.direction === 'increase' ? '+' : '-'}{fmt(s.magnitude, 0)}%
            </span>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={() => onDecision(s, 'accepted')}
              className="px-3 py-1.5 bg-green-100 text-green-800 rounded-lg text-xs font-medium hover:bg-green-200">
              Accept
            </button>
            <button onClick={() => onDecision(s, 'rejected')}
              className="px-3 py-1.5 bg-red-100 text-red-800 rounded-lg text-xs font-medium hover:bg-red-200">
              Reject
            </button>
            <button onClick={() => onDecision(s, 'deferred')}
              className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200">
              Defer
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Calibration History ──

function CalibrationHistory({ records }) {
  if (!records.length) return null;

  const DECISION_COLORS = {
    accepted: 'text-green-700',
    rejected: 'text-red-700',
    deferred: 'text-gray-500',
    pending: 'text-amber-600',
  };

  return (
    <div className="bg-white rounded-xl border p-5">
      <h3 className="font-bold text-gray-900 mb-3">Calibration History</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-500 border-b">
            <th className="text-left py-2">Metric</th>
            <th className="text-left py-2">Group</th>
            <th className="text-right py-2">Previous</th>
            <th className="text-right py-2">Suggested</th>
            <th className="text-right py-2">Decision</th>
            <th className="text-right py-2">Date</th>
          </tr>
        </thead>
        <tbody>
          {records.map(r => (
            <tr key={r.id} className="border-b">
              <td className="py-2">{r.metric}</td>
              <td className="py-2 text-gray-500">{r.dimension_value}</td>
              <td className="py-2 text-right">{fmt(r.previous_value, 1)}</td>
              <td className="py-2 text-right">{fmt(r.suggested_value, 1)}</td>
              <td className={`py-2 text-right font-medium ${DECISION_COLORS[r.owner_decision]}`}>
                {r.owner_decision}
              </td>
              <td className="py-2 text-right text-gray-400">
                {r.decided_at ? new Date(r.decided_at).toLocaleDateString() : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Learning Dashboard ──

export default function LearningDashboard() {
  const [completedBookings, setCompletedBookings] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [calibrationHistory, setCalibrationHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const repo = await getRepo();
        const bookings = await repo.getBookings();
        const completed = bookings.filter(b =>
          b.status === 'completed' && b.actuals && b.actuals.finalAmount != null
        );
        setCompletedBookings(completed);

        if (completed.length > 0) {
          const m = aggregateVarianceMetrics(completed);
          setMetrics(m);

          const settings = getSettings();
          const sug = generateCalibrationSuggestions(completed, settings);
          setSuggestions(sug);
        }

        try {
          const records = await repo.getCalibrationRecords();
          setCalibrationHistory(records);
        } catch { /* table may not exist yet */ }
      } catch (err) {
        console.error('Learning dashboard error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleDecision(suggestion, decision) {
    try {
      const repo = await getRepo();
      const record = {
        metric: suggestion.metric,
        dimension: suggestion.dimension,
        dimension_value: suggestion.dimensionValue,
        previous_value: suggestion.currentValue,
        suggested_value: suggestion.suggestedValue,
        approved_value: decision === 'accepted' ? suggestion.suggestedValue : null,
        sample_size: suggestion.sampleSize,
        confidence: suggestion.confidence,
        owner_decision: decision,
        supporting_job_ids: suggestion.supportingJobIds,
        decided_at: new Date().toISOString(),
        effective_date: decision === 'accepted' ? new Date().toISOString().slice(0, 10) : null,
      };
      await repo.upsertCalibrationRecord(record);

      // Mark suggestion as decided locally
      setSuggestions(prev => prev.map(s =>
        s === suggestion ? { ...s, _decided: true } : s
      ));

      // Refresh history
      const records = await repo.getCalibrationRecords();
      setCalibrationHistory(records);
    } catch (err) {
      console.error('Calibration decision failed:', err);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (completedBookings.length === 0) {
    return (
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-4">Estimate Accuracy & Learning</h2>
        <div className="bg-white rounded-xl border p-6 text-sm text-gray-500">
          No completed jobs with actuals yet. Complete jobs and enter actuals to see accuracy data.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900">Estimate Accuracy & Learning</h2>
        <span className="text-sm text-gray-500">{completedBookings.length} completed jobs</span>
      </div>

      <div className="space-y-4">
        {metrics && <AccuracySummary metrics={metrics} />}
        <DimensionView completedBookings={completedBookings} />
        <CalibrationPanel suggestions={suggestions} onDecision={handleDecision} />
        <CalibrationHistory records={calibrationHistory} />
      </div>
    </div>
  );
}
