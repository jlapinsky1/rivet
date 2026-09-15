export const DRAFT_STORAGE_KEY = 'squatterz_commercial_request_draft';

function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function emptyDraft(attribution = {}) {
  return {
    version: 1,
    idempotencyKey: newIdempotencyKey(),
    uploadSessionId: null,
    photoPreviews: [],
    propName: '',
    propStreet: '',
    propCity: '',
    propState: 'GA',
    propZip: '',
    propType: '',
    propUnits: '',
    propContactName: '',
    propContactPhone: '',
    propNotes: '',
    jobUnit: '',
    jobService: '',
    jobDescription: '',
    jobDate: '',
    jobAccessNotes: '',
    jobPoRef: '',
    name: '',
    email: '',
    phone: '',
    company: '',
    jobTitle: '',
    pendingLogin: false,
    attribution,
  };
}

export function loadDraft() {
  try {
    const raw = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveDraft(draft) {
  try {
    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Ignore during prerender or private browsing
  }
}

export function clearDraft() {
  sessionStorage.removeItem(DRAFT_STORAGE_KEY);
}

export function buildPropertyAddress(draft) {
  return [draft.propStreet, draft.propCity, draft.propState, draft.propZip]
    .filter(Boolean)
    .join(', ');
}

export function buildJobDescriptionText(draft) {
  return [draft.jobService, draft.jobDescription].filter(Boolean).join(' - ');
}

export function buildAccessNotesText(draft) {
  return [
    draft.jobAccessNotes,
    draft.jobPoRef ? `PO/Ref: ${draft.jobPoRef}` : null,
  ].filter(Boolean).join('\n') || null;
}

export function buildPropertyNotesText(draft) {
  return [
    draft.propType ? `Type: ${draft.propType}` : null,
    draft.propUnits ? `Units: ${draft.propUnits}` : null,
    draft.propNotes || null,
  ].filter(Boolean).join('\n') || null;
}

export function isSubmittableDraft(draft) {
  if (!draft) return false;
  return Boolean(
    draft.propName &&
    draft.propStreet &&
    draft.propCity &&
    draft.propZip &&
    draft.propType &&
    draft.jobService &&
    draft.jobDescription?.trim() &&
    draft.name &&
    draft.email &&
    draft.phone &&
    draft.company
  );
}
