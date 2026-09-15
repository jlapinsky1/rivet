import React, { useState, useEffect, useCallback } from 'react';
import { getRepo } from '../utils/repository';
import { calculateGoalProgress, generateAlerts, getTodayProgress, getWeekProgress, extractExpectedProfit, calculateDynamicTargets } from '../utils/goalEngine';
import { PACE_STATUS_COLORS, PACE_STATUS_LABELS, GOAL_TYPE_LABELS, ALERT_SEVERITY, DEFAULT_WORKING_DAYS, GUARDRAIL_LABELS } from '../utils/goalDefaults';
import { evaluateDecision, DECISION_COLORS, DECISION_LABELS } from '../utils/decisionEngine';
import { buildEstimate } from '../utils/estimateBuilder';
import { detectRiskFlags, calculateConfidence } from '../utils/riskFlags';
import { rateJob } from '../utils/jobRating';
import { getSettings } from '../utils/storage';

function formatCurrency(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatPct(n) {
  return (Number(n) || 0).toFixed(1) + '%';
}

// ── Goal Period helpers ──

function getMonthDates(year, month) {
  const start = new Date(year, month, 1).toISOString().slice(0, 10);
  const end = new Date(year, month + 1, 0).toISOString().slice(0, 10);
  return { start, end };
}

function getWeekDates() {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  };
}

function getQuarterDates(year, quarter) {
  const startMonth = (quarter - 1) * 3;
  const start = new Date(year, startMonth, 1).toISOString().slice(0, 10);
  const end = new Date(year, startMonth + 3, 0).toISOString().slice(0, 10);
  return { start, end };
}

function getCurrentQuarter() {
  return Math.floor(new Date().getMonth() / 3) + 1;
}

