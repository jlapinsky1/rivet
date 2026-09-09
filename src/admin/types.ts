import type { LucideIcon } from 'lucide-react';
import { BarChart3, Briefcase, CalendarDays, Home, Users } from 'lucide-react';

export type Recommendation = 'take' | 'review' | 'pass';
export type WorkSource = 'customer_request' | 'commercial_work_order' | 'owner_created';
export type CustomerType = 'individual' | 'organization';
export type OperationalStatus = 'needs_review' | 'quoted' | 'approved' | 'scheduled' | 'in_progress' | 'completed' | 'declined';
export type BillingStatus = 'not_invoiced' | 'deposit_pending' | 'partially_paid' | 'paid' | 'overdue';

export type ReasonItem = { icon: 'check' | 'caution' | 'x'; text: string };

export type EstimateLine = { label: string; value: string | null };

export type WorkItem = {
  id: number;
  title: string;
  source: WorkSource;
  customerType: CustomerType;
  customerName: string;
  customerSub?: string;
  location: string;
  travel: string;
  profit: number;
  hours: string;
  hoursNum: number;
  rate: string;
  rateNum: number;
  recommendation: Recommendation;
  confidence: number;
  description: string;
  price: number;
  costs: number;
  costBreakdown: EstimateLine[];
  reasons: ReasonItem[];
  photos: string[];
  opStatus: OperationalStatus;
  billingStatus: BillingStatus;
  preferredDate?: string;
  phone?: string;
  email?: string;
  address?: string;
  customerNotes?: string;
  companyName?: string;
  propertyName?: string;
  unitLabel?: string;
  workOrderNumber?: string;
  requestedBy?: string;
  requestedByRole?: string;
  requestedDate?: string;
  scope?: string;
  serviceType: string;
  estimationRunId?: string;
};

export type Company = {
  id: number;
  name: string;
  contactName: string;
  contactRole: string;
  phone: string;
  email: string;
  totalRevenue: number;
  properties: Property[];
};

export type Property = {
  id: number;
  name: string;
  address: string;
  unitCount: number;
  workOrderCount: number;
  units: string[];
};

export type IndividualCustomer = {
  id: number;
  name: string;
  phone: string;
  email: string;
  address: string;
  jobCount: number;
  totalRevenue: number;
};

// ─── Static seed data (for tests only — UI fetches from Supabase) ───

import { demoWorkItems } from '../demo/seed';
import { demoIndividuals, demoCompanies } from '../demo/customers';

/** @deprecated Use useWorkItems hook for UI. Kept for pipeline regression tests. */
export const workItems: WorkItem[] = demoWorkItems;
/** @deprecated Use useCustomers hook for UI. Kept for tests. */
export const companies: Company[] = demoCompanies;
/** @deprecated Use useCustomers hook for UI. Kept for tests. */
export const individuals: IndividualCustomer[] = demoIndividuals;

export const navItems: { label: string; icon: LucideIcon; count?: number }[] = [
  { label: 'Home', icon: Home },
  { label: 'Work', icon: Briefcase },
  { label: 'Schedule', icon: CalendarDays },
  { label: 'Customers', icon: Users },
  { label: 'Reports', icon: BarChart3 },
];

export const settingsNav = [
  'Business',
  'Goals & Capacity',
  'Pricing & Costs',
  'Services',
  'Decision Rules',
  'Quote Form',
  'Commercial',
  'Notifications',
  'Integrations',
  'Advanced Engine',
  'Billing / Subscription',
  'Decision Lab',
];
