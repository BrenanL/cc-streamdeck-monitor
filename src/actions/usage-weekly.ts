/**
 * Action: 7d Weekly Button
 * UUID: com.claude-code.usage-monitor.weekly
 *
 * Dedicated button for the 7-day all-models bucket with full pace breakdown:
 * shows current %, expected pace %, delta, and reset countdown.
 */
import { action, KeyDownEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import { addListener, fetchNow, removeListener } from "../shared/poller.js";
import { calcWeeklyPace, paceColor } from "../shared/pace.js";
import { encode, esc, extraBadge, svg, svgError, svgLoading } from "../shared/svg.js";
import type { Bucket, UsageData } from "../shared/poller.js";

interface Settings {
	pacePerDay?: number;
	paceYellow?: number;
	paceRed?: number;
}

function svgWeekly(data: UsageData, s: Settings): string {
	const sd = (data.seven_day ?? {}) as Partial<Bucket>;
	const pct = Math.round(sd.utilization ?? 0);
	const resetIn = esc(sd.resets_in || "?");

	const pace = calcWeeklyPace(sd, s.pacePerDay ?? 20);
	const color = paceColor(pace.delta, s.paceYellow ?? 5, s.paceRed ?? 15);

	const deltaSign = pace.delta > 0 ? "+" : "";
	const deltaText =
		pace.delta === 0
			? "on pace"
			: `${deltaSign}${pace.delta}% pace`;

	const deltaColor =
		pace.delta >= (s.paceRed ?? 15)
			? "#ff4444"
			: pace.delta >= (s.paceYellow ?? 5)
			? "#ffaa00"
			: "#33cc77";

	return svg(
		extraBadge(data.extra_usage) +
		`<text x="36" y="13" class="lbl">7d weekly</text>` +
		`<text x="36" y="35" text-anchor="middle" dominant-baseline="middle" ` +
		`fill="${color}" font-size="24" font-weight="bold" ` +
		`font-family="monospace,sans-serif">${pct}%</text>` +
		`<text x="36" y="48" class="dim">exp ${pace.expectedPct}%</text>` +
		`<text x="36" y="58" text-anchor="middle" fill="${deltaColor}" ` +
		`font-size="9" font-family="monospace,sans-serif">${esc(deltaText)}</text>` +
		`<text x="36" y="68" class="dim">&#x21BB; ${resetIn}</text>`,
	);
}

@action({ UUID: "com.claude-code.usage-monitor.weekly" })
export class UsageWeekly extends SingletonAction {
	private _update!: (data: UsageData) => void;
	private _settings: Settings = {};

	override onWillAppear(ev: WillAppearEvent): void {
		this._settings = (ev.payload.settings ?? {}) as Settings;
		this._update = (data: UsageData) => {
			void ev.action.setImage(
				encode(data.error ? svgError(data) : svgWeekly(data, this._settings)),
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
