/**
 * 7-day workday-weighted pace calculation.
 *
 * The 7-day window is rolling (not calendar-aligned). We walk each calendar day
 * from the window start to now in local time, counting only weekday fractions,
 * then compare against the expected pace.
 */
import type { Bucket } from "./poller.js";

export interface PaceResult {
	expectedPct: number; // what % we'd expect at this point (0–100)
	delta: number;       // actual − expected (positive = over pace)
}

/**
 * Calculate expected pace and delta for a 7-day bucket.
 * @param bucket  The seven_day or seven_day_sonnet bucket.
 * @param pacePerDay  Expected % per working day (default 20 → 5 days × 20% = 100%).
 */
export function calcWeeklyPace(bucket: Partial<Bucket>, pacePerDay: number = 20): PaceResult {
	if (!bucket.resets_at) return { expectedPct: 0, delta: 0 };

	const resetsAt = new Date(bucket.resets_at);
	const windowStart = new Date(resetsAt.getTime() - 7 * 24 * 60 * 60 * 1000);
	const now = new Date();

	// Walk each calendar day, accumulating workday fractions in local time
	let workdayFraction = 0;
	const cursor = new Date(windowStart);

	while (cursor < now) {
		const dayOfWeek = cursor.getDay(); // 0 = Sunday, 6 = Saturday (local time)
		const nextDay = new Date(cursor);
		nextDay.setDate(nextDay.getDate() + 1);

		if (dayOfWeek !== 0 && dayOfWeek !== 6) {
			// Weekday: count full day or partial last day
			if (nextDay <= now) {
				workdayFraction += 1;
			} else {
				workdayFraction += (now.getTime() - cursor.getTime()) / (24 * 60 * 60 * 1000);
			}
		}
		cursor.setDate(cursor.getDate() + 1);
	}

	const expectedPct = Math.min(workdayFraction * pacePerDay, 100);
	const delta = (bucket.utilization ?? 0) - expectedPct;

	return {
		expectedPct: Math.round(expectedPct),
		delta: Math.round(delta),
	};
}

/**
 * Color based on how far over/under expected pace the actual usage is.
 */
export function paceColor(delta: number, paceYellow: number = 5, paceRed: number = 15): string {
	if (delta >= paceRed) return "#ff4444";
	if (delta >= paceYellow) return "#ffaa00";
	return "#33cc77";
}

/**
 * Color based on simple threshold (for session and Sonnet buckets).
 */
export function thresholdColor(pct: number, yellow: number, red: number): string {
	if (pct >= red) return "#ff4444";
	if (pct >= yellow) return "#ffaa00";
	return "#33cc77";
}
