import type React from 'react';
import type { BotTypesEnum } from '@/types';
import type { DrawerBot } from '@/types/bots/drawer';

// Bot drawer tabs — lets a host build add tabs to `BotDetailsDrawer` after
// the built-in ones. A registered tab deep-links like the built-in tabs
// (`?tab=<key>`). Unregistered (the default) ⇒ the drawer is unchanged.

export interface BotDrawerTabContext {
  bot: DrawerBot;
  botType: BotTypesEnum;
  /** Share-link visitor or non-owner. */
  viewOnly: boolean;
  isHedge: boolean;
  /** Whether this tab is the one currently shown. */
  active: boolean;
}

export interface BotDrawerTab {
  /** Also the `?tab=` value. Must not clash with a built-in tab. */
  key: string;
  label: React.ReactNode;
  /** Sort order among registered tabs (ascending). Default 0. */
  order?: number;
  /** Plain function (not a hook). Default: visible. */
  isVisible?: (ctx: Omit<BotDrawerTabContext, 'active'>) => boolean;
  /**
   * The tab fills the drawer body's height and scrolls its own content:
   * while it is shown, the body does not scroll and drops its mobile
   * bottom spacer. Default: the body scrolls the tab like a built-in one.
   */
  fillHeight?: boolean;
  render: (ctx: BotDrawerTabContext) => React.ReactNode;
}

const tabs: BotDrawerTab[] = [];

/** Register (or replace, by `key`) a drawer tab. Call at boot. */
export function registerBotDrawerTab(tab: BotDrawerTab): void {
  const index = tabs.findIndex((t) => t.key === tab.key);
  if (index >= 0) tabs[index] = tab;
  else tabs.push(tab);
  tabs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** Registered tabs visible for this drawer context, in order. */
export function getBotDrawerTabs(
  ctx: Omit<BotDrawerTabContext, 'active'>
): BotDrawerTab[] {
  return tabs.filter((tab) => (tab.isVisible ? tab.isVisible(ctx) : true));
}
