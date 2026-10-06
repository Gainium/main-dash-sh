import { cn } from '@/lib/utils';
import DOMPurify from 'dompurify';
import type { UnifiedNotification } from '@/stores/notificationsStore';
import { ChevronDown, ChevronUp } from 'lucide-react';
import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';

/**
 * `http(s)://…` runs, so a notification that cites a help page renders a real
 * link instead of text the user has to select and paste. Deliberately narrow:
 * only these two schemes match, so a message can never produce a `javascript:`
 * or `data:` href even though some notification text originates from an
 * exchange rather than from us.
 */
const URL_PATTERN = /(https?:\/\/[^\s<]+)/g;

/** Sentence punctuation that trails a URL belongs to the sentence, not the URL. */
const trimTrailingPunctuation = (url: string): [string, string] => {
  const match = /[.,;:!?)\]]+$/.exec(url);
  return match ? [url.slice(0, match.index), match[0]] : [url, ''];
};

/**
 * Plain-text message → nodes with the URLs turned into anchors. The HTML
 * branch below is left alone; announcements author their own markup.
 */
const linkify = (text: string): React.ReactNode[] =>
  text.split(URL_PATTERN).map((part, i) => {
    // Odd indices are the captured URLs — `String.split` with a capturing
    // group interleaves them with the surrounding text.
    if (i % 2 === 0) return part;
    const [href, trailing] = trimTrailingPunctuation(part);
    return (
      <React.Fragment key={i}>
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="text-primary underline underline-offset-2 hover:no-underline break-words"
          onClick={(event) => event.stopPropagation()}
        >
          {href}
        </a>
        {trailing}
      </React.Fragment>
    );
  });

export interface NotificationRichContentProps {
  notification: UnifiedNotification;
  clampLines?: number;
  disableClamp?: boolean;
  className?: string;
  textClassName?: string;
  toggleButtonClassName?: string;
}

export const NotificationRichContent: React.FC<
  NotificationRichContentProps
> = ({
  notification,
  clampLines = 2,
  disableClamp = false,
  className,
  textClassName,
  toggleButtonClassName,
}) => {
  const [expanded, setExpanded] = useState(false);
  const hasHtmlContent = Boolean(notification.htmlDescription);
  const messageContent = notification.message ?? '';

  // Sanitised once per message rather than on every render: this component is
  // rendered for every row of the notification list, and each re-render would
  // otherwise re-parse the whole string.
  const sanitizedMessage = useMemo(
    () => (hasHtmlContent ? DOMPurify.sanitize(messageContent) : ''),
    [hasHtmlContent, messageContent]
  );

  // Whether the clamped text is actually cut off, read from the element rather
  // than guessed from the string length: HTML messages count their tags as
  // characters, and every block (`h3`, `p`) starts a new line however short
  // it is, so a short multi-block update can overflow the clamp.
  const messageRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useLayoutEffect(() => {
    const el = messageRef.current;
    // Expanded text no longer overflows; keep the last clamped reading so the
    // collapse arrow stays.
    if (!el || disableClamp || expanded) return;
    const measure = () =>
      setIsOverflowing(el.scrollHeight - el.clientHeight > 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [disableClamp, expanded, clampLines, messageContent, sanitizedMessage]);

  const shouldShowToggle = !disableClamp && (expanded || isOverflowing);

  const messageClass = cn(
    'text-sm text-muted-foreground mb-2 whitespace-pre-wrap',
    !disableClamp && !expanded ? `line-clamp-${clampLines}` : undefined,
    textClassName
  );

  return (
    <>
      <div className={cn('flex items-start gap-1', className)}>
        <div className="flex-1">
          {hasHtmlContent ? (
            <div
              ref={messageRef}
              className={messageClass}
              dangerouslySetInnerHTML={{ __html: sanitizedMessage }}
              style={{ cursor: 'text' }}
            />
          ) : (
            <div ref={messageRef} className={messageClass}>
              {linkify(messageContent)}
            </div>
          )}
        </div>

        {shouldShowToggle && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setExpanded((prev) => !prev);
            }}
            className={cn(
              'shrink-0 inline-flex items-center justify-center w-5 h-5 mt-0.5 text-muted-foreground hover:text-primary transition-colors rounded-sm hover:bg-muted/50',
              toggleButtonClassName
            )}
            title={expanded ? 'Show less' : 'Show more'}
          >
            {expanded ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>
        )}
      </div>

      {notification.imgSRC && (
        <div className="mt-1 mb-2 flex justify-center">
          <img
            src={notification.imgSRC}
            alt=""
            className="w-[270px] h-[150px] object-cover rounded-[10px]"
          />
        </div>
      )}

    </>
  );
};

export default NotificationRichContent;
