/**
 * Action: 7d Sonnet Button
 * UUID: com.claude-code.usage-monitor.sonnet
 *
 * Dedicated button for the 7-day Sonnet-specific bucket.
 */
import { action, KeyDownEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import { addListener, fetchNow, removeListener } from "../shared/poller.js";
import { thresholdColor } from "../shared/pace.js";
import { encode, esc, extraBadge, svg, svgError, svgLoading } from "../shared/svg.js";
import type { Bucket, UsageData } from "../shared/poller.js";

interface Settings {
	sonnetYellow?: number;
	sonnetRed?: number;
}

function svgSonnet(data: UsageData, s: Settings): string {
	const ss = (data.seven_day_sonnet ?? {}) as Partial<Bucket>;
	const pct = Math.round(ss.utilization ?? 0);
	const resetIn = esc(ss.resets_in || "?");
	const color = thresholdColor(pct, s.sonnetYellow ?? 60, s.sonnetRed ?? 90);

	return svg(
		extraBadge(data.extra_usage) +
		`<text x="36" y="15" class="lbl">7d Sonnet</text>` +
		`<text x="36" y="42" text-anchor="middle" dominant-baseline="middle" ` +
		`fill="${color}" font-size="26" font-weight="bold" ` +
		`font-family="monospace,sans-serif">${pct}%</text>` +
		`<text x="36" y="58" class="dim">&#x21BB; ${resetIn}</text>`,
	);
}

@action({ UUID: "com.claude-code.usage-monitor.sonnet" })
export class UsageSonnet extends SingletonAction {
	private _update!: (data: UsageData) => void;
	private _settings: Settings = {};

	override onWillAppear(ev: WillAppearEvent): void {
		this._settings = (ev.payload.settings ?? {}) as Settings;
		this._update = (data: UsageData) => {
			void ev.action.setImage(
				encode(data.error ? svgError(data) : svgSonnet(data, this._settings)),
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
