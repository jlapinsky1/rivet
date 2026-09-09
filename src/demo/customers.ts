import type { IndividualCustomer, Company } from '../admin/types';

// ─── Residential Customers (13) ───

export const demoIndividuals: IndividualCustomer[] = [
  { id: 101, name: 'Karen Mitchell', phone: '(615) 555-0134', email: 'karen.m@email.com', address: '214 Maple Ridge Dr, Nashville, TN', jobCount: 4, totalRevenue: 3840 },
  { id: 102, name: 'Tom Bradley', phone: '(615) 555-0187', email: 'tbradley@email.com', address: '88 Creekwood Ln, Nashville, TN', jobCount: 2, totalRevenue: 1560 },
  { id: 103, name: 'Angela Reeves', phone: '(615) 555-0212', email: 'angela.r@email.com', address: '1401 Belmont Blvd, Nashville, TN', jobCount: 3, totalRevenue: 2750 },
  { id: 104, name: 'Derek Nguyen', phone: '(615) 555-0156', email: 'derek.n@email.com', address: '309 Woodland St, Nashville, TN', jobCount: 1, totalRevenue: 480 },
  { id: 105, name: 'Stacy Caldwell', phone: '(615) 555-0298', email: 'stacy.c@email.com', address: '72 Hillsboro Pike, Nashville, TN', jobCount: 5, totalRevenue: 4200 },
  { id: 106, name: 'Marcus Coleman', phone: '(615) 555-0341', email: 'marcus.coleman@email.com', address: '555 Eastland Ave, Nashville, TN', jobCount: 2, totalRevenue: 1180 },
  { id: 107, name: 'Lisa Chen', phone: '(615) 555-0177', email: 'lisa.chen@email.com', address: '1825 West End Ave, Nashville, TN', jobCount: 1, totalRevenue: 720 },
  { id: 108, name: 'Brian Hargrove', phone: '(615) 555-0423', email: 'bhargrove@email.com', address: '402 Shelby Ave, Nashville, TN', jobCount: 3, totalRevenue: 2380 },
  { id: 109, name: 'Rachel Park', phone: '(615) 555-0511', email: 'rpark@email.com', address: '1180 Lischey Ave, Nashville, TN', jobCount: 2, totalRevenue: 1440 },
  { id: 110, name: 'James Whitfield', phone: '(615) 555-0389', email: 'jwhitfield@email.com', address: '637 Fatherland St, Nashville, TN', jobCount: 1, totalRevenue: 575 },
  { id: 111, name: 'Denise Morales', phone: '(615) 555-0267', email: 'dmorales@email.com', address: '2240 Elliston Pl, Nashville, TN', jobCount: 2, totalRevenue: 1620 },
  { id: 112, name: 'Greg Patterson', phone: '(615) 555-0144', email: 'gpatt@email.com', address: '891 Dickerson Pike, Nashville, TN', jobCount: 1, totalRevenue: 350 },
  { id: 113, name: 'Yolanda Freeman', phone: '(615) 555-0478', email: 'yfreeman@email.com', address: '3310 Charlotte Ave, Nashville, TN', jobCount: 3, totalRevenue: 2860 },
];

// ─── Commercial Customers (2) ───

export const demoCompanies: Company[] = [
  {
    id: 201,
    name: 'Greenway Property Management',
    contactName: 'David Chen',
    contactRole: 'Maintenance Director',
    phone: '(615) 555-0600',
    email: 'd.chen@greenwaymgmt.com',
    totalRevenue: 12400,
    properties: [
      { id: 301, name: 'Riverside Commons', address: '2100 River Rd, Nashville, TN', unitCount: 24, workOrderCount: 5, units: ['Unit 4B', 'Unit 12A', 'Unit 18C', 'Common Area'] },
      { id: 302, name: 'Summit Place Condos', address: '450 Summit Hill Dr, Nashville, TN', unitCount: 16, workOrderCount: 3, units: ['Unit 6', 'Unit 11', 'Common Area'] },
    ],
  },
  {
    id: 202,
    name: 'Horizon Real Estate Group',
    contactName: 'Amanda Torres',
    contactRole: 'Property Manager',
    phone: '(615) 555-0750',
    email: 'a.torres@horizonre.com',
    totalRevenue: 6200,
    properties: [
      { id: 303, name: 'Midtown Lofts', address: '820 Division St, Nashville, TN', unitCount: 12, workOrderCount: 2, units: ['Unit 3A', 'Unit 8B'] },
    ],
  },
];
