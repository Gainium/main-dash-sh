/**
 * MobileVariableCard Component
 *
 * A mobile-optimized card component for displaying global variables
 * when the screen is too small for the full data table.
 */

import React from 'react';
import { Edit, Trash2, Eye, MoreVertical } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { motion } from 'framer-motion';
import { cardHoverVariants } from '@/lib/animations/variants';
import VariableTypeChip from './VariableTypeChip';
import RelatedBotsPopover from './RelatedBotsPopover';
import type { GlobalVariable } from '@/types/globalVariables';
import { GlobalVariablesTypeEnum } from '@/types';

interface MobileVariableCardProps {
  variable: GlobalVariable & { isPending?: boolean };
  isSelected: boolean;
  onSelect: (selected: boolean) => void;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onViewRelatedBots: () => void;
  relatedBotsPopoverOpen: boolean;
  onRelatedBotsPopoverChange: (open: boolean) => void;
  index?: number; // For animation delay
}

const MobileVariableCard: React.FC<MobileVariableCardProps> = ({
  variable,
  isSelected,
  onSelect,
  onView,
  onEdit,
  onDelete,
  onViewRelatedBots,
  relatedBotsPopoverOpen,
  onRelatedBotsPopoverChange,
}) => {
  const formatValue = (
    value: string,
    type: GlobalVariablesTypeEnum
  ): string => {
    if (type === GlobalVariablesTypeEnum.text && value.length > 30) {
      return `${value.substring(0, 30)}...`;
    }
    return value;
  };

  return (
    <Card position={1} className="p-0 overflow-hidden max-w-sm w-full">
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{
          duration: 0.4,
          delay: 0.05,
          ease: [0.34, 1.56, 0.64, 1],
          type: 'spring',
          stiffness: 300,
          damping: 25,
        }}
        whileHover="hover"
        whileTap="tap"
        variants={cardHoverVariants}
        className={`p-0 cursor-pointer overflow-hidden bg-transparent border-none rounded-lg group shadow-none transition-colors duration-200 min-h-[120px] touch-manipulation ${
          isSelected ? 'ring-2 ring-primary/20' : 'hover:bg-accent/5'
        } ${variable.isPending ? 'ring-2 ring-orange-200' : ''}`}
        onClick={onView}
        style={{
          transformOrigin: 'center',
        }}
      >
        {/* Header */}
        <div className="p-md pb-2">
          <motion.div
            className="flex items-start justify-between mb-3"
            initial={{ opacity: 0, x: -15 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.1, ease: 'easeOut' }}
          >
            <div className="flex items-center gap-sm min-w-0 flex-1">
              <Checkbox
                checked={isSelected}
                onCheckedChange={(checked) => {
                  onSelect(!!checked);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                }}
                aria-label={`Select ${variable.name}`}
              />
              <div className="min-w-0 flex-1">
                {/* Variable Name - Primary Element */}
                <div className="mb-1">
                  <h3
                    className="text-lg font-bold text-card-foreground truncate"
                    title={variable.name}
                  >
                    {variable.name}
                  </h3>
                </div>

                {/* Type and Status - Secondary Elements */}
                <div className="flex items-center gap-xs mb-2">
                  <VariableTypeChip type={variable.type} size="sm" />
                  {variable.isPending && (
                    <Badge
                      variant="secondary"
                      className="text-xs bg-orange-100 text-orange-800 border-orange-200"
                    >
                      Pending
                    </Badge>
                  )}
                </div>

                {/* Bot Usage Badge */}
                <div className="flex items-center gap-xs">
                  <Badge variant="outline" className="text-xs">
                    {variable.botAmount} bot
                    {variable.botAmount !== 1 ? 's' : ''}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Dropdown Menu - styled like BotCard */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200"
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                >
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                side="bottom"
                className="w-48"
                sideOffset={8}
                onClick={(e) => e.stopPropagation()}
              >
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onView();
                  }}
                  className="flex items-center gap-xs"
                >
                  <Eye className="w-4 h-4" />
                  View
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                  className="flex items-center gap-xs"
                >
                  <Edit className="w-4 h-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                  className="flex items-center gap-xs text-destructive focus:text-destructive"
                  disabled={variable.botAmount > 0}
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </motion.div>
        </div>

        {/* Main Content */}
        <motion.div
          className="px-4 pb-4"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15, ease: 'easeOut' }}
        >
          {/* Value Section */}
          <div className="mb-4">
            <div className="text-xs text-muted-foreground mb-2">Value</div>
            <div className="font-mono text-sm bg-muted/50 rounded px-3 py-2 break-all min-h-10 flex items-center">
              {formatValue(variable.value, variable.type)}
            </div>
          </div>

          {/* Footer with Related Bots */}
          {variable.botAmount > 0 && (
            <div className="flex items-center justify-between pt-3 border-t border-border/50">
              <p className="text-xs text-muted-foreground">
                Used by {variable.botAmount} bot
                {variable.botAmount !== 1 ? 's' : ''}
              </p>
              <RelatedBotsPopover
                variableId={variable.id}
                variableName={variable.name}
                isOpen={relatedBotsPopoverOpen}
                onOpenChange={onRelatedBotsPopoverChange}
              >
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewRelatedBots();
                  }}
                  className="h-7 px-2 text-xs"
                >
                  <Eye className="h-3 w-3 mr-1" />
                  View Bots
                </Button>
              </RelatedBotsPopover>
            </div>
          )}
        </motion.div>
      </motion.div>
    </Card>
  );
};

export default MobileVariableCard;
