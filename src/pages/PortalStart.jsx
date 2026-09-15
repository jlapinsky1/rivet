import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Trash2, Mail, Lock, User, Phone, Building2, Briefcase,
  MapPin, AlertTriangle, CheckCircle, ArrowLeft, ArrowRight,
  ClipboardList, Camera, X,
} from "lucide-react";
import { getAvailableBookingDates } from "../utils/dateLogic";
import { supabase } from "../utils/supabaseClient";
import { trackEvent } from "../utils/analytics";
import { getRepo } from "../utils/repository";
import {
  emptyDraft,
  loadDraft,
  saveDraft,
  clearDraft,
  buildPropertyAddress,
} from "../utils/commercialRequestDraft";
import { submitAuthenticatedDraft } from "../utils/submitCommercialDraft";

const PROPERTY_TYPES = [
  { value: "apartment_multifamily", label: "Apartment / Multifamily" },
  { value: "single_family", label: "Single-Family Rental" },
  { value: "commercial_retail", label: "Commercial / Retail" },
  { value: "hoa_community", label: "HOA / Community" },
  { value: "other", label: "Other" },
];

const SERVICE_TYPES = [
  "Apartment / Unit Cleanout",
  "Eviction Cleanup",
  "Unit Turnover Cleanout",
  "Bulk Trash Removal",
  "Dumpster Overflow Cleanup",
  "Illegal Dumping Removal",
  "Furniture Removal",
  "Appliance Removal",
  "General Junk Removal",
  "Other - describe in notes",
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY",
];

