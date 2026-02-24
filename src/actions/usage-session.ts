/**
 * Action: 5h Session Button
 * UUID: com.claude-code.usage-monitor.session
 *
 * Dedicated button for the 5-hour session bucket only.
 */
import { action, KeyDownEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import { addListener, fetchNow, removeListener } from "../shared/poller.js";
import { thresholdColor } from "../shared/pace.js";
import { encode, esc, extraBadge, svg, svgError, svgLoading } from "../shared/svg.js";
import type { Bucket, UsageData } from "../shared/poller.js";

interface Settings {
	sessionYellow?: number;
	sessionRed?: number;
}

function svgSession(data: UsageData, s: Settings): string {
	const fh = (data.five_hour ?? {}) as Partial<Bucket>;
	const pct = Math.round(fh.utilization ?? 0);
	const resetIn = esc(fh.resets_in || "?");
	const color = thresholdColor(pct, s.sessionYellow ?? 60, s.sessionRed ?? 90);

	return svg(
		extraBadge(data.extra_usage) +
		`<text x="36" y="15" class="lbl">5h session</text>` +
		`<text x="36" y="42" text-anchor="middle" dominant-baseline="middle" ` +
		`fill="${color}" font-size="26" font-weight="bold" ` +
		`font-family="monospace,sans-serif">${pct}%</text>` +
		`<text x="36" y="58" class="dim">&#x21BA; ${resetIn}</text>`,
	);
}

@action({ UUID: "com.claude-code.usage-monitor.session" })
export class UsageSession extends SingletonAction {
	private _update!: (data: UsageData) => void;
	private _settings: Settings = {};

	override onWillAppear(ev: WillAppearEvent): void {
		this._settings = (ev.payload.settings ?? {}) as Settings;
		this._update = (data: UsageData) => {
			void ev.action.setImage(
				encode(data.error ? svgError(data) : svgSession(data, this._settings)),
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
