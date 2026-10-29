import type { BotTypeConfig, BotTypeModule } from './types';
import { dcaModule } from '../modules/dcaModule';
import { comboModule } from '../modules/comboModule';
import { gridModule } from '../modules/gridModule';
/* import {
  hedgeModule,
  hedgeDcaModule,
  hedgeComboModule,
} from '../modules/hedgeModule'; */

const STATIC_MODULES: BotTypeModule[] = [
  dcaModule,
  comboModule,
  gridModule,
  /*   hedgeModule,
  hedgeDcaModule,
  hedgeComboModule, */
];

const moduleRegistry = new Map<string, BotTypeModule>();
const configRegistry = new Map<string, BotTypeConfig>();
const legacyLookup = new Map<string, BotTypeConfig>();

for (const module of STATIC_MODULES) {
  moduleRegistry.set(module.id, module);
  configRegistry.set(module.config.id, module.config);
  const legacyIds = module.config.legacyIds ?? [];
  for (const legacyId of legacyIds) {
    legacyLookup.set(legacyId, module.config);
  }
}

let defaultBotTypeId: string = dcaModule.id;

const isDevelopment =
  typeof import.meta !== 'undefined'
    ? Boolean(import.meta.env.DEV)
    : (process.env?.['NODE_ENV'] ?? 'development') !== 'production';

function getEmergencyFallbackBotType(): BotTypeConfig {
  const fallback = configRegistry.get(defaultBotTypeId);
  if (fallback) {
    return fallback;
  }

  const firstEntry = STATIC_MODULES[0]?.config;
  if (firstEntry) {
    return firstEntry;
  }

  throw new Error('[BotTypeRegistry] No bot types available.');
}

export function registerBotType(
  config: BotTypeConfig,
  options?: { setAsDefault?: boolean }
) {
  if (!isDevelopment) {
    console.warn(
      '[BotTypeRegistry] registerBotType is deprecated in production and will be ignored.'
    );
    return;
  }

  configRegistry.set(config.id, config);
  if (options?.setAsDefault) {
    defaultBotTypeId = config.id;
  }
}

export function registerBotModule(
  module: BotTypeModule,
  options?: { setAsDefault?: boolean }
) {
  if (!isDevelopment) {
    console.warn(
      '[BotTypeRegistry] registerBotModule is deprecated in production and will be ignored.'
    );
    return;
  }

  moduleRegistry.set(module.id, module);
  configRegistry.set(module.config.id, module.config);
  if (module.config.legacyIds) {
    for (const legacyId of module.config.legacyIds) {
      legacyLookup.set(legacyId, module.config);
    }
  }

  if (options?.setAsDefault) {
    defaultBotTypeId = module.id;
  }
}

export function resolveBotType(id?: string): BotTypeConfig {
  if (id) {
    const direct = configRegistry.get(id);
    if (direct) {
      return direct;
    }

    const legacy = legacyLookup.get(id);
    if (legacy) {
      return legacy;
    }

    console.warn(
      `[BotTypeRegistry] Unknown bot type '${id}'. Falling back to default bot type.`
    );
  }

  const fallback = configRegistry.get(defaultBotTypeId);
  if (fallback) {
    return fallback;
  }

  return getEmergencyFallbackBotType();
}

export function listBotTypes(): BotTypeConfig[] {
  return Array.from(configRegistry.values());
}

export function resolveBotModule(id?: string): BotTypeModule | undefined {
  if (id) {
    const direct = moduleRegistry.get(id);
    if (direct) {
      return direct;
    }

    const config = configRegistry.get(id) ?? legacyLookup.get(id);
    if (config) {
      return moduleRegistry.get(config.id);
    }
  }

  return (
    moduleRegistry.get(defaultBotTypeId) ?? moduleRegistry.get(dcaModule.id)
  );
}

export function setDefaultBotTypeId(id: string) {
  if (!configRegistry.has(id)) {
    throw new Error(
      `[BotTypeRegistry] Cannot set default bot type to '${id}' because it is not registered.`
    );
  }
  defaultBotTypeId = id;
}

export function getDefaultBotTypeId(): string | null {
  return defaultBotTypeId ?? null;
}

export function clearBotTypeRegistry() {
  if (!isDevelopment) {
    console.warn(
      '[BotTypeRegistry] clearBotTypeRegistry is ignored in production.'
    );
    return;
  }

  moduleRegistry.clear();
  configRegistry.clear();
  legacyLookup.clear();
  defaultBotTypeId = dcaModule.id;
}

export async function ensureBotRegistryBootstrapped(): Promise<void> {
  // No-op: modules are eagerly registered via static catalog.
}

export type {
  BotTypeConfig,
  BotWidgetLayoutBreakpoint,
  BotWidgetLayoutPreset,
  BotWidgetLayoutMap,
  BotWidgetComponent,
  BotActionDescriptor,
  BotTypeFactories,
  BotWidgetRegistry,
  BotTypeModule,
  BotTypeFormContract,
  BotTypeModuleAdapters,
  BotTypeModuleMetadata,
} from './types';
