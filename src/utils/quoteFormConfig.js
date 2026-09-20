/**
 * Default quote form configuration for each vertical.
 * Option VALUES are immutable - they are part of the estimator contract
 * (QUANTITY_TO_LOAD, ACCESS_MAP, STAIRS_TIME_ADD in estimateBuilder.js).
 * Operators can change display labels but never the values the engine uses.
 */

// Locked option values - these map to estimateBuilder.js lookup tables
export const JUNK_REMOVAL_QUANTITY_VALUES = [
  'A few items (1-5)',
  'A room worth of stuff',
  'Multiple rooms',
  'Whole house / cleanout',
];

export const JUNK_REMOVAL_ACCESS_VALUES = [
  'curbside',
  'garage',
  'first_floor',
  'upstairs',
  'basement',
];

export const JUNK_REMOVAL_STAIRS_VALUES = ['none', 'few', 'one_flight', 'multiple'];
export const JUNK_REMOVAL_ELEVATOR_VALUES = ['no', 'yes'];
export const JUNK_REMOVAL_TIME_PREFERENCE_VALUES = ['morning', 'afternoon', 'flexible'];

function getJunkRemovalDefaults() {
  return {
    published: false,

    notifications: {
      emailOnRequest: true,
      notifyEmail: null,
    },

    branding: {
      tagline: '',
      logoUrl: null,
      accentColor: '#22c55e',
      phone: null,
      ctaText: 'Get Free Estimate',
    },

    steps: {
      photos: {
        enabled: true,
        minPhotos: 3,
      },
    },

    fields: {
      quantity: {
        label: 'How much stuff?',
        options: [
          { value: 'A few items (1-5)', label: 'A few items', sub: '1-5 pieces', icon: '1-5' },
          { value: 'A room worth of stuff', label: "A room's worth", sub: 'Furniture, boxes, etc.', icon: '~10' },
          { value: 'Multiple rooms', label: 'Multiple rooms', sub: 'Bigger job', icon: '20+' },
          { value: 'Whole house / cleanout', label: 'Full cleanout', sub: 'Whole house or estate', icon: '50+' },
        ],
      },
      accessType: {
        label: 'Where are the items?',
        options: [
          { value: 'curbside', label: 'Curbside / outside', icon: '\u{1F3E0}' },
          { value: 'garage', label: 'Garage or driveway', icon: '\u{1F697}' },
          { value: 'first_floor', label: 'Inside, first floor', icon: '\u{1F6AA}' },
          { value: 'upstairs', label: 'Upstairs', icon: '\u2B06' },
          { value: 'basement', label: 'Basement', icon: '\u2B07' },
        ],
      },
      stairs: {
        enabled: true,
        label: 'Any stairs?',
        options: [
          { value: 'none', label: 'No stairs' },
          { value: 'few', label: 'A few steps' },
          { value: 'one_flight', label: 'One flight' },
          { value: 'multiple', label: 'Multiple flights' },
        ],
      },
      elevator: {
        enabled: true,
        label: 'Elevator available?',
        options: [
          { value: 'no', label: 'No' },
          { value: 'yes', label: 'Yes, elevator available' },
        ],
      },
      description: {
        enabled: true,
        label: 'Anything else we should know?',
        placeholder: 'Describe the items...',
      },
      secondChoiceDate: { enabled: true },
      email: { required: false },
      timePreference: {
        label: 'What time works best?',
        options: [
          { value: 'morning', label: 'Morning', sub: '8am - 12pm', icon: '\u2600' },
          { value: 'afternoon', label: 'Afternoon', sub: '12pm - 4pm', icon: '\u{1F324}' },
          { value: 'flexible', label: 'Flexible', sub: 'Either works for me', icon: '\u{1F44D}' },
        ],
      },
    },

    companionContent: [
      {
        headline: 'No phone calls required.',
        body: "We'll only use your contact info to send your estimate. No spam, no sales calls.",
        trust: ['Fast response time', 'Your info stays private', 'Touchless process'],
      },
      {
        headline: 'We service your area.',
        body: 'Your address helps us calculate travel distance and check availability for your neighborhood.',
        trust: ['Local crew dispatched', 'Accurate scheduling', 'Fully insured'],
      },
      {
        headline: 'Better photos, better estimate.',
        body: 'Clear photos help us give you an accurate price upfront. No surprises on pickup day.',
        trust: ['AI-powered item detection', 'Reviewed by a real person', 'No hidden fees'],
      },
      {
        headline: 'Tell us about the job.',
        body: 'These details help us send the right size crew and truck. Every estimate is reviewed by a real person.',
        trust: ['Right crew for the job', 'No obligation estimate', 'Fair, transparent pricing'],
      },
      {
        headline: 'Pick the day that works.',
        body: "Choose your preferred pickup time and we'll confirm availability after reviewing your request.",
        trust: ['Flexible scheduling', 'Easy rescheduling', 'We confirm before we come'],
      },
    ],

    confirmation: {
      headline: 'Request received!',
      body: "We'll review your photos and details, then send a price within 2 hours.",
    },
  };
}

