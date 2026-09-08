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

export const workItems: WorkItem[] = [
  {
    id: 1,
    title: 'Build a 12 × 10 ft deck',
    source: 'customer_request',
    customerType: 'individual',
    customerName: 'Maya Thompson',
    location: 'Springfield, IL',
    travel: '18 min away',
    profit: 620,
    hours: '14–18 hrs',
    hoursNum: 16,
    rate: '$65/hr',
    rateNum: 65,
    recommendation: 'take',
    confidence: 72,
    description: 'A small backyard deck with stairs and a simple railing.',
    price: 1480,
    costs: 860,
    costBreakdown: [
      { label: 'Materials (lumber, hardware)', value: '$620' },
      { label: 'Labor allowance', value: '$180' },
      { label: 'Travel', value: '$35' },
      { label: 'Permit / misc', value: '$25' },
    ],
    reasons: [
      { icon: 'check', text: 'Strong profit for the time required' },
      { icon: 'check', text: 'Fits your available capacity this week' },
      { icon: 'check', text: 'Travel is reasonable' },
      { icon: 'caution', text: 'Material quantities may vary' },
    ],
    photos: [
      'https://images.pexels.com/photos/10847167/pexels-photo-10847167.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
      'https://images.pexels.com/photos/7601167/pexels-photo-7601167.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
      'https://images.pexels.com/photos/36220309/pexels-photo-36220309.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    ],
    opStatus: 'needs_review',
    billingStatus: 'not_invoiced',
    preferredDate: 'Sept 15',
    phone: '(217) 555-0142',
    email: 'maya.t@email.com',
    address: '123 Main Street, Springfield, IL',
    customerNotes: 'Would like it done before a family gathering on the 20th.',
    serviceType: 'Handyman',
  },
  {
    id: 2,
    title: 'Unit 22B Move-Out Cleanout',
    source: 'commercial_work_order',
    customerType: 'organization',
    customerName: 'Lapinsky Property Group',
    customerSub: 'Oakwood Ridge Apartments · Unit 22B',
    location: 'Gainesville, GA',
    travel: '21 min away',
    profit: 365,
    hours: '4 hrs',
    hoursNum: 4,
    rate: '$91/hr',
    rateNum: 91,
    recommendation: 'take',
    confidence: 88,
    description: 'Tenant move-out. Remove mattress, dresser, boxes, and miscellaneous household items.',
    price: 575,
    costs: 210,
    costBreakdown: [
      { label: 'Materials / disposal', value: '$95' },
      { label: 'Labor allowance', value: '$80' },
      { label: 'Travel', value: '$35' },
    ],
    reasons: [
      { icon: 'check', text: 'Strong profit for the time required' },
      { icon: 'check', text: 'Helps close your weekly earnings gap' },
      { icon: 'check', text: 'Fits your available capacity' },
      { icon: 'check', text: 'Reasonable travel' },
    ],
    photos: [
      'https://images.pexels.com/photos/10847167/pexels-photo-10847167.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
      'https://images.pexels.com/photos/7601167/pexels-photo-7601167.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    ],
    opStatus: 'needs_review',
    billingStatus: 'not_invoiced',
    companyName: 'Lapinsky Property Group',
    propertyName: 'Oakwood Ridge Apartments',
    unitLabel: 'Unit 22B',
    workOrderNumber: '#1842',
    requestedBy: 'Jennifer Park',
    requestedByRole: 'Property Manager',
    requestedDate: 'September 11',
    scope: 'Tenant move-out. Remove mattress, dresser, boxes, and miscellaneous household items.',
    serviceType: 'Junk Removal',
  },
  {
    id: 3,
    title: 'Install 3 interior doors',
    source: 'customer_request',
    customerType: 'individual',
    customerName: 'Daniel Reed',
    location: 'North Springfield',
    travel: '12 min away',
    profit: 220,
    hours: '6–8 hrs',
    hoursNum: 7,
    rate: '$31/hr',
    rateNum: 31,
    recommendation: 'review',
    confidence: 58,
    description: 'Replace three existing doors and adjust the frames as needed.',
    price: 720,
    costs: 500,
    costBreakdown: [
      { label: 'Materials (doors, hardware)', value: '$380' },
      { label: 'Labor allowance', value: '$90' },
      { label: 'Travel', value: '$30' },
    ],
    reasons: [
      { icon: 'caution', text: 'Material cost is uncertain' },
      { icon: 'caution', text: 'Estimated duration has a wide range' },
      { icon: 'check', text: 'Profit is acceptable if estimate is accurate' },
    ],
    photos: [
      'https://images.pexels.com/photos/5691550/pexels-photo-5691550.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
      'https://images.pexels.com/photos/3615723/pexels-photo-3615723.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    ],
    opStatus: 'needs_review',
    billingStatus: 'not_invoiced',
    phone: '(217) 555-0188',
    email: 'd.reed@email.com',
    address: '455 North Ave, Springfield, IL',
    serviceType: 'Handyman',
  },
  {
    id: 4,
    title: 'Repair leaning fence',
    source: 'customer_request',
    customerType: 'individual',
    customerName: 'Olivia Park',
    location: 'Westside',
    travel: '28 min away',
    profit: 60,
    hours: '5–7 hrs',
    hoursNum: 6,
    rate: '$10/hr',
    rateNum: 10,
    recommendation: 'pass',
    confidence: 64,
    description: 'Repair four leaning fence posts and replace damaged boards.',
    price: 440,
    costs: 380,
    costBreakdown: [
      { label: 'Materials (posts, boards, concrete)', value: '$280' },
      { label: 'Labor allowance', value: '$70' },
      { label: 'Travel', value: '$30' },
    ],
    reasons: [
      { icon: 'x', text: 'Profit falls below your minimum' },
      { icon: 'x', text: 'Uses 6 hours of scarce capacity' },
      { icon: 'x', text: 'Better-paying work is already in your pipeline' },
    ],
    photos: [
      'https://images.pexels.com/photos/11903184/pexels-photo-11903184.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
      'https://images.pexels.com/photos/36909374/pexels-photo-36909374.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    ],
    opStatus: 'needs_review',
    billingStatus: 'not_invoiced',
    phone: '(217) 555-0110',
    email: 'olivia.p@email.com',
    address: '78 Oak Lane, Westside, IL',
    serviceType: 'Handyman',
  },
  {
    id: 5,
    title: 'Unit 31D Cleanout',
    source: 'commercial_work_order',
    customerType: 'organization',
    customerName: 'Lapinsky Property Group',
    customerSub: 'Oakwood Ridge Apartments · Unit 31D',
    location: 'Gainesville, GA',
    travel: '21 min away',
    profit: 390,
    hours: '4 hrs',
    hoursNum: 4,
    rate: '$97/hr',
    rateNum: 97,
    recommendation: 'take',
    confidence: 90,
    description: 'Eviction cleanout. Remove furniture, appliances, and debris.',
    price: 590,
    costs: 200,
    costBreakdown: [
      { label: 'Materials / disposal', value: '$90' },
      { label: 'Labor allowance', value: '$75' },
      { label: 'Travel', value: '$35' },
    ],
    reasons: [
      { icon: 'check', text: 'Strong profit for the time required' },
      { icon: 'check', text: 'Fits your available capacity' },
      { icon: 'check', text: 'High confidence estimate' },
    ],
    photos: [
      'https://images.pexels.com/photos/11903184/pexels-photo-11903184.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
      'https://images.pexels.com/photos/36909374/pexels-photo-36909374.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    ],
    opStatus: 'needs_review',
    billingStatus: 'not_invoiced',
    companyName: 'Lapinsky Property Group',
    propertyName: 'Oakwood Ridge Apartments',
    unitLabel: 'Unit 31D',
    workOrderNumber: '#1843',
    requestedBy: 'Jennifer Park',
    requestedByRole: 'Property Manager',
    requestedDate: 'September 12',
    scope: 'Eviction cleanout. Remove furniture, appliances, and debris.',
    serviceType: 'Junk Removal',
  },
  {
    id: 6,
    title: 'Install kitchen shelving',
    source: 'customer_request',
    customerType: 'individual',
    customerName: 'Chris Wallace',
    location: 'East Springfield',
    travel: '15 min away',
    profit: 180,
    hours: '3–4 hrs',
    hoursNum: 3.5,
    rate: '$51/hr',
    rateNum: 51,
    recommendation: 'take',
    confidence: 86,
    description: 'Install four floating shelves and a small pantry organizer.',
    price: 480,
    costs: 300,
    costBreakdown: [
      { label: 'Materials (shelves, brackets)', value: '$210' },
      { label: 'Labor allowance', value: '$60' },
      { label: 'Travel', value: '$30' },
    ],
    reasons: [
      { icon: 'check', text: 'Good profit for a short visit' },
      { icon: 'check', text: 'Clear scope and high confidence' },
      { icon: 'check', text: 'Convenient location' },
    ],
    photos: [
      'https://images.pexels.com/photos/19109111/pexels-photo-19109111.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
      'https://images.pexels.com/photos/10117716/pexels-photo-10117716.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    ],
    opStatus: 'quoted',
    billingStatus: 'not_invoiced',
    phone: '(217) 555-0199',
    email: 'c.wallace@email.com',
    address: '88 East Blvd, Springfield, IL',
    serviceType: 'Handyman',
  },
  {
    id: 7,
    title: 'Bathroom tile repair',
    source: 'customer_request',
    customerType: 'individual',
    customerName: 'Sarah Lin',
    location: 'South Springfield',
    travel: '9 min away',
    profit: 340,
    hours: '5–6 hrs',
    hoursNum: 5.5,
    rate: '$62/hr',
    rateNum: 62,
    recommendation: 'take',
    confidence: 80,
    description: 'Replace cracked floor tiles around the bathtub area.',
    price: 780,
    costs: 440,
    costBreakdown: [
      { label: 'Materials (tile, grout, sealant)', value: '$320' },
      { label: 'Labor allowance', value: '$90' },
      { label: 'Travel', value: '$30' },
    ],
    reasons: [
      { icon: 'check', text: 'Good profit for the time required' },
      { icon: 'check', text: 'Short travel distance' },
      { icon: 'check', text: 'Fits your schedule this week' },
    ],
    photos: [
      'https://images.pexels.com/photos/5691550/pexels-photo-5691550.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    ],
    opStatus: 'scheduled',
    billingStatus: 'deposit_pending',
    phone: '(217) 555-0177',
    email: 'sarah.lin@email.com',
    address: '301 South St, Springfield, IL',
    serviceType: 'Handyman',
  },
  {
    id: 8,
    title: 'Unit 18A Maintenance',
    source: 'commercial_work_order',
    customerType: 'organization',
    customerName: 'Lapinsky Property Group',
    customerSub: 'Oakwood Ridge Apartments · Unit 18A',
    location: 'Gainesville, GA',
    travel: '21 min away',
    profit: 145,
    hours: '2 hrs',
    hoursNum: 2,
    rate: '$72/hr',
    rateNum: 72,
    recommendation: 'review',
    confidence: 75,
    description: 'Replace garbage disposal and check under-sink plumbing.',
    price: 295,
    costs: 150,
    costBreakdown: [
      { label: 'Materials (disposal unit)', value: '$110' },
      { label: 'Labor allowance', value: '$25' },
      { label: 'Travel', value: '$15' },
    ],
    reasons: [
      { icon: 'check', text: 'Good hourly rate' },
      { icon: 'caution', text: 'Disposal model availability uncertain' },
      { icon: 'check', text: 'Short job, fits easily' },
    ],
    photos: [
      'https://images.pexels.com/photos/5691550/pexels-photo-5691550.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    ],
    opStatus: 'approved',
    billingStatus: 'not_invoiced',
    companyName: 'Lapinsky Property Group',
    propertyName: 'Oakwood Ridge Apartments',
    unitLabel: 'Unit 18A',
    workOrderNumber: '#1844',
    requestedBy: 'Jennifer Park',
    requestedByRole: 'Property Manager',
    requestedDate: 'September 14',
    scope: 'Replace garbage disposal and check under-sink plumbing.',
    serviceType: 'Handyman',
  },
];

export const companies: Company[] = [
  {
    id: 1,
    name: 'Lapinsky Property Group',
    contactName: 'Jennifer Park',
    contactRole: 'Property Manager',
    phone: '(770) 555-0300',
    email: 'j.park@lapinskyprop.com',
    totalRevenue: 18400,
    properties: [
      { id: 1, name: 'Oakwood Ridge Apartments', address: '1240 Ridge Road, Gainesville, GA', unitCount: 18, workOrderCount: 7, units: ['Unit 22B', 'Unit 31D', 'Unit 18A', 'Unit 14C', 'Common Area'] },
      { id: 2, name: 'Brookhaven Condos', address: '88 Brookhaven Dr, Gainesville, GA', unitCount: 12, workOrderCount: 2, units: ['Unit 3', 'Unit 7', 'Common Area'] },
    ],
  },
];

export const individuals: IndividualCustomer[] = [
  { id: 1, name: 'Maya Thompson', phone: '(217) 555-0142', email: 'maya.t@email.com', address: '123 Main Street, Springfield, IL', jobCount: 3, totalRevenue: 3200 },
  { id: 2, name: 'Daniel Reed', phone: '(217) 555-0188', email: 'd.reed@email.com', address: '455 North Ave, Springfield, IL', jobCount: 1, totalRevenue: 720 },
  { id: 3, name: 'Olivia Park', phone: '(217) 555-0110', email: 'olivia.p@email.com', address: '78 Oak Lane, Westside, IL', jobCount: 2, totalRevenue: 880 },
  { id: 4, name: 'Chris Wallace', phone: '(217) 555-0199', email: 'c.wallace@email.com', address: '88 East Blvd, Springfield, IL', jobCount: 4, totalRevenue: 2100 },
  { id: 5, name: 'Sarah Lin', phone: '(217) 555-0177', email: 'sarah.lin@email.com', address: '301 South St, Springfield, IL', jobCount: 2, totalRevenue: 1560 },
];

export const navItems: { label: string; icon: LucideIcon; count?: number }[] = [
  { label: 'Home', icon: Home },
  { label: 'Work', icon: Briefcase, count: 4 },
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
];