function getGoalPeriodLabel(goal) {
  if (!goal) return '';
  const start = new Date(goal.start_date + 'T12:00:00');
  const end = new Date(goal.end_date + 'T12:00:00');
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  // Check if it's a single month
  if (start.getDate() === 1) {
    const lastDay = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    if (end.getDate() === lastDay && start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
      return `${monthNames[start.getMonth()]} ${start.getFullYear()}`;
    }
  }

  // Check if it's a week (7 days)
  const diffDays = Math.round((end - start) / (1000 * 60 * 60 * 24));
  if (diffDays === 6) {
    return `Week of ${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }

  // Check if it's a quarter
  if (start.getDate() === 1 && (start.getMonth() % 3 === 0)) {
    const qEnd = new Date(start.getFullYear(), start.getMonth() + 3, 0);
    if (end.getDate() === qEnd.getDate() && end.getMonth() === qEnd.getMonth()) {
      const q = Math.floor(start.getMonth() / 3) + 1;
      return `Q${q} ${start.getFullYear()}`;
    }
  }

  return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

// ── Goal Setup Modal ──

function GoalSetupModal({ onSave, onClose, existingGoal }) {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const [period, setPeriod] = useState('monthly');
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedQuarter, setSelectedQuarter] = useState(getCurrentQuarter());

  const dates = period === 'weekly' ? getWeekDates()
    : period === 'monthly' ? getMonthDates(selectedYear, selectedMonth)
    : period === 'quarterly' ? getQuarterDates(selectedYear, selectedQuarter)
    : null;

  const [form, setForm] = useState({
    goal_type: existingGoal?.goal_type || 'cash_profit',
    target_amount: existingGoal?.target_amount || '',
    start_date: existingGoal?.start_date || dates?.start || '',
    end_date: existingGoal?.end_date || dates?.end || '',
    working_days_config: existingGoal?.working_days_config || { days: [...DEFAULT_WORKING_DAYS] },
    daily_capacity_limit: existingGoal?.daily_capacity_limit || 4,
    minimum_margin: existingGoal?.minimum_margin != null ? (existingGoal.minimum_margin * 100) : 55,
    minimum_job_profit: existingGoal?.minimum_job_profit || 75,
    active: true,
  });
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Update dates when period/month/quarter changes (but not for custom)
  useEffect(() => {
    if (period === 'custom') return;
    const d = period === 'weekly' ? getWeekDates()
      : period === 'monthly' ? getMonthDates(selectedYear, selectedMonth)
      : getQuarterDates(selectedYear, selectedQuarter);
    setForm(f => ({ ...f, start_date: d.start, end_date: d.end }));
  }, [period, selectedMonth, selectedYear, selectedQuarter]);

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function toggleDay(dayNum) {
    const days = form.working_days_config.days.includes(dayNum)
      ? form.working_days_config.days.filter(d => d !== dayNum)
      : [...form.working_days_config.days, dayNum].sort();
    setForm(f => ({ ...f, working_days_config: { days } }));
  }

  function handleSave() {
    if (!form.target_amount || Number(form.target_amount) <= 0) return;

    // Build goal data synchronously
    const goalData = {
      id: existingGoal?.id || crypto.randomUUID(),
      goal_type: form.goal_type,
      target_amount: Number(form.target_amount),
      start_date: form.start_date,
      end_date: form.end_date,
      working_days_config: form.working_days_config,
      daily_capacity_limit: Number(form.daily_capacity_limit) || 4,
      minimum_margin: Number(form.minimum_margin) / 100,
      minimum_job_profit: Number(form.minimum_job_profit) || 75,
      active: true,
    };

    // Close modal immediately, parent handles persistence
    onSave(goalData);
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold text-gray-900">{existingGoal ? 'Edit Goal' : 'Set Goal'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Goal Period */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Goal Period</label>
            <div className="grid grid-cols-4 gap-1">
              {['weekly', 'monthly', 'quarterly', 'custom'].map(p => (
                <button key={p} type="button" onClick={() => setPeriod(p)}
                  className={`py-2 px-2 rounded-lg text-xs font-medium capitalize ${
                    period === p ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >{p}</button>
              ))}
            </div>
          </div>

          {/* Period selector */}
          {period === 'monthly' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Month</label>
                <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  {monthNames.map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Year</label>
                <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  {[currentYear - 1, currentYear, currentYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
          )}

          {period === 'quarterly' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Quarter</label>
                <select value={selectedQuarter} onChange={e => setSelectedQuarter(Number(e.target.value))}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  {[1, 2, 3, 4].map(q => <option key={q} value={q}>Q{q}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Year</label>
                <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  {[currentYear - 1, currentYear, currentYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
          )}

          {period === 'weekly' && (
            <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-600">
              This week: {new Date(form.start_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} &ndash; {new Date(form.end_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          )}

          {period === 'custom' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Start Date</label>
                <input type="date" value={form.start_date}
                  onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">End Date</label>
                <input type="date" value={form.end_date}
                  onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
          )}

          {/* Goal Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Goal Type</label>
            <select value={form.goal_type}
              onChange={e => setForm(f => ({ ...f, goal_type: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm">
              {Object.entries(GOAL_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {/* Target Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Target Amount ($)</label>
            <input type="number" value={form.target_amount}
              onChange={e => setForm(f => ({ ...f, target_amount: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="15000" min="0" />
          </div>

          {/* Working Days */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Working Days</label>
            <div className="flex gap-1">
              {dayLabels.map((label, i) => (
                <button key={i} type="button" onClick={() => toggleDay(i)}
                  className={`flex-1 py-1.5 text-xs rounded-lg font-medium ${
                    form.working_days_config.days.includes(i)
                      ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'
                  }`}
                >{label}</button>
              ))}
            </div>
          </div>

          {/* Advanced toggle */}
          <button type="button" onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-blue-600 hover:underline">
            {showAdvanced ? 'Hide advanced' : 'Show advanced'}
          </button>

          {showAdvanced && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{GUARDRAIL_LABELS.minimum_margin} (%)</label>
                  <input type="number" value={form.minimum_margin}
                    onChange={e => setForm(f => ({ ...f, minimum_margin: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm" min="0" max="100" />
                  <p className="text-xs text-gray-400 mt-1">Jobs below this margin are flagged for review. This is a hard safety limit.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{GUARDRAIL_LABELS.minimum_job_profit} ($)</label>
                  <input type="number" value={form.minimum_job_profit}
                    onChange={e => setForm(f => ({ ...f, minimum_job_profit: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm" min="0" />
                  <p className="text-xs text-gray-400 mt-1">Jobs below this profit are flagged for review. This is a hard safety limit.</p>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Maximum Jobs Per Day</label>
                <input type="number" value={form.daily_capacity_limit}
                  onChange={e => setForm(f => ({ ...f, daily_capacity_limit: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm" min="1" />
                <p className="text-xs text-gray-400 mt-1">Maximum number of jobs the system should recommend scheduling on a normal working day.</p>
              </div>
              {/* Custom dates shown here too */}
              {period !== 'custom' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Start Date</label>
                    <input type="date" value={form.start_date}
                      onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">End Date</label>
                    <input type="date" value={form.end_date}
                      onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Goal Summary */}
          <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-800">
            <span className="font-semibold">{GOAL_TYPE_LABELS[form.goal_type]}</span>
            {form.target_amount && <span> &middot; {formatCurrency(form.target_amount)}</span>}
            {form.start_date && form.end_date && (
              <span className="text-blue-600"> &middot; {getGoalPeriodLabel({ start_date: form.start_date, end_date: form.end_date })}</span>
            )}
          </div>

          <button type="button" onClick={handleSave} disabled={!form.target_amount}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50">
            {existingGoal ? 'Update Goal' : 'Set Goal'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Weekly Operations Scorecard (Hero) ──

function WeeklyScorecard({ week, progress, goal }) {
  const paceColor = PACE_STATUS_COLORS[progress.paceStatus] || PACE_STATUS_COLORS.on_pace;
  const paceLabel = PACE_STATUS_LABELS[progress.paceStatus] || 'Unknown';

  const weeklyTotal = week.completedThisWeek + week.bookedThisWeek;
  const barPct = week.weeklyTarget > 0 ? Math.min(100, (weeklyTotal / week.weeklyTarget) * 100) : 0;

  return (
    <div className="bg-white rounded-xl border p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-gray-900 text-lg">This Week</h3>
          <div className="text-xs text-gray-500 mt-0.5">{GOAL_TYPE_LABELS[goal.goal_type]} &middot; {getGoalPeriodLabel(goal)}</div>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${paceColor}`}>
          {paceLabel}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-5">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>{formatPct(barPct)} of weekly target</span>
          <span>{formatCurrency(week.weeklyTarget)}</span>
        </div>
        <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              progress.paceStatus === 'achieved' ? 'bg-emerald-500'
              : progress.paceStatus === 'ahead' ? 'bg-green-500'
              : progress.paceStatus === 'on_pace' ? 'bg-blue-500'
              : progress.paceStatus === 'at_risk' ? 'bg-amber-500'
              : 'bg-red-500'
            }`}
            style={{ width: `${barPct}%` }}
          />
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-4 gap-y-4">
        <ScoreMetric label="Goal" value={formatCurrency(goal.target_amount)} sub="period total" />
        <ScoreMetric label="Completed" value={formatCurrency(week.completedThisWeek)} sub="this week" accent="green" />
        <ScoreMetric label="Booked" value={formatCurrency(week.bookedThisWeek)} sub="scheduled" accent="blue" />
        <ScoreMetric label="Pipeline" value={formatCurrency(progress.pipelineProfit)} sub="weighted" />
        <ScoreMetric label="Remaining" value={formatCurrency(week.remainingWeekly)} sub="this week" accent={week.remainingWeekly > 0 ? 'amber' : 'green'} />
        <ScoreMetric label="Projected" value={formatCurrency(progress.projectedEOP)} sub="end of period" />
        <ScoreMetric label="Days Left" value={progress.workingDaysRemaining} sub="working days" />
        <ScoreMetric label="Need Today" value={formatCurrency(progress.requiredDailyProfit)} sub="daily target" accent="blue" />
      </div>
    </div>
  );
}

function ScoreMetric({ label, value, sub, accent }) {
  const colors = {
    green: 'text-green-700',
    blue: 'text-blue-700',
    amber: 'text-amber-700',
    red: 'text-red-700',
  };
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-lg font-bold ${accent ? colors[accent] : 'text-gray-900'}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
    </div>
  );
}

// ── Today's Plan ──

function TodayPlan({ today, dynamicTargets }) {
  const truckPct = today.capacityLimit > 0 ? Math.round((today.capacityBooked / today.capacityLimit) * 100) : 0;
  const dt = dynamicTargets;

  return (
    <div className="bg-white rounded-xl border p-5">
      <h3 className="font-bold text-gray-900 mb-3">Today's Plan</h3>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <div className="text-xs text-gray-500">Need</div>
          <div className="text-lg font-bold text-gray-900">{formatCurrency(today.profitNeededToday)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Booked</div>
          <div className="text-lg font-bold text-green-700">{formatCurrency(today.bookedProfitToday + today.completedProfitToday)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Remaining</div>
          <div className={`text-lg font-bold ${today.remainingDaily > 0 ? 'text-amber-700' : 'text-green-700'}`}>
            {formatCurrency(today.remainingDaily)}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4 mt-3 pt-3 border-t">
        <div>
          <div className="text-xs text-gray-500">Jobs</div>
          <div className="font-semibold text-gray-900">{today.capacityBooked} / {today.capacityLimit}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Truck</div>
          <div className="font-semibold text-gray-900">{truckPct}%</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Hours</div>
          <div className="font-semibold text-gray-900">{today.estimatedHours}h</div>
        </div>
      </div>

      {/* Dynamic Targets */}
      {dt && dt.openSlots > 0 && !dt.todayCovered && (
        <div className="mt-3 pt-3 border-t bg-blue-50 -mx-5 -mb-5 px-5 pb-4 rounded-b-xl">
          <div className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-2">Dynamic Targets</div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-blue-600">Remaining Profit</div>
              <div className="text-lg font-bold text-blue-800">{formatCurrency(dt.remainingDailyProfit)}</div>
            </div>
            <div>
              <div className="text-xs text-blue-600">Open Capacity</div>
              <div className="text-lg font-bold text-blue-800">{dt.openSlots} {dt.openSlots === 1 ? 'Job' : 'Jobs'}</div>
            </div>
            <div>
              <div className="text-xs text-blue-600">Target / Slot</div>
              <div className="text-lg font-bold text-blue-800">~{formatCurrency(dt.suggestedPerSlot)}</div>
            </div>
          </div>
          <div className="text-xs text-blue-500 mt-1">Advisory targets based on remaining goal and capacity. Not hard rules.</div>
        </div>
      )}
      {dt && dt.todayCovered && (
        <div className="mt-3 pt-3 border-t">
          <div className="text-sm text-green-700 font-medium">Today's profit target is covered by booked work.</div>
        </div>
      )}
    </div>
  );
}

// ── Recommended Jobs ──

function RecommendedJobs({ pendingBookings, goalProgress, goal, dynamicTargets, scheduleContext }) {
  if (!pendingBookings || pendingBookings.length === 0) {
    return (
      <div className="bg-white rounded-xl border p-5">
        <h3 className="font-bold text-gray-900 mb-3">Recommended Jobs</h3>
        <div className="text-center py-6 text-gray-400">
          <p className="text-sm">No pending requests to evaluate.</p>
          <p className="text-xs mt-1">New customer submissions will appear here with recommendations.</p>
        </div>
      </div>
    );
  }

  const settings = getSettings();

  // Evaluate each pending booking through the decision engine
  const evaluated = pendingBookings
    .map(booking => {
      try {
        const estimate = buildEstimate(booking, settings);
        if (!estimate) return null;
        const riskFlags = detectRiskFlags(booking, estimate);
        const confidence = calculateConfidence(booking, riskFlags);
        const jobRating = rateJob(estimate, confidence);
        const decision = evaluateDecision({
          estimate,
          confidence,
          jobRating,
          riskFlags,
          blockerOverrides: {},
          goalProgress,
          goal,
          scheduleContext: scheduleContext || null,
          dynamicTargets: dynamicTargets || null,
        });
        return { booking, estimate, decision, confidence };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.decision.score - a.decision.score)
    .slice(0, 3);

  if (evaluated.length === 0) {
    return (
      <div className="bg-white rounded-xl border p-5">
        <h3 className="font-bold text-gray-900 mb-3">Recommended Jobs</h3>
        <div className="text-center py-6 text-gray-400">
          <p className="text-sm">Pending requests could not be evaluated.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border p-5">
      <h3 className="font-bold text-gray-900 mb-3">Recommended Jobs</h3>
      <div className="space-y-3">
        {evaluated.map(({ booking, estimate, decision, confidence }) => (
          <div key={booking.id}
            className={`rounded-lg border-2 p-3 ${DECISION_COLORS[decision.recommendation]}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-sm">{booking.customerName || 'Unnamed'}</span>
              <span className="font-bold text-sm">{DECISION_LABELS[decision.recommendation]}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs mt-2">
              <div>
                <span className="opacity-70">Profit: </span>
                <span className="font-semibold">{formatCurrency(estimate.estimatedProfit)}</span>
              </div>
              <div>
                <span className="opacity-70">Margin: </span>
                <span className="font-semibold">{(estimate.estimatedMargin * 100).toFixed(0)}%</span>
              </div>
              <div>
                <span className="opacity-70">Score: </span>
                <span className="font-semibold">{decision.score}/100</span>
              </div>
            </div>
            {decision.explanation && (
              <div className="text-xs mt-2 opacity-85 leading-relaxed">{decision.explanation}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Operational Alerts ──

function OperationalAlerts({ alerts, today, progress }) {
  const allAlerts = [...alerts];

  // Unused capacity alert
  if (today && today.capacityBooked < today.capacityLimit && today.remainingDaily > 0) {
    const unused = today.capacityLimit - today.capacityBooked;
    allAlerts.push({
      type: 'unused_capacity',
      severity: 'info',
      message: `${unused} open job slot${unused > 1 ? 's' : ''} today with ${formatCurrency(today.remainingDaily)} remaining to hit daily target.`,
    });
  }

  if (allAlerts.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="font-bold text-gray-900">Alerts</h3>
      {allAlerts.map((alert, i) => (
        <div key={i} className={`rounded-lg border px-4 py-2.5 text-sm ${ALERT_SEVERITY[alert.severity]}`}>
          {alert.message}
        </div>
      ))}
    </div>
  );
}

// ── Upcoming Schedule ──

function UpcomingSchedule({ scheduledToday, scheduledTomorrow, goal }) {
  const hasAny = (scheduledToday?.length > 0) || (scheduledTomorrow?.length > 0);

  if (!hasAny) {
    return (
      <div className="bg-white rounded-xl border p-5">
        <h3 className="font-bold text-gray-900 mb-3">Upcoming Schedule</h3>
        <div className="text-center py-6 text-gray-400">
          <p className="text-sm">No scheduled jobs today or tomorrow.</p>
          <p className="text-xs mt-1">Review pending requests or create a new quote.</p>
        </div>
      </div>
    );
  }

  function renderJob(slot) {
    const b = slot.bookings || slot;
    const profit = b.internal_estimate
      ? extractExpectedProfit(b, goal?.goal_type || 'cash_profit')
      : Number(b.approved_quote) || 0;
    const duration = b.internal_estimate?.estimatedOnSiteHours;
    const volume = b.internal_estimate?.estimatedVolumePct;

    return (
      <div key={slot.booking_id || b.id} className="flex items-center justify-between py-2 border-b last:border-0">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-800 truncate">
            {b.full_address || b.fullAddress || 'No address'}
          </div>
          <div className="text-xs text-gray-500 flex gap-3 mt-0.5">
            {slot.start_time && <span>{slot.start_time}</span>}
            {duration && <span>{duration.toFixed(1)}h</span>}
            {volume && <span>{volume}% truck</span>}
            {b.quantity && <span>{b.quantity}</span>}
          </div>
        </div>
        <div className="text-right ml-3">
          <div className="text-sm font-bold text-gray-900">{formatCurrency(profit)}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border p-5">
      <h3 className="font-bold text-gray-900 mb-3">Upcoming Schedule</h3>
      {scheduledToday?.length > 0 && (
        <div className="mb-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Today</div>
          {scheduledToday.map(renderJob)}
        </div>
      )}
      {scheduledTomorrow?.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Tomorrow</div>
          {scheduledTomorrow.map(renderJob)}
        </div>
      )}
    </div>
  );
}

// ── Quick Actions ──

function QuickActions({ onNavigate }) {
  const actions = [
    { id: 'quote', label: 'New Quote', icon: '+' },
    { id: 'requests', label: 'Review Requests', icon: '\u2709' },
    { id: 'learning', label: 'View Learning', icon: '\u2191' },
    { id: 'history', label: 'History', icon: '\u2630' },
    { id: 'settings', label: 'Settings', icon: '\u2699' },
  ];

  return (
    <div className="flex gap-2 flex-wrap">
      {actions.map(a => (
        <button key={a.id} onClick={() => onNavigate(a.id)}
          className="flex items-center gap-1.5 px-3 py-2 bg-white border rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors">
          <span className="text-gray-400">{a.icon}</span>
          {a.label}
        </button>
      ))}
    </div>
  );
}

// ── Current Goal Banner ──

function GoalBanner({ goal, onEdit }) {
  return (
    <div className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5">
      <div className="text-sm text-gray-600">
        <span className="font-medium text-gray-800">{GOAL_TYPE_LABELS[goal.goal_type]}</span>
        <span className="mx-1.5 text-gray-300">|</span>
        <span>{formatCurrency(goal.target_amount)}</span>
        <span className="mx-1.5 text-gray-300">|</span>
        <span className="text-gray-500">{getGoalPeriodLabel(goal)}</span>
      </div>
      <button onClick={onEdit} className="text-xs text-blue-600 hover:underline font-medium">Edit Goal</button>
    </div>
  );
}

// ── No Goal Empty State ──

function NoGoalState({ onSetGoal }) {
  return (
    <div className="text-center py-16">
      <div className="text-gray-400 text-4xl mb-3">{'\u{1F3AF}'}</div>
      <h2 className="text-xl font-bold text-gray-800 mb-2">Set Your First Goal</h2>
      <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
        Define a profit target and the dashboard will track your pace, recommend jobs, and alert you to problems.
      </p>
      <button onClick={onSetGoal}
        className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium text-sm hover:bg-blue-700">
        Set Goal
      </button>
    </div>
  );
}

// ── Main Dashboard ──

export default function Dashboard({ onNavigate }) {
  const [goal, setGoal] = useState(null);
  const [goalType, setGoalType] = useState('cash_profit');
  const [progress, setProgress] = useState(null);
  const [today, setToday] = useState(null);
  const [week, setWeek] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [pendingBookings, setPendingBookings] = useState([]);
  const [scheduledToday, setScheduledToday] = useState([]);
  const [scheduledTomorrow, setScheduledTomorrow] = useState([]);
  const [dynamicTargets, setDynamicTargets] = useState(null);
  const [scheduleContext, setScheduleContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showGoalModal, setShowGoalModal] = useState(false);

  const loadDashboard = useCallback(async (activeGoal) => {
    if (!activeGoal) { setLoading(false); return; }
    try {
      const repo = await getRepo();

      const [completed, scheduledRaw, pipeline] = await Promise.all([
        repo.getCompletedBookingsInRange(activeGoal.start_date, activeGoal.end_date),
        repo.getActiveBookingsByStatus(['scheduled']),
        repo.getActiveBookingsByStatus(['pending_review', 'quote_sent']),
      ]);

      // Save pending bookings for Recommended Jobs
      const pending = pipeline.filter(b => b.status === 'pending_review' || b.status === 'quote_sent');
      setPendingBookings(pending);

      const prog = calculateGoalProgress(activeGoal, completed, scheduledRaw, pipeline);
      setProgress(prog);

      // Today's bookings
      const todayStr = new Date().toISOString().slice(0, 10);
      const todayBookings = [...completed, ...scheduledRaw].filter(b => {
        if (b.status === 'completed' && b.completed_at) {
          return b.completed_at.slice(0, 10) === todayStr;
        }
        return false;
      });

      let todaySlots = [];
      let todayProg;
      try {
        todaySlots = await repo.getScheduledBookingsForDateRange(todayStr, todayStr);
        const scheduledTodayList = todaySlots
          .filter(s => s.bookings)
          .map(s => ({ ...s.bookings, status: 'scheduled' }));
        setScheduledToday(todaySlots.filter(s => s.bookings));
        const allToday = [...todayBookings, ...scheduledTodayList];
        todayProg = getTodayProgress(activeGoal, allToday, prog);
      } catch {
        todayProg = getTodayProgress(activeGoal, todayBookings, prog);
      }
      setToday(todayProg);

      // Calculate dynamic targets and schedule context
      const dt = calculateDynamicTargets(prog, todayProg, activeGoal);
      setDynamicTargets(dt);
      setScheduleContext({
        jobsToday: todayProg.capacityBooked,
        capacityLimit: todayProg.capacityLimit,
      });

      // Tomorrow's scheduled
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().slice(0, 10);
      try {
        const tomorrowSlots = await repo.getScheduledBookingsForDateRange(tomorrowStr, tomorrowStr);
        setScheduledTomorrow(tomorrowSlots.filter(s => s.bookings));
      } catch { /* table may not exist */ }

      // This week's bookings
      const now = new Date();
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(now);
      monday.setDate(now.getDate() + mondayOffset);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const mondayStr = monday.toISOString().slice(0, 10);
      const sundayStr = sunday.toISOString().slice(0, 10);

      const weekCompleted = completed.filter(b =>
        b.completed_at && b.completed_at.slice(0, 10) >= mondayStr && b.completed_at.slice(0, 10) <= sundayStr
      );
      let weekScheduled = [];
      try {
        const weekSlots = await repo.getScheduledBookingsForDateRange(mondayStr, sundayStr);
        weekScheduled = weekSlots
          .filter(s => s.bookings)
          .map(s => ({ ...s.bookings, status: 'scheduled' }));
      } catch { /* table may not exist yet */ }

      setWeek(getWeekProgress(activeGoal, [...weekCompleted, ...weekScheduled], prog));

      const generatedAlerts = generateAlerts(prog, activeGoal);
      setAlerts(generatedAlerts);

      // Save daily snapshot
      try {
        await repo.saveGoalSnapshot({
          goal_id: activeGoal.id,
          snapshot_date: todayStr,
          completed_profit: prog.completedProfit,
          booked_profit: prog.bookedProfit,
          pipeline_profit: prog.pipelineProfit,
          pct_achieved: prog.pctAchieved,
          pace_status: prog.paceStatus,
          jobs_completed: prog.jobsCompleted,
          avg_daily_profit: prog.avgDailyProfit,
          required_daily_profit: prog.requiredDailyProfit,
        });
      } catch { /* non-critical */ }
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const repo = await getRepo();
        const activeGoal = await repo.getActiveGoal(goalType);
        setGoal(activeGoal);
        await loadDashboard(activeGoal);
      } catch (err) {
        console.error('Failed to load goal:', err);
        setLoading(false);
      }
    })();
  }, [goalType, loadDashboard]);

  async function handleGoalSaved(goalData) {
    setShowGoalModal(false);
    setGoal(goalData);
    setLoading(true);
    try {
      const repo = await getRepo();
      const persisted = await repo.upsertGoal(goalData);
      setGoal(persisted);
      await loadDashboard(persisted);
    } catch (err) {
      console.error('Failed to persist goal:', err);
      // Still try to load dashboard with the in-memory goal
      await loadDashboard(goalData);
    }
  }

  // Navigation handler - try parent prop first, fall back to finding AdminDashboard's setActiveTab
  function handleNavigate(tab) {
    if (onNavigate) {
      onNavigate(tab);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  // No goal set yet
  if (!goal) {
    return (
      <div>
        <NoGoalState onSetGoal={() => setShowGoalModal(true)} />
        {showGoalModal && (
          <GoalSetupModal onSave={handleGoalSaved} onClose={() => setShowGoalModal(false)} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Goal type tabs + banner */}
      <div className="flex items-center gap-2">
        {Object.entries(GOAL_TYPE_LABELS).map(([key, label]) => (
          <button key={key} onClick={() => setGoalType(key)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
              goalType === key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >{label}</button>
        ))}
      </div>

      {/* Goal banner */}
      <GoalBanner goal={goal} onEdit={() => setShowGoalModal(true)} />

      {progress && week && (
        <>
          {/* 1. Weekly Operations Scorecard (Hero) */}
          <WeeklyScorecard week={week} progress={progress} goal={goal} />

          {/* 2. Today's Plan */}
          {today && <TodayPlan today={today} dynamicTargets={dynamicTargets} />}

          {/* 3. Recommended Jobs */}
          <RecommendedJobs pendingBookings={pendingBookings} goalProgress={progress} goal={goal} dynamicTargets={dynamicTargets} scheduleContext={scheduleContext} />

          {/* 4. Operational Alerts */}
          <OperationalAlerts alerts={alerts} today={today} progress={progress} />

          {/* 5. Upcoming Schedule */}
          <UpcomingSchedule scheduledToday={scheduledToday} scheduledTomorrow={scheduledTomorrow} goal={goal} />

          {/* 6. Quick Actions */}
          <QuickActions onNavigate={handleNavigate} />
        </>
      )}

      {/* Goal Edit Modal */}
      {showGoalModal && (
        <GoalSetupModal onSave={handleGoalSaved} onClose={() => setShowGoalModal(false)} existingGoal={goal} />
      )}
    </div>
  );
}
