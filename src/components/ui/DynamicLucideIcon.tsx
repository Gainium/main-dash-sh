/**
 * Renders a lucide icon chosen by NAME at runtime (user-defined navigation
 * items). The full icon set is several hundred KB, so it is loaded as its own
 * chunk on first use instead of being bundled into every page through a
 * static `import * as Icons from 'lucide-react'`.
 */
import { lazy, Suspense, type ComponentType } from 'react';

interface DynamicLucideIconProps {
  name: string;
  className?: string;
}

const LazyIcon = lazy(async () => {
  const icons = (await import('lucide-react')) as unknown as Record<
    string,
    ComponentType<{ className?: string }>
  >;
  const Fallback = icons['Home'] as ComponentType<{ className?: string }>;
  function ResolvedIcon({ name, className }: DynamicLucideIconProps) {
    const Icon = icons[name] ?? Fallback;
    return <Icon className={className} />;
  }
  return { default: ResolvedIcon };
});

export function DynamicLucideIcon(props: DynamicLucideIconProps) {
  return (
    <Suspense
      fallback={<span className={props.className} aria-hidden="true" />}
    >
      <LazyIcon {...props} />
    </Suspense>
  );
}

export default DynamicLucideIcon;
