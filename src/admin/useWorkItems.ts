/**
 * Hook that fetches real bookings from the backend and normalizes them
 * into the WorkItem shape expected by the Rivet UI.
 *
 * This replaces the static mock data in types.ts with live data from Supabase.
 */

import { useState, useEffect, useCallback } from 'react';
import type { WorkItem, Recommendation, OperationalStatus, BillingStatus, WorkSource, CustomerType, ReasonItem, EstimateLine } from './types';
import { getRepo } from '../utils/repository';
import { buildEstimate } from '../utils/estimateBuilder';
import { detectRiskFlags, calculateConfidence } from '../utils/riskFlags';
import { rateJob } from '../utils/jobRating';
import { evaluateDecision } from '../utils/decisionEngine';
import { getSettings } from '../utils/storage';

function mapOpStatus(status: string): OperationalStatus {
  const map: Record<string, OperationalStatus> = {
    pending_review: 'needs_review',
    quote_sent: 'quoted',
    approved: 'approved',
    scheduled: 'scheduled',
    in_progress: 'in_progress',
    completed: 'completed',
    declined: 'declined',
    cancelled: 'declined',
  };
  return map[status] || 'needs_review';
}

function mapBillingStatus(booking: any): BillingStatus {
  if (booking.depositConfirmedAt) return 'deposit_pending';
  if (booking.stripeInvoiceId) return 'partially_paid';
  if (booking.completedAt && booking.stripeInvoiceId) return 'paid';
  return 'not_invoiced';
}

function formatTravelTime(minutes: number | null): string {
  if (!minutes) return 'Unknown';
  if (minutes < 60) return `${Math.round(minutes)} min away`;
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `${hrs}h ${mins}m away` : `${hrs}h away`;
}

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  const rounded = Math.round(hours * 2) / 2;
  return `${rounded} hrs`;
}

function buildReasons(decision: any): ReasonItem[] {
  const reasons: ReasonItem[] = [];
  if (decision.positiveFactors) {
    for (const msg of decision.positiveFactors.slice(0, 3)) {
      reasons.push({ icon: 'check', text: msg });
    }
  }
  if (decision.negativeFactors) {
    for (const msg of decision.negativeFactors.slice(0, 2)) {
      reasons.push({ icon: 'caution', text: msg });
    }
  }
  if (decision.blockers) {
    for (const msg of decision.blockers.slice(0, 2)) {
      reasons.push({ icon: 'x', text: msg });
    }
  }
  return reasons.length > 0 ? reasons : [{ icon: 'check', text: 'Awaiting full analysis' }];
}

function buildCostBreakdown(estimate: any): EstimateLine[] {
  if (!estimate?.breakdown) return [];
  return estimate.breakdown
    .filter((b: any) => b.type === 'cost')
    .map((b: any) => ({
      label: b.label,
      value: `$${Math.round(b.value)}`,
    }));
}

function getPhotos(booking: any): string[] {
  // Photos are stored in upload sessions; for now return a placeholder
  // Real photo URLs will be added when we wire up the storage layer
  if (booking.photoCount > 0) {
    return ['https://images.pexels.com/photos/10847167/pexels-photo-10847167.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'];
  }
  return [];
}

