import { Play } from 'lucide-react';
import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent } from './dialog';
import { getYouTubeVideoId, YouTubeEmbed } from './YouTubeEmbed';

interface VideoThumbnailProps {
  /** Any YouTube watch / share / embed URL. Renders nothing for other URLs. */
  url: string;
  title: string;
  className?: string;
}

/**
 * A YouTube video shown as its own thumbnail with a play badge. Clicking it
 * plays the video in a modal, so the page never leaves the app.
 */
export const VideoThumbnail: React.FC<VideoThumbnailProps> = ({ url, title, className }) => {
  const [open, setOpen] = useState(false);
  const videoId = getYouTubeVideoId(url);
  if (!videoId) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Play video: ${title}`}
        className={cn(
          'group relative block w-full aspect-video overflow-hidden rounded-xl border border-border bg-muted',
          'shadow-[0_8px_30px_rgba(0,0,0,0.25)] cursor-pointer outline-none',
          'focus-visible:ring-2 focus-visible:ring-primary/40 ring-offset-background',
          className
        )}
      >
        <img
          src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-black/5" />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="relative flex h-16 w-16 items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-primary/40 animate-ping [animation-duration:2.4s]" />
            <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform duration-200 group-hover:scale-110">
              <Play className="size-7 translate-x-0.5 fill-current" />
            </span>
          </span>
        </span>
        <span className="absolute inset-x-0 bottom-0 p-md text-left">
          <span className="block text-sm font-semibold text-white drop-shadow">{title}</span>
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl w-[calc(100vw-2rem)] p-0 overflow-hidden" zIndex={90}>
          {open && <YouTubeEmbed url={url} autoplay className="my-0 rounded-none border-0" />}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default VideoThumbnail;
