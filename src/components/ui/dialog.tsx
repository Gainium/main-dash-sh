import { X } from 'lucide-react';
import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';

interface DialogContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DialogContext = React.createContext<DialogContextValue | null>(null);

const useDialog = () => {
  const context = React.useContext(DialogContext);
  if (!context) {
    throw new Error('Dialog components must be used within Dialog');
  }
  return context;
};

interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

const Dialog: React.FC<DialogProps> = ({
  open = false,
  onOpenChange,
  children,
}) => {
  const [internalOpen, setInternalOpen] = React.useState(false);

  const isControlled = open !== undefined && onOpenChange !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const setOpen = isControlled ? onOpenChange : setInternalOpen;

  const contextValue = React.useMemo(
    () => ({
      open: isOpen,
      onOpenChange: setOpen,
    }),
    [isOpen, setOpen]
  );

  return (
    <DialogContext.Provider value={contextValue}>
      {children}
    </DialogContext.Provider>
  );
};

interface DialogTriggerProps {
  asChild?: boolean;
  children: React.ReactNode;
  className?: string;
}

const DialogTrigger: React.FC<DialogTriggerProps> = ({
  asChild = false,
  children,
  className,
}) => {
  const { onOpenChange } = useDialog();

  const handleClick = () => {
    onOpenChange(true);
  };

  if (asChild) {
    const child = children as React.ReactElement<
      React.HTMLAttributes<HTMLElement>
    >;
    return React.cloneElement(child, {
      onClick: handleClick,
      className: cn(className, child.props?.className),
    });
  }

  return (
    <button onClick={handleClick} className={className}>
      {children}
    </button>
  );
};

interface DialogContentProps {
  children: React.ReactNode;
  className?: string;
  showCloseButton?: boolean;
  onClose?: () => void;
  zIndex?: number; // Add custom z-index support
  portalTarget?: Element; // Add custom portal target support
  backdropClassName?: string; // Add custom backdrop className support for z-index classes
  backdropStyle?: 'default' | 'transparent'; // Control the backdrop appearance
  style?: React.CSSProperties; // Add custom style support
}

const DialogContent: React.FC<DialogContentProps> = ({
  children,
  className,
  showCloseButton = true,
  onClose,
  zIndex = 60, // Default z-index
  portalTarget, // Custom portal target
  backdropClassName, // Custom backdrop className
  backdropStyle = 'default',
  style,
}) => {
  const { open, onOpenChange } = useDialog();
  const [mounted, setMounted] = React.useState(false);

  // Ensure we're on the client side
  React.useEffect(() => {
    setMounted(true);
  }, []);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      if (onClose) {
        onClose();
      } else {
        onOpenChange(false);
      }
    }
  };

  const handleClose = React.useCallback(() => {
    if (onClose) {
      onClose();
    } else {
      onOpenChange(false);
    }
  }, [onClose, onOpenChange]);

  // Handle escape key
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        handleClose();
      }
    };

    if (open) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [open, handleClose]);

  if (!mounted || !open) return null;

  const dialogContent = (
    <div
      className={cn(
        'fixed inset-0 flex items-center justify-center p-3 md:p-4',
        backdropStyle === 'default'
          ? 'bg-black/50 backdrop-blur-sm'
          : 'bg-transparent backdrop-blur-0 pointer-events-none',
        backdropClassName
      )}
      style={{ zIndex }}
      onClick={backdropStyle === 'default' ? handleBackdropClick : undefined}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={cn(
          'glass-surface relative rounded-lg shadow-2xl ring-1 ring-border/60 w-full max-w-md max-h-[90vh] overflow-auto p-sm',
          className,
          backdropStyle === 'transparent' && 'pointer-events-auto'
        )}
        style={style}
        onClick={(e) => e.stopPropagation()}
      >
        {showCloseButton && (
          // 0-height sticky wrapper keeps the close button pinned to the
          // top-right of the scroll container even when the dialog body
          // scrolls. `pointer-events-none` on the wrapper lets the rest
          // of the area pass clicks through; the button itself re-enables
          // pointer events.
          <div className="sticky top-0 z-20 h-0 pointer-events-none">
            <button
              onClick={handleClose}
              aria-label="Close"
              // Always-on subtle chip so the X reads as a distinct
              // affordance against any backdrop — including a sticky
              // search row pinned at the top of the scroll container,
              // where it would otherwise blend into the row's surface.
              className="absolute top-3 right-3 grid place-items-center h-7 w-7 rounded-full bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors pointer-events-auto"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );

  // Use portal to render at document.body level or custom target
  return createPortal(dialogContent, portalTarget || document.body);
};

interface DialogHeaderProps {
  children: React.ReactNode;
  className?: string;
}

const DialogHeader: React.FC<DialogHeaderProps> = ({ children, className }) => {
  return <div className={cn('pb-4', className)}>{children}</div>;
};

interface DialogTitleProps {
  children: React.ReactNode;
  className?: string;
}

const DialogTitle: React.FC<DialogTitleProps> = ({ children, className }) => {
  return (
    <h2
      className={cn(
        'text-lg font-semibold text-foreground dark:text-card-foreground',
        className
      )}
    >
      {children}
    </h2>
  );
};

interface DialogDescriptionProps {
  children: React.ReactNode;
  className?: string;
}

const DialogDescription: React.FC<DialogDescriptionProps> = ({
  children,
  className,
}) => {
  return (
    <p
      className={cn(
        'text-sm text-muted-foreground dark:text-muted-foreground mt-2',
        className
      )}
    >
      {children}
    </p>
  );
};

interface DialogBodyProps {
  children: React.ReactNode;
  className?: string;
}

const DialogBody: React.FC<DialogBodyProps> = ({ children, className }) => {
  // No default padding since DialogContent now provides p-sm
  // Users can override with className if needed
  return <div className={cn(className)}>{children}</div>;
};

interface DialogFooterProps {
  children: React.ReactNode;
  className?: string;
}

const DialogFooter: React.FC<DialogFooterProps> = ({ children, className }) => {
  return (
    <div
      className={cn(
        'flex justify-end gap-sm mt-0 p-md border-t border-border dark:border-border',
        className
      )}
    >
      {children}
    </div>
  );
};

export {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
};
