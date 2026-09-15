import { useEffect, useMemo, useState } from 'react';
import { getRepo } from '../utils/repository';
import {
  calculateGoalProgress,
  getTodayProgress,
  getWeekProgress,
  calculateDynamicTargets,
} from '../utils/goalEngine';
import { evaluateDecision } from '../utils/decisionEngine';
import { buildCommercialEstimate, commercialJobToBookingShape } from '../utils/commercialEstimateBuilder';
import { detectRiskFlags, calculateConfidence, checkPriceFlags } from '../utils/riskFlags';
import { rateJob } from '../utils/jobRating';
import { getSettings } from '../utils/storage';

function getWeekDateRange() {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  };
}

export function useCommercialQuoteAnalysis(job) {
  const [travelMinutes, setTravelMinutes] = useState(job?.travelMinutes ?? null);
  const [distanceMiles, setDistanceMiles] = useState(job?.distanceMiles ?? null);
  const [goal, setGoal] = useState(null);
  const [goalProgress, setGoalProgress] = useState(null);
  const [weekProgress, setWeekProgress] = useState(null);
  const [dynamicTargets, setDynamicTargets] = useState(null);
  const [scheduleCtx, setScheduleCtx] = useState(null);
  const [blockerOverrides, setBlockerOverrides] = useState({});

  const settings = getSettings();

  const jobWithTravel = useMemo(
    () => (job ? { ...job, travelMinutes, distanceMiles } : null),
    [job, travelMinutes, distanceMiles],
  );

  const bookingShape = useMemo(
    () => (jobWithTravel ? commercialJobToBookingShape(jobWithTravel) : null),
    [jobWithTravel],
  );

  const estimate = useMemo(
    () => (jobWithTravel ? buildCommercialEstimate(jobWithTravel, settings) : null),
    [jobWithTravel, settings],
  );

  const riskFlags = useMemo(
    () => (bookingShape && estimate ? detectRiskFlags(bookingShape, estimate) : []),
    [bookingShape, estimate],
  );

  const confidence = useMemo(
    () => (bookingShape ? calculateConfidence(bookingShape, riskFlags) : null),
    [bookingShape, riskFlags],
  );

  const rating = useMemo(
    () => (estimate && confidence ? rateJob(estimate, confidence) : null),
    [estimate, confidence],
  );

  const decision = useMemo(() => {
    if (!estimate || !confidence || !rating) return null;
    return evaluateDecision({
      estimate,
      confidence,
      jobRating: rating,
      riskFlags,
      blockerOverrides,
      goalProgress,
      goal,
      scheduleContext: scheduleCtx,
      dynamicTargets,
    });
  }, [
    estimate,
    confidence,
    rating,
    riskFlags,
    blockerOverrides,
    goalProgress,
    goal,
    scheduleCtx,
    dynamicTargets,
  ]);

  useEffect(() => {
    if (!job?.property?.address || travelMinutes != null) return;

    (async () => {
      const settings = getSettings();
      const shopAddress = settings.homeBaseAddress?.trim();
      const jobAddress = job.property.address;

      if (shopAddress) {
        try {
          const { calculateDistance } = await import('../utils/distance');
          const result = await calculateDistance(shopAddress, jobAddress);
          if (result.success) {
            setDistanceMiles(result.miles);
            setTravelMinutes(
              result.durationMinutes ?? Math.max(5, Math.round((result.miles / 30) * 60)),
            );
            return;
          }
        } catch {
          // Fall through to server geocode
        }
      }

      try {
        const res = await fetch('/api/geocode-address', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: jobAddress,
            shopAddress: shopAddress || undefined,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.travelMinutes != null) {
            setTravelMinutes(data.travelMinutes);
            if (data.distanceMiles != null) setDistanceMiles(data.distanceMiles);
          }
        }
      } catch {
        // Non-fatal - estimate uses default travel time
      }
    })();
  }, [job?.property?.address, job?.id, travelMinutes]);

  useEffect(() => {
    (async () => {
      try {
        const repo = await getRepo();
        const activeGoal = await repo.getActiveGoal('cash_profit');
        if (!activeGoal) return;

        setGoal(activeGoal);

        const [completed, scheduled, pipeline] = await Promise.all([
          repo.getCompletedBookingsInRange(activeGoal.start_date, activeGoal.end_date),
          repo.getActiveBookingsByStatus(['scheduled']),
          repo.getActiveBookingsByStatus(['pending_review', 'quote_sent']),
        ]);

        const prog = calculateGoalProgress(activeGoal, completed, scheduled, pipeline);
        setGoalProgress(prog);

        const weekRange = getWeekDateRange();
        const weekBookings = [...completed, ...scheduled].filter((b) => {
          const d = b.completed_at?.slice(0, 10) || b.preferred_date?.slice(0, 10);
          return d && d >= weekRange.start && d <= weekRange.end;
        });
        setWeekProgress(getWeekProgress(activeGoal, weekBookings, prog));

        const todayStr = new Date().toISOString().slice(0, 10);
        const todayBookings = [...completed, ...scheduled].filter((b) => {
          if (b.status === 'completed' && b.completed_at) {
            return b.completed_at.slice(0, 10) === todayStr;
          }
          return false;
        });

        let scheduledToday = [];
        try {
          const todaySlots = await repo.getScheduledBookingsForDateRange(todayStr, todayStr);
          scheduledToday = todaySlots.filter((s) => s.bookings).map((s) => ({
            ...s.bookings,
            status: 'scheduled',
          }));
        } catch {
          // slot_reservations may not exist
        }

        const allToday = [...todayBookings, ...scheduledToday];
        const todayProg = getTodayProgress(activeGoal, allToday, prog);
        setDynamicTargets(calculateDynamicTargets(prog, todayProg, activeGoal));
        setScheduleCtx({
          jobsToday: todayProg.capacityBooked,
          capacityLimit: todayProg.capacityLimit,
        });
      } catch {
        // goal tables may not exist yet
      }
    })();
  }, []);

  function getPriceFlags(quotePrice) {
    if (!quotePrice || !estimate) return [];
    return checkPriceFlags(Number(quotePrice), estimate, settings);
  }

  return {
    settings,
    bookingShape,
    estimate,
    riskFlags,
    confidence,
    rating,
    decision,
    goal,
    goalProgress,
    weekProgress,
    dynamicTargets,
    blockerOverrides,
    setBlockerOverrides,
    getPriceFlags,
    travelMinutes,
  };
}
