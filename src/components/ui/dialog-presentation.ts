import { createContext, useContext } from 'react';

/**
 * How the dialogs below a provider are drawn. `inline` renders a dialog's
 * content in place, as a card in the surrounding layout (no portal, backdrop
 * or scroll lock), so one dialog component also serves as an in-page panel —
 * the deal drawer's actions use it. A dialog rendered inside another dialog
 * is always modal.
 */
export type DialogPresentation = 'modal' | 'inline';

export const DialogPresentationContext =
  createContext<DialogPresentation>('modal');

/** Whether the nearest dialog is drawn inline rather than as a modal. */
export const useDialogPresentation = (): DialogPresentation =>
  useContext(DialogPresentationContext);