function getHandymanDefaults() {
  return {
    published: false,
    layout: 'handyman',
    notifications: {
      emailOnRequest: true,
      notifyEmail: null,
    },
    branding: {
      tagline: '',
      logoUrl: null,
      accentColor: '#22c55e',
      phone: null,
      ctaText: 'Request a Quote',
    },
    steps: {
      photos: {
        enabled: true,
        minPhotos: 1,
      },
    },
    fields: {
      quantity: { enabled: false, label: '', options: [] },
      accessType: { enabled: false, label: '', options: [] },
      stairs: { enabled: false, label: '', options: [] },
      elevator: { enabled: false, label: '', options: [] },
      description: {
        enabled: true,
        label: 'What needs to be done?',
        placeholder: 'Describe the job — for example, patch two holes in drywall, mount a 65" TV, reset fence posts…',
      },
      secondChoiceDate: { enabled: true },
      email: { required: false },
      timePreference: {
        label: 'What time works best?',
        options: [
          { value: 'morning', label: 'Morning', sub: '8am - 12pm', icon: '\u2600' },
          { value: 'afternoon', label: 'Afternoon', sub: '12pm - 4pm', icon: '\u{1F324}' },
          { value: 'flexible', label: 'Flexible', sub: 'Either works for me', icon: '\u{1F44D}' },
        ],
      },
    },
    companionContent: [
      {
        headline: 'No phone calls required.',
        body: "We'll only use your contact info to send your estimate.",
        trust: ['Fast response time', 'Your info stays private', 'Reviewed by the owner'],
      },
      {
        headline: 'We service your area.',
        body: 'Your address helps us estimate travel time and check that we cover your neighborhood.',
        trust: ['Local handyman', 'Accurate scheduling', 'Travel time counted'],
      },
      {
        headline: 'Better photos, better estimate.',
        body: 'Clear photos of the work area help us quote accurately before we come out.',
        trust: ['Reviewed by a real person', 'No hidden fees'],
      },
      {
        headline: 'Tell us about the job.',
        body: 'A short description is enough. Mention size, materials, and anything unusual.',
        trust: ['No obligation estimate', 'Fair, transparent pricing'],
      },
      {
        headline: 'Pick the day that works.',
        body: "Choose a preferred time and we'll confirm after reviewing the request.",
        trust: ['Flexible scheduling', 'We confirm before we come'],
      },
    ],
    confirmation: {
      headline: 'Request received!',
      body: "We'll review the job and send a price shortly.",
    },
  };
}

const VERTICAL_DEFAULTS = {
  junk_removal: getJunkRemovalDefaults,
  handyman: getHandymanDefaults,
};

/**
 * Returns the full default quote form config for a vertical.
 */
export function getDefaultQuoteFormConfig(vertical = 'junk_removal') {
  const factory = VERTICAL_DEFAULTS[vertical];
  if (!factory) throw new Error(`Unknown vertical: ${vertical}`);
  return factory();
}

/**
 * Deep-merges a saved config over defaults so missing keys always fall back.
 * Only merges known keys - unknown keys in saved config are preserved but
 * never override structural defaults.
 */
export function mergeQuoteFormConfig(saved, vertical = 'junk_removal') {
  const defaults = getDefaultQuoteFormConfig(vertical);
  if (!saved) return defaults;

  return {
    published: saved.published ?? defaults.published,
    layout: saved.layout ?? defaults.layout ?? vertical,

    notifications: {
      ...defaults.notifications,
      ...(saved.notifications || {}),
    },

    branding: {
      ...defaults.branding,
      ...(saved.branding || {}),
    },

    steps: {
      photos: {
        ...defaults.steps.photos,
        ...(saved.steps?.photos || {}),
      },
    },

    fields: mergeFields(defaults.fields, saved.fields),

    companionContent: saved.companionContent?.length === defaults.companionContent.length
      ? saved.companionContent
      : defaults.companionContent,

    confirmation: {
      ...defaults.confirmation,
      ...(saved.confirmation || {}),
    },
  };
}

function mergeFields(defaults, saved) {
  if (!saved) return defaults;

  const merged = {};
  for (const [key, defaultVal] of Object.entries(defaults)) {
    const savedVal = saved[key];
    if (!savedVal) {
      merged[key] = defaultVal;
      continue;
    }

    if (defaultVal.options && savedVal.options) {
      // Merge options by value - preserve locked values, apply saved labels
      merged[key] = {
        ...defaultVal,
        ...savedVal,
        options: defaultVal.options.map((defOpt) => {
          const savedOpt = savedVal.options.find((s) => s.value === defOpt.value);
          return savedOpt ? { ...defOpt, ...savedOpt } : defOpt;
        }),
      };
    } else {
      merged[key] = { ...defaultVal, ...savedVal };
    }
  }
  return merged;
}
