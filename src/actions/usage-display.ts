/**
 * Action: Usage Display (enhanced original)
 * UUID: com.claude-code.usage-monitor.display
 *
 * Two-zone layout showing 5h session prominently and 7d/Sonnet in footer.
 * 7d percentage is now pace-colored (over/under expected working-days pace).
 * Extra usage shown as small badge when active.
 */
import { action, KeyDownEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import { addListener, fetchNow, removeListener } from "../shared/poller.js";
import { calcWeeklyPace, paceColor, thresholdColor } from "../shared/pace.js";
import { encode, esc, extraBadge, svg, svgError, svgLoading } from "../shared/svg.js";
import type { Bucket, UsageData } from "../shared/poller.js";
import { hasSonnetData } from "../shared/poller.js";

// ── Settings ──────────────────────────────────────────────────────────────────

interface Settings {
	sessionYellow?: number;
	sessionRed?: number;
	pacePerDay?: number;
	paceYellow?: number;
	paceRed?: number;
	sonnetYellow?: number;
	sonnetRed?: number;
}

// ── SVG rendering ─────────────────────────────────────────────────────────────

function svgDisplay(data: UsageData, s: Settings): string {
	const fh = (data.five_hour ?? {}) as Partial<Bucket>;
	const sd = (data.seven_day ?? {}) as Partial<Bucket>;
	const ss = (data.seven_day_sonnet ?? {}) as Partial<Bucket>;

	const sessionPct = Math.round(fh.utilization ?? 0);
	const weeklyPct  = Math.round(sd.utilization ?? 0);
	const sonnetPct  = Math.round(ss.utilization ?? 0);
	const resetIn    = esc(fh.resets_in || "?");

	const sessionColor = thresholdColor(
		sessionPct,
		s.sessionYellow ?? 60,
		s.sessionRed    ?? 90,
	);

	const pace       = calcWeeklyPace(sd, s.pacePerDay ?? 20);
	const weeklyColor = paceColor(pace.delta, s.paceYellow ?? 5, s.paceRed ?? 15);

	const showSonnet = hasSonnetData(data);
	const sonnetColor = showSonnet
		? thresholdColor(sonnetPct, s.sonnetYellow ?? 60, s.sonnetRed ?? 90)
		: "";

	const footer = showSonnet
		? `<text x="10" y="66" text-anchor="start" fill="${weeklyColor}" ` +
		  `font-size="9" font-family="monospace,sans-serif">7d ${weeklyPct}%</text>` +
		  `<text x="62" y="66" text-anchor="end" fill="${sonnetColor}" ` +
		  `font-size="9" font-family="monospace,sans-serif">&#x25C6;${sonnetPct}%</text>`
		: `<text x="36" y="66" text-anchor="middle" fill="${weeklyColor}" ` +
		  `font-size="9" font-family="monospace,sans-serif">7d ${weeklyPct}%</text>`;

	return svg(
		extraBadge(data.extra_usage) +
		`<text x="36" y="13" class="lbl">5h session</text>` +
		`<text x="36" y="38" text-anchor="middle" dominant-baseline="middle" ` +
		`fill="${sessionColor}" font-size="26" font-weight="bold" ` +
		`font-family="monospace,sans-serif">${sessionPct}%</text>` +
		`<text x="36" y="50" class="dim">&#x21BA; ${resetIn}</text>` +
		`<line x1="12" y1="55" x2="60" y2="55" stroke="#2a2a2a" stroke-width="1"/>` +
		footer,
	);
}

// ── Action class ──────────────────────────────────────────────────────────────

@action({ UUID: "com.claude-code.usage-monitor.display" })
export class UsageDisplay extends SingletonAction {
	private _update!: (data: UsageData) => void;
	private _settings: Settings = {};

	override onWillAppear(ev: WillAppearEvent): void {
		this._settings = (ev.payload.settings ?? {}) as Settings;

		this._update = (data: UsageData) => {
			void ev.action.setImage(
				encode(data.error ? svgError(data) : svgDisplay(data, this._settings)),
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
