/**
 * Action: Toggle View
 * UUID: com.claude-code.usage-monitor.toggle
 *
 * Cycles through three full-button views (5h → 7d → Sonnet) on each press.
 * Page indicator dots at the top show the active view.
 */
import { action, KeyDownEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import { addListener, fetchNow, removeListener } from "../shared/poller.js";
import { calcWeeklyPace, paceColor, thresholdColor } from "../shared/pace.js";
import { encode, esc, extraBadge, pageDots, svg, svgError, svgLoading } from "../shared/svg.js";
import type { Bucket, UsageData } from "../shared/poller.js";

interface Settings {
	sessionYellow?: number;
	sessionRed?: number;
	pacePerDay?: number;
	paceYellow?: number;
	paceRed?: number;
	sonnetYellow?: number;
	sonnetRed?: number;
}

// ── Per-view SVG builders ─────────────────────────────────────────────────────

function svgToggle5h(data: UsageData, s: Settings): string {
	const fh = (data.five_hour ?? {}) as Partial<Bucket>;
	const pct = Math.round(fh.utilization ?? 0);
	const resetIn = esc(fh.resets_in || "?");
	const color = thresholdColor(pct, s.sessionYellow ?? 60, s.sessionRed ?? 90);

	return svg(
		extraBadge(data.extra_usage) +
		pageDots(0) +
		`<text x="56" y="12" text-anchor="end" fill="#444" font-size="8" ` +
		`font-family="sans-serif">5h</text>` +
		`<text x="36" y="39" text-anchor="middle" dominant-baseline="middle" ` +
		`fill="${color}" font-size="26" font-weight="bold" ` +
		`font-family="monospace,sans-serif">${pct}%</text>` +
		`<text x="36" y="56" class="dim">&#x21BA; ${resetIn}</text>`,
	);
}

function svgToggle7d(data: UsageData, s: Settings): string {
	const sd = (data.seven_day ?? {}) as Partial<Bucket>;
	const pct = Math.round(sd.utilization ?? 0);
	const resetIn = esc(sd.resets_in || "?");

	const pace = calcWeeklyPace(sd, s.pacePerDay ?? 20);
	const color = paceColor(pace.delta, s.paceYellow ?? 5, s.paceRed ?? 15);
	const deltaSign = pace.delta >= 0 ? "+" : "";
	const deltaLabel = pace.delta !== 0
		? `${deltaSign}${pace.delta}% vs ${pace.expectedPct}% exp`
		: `on pace (${pace.expectedPct}% exp)`;

	return svg(
		extraBadge(data.extra_usage) +
		pageDots(1) +
		`<text x="56" y="12" text-anchor="end" fill="#444" font-size="8" ` +
		`font-family="sans-serif">7d</text>` +
		`<text x="36" y="36" text-anchor="middle" dominant-baseline="middle" ` +
		`fill="${color}" font-size="24" font-weight="bold" ` +
		`font-family="monospace,sans-serif">${pct}%</text>` +
		`<text x="36" y="51" class="dim">${esc(deltaLabel)}</text>` +
		`<text x="36" y="63" class="dim">&#x21BB; ${resetIn}</text>`,
	);
}

function svgToggleSonnet(data: UsageData, s: Settings): string {
	const ss = (data.seven_day_sonnet ?? {}) as Partial<Bucket>;
	const pct = Math.round(ss.utilization ?? 0);
	const resetIn = esc(ss.resets_in || "?");
	const color = thresholdColor(pct, s.sonnetYellow ?? 60, s.sonnetRed ?? 90);

	return svg(
		extraBadge(data.extra_usage) +
		pageDots(2) +
		`<text x="56" y="12" text-anchor="end" fill="#444" font-size="8" ` +
		`font-family="sans-serif">S</text>` +
		`<text x="36" y="39" text-anchor="middle" dominant-baseline="middle" ` +
		`fill="${color}" font-size="26" font-weight="bold" ` +
		`font-family="monospace,sans-serif">${pct}%</text>` +
		`<text x="36" y="56" class="dim">&#x21BB; ${resetIn}</text>`,
	);
}

// ── Action class ──────────────────────────────────────────────────────────────

@action({ UUID: "com.claude-code.usage-monitor.toggle" })
export class UsageToggle extends SingletonAction {
	private _update!: (data: UsageData) => void;
	private _settings: Settings = {};
	private _view = 0; // 0=5h, 1=7d, 2=Sonnet
	private _lastData: UsageData | null = null;

	private renderCurrent(): string {
		const data = this._lastData;
		if (!data) return svgLoading();
		if (data.error) return svgError(data);
		if (this._view === 1) return svgToggle7d(data, this._settings);
		if (this._view === 2) return svgToggleSonnet(data, this._settings);
		return svgToggle5h(data, this._settings);
	}

	override onWillAppear(ev: WillAppearEvent): void {
		this._settings = (ev.payload.settings ?? {}) as Settings;
		this._update = (data: UsageData) => {
			this._lastData = data;
			void ev.action.setImage(encode(this.renderCurrent()));
		};
		void ev.action.setImage(encode(svgLoading()));
		addListener(this._update);
	}

	override onWillDisappear(_ev: WillDisappearEvent): void {
		removeListener(this._update);
	}

	override onKeyDown(ev: KeyDownEvent): void {
		this._view = (this._view + 1) % 3;
		void ev.action.setImage(encode(this.renderCurrent()));
		// Also refresh data
		fetchNow();
	}
}
