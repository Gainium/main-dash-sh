// Simple toast notification system without external dependencies
export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastOptions {
  /** Auto-dismiss delay in ms; `Infinity` keeps it until dismissed. */
  duration?: number;
  type?: ToastType;
}

/** A shown toast whose text can change until it is dismissed. */
export interface ToastHandle {
  update: (message: string) => void;
  dismiss: () => void;
}

const defaultOptions: ToastOptions = {
  duration: 3000,
  type: 'info',
};

let toastContainer: HTMLElement | null = null;

const createToastContainer = (): HTMLElement => {
  if (toastContainer) return toastContainer;

  toastContainer = document.createElement('div');
  toastContainer.id = 'toast-container';
  toastContainer.style.cssText = `
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    pointer-events: none;
  `;
  document.body.appendChild(toastContainer);
  return toastContainer;
};

const getToastStyles = (type: ToastType): string => {
  const baseStyles = `
    position: relative;
    min-width: 300px;
    max-width: 500px;
    padding: 0.875rem 1rem;
    padding-right: 2.5rem;
    border-radius: 0.5rem;
    color: white;
    font-size: 0.875rem;
    line-height: 1.25rem;
    font-weight: 500;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
    transform: translateX(100%);
    transition: transform 0.3s ease-in-out;
    pointer-events: auto;
    cursor: default;
  `;

  const typeStyles = {
    success: 'background-color: #10B981;',
    error: 'background-color: #EF4444;',
    warning: 'background-color: #F59E0B;',
    info: 'background-color: #3B82F6;',
  };

  return baseStyles + typeStyles[type];
};

const NOOP_HANDLE: ToastHandle = { update: () => {}, dismiss: () => {} };

export const showToast = (
  message: string,
  options: ToastOptions = {}
): ToastHandle => {
  const { duration, type } = { ...defaultOptions, ...options };
  if (!type) return NOOP_HANDLE;
  const container = createToastContainer();

  const toast = document.createElement('div');
  const text = document.createElement('span');
  text.textContent = message;
  toast.appendChild(text);
  toast.style.cssText = getToastStyles(type);

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '&times;';
  closeBtn.style.cssText = `
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    background: transparent;
    border: none;
    color: white;
    font-size: 1.25rem;
    line-height: 1;
    cursor: pointer;
    opacity: 0.7;
    padding: 0 0.25rem;
    transition: opacity 0.2s;
  `;
  closeBtn.onmouseenter = () => (closeBtn.style.opacity = '1');
  closeBtn.onmouseleave = () => (closeBtn.style.opacity = '0.7');

  toast.appendChild(closeBtn);
  container.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.style.transform = 'translateX(0)';
  });

  // Auto dismiss (setTimeout treats Infinity as 0, so skip it)
  const timeoutId =
    duration !== undefined && Number.isFinite(duration)
      ? setTimeout(() => {
          dismissToast(toast);
        }, duration)
      : undefined;

  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    dismissToast(toast);
  };

  // Click close button to dismiss
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dismiss();
  });

  return {
    update: (next: string) => {
      text.textContent = next;
    },
    dismiss,
  };
};

const dismissToast = (toast: HTMLElement): void => {
  toast.style.transform = 'translateX(100%)';
  setTimeout(() => {
    toast.remove();
  }, 300);
};

export const toast = {
  success: (message: string, options?: Omit<ToastOptions, 'type'>) =>
    showToast(message, { ...options, type: 'success' }),
  error: (message: string, options?: Omit<ToastOptions, 'type'>) =>
    showToast(message, { ...options, type: 'error' }),
  info: (message: string, options?: Omit<ToastOptions, 'type'>) =>
    showToast(message, { ...options, type: 'info' }),
  warning: (message: string, options?: Omit<ToastOptions, 'type'>) =>
    showToast(message, { ...options, type: 'warning' }),
  /** An info toast that stays until `dismiss()`; `update()` changes its text. */
  progress: (message: string): ToastHandle =>
    showToast(message, { type: 'info', duration: Infinity }),
};
