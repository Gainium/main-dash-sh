/* eslint-disable react-refresh/only-export-components */
import React, { useContext, useMemo } from 'react';
import {
  useOptionalBotFormBinding,
  useOptionalBotFormContext,
  useOptionalBotFormTopLevelSelector,
  type BotFormMode,
} from '@/contexts/bots/form/BotFormProvider';
import { BotFormQueryContext } from '@/features/bots/widgets/BotForm/providers/BotFormQueryProvider';
import useBotVarBinding, {
  type VarBindingPath,
} from '@/hooks/bots/global-variables/useBotVarBinding';
import { cn } from '@/lib/utils';

// Bot field extensions — lets a host build attach a component to an
// individual bot-form setting (rendered next to where the global-variable
// binding renders) and, optionally, take ownership of that setting.
//
//   registerBotFieldExtension({
//     key: 'my-extension',
//     match: ['tpPerc', 'slPerc'],
//     Component: MyChip,
//     useFieldState: (ctx) => ({ active: true, readOnly: false }),
//   });
//
// Unregistered (the default) ⇒ every mount point renders nothing and every
// field behaves exactly as before.

/** Shape of the setting a mount point represents. `section` is a whole form
 *  section (path `section:<sectionId>`), not a single field. */
export type BotFieldKind = 'number' | 'boolean' | 'enum' | 'section';

export interface BotFieldExtensionContext {
  /** Setting path, e.g. `tpPerc`, or `section:<sectionId>` for a section. */
  path: string;
  kind: BotFieldKind;
  /** Saved bot id — undefined while creating a bot. */
  botId?: string | undefined;
  /** Bot type from the form data (`dca`, `combo`, …). */
  botType?: string | undefined;
  mode: BotFormMode;
  /** The field is currently bound to a global variable. */
  isVariableBound: boolean;
  /** The whole form is read-only (e.g. the drawer's settings view). */
  readOnlyForm: boolean;
  /** The form is one leg of a hedge bot. */
  isNestedLeg: boolean;
}

export interface BotFieldExtensionState {
  /** The extension owns the field: the global-variable binding control is
   *  hidden so the two cannot both drive the same setting. */
  active: boolean;
  /** The field's own inputs are disabled while the extension owns it. */
  readOnly: boolean;
  /**
   * Extra classes for the mount point's container while the extension
   * reports it (section headers apply them to the whole header).
   */
  className?: string | undefined;
}

export interface BotFieldExtension {
  key: string;
  match: string | readonly string[] | RegExp | ((path: string) => boolean);
  /** Rendered at the field's mount point (beside the field). */
  Component: React.ComponentType<BotFieldExtensionContext>;
  /**
   * Optional block rendered directly under the field (or at the top of a
   * section's body for `section:<id>` paths and section toggles).
   */
  Panel?: React.ComponentType<BotFieldExtensionContext>;
  /**
   * Hook reporting whether the extension owns the field. Called on every
   * render of every mount point that matches, so it must obey the rules of
   * hooks (it is registered once at boot, so its call order is stable).
   */
  useFieldState?: (ctx: BotFieldExtensionContext) => BotFieldExtensionState;
}

const extensions: BotFieldExtension[] = [];

/** Register (or replace, by `key`) a bot field extension. Call at boot. */
export function registerBotFieldExtension(extension: BotFieldExtension): void {
  const index = extensions.findIndex((e) => e.key === extension.key);
  if (index >= 0) extensions[index] = extension;
  else extensions.push(extension);
}

export function hasBotFieldExtensions(): boolean {
  return extensions.length > 0;
}

function matches(extension: BotFieldExtension, path: string): boolean {
  const { match } = extension;
  if (typeof match === 'string') return match === path;
  if (typeof match === 'function') return match(path);
  if (match instanceof RegExp) return match.test(path);
  return match.includes(path);
}

const INACTIVE: BotFieldExtensionState = { active: false, readOnly: false };
const noopState = (): BotFieldExtensionState => INACTIVE;

/**
 * Builds the context for `path`, or `null` where extensions never apply
 * (outside a bot form, deal editors, terminal deals).
 */
export function useBotFieldExtensionContext(
  path: string,
  kind: BotFieldKind = 'section'
): BotFieldExtensionContext | null {
  return useExtensionContext(path, kind);
}

function useExtensionContext(
  path: string,
  kind: BotFieldKind
): BotFieldExtensionContext | null {
  const binding = useOptionalBotFormBinding();
  const isNestedLeg = useOptionalBotFormContext()?.isNestedLeg ?? false;
  const terminal = useOptionalBotFormTopLevelSelector('terminal');
  const botType = useOptionalBotFormTopLevelSelector('type');
  const query = useContext(BotFormQueryContext);
  const { isBound } = useBotVarBinding(path as VarBindingPath);
  const mode = binding?.mode;
  const botId = query?.botId;

  return useMemo(() => {
    if (!mode) return null;
    if (mode === 'deal-edit' || mode === 'deal-mass-edit') return null;
    if (terminal) return null;
    return {
      path,
      kind,
      botId,
      botType: botType ? String(botType) : undefined,
      mode,
      isVariableBound: isBound,
      readOnlyForm: mode === 'settings-readonly',
      isNestedLeg,
    };
  }, [mode, terminal, path, kind, botId, botType, isBound, isNestedLeg]);
}

interface ResolvedExtensions {
  context: BotFieldExtensionContext | null;
  matched: BotFieldExtension[];
  state: BotFieldExtensionState;
}

/**
 * Every registered extension's hook runs on every render (matched or not,
 * with or without a form context) so the hook order never changes.
 */