function ProgressBar({ step }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-10">
      {[1, 2, 3].map((n) => (
        <React.Fragment key={n}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
            n < step
              ? "bg-[#22c55e] text-black"
              : n === step
              ? "bg-[#22c55e]/20 border-2 border-[#22c55e] text-[#22c55e]"
              : "bg-white/5 border border-white/10 text-white/30"
          }`}>
            {n < step ? <CheckCircle className="w-4 h-4" /> : n}
          </div>
          {n < 3 && (
            <div className={`h-px flex-1 max-w-12 transition-colors ${n < step ? "bg-[#22c55e]" : "bg-white/10"}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function FieldWrap({ label, required, children }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs text-white/50 font-medium uppercase tracking-wider">
        {label}{required && <span className="text-[#22c55e] ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}

function InputRow({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-3 bg-[#111a14] border border-white/10 rounded-xl px-4 py-3 focus-within:border-[#22c55e]/40 transition-colors">
      {Icon && <Icon className="w-4 h-4 text-[#22c55e] shrink-0" />}
      {children}
    </div>
  );
}

const inputCls = "w-full bg-transparent text-sm text-white placeholder:text-white/25 outline-none";
const selectCls = "w-full bg-transparent text-sm text-white outline-none [&>option]:bg-[#111a14]";

function formatDateShort(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  return {
    weekday: d.toLocaleDateString("en-US", { weekday: "short" }),
    date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  };
}

function formatPreferredDate(isoDate) {
  const d = new Date(`${isoDate}T12:00:00`);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function resizeImagePreview(file, maxWidth) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function PortalStart() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [existingEmailPrompt, setExistingEmailPrompt] = useState(false);
  const [showMoreDates, setShowMoreDates] = useState(false);

  const availableDays = useMemo(
    () => getAvailableBookingDates({ referenceDate: new Date() }),
    [],
  );

  // Initialize draft from sessionStorage
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const attribution = {
      utm_source: p.get("utm_source") || "",
      utm_medium: p.get("utm_medium") || "",
      utm_campaign: p.get("utm_campaign") || "",
      utm_term: p.get("utm_term") || "",
      utm_content: p.get("utm_content") || "",
      referrer: document.referrer || "",
      landing_page: window.location.href,
    };

    const saved = loadDraft();
    setDraft(saved ? { ...emptyDraft(attribution), ...saved, attribution: saved.attribution || attribution } : emptyDraft(attribution));
  }, []);

  // Persist draft on change
  useEffect(() => {
    if (draft) saveDraft(draft);
  }, [draft]);

  const updateDraft = useCallback((patch) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  function clearError() {
    setError("");
    setExistingEmailPrompt(false);
  }

  async function ensureUploadSession(currentDraft) {
    if (currentDraft.uploadSessionId) return currentDraft.uploadSessionId;
    const repo = await getRepo();
    const session = await repo.createUploadSession(null);
    updateDraft({ uploadSessionId: session.sessionId });
    return session.sessionId;
  }

  async function handlePhotoUpload(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length || !draft) return;

    const remaining = 10 - (draft.photoPreviews?.length || 0);
    const toProcess = files.slice(0, remaining);
    if (!toProcess.length) return;

    setUploadingPhotos(true);
    clearError();

    try {
      const sid = await ensureUploadSession(draft);
      const repo = await getRepo();
      const newPreviews = [...(draft.photoPreviews || [])];

      for (const file of toProcess) {
        const preview = await resizeImagePreview(file, 1200);
        await repo.getUploadUrl(sid, file.name, file.type || "image/jpeg");
        newPreviews.push(preview);
      }

      updateDraft({ photoPreviews: newPreviews, uploadSessionId: sid });
    } catch {
      setError("Photo upload failed. You can continue without photos or try again.");
    } finally {
      setUploadingPhotos(false);
      e.target.value = "";
    }
  }

  function removePhoto(index) {
    updateDraft({
      photoPreviews: draft.photoPreviews.filter((_, i) => i !== index),
    });
  }

  // ── Step 1: Cleanup details ─────────────────────────────────────────────
  function handleStep1(e) {
    e.preventDefault();
    if (!draft.propName || !draft.propStreet || !draft.propCity || !draft.propZip || !draft.propType) {
      setError("Property name, address, and type are required.");
      return;
    }
    if (!draft.jobService || !draft.jobDescription?.trim()) {
      setError("Service type and description are required.");
      return;
    }
    clearError();
    trackEvent("commercial_request_details_entered");
    setStep(2);
  }

  // ── Step 2: Contact details + email check ───────────────────────────────
  async function handleStep2(e) {
    e.preventDefault();
    if (!draft.name || !draft.email || !draft.phone || !draft.company) {
      setError("Name, work email, phone, and company are required.");
      return;
    }
    setLoading(true);
    clearError();

    try {
      const res = await fetch("/api/check-commercial-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: draft.email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Unable to verify email.");
        return;
      }

      if (data.exists) {
        updateDraft({ pendingLogin: true });
        setExistingEmailPrompt(true);
        setError("An account with this email already exists. Log in to submit your request.");
        return;
      }

      trackEvent("commercial_contact_entered");
      setStep(3);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function goToLoginWithDraft() {
    saveDraft({ ...draft, pendingLogin: true });
    navigate("/portal/login?resume=request");
  }

  // ── Step 3: Review + create account + submit ────────────────────────────
  async function handleStep3(e) {
    e.preventDefault();
    if (submitted) return;
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!agreed) {
      setError("Please agree to continue.");
      return;
    }

    setLoading(true);
    setSubmitted(true);
    clearError();

    try {
      const res = await fetch("/api/submit-commercial-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: draft.idempotencyKey,
          name: draft.name,
          email: draft.email.trim(),
          password,
          phone: draft.phone,
          company: draft.company,
          jobTitle: draft.jobTitle || null,
          propName: draft.propName,
          propStreet: draft.propStreet,
          propCity: draft.propCity,
          propState: draft.propState,
          propZip: draft.propZip,
          propType: draft.propType,
          propUnits: draft.propUnits || null,
          propContactName: draft.propContactName || null,
          propContactPhone: draft.propContactPhone || null,
          propNotes: draft.propNotes || null,
          jobUnit: draft.jobUnit || null,
          jobService: draft.jobService,
          jobDescription: draft.jobDescription,
          jobDate: draft.jobDate || null,
          jobAccessNotes: draft.jobAccessNotes || null,
          jobPoRef: draft.jobPoRef || null,
          uploadSessionId: draft.uploadSessionId || null,
          attribution: draft.attribution,
        }),
      });

      const data = await res.json();

      if (res.status === 409) {
        setSubmitted(false);
        updateDraft({ pendingLogin: true });
        setExistingEmailPrompt(true);
        setError(data.error || "This email already has an account. Please log in.");
        return;
      }

      if (data.userCreated && !data.success) {
        setSubmitted(false);
        if (supabase) {
          const { error: signInErr } = await supabase.auth.signInWithPassword({
            email: draft.email.trim(),
            password,
          });
          if (!signInErr) {
            try {
              await submitAuthenticatedDraft(supabase, draft);
              clearDraft();
              trackEvent("commercial_profile_created");
              trackEvent("commercial_work_order_submitted");
              trackEvent("commercial_onboarding_completed");
              setStep(4);
              setTimeout(() => navigate("/portal"), 2500);
              return;
            } catch (resumeErr) {
              updateDraft({ pendingLogin: true });
              setExistingEmailPrompt(true);
              setError(resumeErr?.message || data.error || "Account created. Log in to finish submitting your request.");
              return;
            }
          }
        }
        updateDraft({ pendingLogin: true });
        setExistingEmailPrompt(true);
        setError(data.error || "Account created but submission failed. Please log in to finish.");
        return;
      }

      if (!res.ok) {
        setSubmitted(false);
        setError(data.error || "Failed to submit. Please try again.");
        return;
      }

      // Sign in with the credentials just created
      if (supabase) {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: draft.email.trim(),
          password,
        });
        if (signInErr) {
          // Non-fatal - account and job exist
          console.error("Post-submit sign-in failed");
        }
      }

      clearDraft();
      trackEvent("commercial_profile_created");
      trackEvent("commercial_work_order_submitted");
      trackEvent("commercial_onboarding_completed");
      setStep(4);
      setTimeout(() => navigate("/portal"), 2500);
    } catch {
      setSubmitted(false);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!draft) {
    return (
      <div className="min-h-screen bg-[#0a0f0d] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-[#22c55e] border-t-transparent rounded-full" />
      </div>
    );
  }

  const propAddress = buildPropertyAddress(draft);

  return (
    <div className="min-h-screen bg-[#0a0f0d] text-white">
      <header className="fixed top-0 inset-x-0 z-50 border-b border-white/5 bg-[#0a0f0d]/90 backdrop-blur-md">
        <div className="max-w-lg mx-auto px-5 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center">
              <Trash2 className="w-4 h-4 text-[#0a0f0d]" />
            </div>
            <div className="leading-none">
              <span className="text-white font-black tracking-widest text-xs uppercase">Squatterz</span>
              <div className="text-[#22c55e] text-[8px] tracking-[0.2em] font-semibold uppercase mt-0.5">Commercial</div>
            </div>
          </Link>
          {step < 4 && (
            <Link to="/portal/login" className="text-xs text-white/40 hover:text-white/60 transition-colors">
              Client Login
            </Link>
          )}
        </div>
      </header>

      <main className="pt-24 pb-16 px-5">
        <div className="max-w-lg mx-auto">
          {step < 4 && (
            <div className="text-center mb-8">
              <h1 className="text-2xl font-black mb-1">
                {step === 1 && "Tell Us About the Cleanup"}
                {step === 2 && "Your Contact Details"}
                {step === 3 && "Save and Submit Your Request"}
              </h1>
              <p className="text-white/45 text-sm">
                {step === 1 && "Property and cleanup details first - account setup comes at the end."}
                {step === 2 && "We'll use this to follow up about your estimate."}
                {step === 3 && "Create secure portal access to submit your request, review your estimate, approve work, track progress, and manage future cleanups."}
              </p>
            </div>
          )}

          {step < 4 && <ProgressBar step={step} />}

          {error && (
            <div className="bg-red-400/10 border border-red-400/20 rounded-xl p-4 mb-6 text-sm text-red-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <span>{error}</span>
                {existingEmailPrompt && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={goToLoginWithDraft}
                      className="text-[#22c55e] font-semibold hover:underline"
                    >
                      Log in to submit your request →
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 1 - Cleanup details */}
          {step === 1 && (
            <form onSubmit={handleStep1} className="bg-white/[0.03] border border-white/8 rounded-2xl p-6 space-y-5">
              <FieldWrap label="Property Name" required>
                <InputRow icon={Building2}>
                  <input required value={draft.propName} onChange={(e) => updateDraft({ propName: e.target.value })} placeholder="Oakwood Ridge Apartments" className={inputCls} />
                </InputRow>
              </FieldWrap>

              <FieldWrap label="Street Address" required>
                <InputRow icon={MapPin}>
                  <input required value={draft.propStreet} onChange={(e) => updateDraft({ propStreet: e.target.value })} placeholder="1240 Ridge Blvd" className={inputCls} />
                </InputRow>
              </FieldWrap>

              <div className="grid grid-cols-2 gap-4">
                <FieldWrap label="City" required>
                  <InputRow>
                    <input required value={draft.propCity} onChange={(e) => updateDraft({ propCity: e.target.value })} placeholder="Gainesville" className={inputCls} />
                  </InputRow>
                </FieldWrap>
                <FieldWrap label="State" required>
                  <InputRow>
                    <select value={draft.propState} onChange={(e) => updateDraft({ propState: e.target.value })} className={selectCls}>
                      {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </InputRow>
                </FieldWrap>
              </div>

              <FieldWrap label="ZIP Code" required>
                <InputRow>
                  <input required value={draft.propZip} onChange={(e) => updateDraft({ propZip: e.target.value })} placeholder="30501" maxLength={10} className={inputCls} />
                </InputRow>
              </FieldWrap>

              <FieldWrap label="Property Type" required>
                <InputRow>
                  <select required value={draft.propType} onChange={(e) => updateDraft({ propType: e.target.value })} className={selectCls}>
                    <option value="" disabled>Select type…</option>
                    {PROPERTY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </InputRow>
              </FieldWrap>

              <FieldWrap label="Unit or Location">
                <InputRow>
                  <input value={draft.jobUnit} onChange={(e) => updateDraft({ jobUnit: e.target.value })} placeholder="Unit 14B, Dumpster Area… (optional)" className={inputCls} />
                </InputRow>
              </FieldWrap>

              <FieldWrap label="Service Needed" required>
                <InputRow icon={ClipboardList}>
                  <select required value={draft.jobService} onChange={(e) => updateDraft({ jobService: e.target.value })} className={selectCls}>
                    <option value="" disabled>Select service…</option>
                    {SERVICE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </InputRow>
              </FieldWrap>

              <FieldWrap label="Description" required>
                <textarea
                  required
                  value={draft.jobDescription}
                  onChange={(e) => updateDraft({ jobDescription: e.target.value })}
                  rows={4}
                  placeholder="Describe what needs to go. Include specific items, volumes, or conditions."
                  className="w-full bg-[#111a14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none focus:border-[#22c55e]/40 transition-colors resize-none"
                />
              </FieldWrap>

              <FieldWrap label="Photos (optional)">
                <div className="space-y-3">
                  {draft.photoPreviews?.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {draft.photoPreviews.map((src, i) => (
                        <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-white/10">
                          <img src={src} alt="" className="w-full h-full object-cover" />
                          <button type="button" onClick={() => removePhoto(i)} className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {draft.photoPreviews?.length < 10 && (
                    <label className="flex items-center justify-center gap-2 border border-dashed border-white/15 rounded-xl py-4 cursor-pointer hover:border-[#22c55e]/40 transition-colors">
                      <Camera className="w-4 h-4 text-[#22c55e]" />
                      <span className="text-sm text-white/50">{uploadingPhotos ? "Uploading…" : "Add photos"}</span>
                      <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} disabled={uploadingPhotos} />
                    </label>
                  )}
                </div>
              </FieldWrap>

              <FieldWrap label="Preferred Date">
                <p className="text-xs text-white/35 -mt-1 mb-3">Optional - click a day that works best.</p>
                <div className="grid grid-cols-3 gap-2.5">
                  {(showMoreDates ? availableDays : availableDays.slice(0, 12)).map((day) => {
                    const { weekday, date } = formatDateShort(day);
                    const isSelected = draft.jobDate === day;
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => updateDraft({ jobDate: isSelected ? "" : day })}
                        className={`p-3 rounded-xl border text-center transition-all ${
                          isSelected
                            ? "bg-[#22c55e]/10 border-[#22c55e]/50 ring-1 ring-[#22c55e]/40"
                            : "bg-[#111a14] border-white/10 hover:border-white/25"
                        }`}
                      >
                        <span className={`text-[10px] font-bold block tracking-wide ${isSelected ? "text-[#22c55e]" : "text-white/40"}`}>
                          {weekday}
                        </span>
                        <span className={`text-sm font-semibold block mt-0.5 ${isSelected ? "text-white" : "text-white/70"}`}>
                          {date}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {availableDays.length > 12 && (
                  <button
                    type="button"
                    onClick={() => setShowMoreDates((v) => !v)}
                    className="mt-3 text-xs text-white/40 hover:text-white/60 underline underline-offset-2 transition-colors"
                  >
                    {showMoreDates ? "Show fewer dates" : `View more dates (${availableDays.length - 12} more)`}
                  </button>
                )}
              </FieldWrap>

              <FieldWrap label="Access Notes">
                <textarea
                  value={draft.jobAccessNotes}
                  onChange={(e) => updateDraft({ jobAccessNotes: e.target.value })}
                  rows={2}
                  placeholder="Lockbox code, gate code, who to contact on arrival… (optional)"
                  className="w-full bg-[#111a14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none focus:border-[#22c55e]/40 transition-colors resize-none"
                />
              </FieldWrap>

              <button type="submit" className="w-full bg-[#22c55e] hover:bg-[#16a34a] text-black font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors">
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* Step 2 - Contact details */}
          {step === 2 && (
            <form onSubmit={handleStep2} className="bg-white/[0.03] border border-white/8 rounded-2xl p-6 space-y-5">
              <FieldWrap label="Full Name" required>
                <InputRow icon={User}>
                  <input required value={draft.name} onChange={(e) => updateDraft({ name: e.target.value })} placeholder="Jordan Rivera" className={inputCls} />
                </InputRow>
              </FieldWrap>

              <FieldWrap label="Company / Organization" required>
                <InputRow icon={Building2}>
                  <input required value={draft.company} onChange={(e) => updateDraft({ company: e.target.value })} placeholder="Apex Property Management" className={inputCls} />
                </InputRow>
              </FieldWrap>

              <FieldWrap label="Work Email" required>
                <InputRow icon={Mail}>
                  <input required type="email" value={draft.email} onChange={(e) => updateDraft({ email: e.target.value })} placeholder="jordan@propertyco.com" autoComplete="email" className={inputCls} />
                </InputRow>
              </FieldWrap>

              <FieldWrap label="Phone" required>
                <InputRow icon={Phone}>
                  <input required type="tel" value={draft.phone} onChange={(e) => updateDraft({ phone: e.target.value })} placeholder="(770) 555-0100" className={inputCls} />
                </InputRow>
              </FieldWrap>

              <FieldWrap label="Job Title">
                <InputRow icon={Briefcase}>
                  <input value={draft.jobTitle} onChange={(e) => updateDraft({ jobTitle: e.target.value })} placeholder="Property Manager (optional)" className={inputCls} />
                </InputRow>
              </FieldWrap>

              <div className="flex gap-3">
                <button type="button" onClick={() => { clearError(); setStep(1); }} className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white/60 transition-colors">
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button type="submit" disabled={loading} className="flex-1 bg-[#22c55e] hover:bg-[#16a34a] disabled:opacity-50 text-black font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors">
                  {loading ? "Checking…" : <>Continue <ArrowRight className="w-4 h-4" /></>}
                </button>
              </div>
            </form>
          )}

          {/* Step 3 - Review + password */}
          {step === 3 && (
            <form onSubmit={handleStep3} className="space-y-5">
              <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-6 space-y-3">
                <h2 className="font-black text-lg mb-4">Review Your Request</h2>
                {[
                  ["Property", draft.propName],
                  propAddress && ["Address", propAddress],
                  draft.jobUnit && ["Unit / Location", draft.jobUnit],
                  ["Service", draft.jobService],
                  draft.jobDate && ["Preferred Date", formatPreferredDate(draft.jobDate)],
                  ["Contact", draft.name],
                  ["Company", draft.company],
                  ["Email", draft.email],
                  ["Phone", draft.phone],
                ].filter(Boolean).map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4 py-2 border-b border-white/8 text-sm">
                    <span className="text-white/40">{label}</span>
                    <span className="text-white text-right">{value}</span>
                  </div>
                ))}
                {draft.jobDescription && (
                  <div className="pt-2 text-sm">
                    <span className="text-white/40 block mb-1">Description</span>
                    <span className="text-white leading-relaxed">{draft.jobDescription}</span>
                  </div>
                )}
              </div>

              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 text-xs text-white/40 leading-relaxed">
                Create secure portal access to submit this request. Your property and work order will be saved so future cleanup requests only take a few clicks.
              </div>

              <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-6 space-y-5">
                <FieldWrap label="Password" required>
                  <InputRow icon={Lock}>
                    <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters" minLength={8} autoComplete="new-password" className={inputCls} />
                  </InputRow>
                </FieldWrap>

                <FieldWrap label="Confirm Password" required>
                  <InputRow icon={Lock}>
                    <input required type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter password" minLength={8} autoComplete="new-password" className={inputCls} />
                  </InputRow>
                </FieldWrap>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 accent-[#22c55e]" />
                  <span className="text-xs text-white/45 leading-relaxed">
                    I agree to create a Squatterz commercial portal account and submit this estimate request for review.
                  </span>
                </label>
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={() => { clearError(); setStep(2); }} disabled={loading || submitted} className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white/60 transition-colors disabled:opacity-30">
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button type="submit" disabled={loading || submitted} className="flex-1 bg-[#22c55e] hover:bg-[#16a34a] disabled:opacity-50 text-black font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors">
                  {loading ? "Submitting…" : "Create Account & Submit Request"}
                </button>
              </div>
            </form>
          )}

          {/* Success */}
          {step === 4 && (
            <div className="text-center space-y-6 py-8">
              <div className="w-16 h-16 rounded-full bg-[#22c55e]/15 border border-[#22c55e]/30 flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8 text-[#22c55e]" />
              </div>
              <div>
                <h2 className="text-2xl font-black mb-3">Request Submitted</h2>
                <p className="text-white/55 text-sm leading-relaxed max-w-sm mx-auto">
                  Your estimate request has been submitted for review. Check your email for confirmation. Redirecting you to the portal…
                </p>
              </div>
              <button onClick={() => navigate("/portal")} className="text-sm text-[#22c55e] font-semibold hover:underline">
                Go to portal now →
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
