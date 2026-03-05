/**
 * Action: Stacked Bars
 * UUID: com.claude-code.usage-monitor.stacked
 *
 * Three horizontal progress bars — 5h, 7d, Sonnet — all equally prominent.
 * 7d bar is pace-colored; 5h and Sonnet use threshold coloring.
 */
import { action, KeyDownEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import { addListener, fetchNow, removeListener } from "../shared/poller.js";
import { calcWeeklyPace, paceColor, thresholdColor } from "../shared/pace.js";
import { encode, extraBadge, meterRow, svg, svgError, svgLoading } from "../shared/svg.js";
import type { Bucket, UsageData } from "../shared/poller.js";
import { hasSonnetData } from "../shared/poller.js";

interface Settings {
	sessionYellow?: number;
	sessionRed?: number;
	pacePerDay?: number;
	paceYellow?: number;
	paceRed?: number;
	sonnetYellow?: number;
	sonnetRed?: number;
}

function svgStacked(data: UsageData, s: Settings): string {
	const fh = (data.five_hour ?? {}) as Partial<Bucket>;
	const sd = (data.seven_day ?? {}) as Partial<Bucket>;
	const ss = (data.seven_day_sonnet ?? {}) as Partial<Bucket>;

	const sessionPct = Math.round(fh.utilization ?? 0);
	const weeklyPct  = Math.round(sd.utilization ?? 0);
	const sonnetPct  = Math.round(ss.utilization ?? 0);
	const resetIn    = (fh.resets_in || "?").replace(/&/g, "&amp;");

	const sessionColor = thresholdColor(sessionPct, s.sessionYellow ?? 60, s.sessionRed ?? 90);
	const pace = calcWeeklyPace(sd, s.pacePerDay ?? 20);
	const weeklyColor  = paceColor(pace.delta, s.paceYellow ?? 5, s.paceRed ?? 15);

	const showSonnet = hasSonnetData(data);

	if (showSonnet) {
		const sonnetColor = thresholdColor(sonnetPct, s.sonnetYellow ?? 60, s.sonnetRed ?? 90);
		return svg(
			extraBadge(data.extra_usage) +
			meterRow(14, "5h", sessionPct, sessionColor) +
			meterRow(30, "7d", weeklyPct, weeklyColor) +
			meterRow(46, " S", sonnetPct, sonnetColor) +
			`<line x1="8" y1="54" x2="64" y2="54" stroke="#1e1e1e" stroke-width="1"/>` +
			`<text x="36" y="64" class="dim">&#x21BA; ${resetIn}</text>`,
		);
	}

	return svg(
		extraBadge(data.extra_usage) +
		meterRow(22, "5h", sessionPct, sessionColor) +
		meterRow(42, "7d", weeklyPct, weeklyColor) +
		`<line x1="8" y1="52" x2="64" y2="52" stroke="#1e1e1e" stroke-width="1"/>` +
		`<text x="36" y="63" class="dim">&#x21BA; ${resetIn}</text>`,
	);
}

@action({ UUID: "com.claude-code.usage-monitor.stacked" })
export class UsageStacked extends SingletonAction {
	private _update!: (data: UsageData) => void;
	private _settings: Settings = {};

	override onWillAppear(ev: WillAppearEvent): void {
		this._settings = (ev.payload.settings ?? {}) as Settings;
		this._update = (data: UsageData) => {
			void ev.action.setImage(
				encode(data.error ? svgError(data) : svgStacked(data, this._settings)),
			);
		};
		void ev.action.setImage(encode(svgLoading()));
		addListener(this._update);
	}

	override onWillDisappear(_ev: WillDisappearEvent): void {
		removeListener(this._update);
	}

	override onKeyDown(_ev: KeyDownEvent): void {
		fetchNow();
	}
}
