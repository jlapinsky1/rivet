import { describe, expect, it } from 'vitest';
import { attachCustomerContact } from '../customerContact';

const customers = [
  { name: 'Karen Mitchell', phone: '(615) 555-0134', email: 'karen.m@email.com', address: '214 Maple Ridge Dr, Nashville, TN' },
];

const companies = [
  {
    name: 'Greenway Property Management',
    phone: '(615) 555-0600',
    email: 'd.chen@greenwaymgmt.com',
    properties: [{ name: 'Riverside Commons', address: '2100 River Rd, Nashville, TN' }],
  },
];

describe('attachCustomerContact', () => {
  it('fills a residential job from the customer record when the work item has no contact', () => {
    const filled = attachCustomerContact({
      customerName: 'Karen Mitchell',
      phone: null,
      email: null,
      address: null,
    }, customers, companies);
    expect(filled.phone).toBe('(615) 555-0134');
    expect(filled.email).toBe('karen.m@email.com');
    expect(filled.address).toBe('214 Maple Ridge Dr, Nashville, TN');
  });

  it('keeps contact already stored on the job', () => {
    const filled = attachCustomerContact({
      customerName: 'Derek Nguyen',
      phone: '(615) 555-0156',
      email: 'derek.n@email.com',
      address: '309 Woodland St, Nashville, TN',
    }, customers, companies);
    expect(filled.address).toBe('309 Woodland St, Nashville, TN');
  });

  it('fills a commercial job from the property and company', () => {
    const filled = attachCustomerContact({
      customerName: 'Greenway Property Management',
      companyName: 'Greenway Property Management',
      propertyName: 'Riverside Commons',
      unitLabel: 'Unit 4B',
      phone: null,
      email: null,
      address: null,
    }, customers, companies);
    expect(filled.phone).toBe('(615) 555-0600');
    expect(filled.email).toBe('d.chen@greenwaymgmt.com');
    expect(filled.address).toBe('2100 River Rd, Nashville, TN · Unit 4B');
  });
});