function useResolvedExtensions(
  path: string,
  kind: BotFieldKind
): ResolvedExtensions {
  const context = useExtensionContext(path, kind);
  const states = extensions.map((extension) => {
    const useState = extension.useFieldState ?? noopState;
    // Registered once at boot — stable order, so this is a fixed hook list.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useState(
      context ?? {
        path,
        kind,
        mode: 'create',
        isVariableBound: false,
        readOnlyForm: false,
        isNestedLeg: false,
      }
    );
  });

  const matched = context
    ? extensions.filter((extension) => matches(extension, path))
    : [];
  let active = false;
  let readOnly = false;
  const classNames: string[] = [];
  if (context) {
    extensions.forEach((extension, i) => {
      if (!matches(extension, path)) return;
      active = active || states[i].active;
      readOnly = readOnly || states[i].readOnly;
      const extra = states[i].className;
      if (extra) classNames.push(extra);
    });
  }
  return {
    context,
    matched,
    state: {
      active,
      readOnly,
      className: classNames.length ? classNames.join(' ') : undefined,
    },
  };
}

/** Merged state of every extension that matches `path`. */
export function useBotFieldExtensionState(
  path: string,
  kind: BotFieldKind = 'number'
): BotFieldExtensionState {
  return useResolvedExtensions(path, kind).state;
}

interface BotFieldExtensionSlotProps {
  path: string;
  kind?: BotFieldKind;
  className?: string;
}

/** Renders every matching extension's component for `path`. */
export const BotFieldExtensionSlot: React.FC<BotFieldExtensionSlotProps> = ({
  path,
  kind = 'number',
  className,
}) => {
  const { context, matched } = useResolvedExtensions(path, kind);
  if (!context || matched.length === 0) return null;
  return (
    <span
      className={cn('inline-flex items-center gap-xs', className)}
      data-field-extension={path}
    >
      {matched.map(({ key, Component }) => (
        <Component key={key} {...context} />
      ))}
    </span>
  );
};

interface BotFieldManagedFieldsetProps {
  path: string;
  kind?: BotFieldKind;
  className?: string;
  children: React.ReactNode;
}

/**
 * Wraps a field's own inputs and disables them (natively, via a disabled
 * fieldset) while an extension reports the field as read-only.
 */
export const BotFieldManagedFieldset: React.FC<
  BotFieldManagedFieldsetProps
> = ({ path, kind = 'number', className, children }) => {
  const { readOnly } = useBotFieldExtensionState(path, kind);
  if (!readOnly) return <>{children}</>;
  return (
    <fieldset
      disabled
      className={cn('m-0 min-w-0 border-0 p-0 opacity-70', className)}
      data-field-managed={path}
    >
      {children}
    </fieldset>
  );
};

interface BotFieldExtensionControlProps {
  path: string;
  kind?: BotFieldKind;
  children: React.ReactNode;
}

/**
 * For a compact control (a switch in a row's header): the extension slot
 * followed by the control, disabled while an extension owns it.
 */
export const BotFieldExtensionControl: React.FC<
  BotFieldExtensionControlProps
> = ({ path, kind = 'boolean', children }) => (
  <span className="inline-flex items-center gap-sm">
    <BotFieldExtensionSlot path={path} kind={kind} />
    <BotFieldManagedFieldset path={path} kind={kind} className="inline-flex">
      {children}
    </BotFieldManagedFieldset>
  </span>
);

interface BotFieldExtensionPanelProps {
  path: string;
  kind?: BotFieldKind;
  className?: string;
}

/** Renders every matching extension's `Panel` for `path` (under the field). */
export const BotFieldExtensionPanel: React.FC<BotFieldExtensionPanelProps> = ({
  path,
  kind = 'number',
  className,
}) => {
  const { context, matched } = useResolvedExtensions(path, kind);
  if (!context) return null;
  const panels = matched.filter((e) => e.Panel);
  if (panels.length === 0) return null;
  return (
    <div className={cn('min-w-0', className)} data-field-extension-panel={path}>
      {panels.map(({ key, Panel }) =>
        Panel ? <Panel key={key} {...context} /> : null
      )}
    </div>
  );
};

interface BotFormSectionPanelsProps {
  sectionId: string;
  /** The section's on/off field, when it has one (`useSl`, …). */
  toggleField?: string | undefined;
  className?: string;
}

/**
 * Panels for a form section: the section's own (`section:<id>`) and its
 * toggle field's. Rendered at the top of the section body.
 */
export const BotFormSectionPanels: React.FC<BotFormSectionPanelsProps> = ({
  sectionId,
  toggleField,
  className,
}) => {
  if (!hasBotFieldExtensions()) return null;
  return (
    <>
      <BotFieldExtensionPanel
        path={`section:${sectionId}`}
        kind="section"
        {...(className ? { className } : {})}
      />
      {toggleField ? (
        <BotFieldExtensionPanel
          path={toggleField}
          kind="boolean"
          {...(className ? { className } : {})}
        />
      ) : null}
    </>
  );
};

interface BotFormSectionHeaderFrameProps {
  sectionId: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * A section header's container. Applies the classes an extension reports for
 * `section:<id>` (e.g. to mark a section it manages).
 */
export const BotFormSectionHeaderFrame: React.FC<
  BotFormSectionHeaderFrameProps
> = ({ sectionId, className, children }) => {
  const { className: extra } = useBotFieldExtensionState(
    `section:${sectionId}`,
    'section'
  );
  return (
    <div
      className={cn(className, extra)}
      {...(extra ? { 'data-section-decorated': 'true' } : {})}
    >
      {children}
    </div>
  );
};
