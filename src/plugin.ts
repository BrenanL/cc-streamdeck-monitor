import streamDeck from "@elgato/streamdeck";
import { UsageDisplay } from "./actions/usage-display.js";
import { UsageStacked } from "./actions/usage-stacked.js";
import { UsageToggle } from "./actions/usage-toggle.js";
import { UsageSession } from "./actions/usage-session.js";
import { UsageWeekly } from "./actions/usage-weekly.js";
import { UsageSonnet } from "./actions/usage-sonnet.js";

streamDeck.logger.setLevel("trace");

streamDeck.actions.registerAction(new UsageDisplay());
streamDeck.actions.registerAction(new UsageStacked());
streamDeck.actions.registerAction(new UsageToggle());
streamDeck.actions.registerAction(new UsageSession());
streamDeck.actions.registerAction(new UsageWeekly());
streamDeck.actions.registerAction(new UsageSonnet());

streamDeck.connect();
