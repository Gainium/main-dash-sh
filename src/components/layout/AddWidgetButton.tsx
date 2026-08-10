import { Plus } from 'lucide-react';
import React from 'react';
import { Button } from '../ui/button';

interface AddWidgetButtonProps {
  onClick: () => void;
  children?: React.ReactNode;
  variant?: 'default' | 'dashed';
  className?: string;
}

const AddWidgetButton: React.FC<AddWidgetButtonProps> = ({
  onClick,
  children,
  variant = 'dashed',
  className = '',
}) => {
  if (variant === 'dashed') {
    return (
      <button
        onClick={onClick}
        className={`w-full p-sm rounded-md border-2 border-dashed border-muted-foreground/30 hover:border-muted-foreground/50 bg-background hover:bg-muted/20 transition-all duration-200 group ${className}`}
      >
        <div className="flex items-center justify-center gap-xs">
          <Plus className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          <span className="font-medium text-sm text-muted-foreground group-hover:text-foreground transition-colors">
            {children || 'Add Widget'}
          </span>
        </div>
      </button>
    );
  }

  return (
    <Button
      onClick={onClick}
      variant="outline"
      className={`h-auto p-sm flex-col gap-xs ${className}`}
    >
      <Plus className="h-5 w-5" />
      {children || 'Add Widget'}
    </Button>
  );
};

export default AddWidgetButton;
