import { useState } from 'react';
import type { WorkItem } from './types';
import { navItems } from './types';
import { WorkDetailDrawer } from './WorkDetailDrawer';
import { WorkItemsProvider, useWorkItemsContext } from './WorkItemsContext';
import { HomeScreen, WorkScreen, ScheduleScreen, CustomersScreen, ReportsScreen, SettingsScreen } from './screens';
import { ChevronDown, ChevronRight, CircleHelp, LogOut, Menu, Plus, Settings, TrendingUp } from 'lucide-react';

function Sidebar({ active, setActive, mobileOpen, closeMobile, businessName, businessInitials, onSignOut }: {
  active: string;
  setActive: (label: string) => void;
  mobileOpen: boolean;
  closeMobile: () => void;
  businessName: string;
  businessInitials: string;
  onSignOut: () => void;
}) {
  return (
    <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
      <div className="brand">
        <div className="brand-mark"><TrendingUp size={18} /></div>
        <span>Rivet</span>
      </div>
      <div className="business-switcher">
        <div className="business-avatar">{businessInitials}</div>
        <div className="business-info">
          <strong>{businessName}</strong>
          <small>Owner account</small>
        </div>
        <ChevronDown size={16} className="switcher-chevron" />
      </div>
      <nav>
        {navItems.map(({ label, icon: Icon, count }) => (
          <button key={label} className={active === label ? 'active' : ''} onClick={() => { setActive(label); closeMobile(); }}>
            <Icon size={19} />
            <span>{label}</span>
            {count && <b>{count}</b>}
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <button onClick={() => { setActive('Settings'); closeMobile(); }} className={active === 'Settings' ? 'active' : ''}>
          <Settings size={19} />
          <span>Settings</span>
        </button>
        <button onClick={onSignOut} className="sign-out-btn">
          <LogOut size={19} />
          <span>Sign Out</span>
        </button>
        <div className="support-card">
          <CircleHelp size={18} />
          <div>
            <strong>Need a hand?</strong>
            <small>Visit the help center</small>
          </div>
        </div>
      </div>
    </aside>
  );
}

function MobileBottomNav({ active, setActive }: { active: string; setActive: (label: string) => void }) {
  const items = navItems.slice(0, 5);
  return (
    <nav className="mobile-bottom-nav">
      {items.map(({ label, icon: Icon, count }) => (
        <button key={label} className={active === label ? 'active' : ''} onClick={() => setActive(label)}>
          <Icon size={20} />
          <span>{label}</span>
          {count && <b>{count}</b>}
        </button>
      ))}
    </nav>
  );
}

function DrawerWithRefresh({ item, onClose }: { item: WorkItem; onClose: () => void }) {
  const { refresh } = useWorkItemsContext();
  return <WorkDetailDrawer item={item} onClose={onClose} onActionComplete={refresh} />;
}

export default function RivetDashboard({ businessName, businessInitials, displayName, onSignOut }: {
  businessName: string;
  businessInitials: string;
  displayName?: string;
  onSignOut: () => void;
}) {
  const [active, setActive] = useState('Home');
  const [selectedItem, setSelectedItem] = useState<WorkItem | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const openItem = (item: WorkItem) => setSelectedItem(item);
  const closeItem = () => setSelectedItem(null);

  const greeting = displayName || businessName.split(' ')[0] || 'there';
  const topbarTitle = active === 'Home' ? `Good morning, ${greeting}` : active;
  const topbarCrumb = active === 'Home' ? 'Today' : active;

  return (
    <WorkItemsProvider>
      <div className="app-shell">
        <Sidebar
          active={active}
          setActive={setActive}
          mobileOpen={mobileOpen}
          closeMobile={() => setMobileOpen(false)}
          businessName={businessName}
          businessInitials={businessInitials}
          onSignOut={onSignOut}
        />
        {mobileOpen && <div className="mobile-overlay" onClick={() => setMobileOpen(false)} />}
        <main className="main-content">
          <header className="topbar">
            <button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={22} /></button>
            <div className="topbar-title">
              {active === 'Home' && <div className="breadcrumb">Home <ChevronRight size={14} /> {topbarCrumb}</div>}
              <h1>{topbarTitle}</h1>
            </div>
            <div className="topbar-actions">
              {active === 'Home' && <button className="btn-new-quote"><Plus size={17} /> <span>New quote</span></button>}
              <button className="avatar">{businessInitials}</button>
            </div>
          </header>
          <div className="main-scroll">
            {active === 'Home' && <HomeScreen onOpenItem={openItem} />}
            {active === 'Work' && <WorkScreen onOpenItem={openItem} />}
            {active === 'Schedule' && <ScheduleScreen onOpenItem={openItem} />}
            {active === 'Customers' && <CustomersScreen />}
            {active === 'Reports' && <ReportsScreen />}
            {active === 'Settings' && <SettingsScreen />}
          </div>
          <MobileBottomNav active={active} setActive={setActive} />
        </main>
        {selectedItem && <DrawerWithRefresh item={selectedItem} onClose={closeItem} />}
      </div>
    </WorkItemsProvider>
  );
}
