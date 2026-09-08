import { useState } from 'react';
import type { WorkItem, OperationalStatus } from './types';
import { companies, individuals, settingsNav } from './types';
import { useWorkItemsContext } from './WorkItemsContext';
import { useSettings } from './useSettings';
import { useGoalData } from './useGoalData';
import { MetricCard, WorkRecommendationCard, WorkRow, RecPill, StatusBadge, sourceLabel } from './components';
import {
  ArrowRight, Building2, CalendarDays, ChevronDown, ChevronRight,
  Clock3, Copy, ExternalLink, Filter, MapPin, Phone, Mail, Plus, TrendingUp,
  User, Wallet, Zap, Briefcase, DollarSign, Target, Percent, Clock,
} from 'lucide-react';
import { getDefaultQuoteFormConfig, mergeQuoteFormConfig } from '../utils/quoteFormConfig';

/* ===== HOME ===== */
export function HomeScreen({ onOpenItem }: { onOpenItem: (item: WorkItem) => void }) {
  const { workItems, loading } = useWorkItemsContext();
  const goal = useGoalData();
  const needsReview = workItems.filter((w) => w.opStatus === 'needs_review');
  const lead = needsReview[0];

  const fmt = (n: number) => '$' + n.toLocaleString();
  const paceClass = goal.paceStatus === 'ahead' || goal.paceStatus === 'achieved' ? 'ahead'
    : goal.paceStatus === 'behind' ? 'behind'
    : goal.paceStatus === 'at_risk' ? 'at-risk'
    : 'on-pace';

  return (
    <div className="dashboard">
      <p className="dashboard-intro">Here's what matters today.</p>
      <section className="summary-grid">
        <MetricCard
          value={fmt(goal.earnedThisWeek)}
          label="Earned this week"
          detail={`${fmt(goal.weeklyTarget)} goal`}
          icon={TrendingUp}
          progress={goal.progressPct}
        />
        <MetricCard
          value={`${goal.availableHours} hrs`}
          label="Available this week"
          detail={`${goal.scheduledJobs} jobs scheduled`}
          icon={Clock3}
        />
        <MetricCard
          value={goal.neededPerHour > 0 ? `$${goal.neededPerHour}/hr` : '--'}
          label="Needed to hit your goal"
          detail="From remaining time"
          icon={Zap}
          accent
        />
        <MetricCard
          value={String(needsReview.length)}
          label="Need review"
          detail="Work requiring attention"
          icon={Briefcase}
        />
      </section>
      <div className="content-grid">
        <div className="primary-column">
          <div className="section-title-row">
            <div><span className="section-kicker">Your next best move</span><h2>Action needed</h2></div>
            <span className="attention-count">{needsReview.length} to review</span>
          </div>
          {lead && <WorkRecommendationCard item={lead} onView={() => onOpenItem(lead)} />}
          {!lead && !loading && (
            <div className="empty-state">
              <p>No jobs need review right now.</p>
            </div>
          )}
          <section className="leads-section">
            <div className="section-title-row">
              <div><span className="section-kicker">Keep moving</span><h2>Other work</h2></div>
            </div>
            <div className="lead-list">
              {needsReview.slice(1).map((item) => <WorkRow key={item.id} item={item} onClick={() => onOpenItem(item)} />)}
            </div>
          </section>
        </div>
        <aside className="right-column">
          <section className="goal-card">
            <div className="section-title-row">
              <div><span className="section-kicker">This week</span><h2>Weekly goal</h2></div>
              {goal.hasGoal && <span className={`pace-badge ${paceClass}`}>{goal.paceLabel}</span>}
            </div>
            {goal.hasGoal ? (
              <>
                <div className="goal-numbers"><strong>{fmt(goal.earnedThisWeek)}</strong><span>/ {fmt(goal.weeklyTarget)}</span></div>
                <div className="goal-progress"><span style={{ width: `${goal.progressPct}%` }} /></div>
                <div className="goal-footer"><span>{goal.progressPct}% of goal</span><strong>{goal.jobsBooked} jobs booked</strong></div>
                {goal.neededPerHour > 0 && (
                  <p className="goal-insight">You need about <strong>${goal.neededPerHour} of profit</strong> per remaining hour to hit your goal.</p>
                )}
              </>
            ) : (
              <p className="goal-insight">Set a goal in Settings to track your progress here.</p>
            )}
          </section>
          <section className="schedule-card">
            <div className="section-title-row">
              <div><span className="section-kicker">Up next</span><h2>Schedule</h2></div>
              <CalendarDays size={19} className="muted-icon" />
            </div>
            {workItems.filter(w => w.opStatus === 'scheduled').slice(0, 3).map((item) => (
              <div key={item.id} className="schedule-item" onClick={() => onOpenItem(item)} style={{ cursor: 'pointer' }}>
                <div className="schedule-date"><strong>{item.preferredDate?.slice(0, 3).toUpperCase() || 'TBD'}</strong></div>
                <div><strong>{item.title}</strong><small>{item.customerName} · {item.hours}</small></div>
              </div>
            ))}
            {workItems.filter(w => w.opStatus === 'scheduled').length === 0 && (
              <div className="schedule-item">
                <div><strong>No scheduled jobs</strong><small className="success-text">Schedule is open</small></div>
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

/* ===== WORK ===== */
export function WorkScreen({ onOpenItem }: { onOpenItem: (item: WorkItem) => void }) {
  const { workItems, loading } = useWorkItemsContext();
  const [filter, setFilter] = useState<string>('All');
  const [showFilters, setShowFilters] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<string>('All');
  const [recFilter, setRecFilter] = useState<string>('All');

  const filters = ['All', 'Needs Review', 'Quoted', 'Scheduled', 'In Progress', 'Completed'];
  const statusMap: Record<string, OperationalStatus | null> = {
    'All': null, 'Needs Review': 'needs_review', 'Quoted': 'quoted', 'Scheduled': 'scheduled', 'In Progress': 'in_progress', 'Completed': 'completed',
  };

  const filtered = workItems.filter((item) => {
    const status = statusMap[filter];
    if (status && item.opStatus !== status) return false;
    if (sourceFilter !== 'All') {
      const sourceVal = sourceFilter === 'Customer Request' ? 'customer_request' : sourceFilter === 'Commercial Work Order' ? 'commercial_work_order' : 'owner_created';
      if (item.source !== sourceVal) return false;
    }
    if (recFilter !== 'All' && item.recommendation !== recFilter.toLowerCase()) return false;
    return true;
  });

  return (
    <div className="dashboard">
      <div className="work-header">
        <div>
          <h1 className="page-title">Work</h1>
          <p className="page-subtitle">Everything coming in and everything you're working on.</p>
        </div>
        <button className="btn-new-quote"><Plus size={17} /> New work</button>
      </div>
      <div className="work-filter-bar">
        <div className="quick-filters">
          {filters.map((f) => (
            <button key={f} className={`quick-filter ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>
        <button className={`filter-toggle ${showFilters ? 'active' : ''}`} onClick={() => setShowFilters(!showFilters)}>
          <Filter size={15} /> Filters {showFilters ? <ChevronDown size={15} className="flip" /> : <ChevronDown size={15} />}
        </button>
      </div>
      {showFilters && (
        <div className="filter-panel">
          <div className="filter-group">
            <label>Source</label>
            <div className="filter-chips">
              {['All', 'Customer Request', 'Commercial Work Order', 'Owner Created'].map((s) => (
                <button key={s} className={`filter-chip ${sourceFilter === s ? 'active' : ''}`} onClick={() => setSourceFilter(s)}>{s}</button>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <label>Recommendation</label>
            <div className="filter-chips">
              {['All', 'Take', 'Review', 'Pass'].map((r) => (
                <button key={r} className={`filter-chip ${recFilter === r ? 'active' : ''}`} onClick={() => setRecFilter(r)}>{r}</button>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className="work-list-section">
        <div className="work-list-header">
          <span>{filtered.length} work items</span>
        </div>
        <div className="lead-list">
          {filtered.map((item) => (
            <button key={item.id} className="work-list-row" onClick={() => onOpenItem(item)}>
              <div className="work-list-thumb"><img src={item.photos[0]} alt={item.title} loading="lazy" /></div>
              <div className="work-list-main">
                <div className="work-list-top"><span className={`source-tag ${item.source === 'commercial_work_order' ? 'commercial' : 'residential'}`}>{sourceLabel(item.source)}</span></div>
                <strong>{item.title}</strong>
                <small>{item.customerName}{item.customerSub ? ` · ${item.customerSub}` : ''}</small>
              </div>
              <div className="work-list-econ">
                <span>${item.profit} profit</span>
                <small>{item.rate} · {item.hours}</small>
              </div>
              <div className="work-list-rec"><RecPill rec={item.recommendation} compact /></div>
              <StatusBadge status={item.opStatus} />
              <ChevronRight className="lead-chevron" size={18} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ===== SCHEDULE ===== */
export function ScheduleScreen({ onOpenItem }: { onOpenItem: (item: WorkItem) => void }) {
  const { workItems } = useWorkItemsContext();
  const scheduled = workItems.filter((w) => w.opStatus === 'scheduled' || w.opStatus === 'approved' || w.opStatus === 'in_progress');
  const days = [
    { day: 'THU', date: 12, items: [{ title: 'Kitchen cabinet repair', time: '9:00 AM', duration: '3 hrs', customer: 'Chris Wallace' }] },
    { day: 'FRI', date: 13, items: [{ title: 'Bathroom tile repair', time: '10:00 AM', duration: '5–6 hrs', customer: 'Sarah Lin' }] },
    { day: 'SAT', date: 14, items: [] },
    { day: 'SUN', date: 15, items: [] },
  ];
  return (
    <div className="dashboard">
      <div className="work-header">
        <div>
          <h1 className="page-title">Schedule</h1>
          <p className="page-subtitle">When am I doing it?</p>
        </div>
      </div>
      <div className="schedule-week">
        {days.map((d) => (
          <div key={d.day} className={`schedule-day ${d.items.length === 0 ? 'empty' : ''}`}>
            <div className="schedule-day-header">
              <div className="schedule-date-lg"><strong>{d.day}</strong><span>{d.date}</span></div>
            </div>
            <div className="schedule-day-items">
              {d.items.map((item, i) => (
                <div key={i} className="schedule-card-item">
                  <strong>{item.title}</strong>
                  <small>{item.customer}</small>
                  <span className="schedule-time">{item.time} · {item.duration}</span>
                </div>
              ))}
              {d.items.length === 0 && <span className="schedule-empty">Open</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="schedule-upcoming">
        <div className="section-title-row"><div><span className="section-kicker">Pipeline</span><h2>Approved & waiting to schedule</h2></div></div>
        <div className="lead-list">
          {workItems.filter((w: WorkItem) => w.opStatus === 'approved').map((item: WorkItem) => (
            <WorkRow key={item.id} item={item} onClick={() => onOpenItem(item)} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ===== CUSTOMERS ===== */
export function CustomersScreen() {
  const [tab, setTab] = useState<'All' | 'People' | 'Companies'>('All');
  return (
    <div className="dashboard">
      <div className="work-header">
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="page-subtitle">Who do I work for?</p>
        </div>
        <button className="btn-new-quote"><Plus size={17} /> Add customer</button>
      </div>
      <div className="quick-filters">
        {(['All', 'People', 'Companies'] as const).map((t) => (
          <button key={t} className={`quick-filter ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      <div className="customers-grid">
        {(tab === 'All' || tab === 'People') && individuals.map((person) => (
          <div key={person.id} className="customer-card">
            <div className="customer-avatar">{person.name.split(' ').map((n) => n[0]).join('')}</div>
            <div className="customer-info">
              <strong>{person.name}</strong>
              <small><Phone size={12} /> {person.phone}</small>
              <small><Mail size={12} /> {person.email}</small>
              <small><MapPin size={12} /> {person.address}</small>
            </div>
            <div className="customer-stats">
              <div><span>{person.jobCount}</span><small>jobs</small></div>
              <div><span>${person.totalRevenue.toLocaleString()}</span><small>revenue</small></div>
            </div>
          </div>
        ))}
        {(tab === 'All' || tab === 'Companies') && companies.map((company) => (
          <div key={company.id} className="customer-card company-card">
            <div className="company-avatar"><Building2 size={22} /></div>
            <div className="customer-info">
              <strong>{company.name}</strong>
              <small><User size={12} /> {company.contactName} · {company.contactRole}</small>
              <small><Phone size={12} /> {company.phone}</small>
              <small><Mail size={12} /> {company.email}</small>
            </div>
            <div className="customer-stats">
              <div><span>{company.properties.length}</span><small>properties</small></div>
              <div><span>${company.totalRevenue.toLocaleString()}</span><small>revenue</small></div>
            </div>
            <div className="company-properties">
              {company.properties.map((prop) => (
                <div key={prop.id} className="property-row">
                  <div className="property-icon"><Building2 size={16} /></div>
                  <div className="property-info">
                    <strong>{prop.name}</strong>
                    <small>{prop.address}</small>
                  </div>
                  <div className="property-stats">
                    <span>{prop.unitCount} units</span>
                    <small>{prop.workOrderCount} work orders</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ===== REPORTS ===== */
export function ReportsScreen() {
  const reportMetrics = [
    { label: 'Revenue', value: '$12,840', detail: 'Last 30 days', icon: DollarSign },
    { label: 'Cash profit', value: '$7,320', detail: '57% margin', icon: Wallet },
    { label: 'Profit / hour', value: '$58/hr', detail: 'Across all jobs', icon: Clock },
    { label: 'Goal performance', value: '102%', detail: 'On track this month', icon: Target },
    { label: 'Win rate', value: '68%', detail: 'Quotes accepted', icon: Percent },
    { label: 'Avg job value', value: '$780', detail: 'Per completed job', icon: TrendingUp },
    { label: 'Capacity utilization', value: '74%', detail: 'Of available hours', icon: Zap },
    { label: 'Pipeline value', value: '$4,200', detail: 'Pending quotes', icon: Briefcase },
  ];
  return (
    <div className="dashboard">
      <div className="work-header">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">Am I making money?</p>
        </div>
      </div>
      <div className="report-filters">
        <div className="quick-filters">
          {['7 Days', '30 Days', '90 Days', 'This Year'].map((f, i) => (
            <button key={f} className={`quick-filter ${i === 1 ? 'active' : ''}`}>{f}</button>
          ))}
        </div>
        <button className="filter-toggle"><Filter size={15} /> Filters <ChevronDown size={15} /></button>
      </div>
      <div className="report-grid">
        {reportMetrics.map((m) => (
          <div key={m.label} className="report-card">
            <div className="report-icon"><m.icon size={18} /></div>
            <div className="report-value">{m.value}</div>
            <div className="report-label">{m.label}</div>
            <div className="report-detail">{m.detail}</div>
          </div>
        ))}
      </div>
      <div className="report-chart-section">
        <div className="section-title-row"><div><span className="section-kicker">Trends</span><h2>Revenue vs profit</h2></div></div>
        <div className="report-chart">
          {[40, 55, 48, 62, 58, 70, 65, 78, 72, 85, 80, 92].map((h, i) => (
            <div key={i} className="chart-bar-group">
              <div className="chart-bars">
                <div className="chart-bar revenue" style={{ height: `${h}%` }} />
                <div className="chart-bar profit" style={{ height: `${h * 0.6}%` }} />
              </div>
              <small>{i % 3 === 0 ? `W${i + 1}` : ''}</small>
            </div>
          ))}
        </div>
        <div className="chart-legend">
          <span><span className="legend-dot revenue" /> Revenue</span>
          <span><span className="legend-dot profit" /> Profit</span>
        </div>
      </div>
    </div>
  );
}

/* ===== SETTINGS ===== */
export function SettingsScreen() {
  const [activeSection, setActiveSection] = useState('Business');
  const { settings, saving, error: saveError, save } = useSettings();

  function field(key: string, fallback: any = '') {
    return settings[key] ?? fallback;
  }

  function handleChange(key: string, value: any) {
    save({ [key]: value });
  }

  return (
    <div className="dashboard settings-dashboard">
      <div className="work-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">How should Rivet evaluate your business?</p>
          {saving && <small className="settings-saving">Saving...</small>}
          {saveError && <small className="settings-save-error">{saveError}</small>}
        </div>
      </div>
      <div className="settings-layout">
        <nav className="settings-nav">
          {settingsNav.map((section) => (
            <button key={section} className={activeSection === section ? 'active' : ''} onClick={() => setActiveSection(section)}>{section}</button>
          ))}
        </nav>
        <div className="settings-content">
          {activeSection === 'Business' && (
            <div className="settings-section">
              <h3>Business profile</h3>
              <div className="settings-field"><label>Business name</label><input type="text" value={field('businessName')} onChange={e => handleChange('businessName', e.target.value)} /></div>
              <div className="settings-field"><label>Home base address</label><input type="text" value={field('homeBaseAddress')} onChange={e => handleChange('homeBaseAddress', e.target.value)} placeholder="Your starting location for travel estimates" /></div>
              <div className="settings-field"><label>Phone</label><input type="text" value={field('phone')} onChange={e => handleChange('phone', e.target.value)} /></div>
              <div className="settings-field"><label>Email</label><input type="text" value={field('email')} onChange={e => handleChange('email', e.target.value)} /></div>
            </div>
          )}
          {activeSection === 'Goals & Capacity' && (
            <div className="settings-section">
              <h3>How much do you want to earn?</h3>
              <div className="settings-field"><label>Weekly earnings goal</label><div className="price-input"><span>$</span><input type="number" value={field('weeklyGoal', 2500)} onChange={e => handleChange('weeklyGoal', Number(e.target.value))} /><span>USD</span></div></div>
              <div className="settings-field"><label>How many hours do you normally work?</label><div className="settings-inline"><input type="number" value={field('weeklyHours', 35)} onChange={e => handleChange('weeklyHours', Number(e.target.value))} /><span>hours / week</span></div></div>
            </div>
          )}
          {activeSection === 'Pricing & Costs' && (
            <div className="settings-section">
              <h3>What does an hour of your time need to be worth?</h3>
              <div className="settings-field"><label>Minimum price (smallest job worth doing)</label><div className="price-input"><span>$</span><input type="number" value={field('minimumPrice', 150)} onChange={e => handleChange('minimumPrice', Number(e.target.value))} /><span>USD</span></div></div>
              <h4>Vehicle costs</h4>
              <div className="settings-field"><label>Gas price per gallon</label><div className="price-input"><span>$</span><input type="number" step="0.10" value={field('gasPrice', 3.50)} onChange={e => handleChange('gasPrice', Number(e.target.value))} /><span>/gal</span></div></div>
              <div className="settings-field"><label>Vehicle MPG</label><div className="price-input"><input type="number" value={field('mpg', 15)} onChange={e => handleChange('mpg', Number(e.target.value))} /><span>mpg</span></div></div>
              <h4>Disposal</h4>
              <div className="settings-field"><label>Dump fee per load</label><div className="price-input"><span>$</span><input type="number" value={field('dumpFee', 25)} onChange={e => handleChange('dumpFee', Number(e.target.value))} /><span>USD</span></div></div>
              <div className="settings-field"><label>Landfill address</label><input type="text" value={field('landfillAddress')} onChange={e => handleChange('landfillAddress', e.target.value)} /></div>
            </div>
          )}
          {activeSection === 'Advanced Engine' && (
            <div className="settings-section">
              <h3>Advanced engine settings</h3>
              <p className="settings-warning">These settings control the decision engine directly. Most owners don't need to change these.</p>
              <div className="settings-field"><label>Minimum margin floor</label><div className="price-input"><input type="number" value={field('minimumMargin', 55)} onChange={e => handleChange('minimumMargin', Number(e.target.value))} /><span>%</span></div></div>
              <div className="settings-field"><label>Minimum job profit</label><div className="price-input"><span>$</span><input type="number" value={field('minimumJobProfit', 75)} onChange={e => handleChange('minimumJobProfit', Number(e.target.value))} /><span>USD</span></div></div>
              <div className="settings-field"><label>Daily capacity limit</label><div className="price-input"><input type="number" value={field('dailyCapacityLimit', 4)} onChange={e => handleChange('dailyCapacityLimit', Number(e.target.value))} /><span>jobs</span></div></div>
            </div>
          )}
          {activeSection === 'Quote Form' && (
            <QuoteFormSettings settings={settings} onSave={save} />
          )}
          {!['Business', 'Goals & Capacity', 'Pricing & Costs', 'Advanced Engine', 'Quote Form'].includes(activeSection) && (
            <div className="settings-section">
              <h3>{activeSection}</h3>
              <p className="settings-placeholder">Configuration for {activeSection.toLowerCase()} will appear here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ===== QUOTE FORM SETTINGS ===== */
function QuoteFormSettings({ settings, onSave }: { settings: any; onSave: (updates: Record<string, any>) => void }) {
  const qfc = mergeQuoteFormConfig(settings.quoteFormConfig || null, 'junk_removal');
  const slug = settings.slug || 'your-business';
  const publicUrl = `${window.location.origin}/request/${slug}`;
  const [copied, setCopied] = useState(false);

  function updateConfig(path: string, value: any) {
    const parts = path.split('.');
    const updated = JSON.parse(JSON.stringify(qfc));
    let obj = updated;
    for (let i = 0; i < parts.length - 1; i++) {
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = value;
    onSave({ quoteFormConfig: updated });
  }

  function copyLink() {
    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="settings-section" style={{ maxWidth: 600 }}>
      {/* Section A: Form Status */}
      <h3>Quote Request Form</h3>
      <div className="settings-field">
        <label>Form status</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => updateConfig('published', !qfc.published)}
            style={{
              padding: '6px 16px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
              backgroundColor: qfc.published ? '#22c55e' : '#374151',
              color: qfc.published ? '#fff' : '#9ca3af',
            }}
          >
            {qfc.published ? 'Published' : 'Unpublished'}
          </button>
          <span style={{ fontSize: 12, color: '#6b7280' }}>
            {qfc.published ? 'Customers can access your form' : 'Form is hidden from customers'}
          </span>
        </div>
      </div>

      {qfc.published && (
        <div className="settings-field">
          <label>Public URL</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <code style={{ flex: 1, fontSize: 12, color: '#d1d5db', background: '#1f2937', padding: '8px 12px', borderRadius: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {publicUrl}
            </code>
            <button onClick={copyLink} title="Copy link" style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #374151', background: 'transparent', cursor: 'pointer', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Copy size={14} />
              <span style={{ fontSize: 12 }}>{copied ? 'Copied!' : 'Copy'}</span>
            </button>
            <a href={publicUrl} target="_blank" rel="noopener noreferrer" title="Preview form" style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #374151', background: 'transparent', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none', fontSize: 12 }}>
              <ExternalLink size={14} />
              Preview
            </a>
          </div>
        </div>
      )}

      {/* Section B: Branding */}
      <h4 style={{ marginTop: 28 }}>Branding</h4>
      <div className="settings-field">
        <label>Tagline</label>
        <input type="text" value={qfc.branding.tagline} onChange={e => updateConfig('branding.tagline', e.target.value)} placeholder="e.g. We Haul It All" />
      </div>
      <div className="settings-field">
        <label>Accent color</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="color" value={qfc.branding.accentColor} onChange={e => updateConfig('branding.accentColor', e.target.value)} style={{ width: 40, height: 32, padding: 0, border: 'none', cursor: 'pointer' }} />
          <input type="text" value={qfc.branding.accentColor} onChange={e => updateConfig('branding.accentColor', e.target.value)} placeholder="#22c55e" style={{ width: 100, fontFamily: 'monospace' }} />
        </div>
      </div>
      <div className="settings-field">
        <label>Phone number</label>
        <input type="text" value={qfc.branding.phone || ''} onChange={e => updateConfig('branding.phone', e.target.value || null)} placeholder="(555) 555-5555" />
      </div>
      <div className="settings-field">
        <label>CTA button text</label>
        <input type="text" value={qfc.branding.ctaText} onChange={e => updateConfig('branding.ctaText', e.target.value)} placeholder="Get Free Estimate" />
      </div>

      {/* Section C: Form Steps */}
      <h4 style={{ marginTop: 28 }}>Photos</h4>
      <div className="settings-field">
        <label>Require photos</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => updateConfig('steps.photos.enabled', !qfc.steps.photos.enabled)}
            style={{
              padding: '6px 16px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
              backgroundColor: qfc.steps.photos.enabled ? '#22c55e' : '#374151',
              color: qfc.steps.photos.enabled ? '#fff' : '#9ca3af',
            }}
          >
            {qfc.steps.photos.enabled ? 'On' : 'Off'}
          </button>
          {!qfc.steps.photos.enabled && (
            <span style={{ fontSize: 12, color: '#f59e0b' }}>Estimate confidence will be lower without photos</span>
          )}
        </div>
      </div>
      {qfc.steps.photos.enabled && (
        <div className="settings-field">
          <label>Minimum photos required</label>
          <div className="settings-inline">
            <input type="number" min={1} max={10} value={qfc.steps.photos.minPhotos} onChange={e => updateConfig('steps.photos.minPhotos', Math.max(1, Math.min(10, Number(e.target.value))))} style={{ width: 60 }} />
            <span>photos</span>
          </div>
        </div>
      )}

      {/* Section D: Field Configuration */}
      <h4 style={{ marginTop: 28 }}>Optional Fields</h4>
      {([
        { key: 'stairs', label: 'Stairs question' },
        { key: 'elevator', label: 'Elevator question' },
        { key: 'description', label: 'Description field' },
        { key: 'secondChoiceDate', label: 'Second choice date' },
      ] as const).map(({ key, label }) => (
        <div key={key} className="settings-field">
          <label>{label}</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => updateConfig(`fields.${key}.enabled`, !(qfc.fields as any)[key].enabled)}
              style={{
                padding: '4px 12px',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 12,
                backgroundColor: (qfc.fields as any)[key].enabled ? '#22c55e' : '#374151',
                color: (qfc.fields as any)[key].enabled ? '#fff' : '#9ca3af',
              }}
            >
              {(qfc.fields as any)[key].enabled ? 'Shown' : 'Hidden'}
            </button>
            {(qfc.fields as any)[key].label !== undefined && (qfc.fields as any)[key].enabled && (
              <input
                type="text"
                value={(qfc.fields as any)[key].label}
                onChange={e => updateConfig(`fields.${key}.label`, e.target.value)}
                placeholder="Custom label"
                style={{ flex: 1, fontSize: 13 }}
              />
            )}
          </div>
        </div>
      ))}

      <h4 style={{ marginTop: 28 }}>Field Labels</h4>
      <div className="settings-field">
        <label>Quantity question</label>
        <input type="text" value={qfc.fields.quantity.label} onChange={e => updateConfig('fields.quantity.label', e.target.value)} />
      </div>
      <div className="settings-field">
        <label>Access type question</label>
        <input type="text" value={qfc.fields.accessType.label} onChange={e => updateConfig('fields.accessType.label', e.target.value)} />
      </div>
      <div className="settings-field">
        <label>Time preference question</label>
        <input type="text" value={qfc.fields.timePreference.label} onChange={e => updateConfig('fields.timePreference.label', e.target.value)} />
      </div>

      {/* Section E: Lead Notifications */}
      <h4 style={{ marginTop: 28 }}>Lead Notifications</h4>
      <div className="settings-field">
        <label>Email me when a request arrives</label>
        <button
          onClick={() => updateConfig('notifications.emailOnRequest', !qfc.notifications.emailOnRequest)}
          style={{
            padding: '6px 16px',
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 13,
            backgroundColor: qfc.notifications.emailOnRequest ? '#22c55e' : '#374151',
            color: qfc.notifications.emailOnRequest ? '#fff' : '#9ca3af',
          }}
        >
          {qfc.notifications.emailOnRequest ? 'On' : 'Off'}
        </button>
      </div>
      {qfc.notifications.emailOnRequest && (
        <div className="settings-field">
          <label>Notification email</label>
          <input type="email" value={qfc.notifications.notifyEmail || ''} onChange={e => updateConfig('notifications.notifyEmail', e.target.value || null)} placeholder="Defaults to your account email" />
        </div>
      )}

      {/* Section F: Confirmation */}
      <h4 style={{ marginTop: 28 }}>Confirmation Screen</h4>
      <div className="settings-field">
        <label>Headline</label>
        <input type="text" value={qfc.confirmation.headline} onChange={e => updateConfig('confirmation.headline', e.target.value)} />
      </div>
      <div className="settings-field">
        <label>Body text</label>
        <textarea value={qfc.confirmation.body} onChange={e => updateConfig('confirmation.body', e.target.value)} rows={3} style={{ width: '100%', resize: 'vertical' }} />
      </div>
    </div>
  );
}

/* ===== PLACEHOLDER for unbuilt screens ===== */
export function PlaceholderScreen({ title, subtitle, description }: { title: string; subtitle: string; description: string }) {
  return (
    <div className="dashboard">
      <div className="work-header">
        <div>
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">{subtitle}</p>
        </div>
      </div>
      <div className="placeholder-page inline">
        <div className="placeholder-icon"><Briefcase size={28} /></div>
        <h2>{description}</h2>
      </div>
    </div>
  );
}
