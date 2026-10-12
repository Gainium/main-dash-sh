import { ArrowUpRight } from 'lucide-react';
import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { VideoThumbnail } from './video-thumbnail';

export interface FeatureEmptyStateProps {
  icon: React.ReactNode;
  title: string;
  /** One line. Anything longer belongs in a help article. */
  subtitle?: string;
  /** Short labels shown as chips under the subtitle. */
  highlights?: { icon: React.ReactNode; label: string }[];
  action?: { label: string; onClick: () => void; icon?: React.ReactNode };
  secondaryAction?: { label: string; onClick: () => void; icon?: React.ReactNode };
  learnMore?: { label: string; href: string };
  /** Shown beside the copy; takes precedence over `media`. */
  video?: { url: string; title: string };
  /** Custom visual beside the copy when there is no video. */
  media?: React.ReactNode;
  /** Extra section under the hero (e.g. templates). */
  children?: React.ReactNode;
  className?: string;
}

/**
 * Page-size empty state for a feature the user has not used yet: a hero with
 * the feature's pitch and a video (or custom visual) beside it, plus room for
 * starter templates underneath.
 */
const FeatureEmptyState: React.FC<FeatureEmptyStateProps> = ({
  icon,
  title,
  subtitle,
  highlights,
  action,
  secondaryAction,
  learnMore,
  video,
  media,
  children,
  className,
}) => {
  const visual = video ? <VideoThumbnail url={video.url} title={video.title} /> : media;
  return (
    <div className={cn('relative w-full overflow-hidden', className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
      />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-xl px-md py-lg md:py-xl">
        <section
          className={cn(
            'grid items-center gap-lg',
            visual && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-xl'
          )}
        >
          <div
            className={cn(
              'flex flex-col gap-md',
              visual ? 'items-start text-left' : 'items-center text-center'
            )}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
              {icon}
            </div>
            <div className="flex flex-col gap-xs">
              <h3 className="text-2xl md:text-3xl font-semibold tracking-tight text-balance">
                {title}
              </h3>
              {subtitle && (
                <p className="text-muted-foreground text-sm md:text-base max-w-xl text-pretty">
                  {subtitle}
                </p>
              )}
            </div>
            {highlights && highlights.length > 0 && (
              <ul className={cn('flex flex-wrap gap-xs', !visual && 'justify-center')}>
                {highlights.map((h) => (
                  <li
                    key={h.label}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-foreground [&_svg]:size-3.5 [&_svg]:text-primary"
                  >
                    {h.icon}
                    {h.label}
                  </li>
                ))}
              </ul>
            )}
            {(action || secondaryAction || learnMore) && (
              <div
                className={cn('mt-xs flex flex-wrap items-center gap-sm', !visual && 'justify-center')}
              >
                {action && (
                  <Button size="lg" onClick={action.onClick} className="fx-glow">
                    {action.icon}
                    {action.label}
                  </Button>
                )}
                {secondaryAction && (
                  <Button size="lg" variant="outline" onClick={secondaryAction.onClick}>
                    {secondaryAction.icon}
                    {secondaryAction.label}
                  </Button>
                )}
                {learnMore && (
                  <a
                    href={learnMore.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {learnMore.label}
                    <ArrowUpRight className="size-4" />
                  </a>
                )}
              </div>
            )}
          </div>
          {visual && <div className="w-full">{visual}</div>}
        </section>
        {children}
      </div>
    </div>
  );
};

export default FeatureEmptyState;
export { FeatureEmptyState };
