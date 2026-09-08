import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { getRepo } from '../utils/repository';
import { getAvailableBookingDates, localDateString } from '../utils/dateLogic';

function generateIdempotencyKey() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Configurable quote request form for any junk removal business.
 * Accepts a merged quoteFormConfig, the canonical business name, and the business slug.
 */
export default function VerticalQuoteForm({ config, businessName, businessSlug }) {
  const photosEnabled = config.steps.photos.enabled;
  const minPhotos = config.steps.photos.minPhotos;
  const accentColor = config.branding.accentColor || '#22c55e';

  const STEPS = useMemo(() => {
    const steps = [
      { key: 'info', label: 'Your Info', icon: UserIcon, description: 'Tell us where to send your estimate' },
      { key: 'location', label: 'Pickup Location', icon: PinIcon, description: 'Where should we pick up?' },
    ];
    if (photosEnabled) {
      steps.push({ key: 'photos', label: 'Photos', icon: CameraIcon, description: 'Show us what needs to go' });
    }
    steps.push(
      { key: 'details', label: 'Job Details', icon: ClipboardIcon, description: 'Help us send the right crew' },
      { key: 'schedule', label: 'Pickup Time', icon: CalendarIcon, description: 'When works best for you?' },
    );
    return steps;
  }, [photosEnabled]);

  const quantityOptions = config.fields.quantity.options;
  const accessOptions = config.fields.accessType.options;
  const stairsOptions = config.fields.stairs.options;
  const elevatorOptions = config.fields.elevator.options;
  const timePreferences = config.fields.timePreference.options;
  const companionContent = config.companionContent;

  const [step, setStep] = useState(-1);
  const [submitted, setSubmitted] = useState(false);
  const [bookingId, setBookingId] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiItems, setAiItems] = useState(null);
  const fileInputRef = useRef(null);

  const [sessionId, setSessionId] = useState(null);
  const [idempotencyKey] = useState(() => generateIdempotencyKey());
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [photoError, setPhotoError] = useState(null);

  const [heroZip, setHeroZip] = useState('');
  const [heroCheckState, setHeroCheckState] = useState(null);
  const [locationCheckState, setLocationCheckState] = useState(null);
  const [notifyState, setNotifyState] = useState({ open: false, name: '', email: '', submitting: false, done: false });
  const [showMoreDates, setShowMoreDates] = useState(false);
  const [form, setForm] = useState({
    firstName: '', lastName: '', phone: '', email: '',
    address: '', city: '', state: '', zip: '',
    photos: [], photoNames: [], detectedItems: [],
    description: '', quantity: '',
    accessType: 'curbside', stairs: 'none', elevator: 'no',
    preferredDate: '', secondChoiceDate: '', timePreference: 'morning',
  });

  useEffect(() => {
    const handlePopState = (e) => {
      const s = e.state?.step ?? -1;
      setStep(s);
    };
    window.addEventListener('popstate', handlePopState);
    if (!window.history.state?.hasOwnProperty('step')) {
      window.history.replaceState({ step: -1 }, '');
    }
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const ensureSession = useCallback(async () => {
    if (sessionId) return sessionId;
    const repo = await getRepo();
    const session = await repo.createUploadSession(businessSlug);
    setSessionId(session.sessionId);
    return session.sessionId;
  }, [sessionId, businessSlug]);

  function update(field, value) {
    if (['address', 'city', 'state', 'zip'].includes(field)) {
      setLocationCheckState(null);
    }
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function goToStep(s) {
    setStep(s);
    window.history.pushState({ step: s }, '');
  }

  function next() {
    if (step < STEPS.length - 1) goToStep(step + 1);
  }

  function back() {
    window.history.back();
  }

  function canProceed() {
    const currentKey = STEPS[step]?.key;
    switch (currentKey) {
      case 'info': return form.firstName.trim() && form.phone.trim();
      case 'location': return form.address.trim() && form.city.trim() && form.zip.trim();
      case 'photos': return form.photos.length >= minPhotos;
      case 'details': return form.quantity;
      case 'schedule': return form.preferredDate && form.timePreference;
      default: return true;
    }
  }

  async function handlePhotoUpload(e) {
    const files = Array.from(e.target.files);
    const maxPhotos = 10;
    const remaining = maxPhotos - form.photos.length;
    const toProcess = files.slice(0, remaining);
    if (toProcess.length === 0) return;

    setUploadingPhotos(true);
    setPhotoError(null);

    try {
      const sid = await ensureSession();
      const repo = await getRepo();

      for (const file of toProcess) {
        const preview = await resizeImage(file, 1200);
        const { signedUrl, token } = await repo.getUploadUrl(sid, file.name, file.type || 'image/jpeg');

        await fetch(signedUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': file.type || 'image/jpeg',
            ...(token ? { 'x-upsert': 'true' } : {}),
          },
          body: file,
        });

        setForm(prev => ({
          ...prev,
          photos: [...prev.photos, preview],
          photoNames: [...prev.photoNames, file.name],
        }));
      }
    } catch (err) {
      console.error('Photo upload error:', err);
      setPhotoError(err.message || 'Failed to upload photo. Please try again.');
    } finally {
      setUploadingPhotos(false);
    }
  }

  function removePhoto(index) {
    setForm(prev => ({
      ...prev,
      photos: prev.photos.filter((_, i) => i !== index),
      photoNames: prev.photoNames.filter((_, i) => i !== index),
    }));
    setAiItems(null);
  }

  async function analyzePhotos() {
    setAnalyzing(true);
    try {
      const images = form.photos.map(dataUrl => {
        const [meta, data] = dataUrl.split(',');
        const mediaType = meta.match(/:(.*?);/)?.[1] || 'image/jpeg';
        return { mediaType, data };
      });

      const response = await fetch('/api/analyze-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images }),
      });

      if (response.ok) {
        const { items } = await response.json();
        setAiItems(items);
        setForm(prev => ({ ...prev, detectedItems: items }));
      } else {
        setAiItems([]);
      }
    } catch {
      setAiItems([]);
    }
    setAnalyzing(false);
  }

  function removeDetectedItem(index) {
    setForm(prev => ({
      ...prev,
      detectedItems: prev.detectedItems.filter((_, i) => i !== index),
    }));
    setAiItems(prev => prev?.filter((_, i) => i !== index));
  }

  function updateDetectedItem(index, field, value) {
    setForm(prev => {
      const items = [...prev.detectedItems];
      items[index] = { ...items[index], [field]: value };
      return { ...prev, detectedItems: items };
    });
    setAiItems(prev => {
      if (!prev) return prev;
      const items = [...prev];
      items[index] = { ...items[index], [field]: value };
      return items;
    });
  }

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);

    try {
      // If photos are disabled and we haven't created a session yet, create one now
      if (!sessionId) {
        await ensureSession();
      }
      const sid = sessionId || (await ensureSession());

      const repo = await getRepo();
      const result = await repo.createBooking({
        sessionId: sid, idempotencyKey,
        customerName: `${form.firstName} ${form.lastName}`.trim(),
        customerPhone: form.phone, customerEmail: form.email,
        address: form.address, city: form.city, state: form.state, zip: form.zip,
        fullAddress: `${form.address}, ${form.city}, ${form.state} ${form.zip}`,
        photoCount: form.photos.length,
        detectedItems: form.detectedItems, aiDetectedItems: form.detectedItems,
        description: form.description, quantity: form.quantity,
        accessType: form.accessType, stairs: form.stairs, elevator: form.elevator,
        preferredDate: form.preferredDate,
        secondChoiceDate: form.secondChoiceDate || null,
        timePreference: form.timePreference,
      });
      setBookingId(result.bookingId || result.id);
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err.message || 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function callCheckServiceArea(zip) {
    try {
      const res = await fetch('/api/check-service-area', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zip }),
      });
      if (!res.ok) return { serviceable: true, reason: 'error' };
      return await res.json();
    } catch {
      return { serviceable: true, reason: 'error' };
    }
  }

  function resolveCheckState(result) {
    if (result.serviceable) return null;
    if (result.reason === 'invalid_zip') return 'invalid';
    if (result.reason === 'unavailable') return 'unavailable';
    return 'outside';
  }

  async function handleHeroCheck() {
    const zip = heroZip.trim();
    if (!zip || heroCheckState === 'checking') return;
    if (!/^\d{5}$/.test(zip)) {
      setHeroCheckState('invalid');
      return;
    }
    setHeroCheckState('checking');
    const result = await callCheckServiceArea(zip);
    if (result.serviceable) {
      update('zip', zip);
      setHeroCheckState(null);
      setNotifyState({ open: false, name: '', email: '', submitting: false, done: false });
      goToStep(0);
    } else {
      setHeroCheckState(resolveCheckState(result));
    }
  }

  async function handleLocationCheck() {
    if (locationCheckState === 'checking') return;
    const zip = form.zip.trim();
    if (!zip) return;
    setLocationCheckState('checking');
    const result = await callCheckServiceArea(zip);
    if (result.serviceable) {
      setLocationCheckState(null);
      next();
    } else {
      setLocationCheckState(resolveCheckState(result));
    }
  }

  async function handleNotifySubmit(enteredAddress) {
    setNotifyState(s => ({ ...s, submitting: true }));
    try {
      await fetch('/api/notify-expansion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: notifyState.name, email: notifyState.email, address: enteredAddress }),
      });
    } catch {
      // Fire-and-forget
    }
    setNotifyState(s => ({ ...s, submitting: false, done: true }));
  }

  const progressPercent = step < 0 ? 0 : ((step + 1) / STEPS.length) * 100;
  const availableDays = getAvailableBookingDates({ referenceDate: new Date() });

  // CSS custom property for accent color
  const accentStyle = { '--accent': accentColor };

  // ---- SUCCESS SCREEN ----
  if (submitted) {
    return (
      <PageShell style={accentStyle}>
        <BrandHeader businessName={businessName} branding={config.branding} />
        <div className="lg:flex lg:min-h-[calc(100vh-65px)]">
          <CompanionPanel>
            <div className="max-w-md">
              <div className="w-16 h-16 bg-green-500/10 rounded-2xl flex items-center justify-center mb-8 ring-1 ring-green-500/20">
                <CheckCircleIcon className="w-8 h-8 text-green-400" />
              </div>
              <h2 className="text-4xl font-black text-white leading-tight mb-5 tracking-tight">
                {config.confirmation.headline}
              </h2>
              <p className="text-gray-400 text-lg leading-relaxed mb-10">
                {config.confirmation.body}
              </p>
              <div className="space-y-4">
                <CompanionTrust text="Reviewed by a real person" />
                <CompanionTrust text="No obligation - review before you commit" />
                <CompanionTrust text="Fully insured and licensed" />
              </div>
            </div>
          </CompanionPanel>

          <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
            <div className="max-w-md w-full text-center">
              <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-8 shadow-[0_0_40px_rgba(34,197,94,0.3)]" style={{ backgroundColor: accentColor }}>
                <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-3xl font-black text-white mb-3 tracking-tight">{config.confirmation.headline}</h1>
              <p className="text-gray-400 text-lg mb-4 leading-relaxed">
                A real person is reviewing your request now.
              </p>
              <div className="space-y-2 mb-10 text-left">
                <div className="flex items-start gap-2.5">
                  <CheckCircleIcon className="w-5 h-5 text-green-400 mt-0.5 shrink-0" />
                  <span className="text-gray-300 text-sm">A confirmation email is on its way to you</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <CheckCircleIcon className="w-5 h-5 text-green-400 mt-0.5 shrink-0" />
                  <span className="text-gray-300 text-sm">Your booking number is below for reference</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <CheckCircleIcon className="w-5 h-5 text-green-400 mt-0.5 shrink-0" />
                  <span className="text-gray-300 text-sm">Most customers hear back within a few hours</span>
                </div>
              </div>

              <div className="bg-gray-900/80 rounded-2xl p-6 text-left space-y-3.5 border border-gray-800/80 shadow-lg shadow-black/20 ring-1 ring-white/[0.03]">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 text-sm">Preferred date</span>
                  <span className="text-white font-semibold text-sm">{formatDate(form.preferredDate)}</span>
                </div>
                {form.secondChoiceDate && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 text-sm">Second choice</span>
                    <span className="text-white font-semibold text-sm">{formatDate(form.secondChoiceDate)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 text-sm">Time</span>
                  <span className="text-white font-semibold text-sm">
                    {timePreferences.find(t => t.value === form.timePreference)?.label || form.timePreference}
                  </span>
                </div>
                <div className="border-t border-gray-800/60 pt-3.5 flex justify-between items-center">
                  <span className="text-gray-500 text-sm">Confirmation</span>
                  <span className="font-mono font-bold tracking-wider text-sm" style={{ color: accentColor }}>
                    #{bookingId.slice(0, 8).toUpperCase()}
                  </span>
                </div>
              </div>

              <div className="mt-10 flex flex-col gap-3 lg:hidden">
                <TrustBadge icon={CheckCircleIcon} text="A real person will review your request" />
                <TrustBadge icon={CheckCircleIcon} text="Estimate sent within a few hours" />
                <TrustBadge icon={CheckCircleIcon} text="No obligation - review before you commit" />
              </div>
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  // ---- HERO LANDING ----
  if (step === -1) {
    return (
      <PageShell style={accentStyle}>
        <BrandHeader businessName={businessName} branding={config.branding} />

        <section className="relative overflow-hidden">
          <div className="max-w-7xl mx-auto px-5 lg:px-14 xl:px-20 py-16 lg:py-24">
            <div className="lg:flex lg:items-center lg:gap-12">
              <div className="lg:w-1/2">
                <h1 className="text-5xl lg:text-6xl xl:text-7xl font-black leading-[1.05] tracking-tight mb-6">
                  Junk gone.<br />
                  <span style={{ color: accentColor }}>On your schedule.</span>
                </h1>
                <p className="text-gray-400 text-lg lg:text-xl leading-relaxed mb-10 max-w-lg">
                  Fast, reliable junk removal for homes and businesses.
                </p>

                <div className="max-w-md space-y-3">
                  <div className="bg-gray-900/60 border border-gray-800/60 rounded-2xl p-6 ring-1 ring-white/[0.02]">
                    <label className="block text-[11px] font-bold text-gray-400 mb-3 uppercase tracking-[0.15em]">
                      Where is the pickup?
                    </label>
                    <div className="flex gap-3">
                      <div className="flex-1 flex items-center bg-gray-800/50 border border-gray-700/50 rounded-xl px-4">
                        <PinIcon className="w-4 h-4 text-gray-500 mr-3 flex-shrink-0" />
                        <input
                          id="hero-zip"
                          type="text"
                          inputMode="numeric"
                          maxLength={5}
                          autoComplete="off"
                          className="w-full bg-transparent py-3.5 text-sm text-white placeholder-gray-500 focus:outline-none font-mono tracking-widest [&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_rgb(31,41,55)] [&:-webkit-autofill]:[-webkit-text-fill-color:white]"
                          placeholder="ZIP code"
                          value={heroZip}
                          onChange={e => { setHeroZip(e.target.value.replace(/\D/g, '').slice(0, 5)); setHeroCheckState(null); }}
                          onKeyDown={e => { if (e.key === 'Enter' && heroZip.trim()) handleHeroCheck(); }}
                        />
                      </div>
                      <button
                        onClick={handleHeroCheck}
                        disabled={!heroZip.trim() || heroCheckState === 'checking'}
                        className="hover:brightness-110 disabled:opacity-60 text-gray-950 font-bold text-sm px-6 rounded-xl transition-colors whitespace-nowrap flex items-center gap-2"
                        style={{ backgroundColor: accentColor }}
                      >
                        {heroCheckState === 'checking' ? (
                          <>
                            <svg className="animate-spin w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Checking...
                          </>
                        ) : config.branding.ctaText}
                      </button>
                    </div>

                    {heroCheckState === 'invalid' && (
                      <p className="mt-3 text-sm text-red-400">
                        Please enter a valid five-digit ZIP code.
                      </p>
                    )}
                  </div>

                  {(heroCheckState === 'outside' || heroCheckState === 'unavailable') && (
                    <OutsideServiceAreaCard
                      businessName={businessName}
                      accentColor={accentColor}
                      enteredZip={heroZip}
                      isUnavailable={heroCheckState === 'unavailable'}
                      notifyState={notifyState}
                      onNotifyChange={patch => setNotifyState(s => ({ ...s, ...patch }))}
                      onNotifySubmit={() => handleNotifySubmit(heroZip)}
                      onCheckAnother={() => {
                        setHeroCheckState(null);
                        setNotifyState({ open: false, name: '', email: '', submitting: false, done: false });
                        document.getElementById('hero-zip')?.focus();
                      }}
                    />
                  )}
                </div>
              </div>

              <div className="lg:w-1/2 mt-10 lg:mt-0 flex justify-center lg:justify-end">
                {config.branding.logoUrl ? (
                  <img
                    src={config.branding.logoUrl}
                    alt={businessName}
                    style={{ display: 'block', width: 'min(90%, 600px)', height: 'auto', filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.4))' }}
                  />
                ) : (
                  <div className="w-64 h-64 bg-gray-900/50 rounded-3xl flex items-center justify-center border border-gray-800/60">
                    <span className="text-gray-600 text-6xl font-black">{businessName.charAt(0)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-gray-800/30">
          <div className="max-w-4xl mx-auto px-5 py-20 lg:py-28 text-center">
            <h2 className="text-4xl lg:text-6xl font-black leading-[1.08] tracking-tight mb-6">
              Ready to reclaim your<br />space?
            </h2>
            <p className="text-gray-400 text-lg lg:text-xl mb-10 max-w-2xl mx-auto">
              Get a free, firm estimate in about 2 minutes. No phone calls required.
            </p>

            <div className="flex justify-center mb-10">
              <button
                onClick={() => goToStep(0)}
                className="hover:brightness-110 text-gray-950 font-extrabold text-lg px-10 py-5 rounded-2xl transition-all duration-200 btn-glow active:scale-[0.98] transform flex items-center justify-center gap-2"
                style={{ backgroundColor: accentColor }}
              >
                {config.branding.ctaText}
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
            </div>

            <div className="flex flex-wrap justify-center gap-x-6 gap-y-3">
              <CompanionTrust text="Touchless process" />
              <CompanionTrust text="Fully insured" />
              <CompanionTrust text="No hidden fees" />
              <CompanionTrust text="Reviewed by a real person" />
            </div>
          </div>
        </section>

        <section id="how-it-works" className="border-t border-gray-800/30 scroll-mt-16">
          <div className="max-w-6xl mx-auto px-5 py-20 lg:py-28">
            <div className="text-center mb-14">
              <p className="text-xs font-bold tracking-[0.2em] uppercase mb-3" style={{ color: accentColor }}>Simple Process</p>
              <h2 className="text-3xl lg:text-5xl font-black tracking-tight">Three steps and you're done</h2>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {[
                { num: '1', icon: CameraIcon, title: 'Snap a Few Photos', desc: 'Show us what needs to go.' },
                { num: '2', icon: ClipboardIcon, title: 'Get a Firm Price', desc: 'No surprises, no upsells.' },
                { num: '3', icon: TruckIcon, title: 'We Haul It All', desc: 'Pick a time. We handle everything.' },
              ].map(s => (
                <div key={s.num} className="bg-gray-900/50 border border-gray-800/60 rounded-2xl p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: accentColor }}>
                      <span className="text-gray-950 font-black text-sm">{s.num}</span>
                    </div>
                    <s.icon className="w-5 h-5 text-gray-400" />
                  </div>
                  <h3 className="text-white font-bold text-lg mb-2">{s.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </PageShell>
    );
  }

  // ---- FORM FLOW ----
  const companion = companionContent[step] || companionContent[0];

  return (
    <PageShell style={accentStyle}>
      <BrandHeader businessName={businessName} branding={config.branding} />

      <div className="lg:flex lg:min-h-[calc(100vh-65px)]">
        <CompanionPanel>
          <div className="max-w-md relative">
            <div className="w-14 h-14 bg-green-500/10 rounded-2xl flex items-center justify-center mb-8 ring-1 ring-green-500/20 shadow-lg shadow-green-500/5">
              {React.createElement(STEPS[step].icon, { className: 'w-7 h-7 text-green-400' })}
            </div>

            <h2 className="text-4xl font-black text-white leading-tight mb-5 tracking-tight">
              {companion.headline}
            </h2>
            <p className="text-gray-400 text-lg leading-relaxed mb-12">
              {companion.body}
            </p>

            <div className="space-y-4 pt-8 border-t border-gray-800/40">
              {companion.trust.map(text => (
                <CompanionTrust key={text} text={text} />
              ))}
            </div>

            <div className="mt-12 pt-8 border-t border-gray-800/40">
              <div className="flex items-center gap-2.5">
                {STEPS.map((s, i) => (
                  <div
                    key={s.key}
                    className={`h-1.5 rounded-full flex-1 transition-all duration-500 ease-out ${
                      i < step ? 'bg-green-500' :
                      i === step ? 'bg-green-400 shadow-[0_0_8px_rgba(34,197,94,0.4)]' :
                      'bg-gray-800/80'
                    }`}
                  />
                ))}
              </div>
              <p className="text-gray-600 text-xs mt-3 font-medium">Step {step + 1} of {STEPS.length}</p>
            </div>
          </div>
        </CompanionPanel>

        <div className="flex-1 flex flex-col relative">
          <div className="hidden lg:block absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-green-500/[0.02] rounded-full blur-[100px]" />
          </div>

          {/* Mobile progress bar */}
          <div className="lg:hidden sticky top-0 z-50 bg-gray-950/90 backdrop-blur-xl border-b border-gray-800/40">
            <div className="max-w-lg mx-auto px-5 pt-4 pb-3">
              <div className="h-1 bg-gray-800/80 rounded-full overflow-hidden mb-4">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progressPercent}%`, backgroundColor: accentColor }}
                />
              </div>
              <div className="flex items-center justify-between">
                {STEPS.map((s, i) => {
                  const Icon = s.icon;
                  const isActive = i === step;
                  const isDone = i < step;
                  return (
                    <div key={s.key} className="flex flex-col items-center gap-1.5">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 ${
                        isDone ? 'bg-green-500/15 text-green-400' :
                        isActive ? 'text-gray-950 shadow-[0_0_16px_rgba(34,197,94,0.35)]' :
                        'bg-gray-800/80 text-gray-600'
                      }`} style={isActive ? { backgroundColor: accentColor } : undefined}>
                        {isDone ? (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <Icon className="w-4 h-4" />
                        )}
                      </div>
                      <span className={`text-[10px] font-semibold transition-colors ${
                        isActive ? 'text-white' : isDone ? 'text-green-400/80' : 'text-gray-600'
                      }`}>
                        {s.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Form content */}
          <div className="flex-1 flex flex-col justify-center relative">
            <div className="max-w-lg mx-auto w-full px-5 py-8 lg:px-10 xl:px-14 lg:py-0">
              <div className="lg:bg-gray-900/40 lg:border lg:border-gray-800/50 lg:rounded-3xl lg:p-10 lg:ring-1 lg:ring-white/[0.03] lg:shadow-2xl lg:shadow-black/20 lg:backdrop-blur-sm">
                <div className="mb-8">
                  <h2 className="text-[1.65rem] font-black text-white tracking-tight leading-tight">{STEPS[step].description}</h2>
                  <p className="text-gray-500 text-sm mt-1.5 lg:hidden font-medium">
                    Step {step + 1} of {STEPS.length}
                  </p>
                </div>

                {/* Step: Contact */}
                {STEPS[step]?.key === 'info' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <FloatingInput label="First name" value={form.firstName} onChange={v => update('firstName', v)} autoFocus />
                      <FloatingInput label="Last name" value={form.lastName} onChange={v => update('lastName', v)} />
                    </div>
                    <FloatingInput label="Phone number" type="tel" value={form.phone} onChange={v => update('phone', v)} placeholder="(555) 555-5555" />
                    <FloatingInput label={`Email${config.fields.email.required ? '' : ' (optional)'}`} type="email" value={form.email} onChange={v => update('email', v)} placeholder="you@example.com" />
                    <InlineTrust text="We'll only use this to send your estimate" />
                  </div>
                )}

                {/* Step: Address */}
                {STEPS[step]?.key === 'location' && (
                  <div className="space-y-4">
                    <FloatingInput label="Street address" value={form.address} onChange={v => update('address', v)} autoFocus placeholder="123 Main St" />
                    <div className="grid grid-cols-5 gap-3">
                      <div className="col-span-3">
                        <FloatingInput label="City" value={form.city} onChange={v => update('city', v)} />
                      </div>
                      <FloatingInput label="State" value={form.state} onChange={v => update('state', v)} placeholder="GA" />
                      <FloatingInput label="ZIP" value={form.zip} onChange={v => update('zip', v)} placeholder="30301" />
                    </div>
                    <InlineTrust text="We need this to check if we service your area" />
                    {locationCheckState === 'invalid' && (
                      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3.5 text-sm text-red-400">
                        Please enter a valid five-digit ZIP code.
                      </div>
                    )}
                  </div>
                )}

                {/* Step: Photos */}
                {STEPS[step]?.key === 'photos' && (
                  <div className="space-y-4">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handlePhotoUpload}
                    />

                    {form.photos.length < 10 && !uploadingPhotos && (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full border-2 border-dashed border-gray-700/60 hover:border-green-500/40 rounded-2xl p-8 text-center transition-all duration-200 hover:bg-green-500/[0.03] group"
                      >
                        <div className="w-14 h-14 bg-gray-800/80 group-hover:bg-green-500/15 rounded-2xl flex items-center justify-center mx-auto mb-3 transition-all duration-200 group-hover:shadow-lg group-hover:shadow-green-500/10">
                          <CameraIcon className="w-7 h-7 text-gray-500 group-hover:text-green-400 transition-colors duration-200" />
                        </div>
                        <span className="text-white font-bold text-base block">
                          Tap to add photos
                        </span>
                        <span className="text-gray-500 text-sm mt-1 block">
                          {form.photos.length === 0
                            ? `Upload at least ${minPhotos} photos of your items`
                            : `${form.photos.length}/10 photos (${Math.max(0, minPhotos - form.photos.length)} more required)`
                          }
                        </span>
                      </button>
                    )}

                    {form.photos.length > 0 && (
                      <div className="grid grid-cols-3 gap-2.5">
                        {form.photos.map((photo, i) => (
                          <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-gray-800 ring-1 ring-white/[0.06] shadow-md shadow-black/20 group">
                            <img src={photo} alt={`Photo ${i + 1}`} className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105" />
                            <button
                              onClick={() => removePhoto(i)}
                              className="absolute top-1.5 right-1.5 w-7 h-7 bg-black/60 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-red-500/80 transition-all duration-150 opacity-0 group-hover:opacity-100 sm:opacity-100"
                            >
                              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))}
                        {form.photos.length < 10 && (
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            className="aspect-square rounded-xl border-2 border-dashed border-gray-700/50 flex items-center justify-center hover:border-green-500/40 hover:bg-green-500/[0.03] transition-all duration-200"
                          >
                            <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                            </svg>
                          </button>
                        )}
                      </div>
                    )}

                    {form.photos.length >= minPhotos && !aiItems && (
                      <button
                        onClick={analyzePhotos}
                        disabled={analyzing}
                        className="w-full bg-gray-800/80 hover:bg-gray-700/80 text-white py-4 rounded-xl font-bold text-sm disabled:opacity-50 transition-all duration-200 border border-gray-700/60 flex items-center justify-center gap-2 ring-1 ring-white/[0.03]"
                      >
                        {analyzing ? (
                          <>
                            <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Identifying items...
                          </>
                        ) : (
                          <>
                            <SparkleIcon className="w-5 h-5 text-green-400" />
                            Auto-detect items from photos
                          </>
                        )}
                      </button>
                    )}

                    {aiItems && aiItems.length > 0 && (
                      <div className="bg-gray-900/60 rounded-2xl p-4 space-y-2 border border-gray-800/60 ring-1 ring-white/[0.02]">
                        <div className="flex items-center gap-2 mb-3">
                          <SparkleIcon className="w-4 h-4 text-green-400" />
                          <span className="text-sm font-bold text-white">Items detected - confirm or edit:</span>
                        </div>
                        {aiItems.map((item, i) => (
                          <div key={i} className="flex items-center gap-2 bg-gray-800/60 rounded-xl p-2.5">
                            <input
                              type="text"
                              value={item.item}
                              onChange={e => updateDetectedItem(i, 'item', e.target.value)}
                              className="flex-1 text-sm bg-transparent text-white border border-gray-700/60 rounded-lg px-3 py-2 focus:outline-none focus:border-green-500 focus-glow transition-all"
                            />
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={e => updateDetectedItem(i, 'quantity', Number(e.target.value))}
                              className="w-16 text-sm bg-transparent text-white border border-gray-700/60 rounded-lg px-2 py-2 text-center focus:outline-none focus:border-green-500 focus-glow transition-all"
                            />
                            <button
                              onClick={() => removeDetectedItem(i)}
                              className="text-gray-600 hover:text-red-400 p-1.5 transition-colors duration-150"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {aiItems && aiItems.length === 0 && (
                      <p className="text-sm text-gray-500 text-center py-2">
                        Couldn't auto-detect items. No worries - just describe them in the next step.
                      </p>
                    )}

                    {uploadingPhotos && (
                      <div className="flex items-center justify-center gap-2 py-3 text-sm text-gray-400">
                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Uploading photos...
                      </div>
                    )}

                    {photoError && (
                      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-400 text-center">
                        {photoError}
                      </div>
                    )}

                    <InlineTrust text="Photos help us give you an accurate, no-surprise estimate" />
                  </div>
                )}

                {/* Step: Details */}
                {STEPS[step]?.key === 'details' && (
                  <div className="space-y-7">
                    <div>
                      <SectionLabel>{config.fields.quantity.label}</SectionLabel>
                      <div className="grid grid-cols-2 gap-2.5">
                        {quantityOptions.map(opt => (
                          <OptionCard
                            key={opt.value}
                            selected={form.quantity === opt.value}
                            onClick={() => update('quantity', opt.value)}
                          >
                            <span className={`text-2xl font-black block ${form.quantity === opt.value ? 'text-green-400' : 'text-gray-600'}`}>
                              {opt.icon}
                            </span>
                            <span className={`text-sm font-bold block mt-1.5 ${form.quantity === opt.value ? 'text-white' : 'text-gray-300'}`}>
                              {opt.label}
                            </span>
                            <span className="text-xs text-gray-500 block mt-0.5">{opt.sub}</span>
                          </OptionCard>
                        ))}
                      </div>
                    </div>

                    <div>
                      <SectionLabel>{config.fields.accessType.label}</SectionLabel>
                      <div className="space-y-2">
                        {accessOptions.map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => update('accessType', opt.value)}
                            className={`w-full flex items-center gap-3 p-4 rounded-xl border text-left transition-all duration-200 ${
                              form.accessType === opt.value
                                ? 'bg-green-500/10 border-green-500/50 ring-1 ring-green-500/40 shadow-sm shadow-green-500/5'
                                : 'bg-gray-900/50 border-gray-800/60 hover:border-gray-700 hover:bg-gray-800/40'
                            }`}
                          >
                            <span className="text-xl">{opt.icon}</span>
                            <span className={`font-semibold text-sm ${form.accessType === opt.value ? 'text-white' : 'text-gray-300'}`}>
                              {opt.label}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {config.fields.stairs.enabled && (
                      <div>
                        <SectionLabel>{config.fields.stairs.label}</SectionLabel>
                        <div className="grid grid-cols-2 gap-2.5">
                          {stairsOptions.map(opt => (
                            <OptionCard
                              key={opt.value}
                              selected={form.stairs === opt.value}
                              onClick={() => update('stairs', opt.value)}
                              compact
                            >
                              <span className={`font-semibold text-sm ${form.stairs === opt.value ? 'text-white' : 'text-gray-400'}`}>
                                {opt.label}
                              </span>
                            </OptionCard>
                          ))}
                        </div>
                      </div>
                    )}

                    {config.fields.elevator.enabled && (form.accessType === 'upstairs' || form.accessType === 'basement') && (
                      <div>
                        <SectionLabel>{config.fields.elevator.label}</SectionLabel>
                        <div className="grid grid-cols-2 gap-2.5">
                          {elevatorOptions.map(opt => (
                            <OptionCard
                              key={opt.value}
                              selected={form.elevator === opt.value}
                              onClick={() => update('elevator', opt.value)}
                              compact
                            >
                              <span className={`font-semibold text-sm ${form.elevator === opt.value ? 'text-white' : 'text-gray-400'}`}>
                                {opt.label}
                              </span>
                            </OptionCard>
                          ))}
                        </div>
                      </div>
                    )}

                    {config.fields.description.enabled && (
                      <div>
                        <label className="block text-[11px] font-bold text-gray-400 mb-2.5 uppercase tracking-[0.1em]">
                          {config.fields.description.label} <span className="text-gray-600 font-medium normal-case tracking-normal">(optional)</span>
                        </label>
                        <textarea
                          className="w-full bg-gray-900/60 border border-gray-800/60 rounded-xl px-4 py-3.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/60 focus-glow transition-all duration-200 resize-none ring-1 ring-white/[0.02]"
                          rows={3}
                          value={form.description}
                          onChange={e => update('description', e.target.value)}
                          placeholder={config.fields.description.placeholder}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Step: Schedule */}
                {STEPS[step]?.key === 'schedule' && (
                  <div className="space-y-7">
                    <div>
                      <SectionLabel>Pick a day</SectionLabel>
                      <div className="grid grid-cols-3 gap-2.5">
                        {(showMoreDates ? availableDays : availableDays.slice(0, 12)).map(day => {
                          const { weekday, date } = formatDateShort(day);
                          const isSelected = form.preferredDate === day;
                          return (
                            <button
                              key={day}
                              onClick={() => setForm(prev => ({ ...prev, preferredDate: day, secondChoiceDate: '' }))}
                              className={`p-3 rounded-xl border text-center transition-all duration-200 ${
                                isSelected
                                  ? 'bg-green-500/10 border-green-500/50 ring-1 ring-green-500/40 shadow-sm shadow-green-500/5'
                                  : 'bg-gray-900/50 border-gray-800/60 hover:border-gray-700 hover:bg-gray-800/40'
                              }`}
                            >
                              <span className={`text-[10px] font-bold block tracking-wide ${isSelected ? 'text-green-400' : 'text-gray-500'}`}>
                                {weekday}
                              </span>
                              <span className={`text-sm font-semibold block mt-0.5 ${isSelected ? 'text-white' : 'text-gray-300'}`}>
                                {date}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      {availableDays.length > 12 && (
                        <button
                          onClick={() => setShowMoreDates(v => !v)}
                          className="mt-3 text-xs text-gray-500 hover:text-gray-300 transition-colors duration-200 underline underline-offset-2"
                        >
                          {showMoreDates ? 'Show fewer dates' : `View more dates (${availableDays.length - 12} more)`}
                        </button>
                      )}
                    </div>

                    {config.fields.secondChoiceDate.enabled && (() => {
                      const backupDates = availableDays.filter(d => d > form.preferredDate).slice(0, 6);
                      if (!form.preferredDate || backupDates.length === 0) return null;
                      return (
                        <div>
                          <div className="mb-3">
                            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-[0.1em]">
                              Could another day work?
                            </label>
                            <p className="text-xs text-gray-600 mt-0.5">Optional — helps us schedule you faster.</p>
                          </div>
                          <div className="grid grid-cols-3 gap-2.5">
                            {backupDates.map(day => {
                              const { weekday, date } = formatDateShort(day);
                              const isSelected = form.secondChoiceDate === day;
                              return (
                                <button
                                  key={day}
                                  onClick={() => update('secondChoiceDate', form.secondChoiceDate === day ? '' : day)}
                                  className={`p-3 rounded-xl border text-center transition-all duration-200 ${
                                    isSelected
                                      ? 'bg-green-500/10 border-green-500/50 ring-1 ring-green-500/40 shadow-sm shadow-green-500/5'
                                      : 'bg-gray-900/50 border-gray-800/60 hover:border-gray-700 hover:bg-gray-800/40'
                                  }`}
                                >
                                  <span className={`text-[10px] font-bold block tracking-wide ${isSelected ? 'text-green-400' : 'text-gray-500'}`}>
                                    {weekday}
                                  </span>
                                  <span className={`text-sm font-semibold block mt-0.5 ${isSelected ? 'text-white' : 'text-gray-300'}`}>
                                    {date}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    <div>
                      <SectionLabel>{config.fields.timePreference.label}</SectionLabel>
                      <div className="grid grid-cols-3 gap-2.5">
                        {timePreferences.map(pref => (
                          <OptionCard
                            key={pref.value}
                            selected={form.timePreference === pref.value}
                            onClick={() => update('timePreference', pref.value)}
                            className="text-center"
                          >
                            <span className="text-xl block">{pref.icon}</span>
                            <span className={`text-sm font-bold block mt-1.5 ${form.timePreference === pref.value ? 'text-white' : 'text-gray-300'}`}>
                              {pref.label}
                            </span>
                            <span className="text-xs text-gray-500 block mt-0.5">{pref.sub}</span>
                          </OptionCard>
                        ))}
                      </div>
                    </div>

                    <InlineTrust text="You'll confirm the exact time when you accept your estimate" />
                  </div>
                )}

                {submitError && (
                  <div className="mt-5 bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-sm text-red-400 text-center">
                    {submitError}
                  </div>
                )}

                {/* Navigation */}
                <div className="mt-10 space-y-3 pb-8 lg:pb-0">
                  {STEPS[step]?.key === 'location' && (locationCheckState === 'outside' || locationCheckState === 'unavailable') ? (
                    <OutsideServiceAreaCard
                      businessName={businessName}
                      accentColor={accentColor}
                      enteredZip={form.zip}
                      isUnavailable={locationCheckState === 'unavailable'}
                      notifyState={notifyState}
                      onNotifyChange={patch => setNotifyState(s => ({ ...s, ...patch }))}
                      onNotifySubmit={() => handleNotifySubmit(form.zip)}
                      onCheckAnother={() => {
                        setLocationCheckState(null);
                        setNotifyState({ open: false, name: '', email: '', submitting: false, done: false });
                      }}
                    />
                  ) : step < STEPS.length - 1 ? (
                    <button
                      onClick={STEPS[step]?.key === 'location' ? handleLocationCheck : next}
                      disabled={!canProceed() || locationCheckState === 'checking'}
                      className="w-full hover:brightness-110 text-gray-950 rounded-xl text-base font-extrabold btn-glow disabled:opacity-30 disabled:shadow-none active:scale-[0.98] transform transition-all duration-200"
                      style={{ paddingTop: '18px', paddingBottom: '18px', backgroundColor: accentColor }}
                    >
                      {STEPS[step]?.key === 'location' && locationCheckState === 'checking' ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Checking your area...
                        </span>
                      ) : 'Continue'}
                    </button>
                  ) : (
                    <button
                      onClick={handleSubmit}
                      disabled={!canProceed() || submitting}
                      className="w-full hover:brightness-110 text-gray-950 rounded-xl text-base font-extrabold btn-glow disabled:opacity-30 disabled:shadow-none active:scale-[0.98] transform transition-all duration-200"
                      style={{ paddingTop: '18px', paddingBottom: '18px', backgroundColor: accentColor }}
                    >
                      {submitting ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Submitting...
                        </span>
                      ) : (
                        'Submit Request'
                      )}
                    </button>
                  )}

                  {!(STEPS[step]?.key === 'location' && (locationCheckState === 'outside' || locationCheckState === 'unavailable')) && (
                    <button
                      onClick={back}
                      className="w-full text-gray-500 hover:text-gray-300 py-3 text-sm font-semibold transition-colors duration-200"
                    >
                      {step === 0 ? 'Back to start' : 'Back'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

// ---- LAYOUT COMPONENTS ----

function PageShell({ children, style }) {
  return (
    <div className="min-h-screen bg-gray-950 text-white bg-noise" style={style}>
      {children}
    </div>
  );
}

function BrandHeader({ businessName, branding }) {
  return (
    <header className="bg-gray-950/80 backdrop-blur-xl border-b border-gray-800/40 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-5 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt={businessName} className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: branding.accentColor || '#22c55e' }}>
              <span className="text-gray-950 font-black text-lg">{businessName.charAt(0)}</span>
            </div>
          )}
          <div className="leading-tight">
            <span className="text-white font-extrabold text-lg tracking-tight block">{businessName.toUpperCase()}</span>
            {branding.tagline && (
              <span className="text-gray-500 text-[10px] font-bold tracking-[0.15em] uppercase block">{branding.tagline}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-6">
          {branding.phone && (
            <a href={`tel:${branding.phone.replace(/\D/g, '')}`} className="text-gray-400 hover:text-white text-sm font-medium transition-colors hidden sm:flex items-center gap-2">
              <PhoneIcon className="w-4 h-4" />
              {branding.phone}
            </a>
          )}
        </div>
      </div>
    </header>
  );
}

function CompanionPanel({ children }) {
  return (
    <div className="hidden lg:flex lg:w-[45%] xl:w-[42%] border-r border-gray-800/30 flex-col justify-center px-14 xl:px-18 relative overflow-hidden"
      style={{ background: 'linear-gradient(160deg, rgba(17,24,39,0.95) 0%, rgba(3,7,18,1) 50%, rgba(17,24,39,0.9) 100%)' }}
    >
      <div className="absolute top-1/4 right-0 w-80 h-80 bg-green-500/[0.04] rounded-full blur-[100px] translate-x-1/3" />
      <div className="absolute bottom-1/4 left-0 w-64 h-64 bg-green-500/[0.03] rounded-full blur-[80px] -translate-x-1/3" />
      <div className="absolute top-0 left-1/2 w-full h-px bg-gradient-to-r from-transparent via-gray-800/50 to-transparent" />
      <div className="relative">
        {children}
      </div>
    </div>
  );
}

function CompanionTrust({ text }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-5 h-5 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0 ring-1 ring-green-500/20">
        <svg className="w-2.5 h-2.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <span className="text-gray-400 text-sm">{text}</span>
    </div>
  );
}

// ---- FORM COMPONENTS ----

function FloatingInput({ label, type = 'text', value, onChange, placeholder, autoFocus }) {
  return (
    <div>
      <label className="block text-[11px] font-bold text-gray-500 mb-2 uppercase tracking-[0.1em]">{label}</label>
      <input
        type={type}
        className="w-full bg-gray-900/60 border border-gray-800/60 rounded-xl px-4 py-3.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/60 focus-glow transition-all duration-200 ring-1 ring-white/[0.02]"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
      />
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <label className="block text-[11px] font-bold text-gray-400 mb-3 uppercase tracking-[0.1em]">
      {children}
    </label>
  );
}

function OptionCard({ selected, onClick, children, compact, className = '' }) {
  return (
    <button
      onClick={onClick}
      className={`${compact ? 'p-3.5' : 'p-4'} rounded-xl border text-left transition-all duration-200 ${
        selected
          ? 'bg-green-500/10 border-green-500/50 ring-1 ring-green-500/40 shadow-sm shadow-green-500/5'
          : 'bg-gray-900/50 border-gray-800/60 hover:border-gray-700 hover:bg-gray-800/40'
      } ${className}`}
    >
      {children}
    </button>
  );
}

function TrustBadge({ icon: Icon, text }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="w-5 h-5 text-green-400 flex-shrink-0" />
      <span className="text-gray-300 text-sm">{text}</span>
    </div>
  );
}

function InlineTrust({ text }) {
  return (
    <div className="flex items-center gap-2 pt-3">
      <ShieldIcon className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" />
      <span className="text-[11px] text-gray-600 font-medium">{text}</span>
    </div>
  );
}

// ---- OUT-OF-AREA CARD ----

function OutsideServiceAreaCard({ businessName, accentColor, enteredZip, isUnavailable, notifyState, onNotifyChange, onNotifySubmit, onCheckAnother }) {
  if (notifyState.done) {
    return (
      <div className="bg-green-500/5 border border-green-500/20 rounded-2xl p-6 text-center">
        <div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4 ring-1 ring-green-500/20">
          <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-white font-bold mb-1">You're on the list!</p>
        <p className="text-gray-400 text-sm">We'll reach out as soon as {businessName} expands to your area.</p>
        <button onClick={onCheckAnother} className="mt-4 text-sm font-medium transition-colors" style={{ color: accentColor }}>
          Check another ZIP
        </button>
      </div>
    );
  }

  if (notifyState.open) {
    return (
      <div className="bg-gray-900/60 border border-gray-800/60 rounded-2xl p-6 ring-1 ring-white/[0.02]">
        <p className="text-white font-bold mb-1">Leave your info</p>
        <p className="text-gray-400 text-sm mb-5">We'll let you know as soon as we start serving your area.</p>
        <div className="space-y-3">
          <input type="text" placeholder="Your name (optional)" value={notifyState.name} onChange={e => onNotifyChange({ name: e.target.value })} className="w-full bg-gray-800/60 border border-gray-700/60 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-green-500/60 transition-all" />
          <input type="email" placeholder="Email address" value={notifyState.email} onChange={e => onNotifyChange({ email: e.target.value })} className="w-full bg-gray-800/60 border border-gray-700/60 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-green-500/60 transition-all" />
          <button
            onClick={onNotifySubmit}
            disabled={!notifyState.email.trim() || notifyState.submitting}
            className="w-full hover:brightness-110 disabled:opacity-40 text-gray-950 font-bold text-sm py-3 rounded-xl transition-colors"
            style={{ backgroundColor: accentColor }}
          >
            {notifyState.submitting ? 'Submitting...' : 'Notify Me When You Expand'}
          </button>
          <button onClick={onCheckAnother} className="w-full text-gray-500 hover:text-gray-300 py-2 text-sm font-medium transition-colors">
            Check another ZIP
          </button>
        </div>
      </div>
    );
  }

  if (isUnavailable) {
    return (
      <div className="bg-gray-900/60 border border-gray-800/60 rounded-2xl p-6 ring-1 ring-white/[0.02]">
        <p className="text-white font-bold text-[15px] mb-2">We're temporarily unavailable in this area.</p>
        <p className="text-gray-400 text-sm leading-relaxed mb-5">Please check back soon or contact us for assistance.</p>
        {enteredZip && <p className="text-gray-500 text-xs mb-5 font-mono">ZIP: {enteredZip}</p>}
        <button onClick={onCheckAnother} className="w-full bg-gray-800/80 hover:bg-gray-700/80 text-white font-semibold text-sm py-3.5 rounded-xl border border-gray-700/60 transition-colors">
          Check Another ZIP
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/60 border border-gray-800/60 rounded-2xl p-6 ring-1 ring-white/[0.02]">
      <p className="text-white font-bold text-[15px] mb-2">We're not in your neighborhood just yet.</p>
      <p className="text-gray-400 text-sm leading-relaxed mb-5">
        {businessName} is not currently servicing this ZIP code. We're expanding, so leave your
        information and we'll let you know when service becomes available.
      </p>
      {enteredZip && <p className="text-gray-500 text-xs mb-5 font-mono">ZIP: {enteredZip}</p>}
      <div className="space-y-2">
        <button
          onClick={() => onNotifyChange({ open: true })}
          className="w-full hover:brightness-110 text-gray-950 font-bold text-sm py-3.5 rounded-xl transition-colors"
          style={{ backgroundColor: accentColor }}
        >
          Notify Me When You Expand
        </button>
        <button onClick={onCheckAnother} className="w-full bg-gray-800/80 hover:bg-gray-700/80 text-white font-semibold text-sm py-3.5 rounded-xl border border-gray-700/60 transition-colors">
          Check Another ZIP
        </button>
      </div>
    </div>
  );
}

// ---- ICONS ----

function TruckIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
    </svg>
  );
}

function PhoneIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
  );
}

function UserIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

function PinIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function CameraIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function ClipboardIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );
}

function CalendarIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function ShieldIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function CheckCircleIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function SparkleIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  );
}

// ---- HELPERS ----

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return { weekday: d.toLocaleDateString('en-US', { weekday: 'short' }), date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) };
}

function resizeImage(file, maxWidth) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}