function normalizeBookingToWorkItem(
  booking: any,
  estimate: any,
  decision: any,
  confidence: any,
): WorkItem {
  const profit = estimate?.estimatedProfit ?? 0;
  const totalHours = (estimate?.estimatedOnSiteHours ?? 0) + ((estimate?.estimatedTravelMinutes ?? 0) / 60);
  const profitPerHour = totalHours > 0 ? profit / totalHours : 0;
  const price = estimate?.recommendedPrice ?? (booking.approvedQuote ?? 0);
  const costs = estimate?.estimatedDirectCost ?? 0;

  return {
    id: booking.id,
    title: booking.description
      ? booking.description.slice(0, 60) + (booking.description.length > 60 ? '...' : '')
      : `${booking.quantity || 'Job'} - ${booking.city || 'Unknown location'}`,
    source: (booking.source === 'commercial_work_order' ? 'commercial_work_order' : 'customer_request') as WorkSource,
    customerType: (booking.source === 'commercial_work_order' ? 'organization' : 'individual') as CustomerType,
    customerName: booking.customerName || 'Unknown Customer',
    customerSub: booking.propertyName ? `${booking.propertyName}${booking.unitLabel ? ` · ${booking.unitLabel}` : ''}` : undefined,
    location: booking.city && booking.state ? `${booking.city}, ${booking.state}` : booking.fullAddress || 'Unknown',
    travel: formatTravelTime(booking.travelMinutes),
    profit,
    hours: formatHours(totalHours),
    hoursNum: totalHours,
    rate: `$${Math.round(profitPerHour)}/hr`,
    rateNum: Math.round(profitPerHour),
    recommendation: (decision?.recommendation || 'review') as Recommendation,
    confidence: confidence?.score ?? 50,
    description: booking.description || '',
    price: Math.round(price),
    costs: Math.round(costs),
    costBreakdown: buildCostBreakdown(estimate),
    reasons: buildReasons(decision),
    photos: getPhotos(booking),
    opStatus: mapOpStatus(booking.status),
    billingStatus: mapBillingStatus(booking),
    preferredDate: booking.preferredDate || undefined,
    phone: booking.customerPhone || undefined,
    email: booking.customerEmail || undefined,
    address: booking.fullAddress || undefined,
    customerNotes: booking.internalNotes || undefined,
    companyName: booking.companyName || undefined,
    propertyName: booking.propertyName || undefined,
    unitLabel: booking.unitLabel || undefined,
    workOrderNumber: booking.workOrderNumber || undefined,
    serviceType: 'Junk Removal',
  };
}

export function useWorkItems() {
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const repo = await getRepo();
      const bookings = await repo.getBookings();
      const settings = getSettings();

      // Try to get goal context for decision engine
      let goalProgress = null;
      let goal = null;
      let dynamicTargets = null;
      try {
        goal = await repo.getActiveGoal('cash_profit');
        if (goal) {
          const { calculateGoalProgress, getTodayProgress, calculateDynamicTargets } = await import('../utils/goalEngine');
          const completed = await repo.getCompletedBookingsInRange(goal.start_date, goal.end_date);
          const scheduled = await repo.getActiveBookingsByStatus(['scheduled']);
          const pipeline = await repo.getActiveBookingsByStatus(['pending_review', 'quote_sent']);
          goalProgress = calculateGoalProgress(goal, completed, scheduled, pipeline);
          const todayStr = new Date().toISOString().slice(0, 10);
          const todayBookings = completed.filter((b: any) => b.completedAt?.slice(0, 10) === todayStr);
          const todayProgress = getTodayProgress(goal, todayBookings, goalProgress);
          dynamicTargets = calculateDynamicTargets(goalProgress, todayProgress, goal);
        }
      } catch {
        // Goal context is optional — proceed without it
      }

      const items: WorkItem[] = bookings.map((booking: any) => {
        try {
          const estimate = buildEstimate(booking, settings);
          const riskFlags = detectRiskFlags(booking, estimate);
          const confidence = calculateConfidence(booking, riskFlags);
          const jobRating = rateJob(estimate, confidence);
          const decision = evaluateDecision({
            estimate,
            confidence,
            jobRating,
            riskFlags,
            blockerOverrides: booking.blockerOverrides || {},
            goalProgress,
            goal,
            scheduleContext: null,
            dynamicTargets,
          });
          return normalizeBookingToWorkItem(booking, estimate, decision, confidence);
        } catch {
          // If estimation fails, return a basic work item without recommendation
          return normalizeBookingToWorkItem(booking, null, null, null);
        }
      });

      setWorkItems(items);
    } catch (err: any) {
      setError(err.message || 'Failed to load work items');
      setWorkItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { workItems, loading, error, refresh };
}
