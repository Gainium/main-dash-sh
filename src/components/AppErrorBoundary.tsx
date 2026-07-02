import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { GraphQLClient } from '@/lib/api/GraphQLClient';
import { otherQueries } from '@/lib/api/GraphQLQueries-other-queries';
import { useAuthStore } from '@/stores/authStore';
import { logger } from '@/lib/loggerInstance';
import {
  initCrashBreadcrumbs,
  serializeCrashMeta,
} from '@/lib/crashBreadcrumbs';

// Start recording route/click/resize/socket breadcrumbs as soon as this
// module loads. Both entry points (cloud src/main.tsx and core/src/main.tsx)
// import AppErrorBoundary, so this covers both bundles. Idempotent + HMR-safe.
initCrashBreadcrumbs();

/**
 * Friendly text for the React production "minified error" codes we actually
 * see in the wild. Production React ships error *numbers* (e.g. "Minified
 * React error #185") to keep the bundle small; this maps the common ones to a
 * human description so the stored crash reports are readable without visiting
 * react.dev. Unknown codes are left untouched (the message already carries the
 * react.dev/errors/<n> link).
 */
const REACT_ERROR_MESSAGES: Record<string, string> = {
  '130': 'Element type is invalid — a component rendered as undefined (bad or circular import / missing export)',
  '185': 'Maximum update depth exceeded — infinite render loop (a component updates state on every render)',
  '300': 'Rendered more hooks than during the previous render (hooks called conditionally)',
  '310': 'Rendered fewer hooks than expected (a hook is skipped by an early return or conditional)',
  '418': 'Hydration failed — server-rendered HTML did not match the client',
  '423': 'Hydration error — React recovered by client-rendering the subtree',
  '425': 'Text content did not match the server-rendered HTML',
};

/**
 * If `message` is a minified React error, append the decoded description so the
 * backend crash log is human-readable. No-op for everything else.
 */
function decodeReactError(message: string): string {
  const match = message.match(/Minified React error #(\d+)/);
  const friendly = match && REACT_ERROR_MESSAGES[match[1]];
  return friendly ? `${message} [React #${match[1]}: ${friendly}]` : message;
}

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  componentStack?: string;
}

/**
 * Global error boundary that catches all unhandled React errors,
 * renders a retry UI, and reports crash details to the backend.
 */
export class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const token = useAuthStore.getState().tokens?.accessToken;

    const errorMessage = `Page: ${window.location.href}, Message: ${decodeReactError(error.message || '')}`;
    const componentStack = errorInfo.componentStack || '';

    // The `sendError` GraphQL input shape is rigid (error.{message,stack},
    // errorInfo.componentStack, subType, source) — no room for new fields.
    // So serialize the extras (bundle hash for source-map lookup, build mode,
    // React 19 digest, and the breadcrumb trail) into a compact JSON block and
    // append it to error.stack. Zero backend change; the triage pipeline reads
    // the `[[meta]]` marker. React 19 puts a `digest` on ErrorInfo when present.
    const digest = (errorInfo as ErrorInfo & { digest?: string }).digest;
    const metaBlock = serializeCrashMeta(digest ? { digest } : undefined);
    const errorStack = (error.stack || '') + metaBlock;

    logger.error('[AppErrorBoundary] Unhandled error:', {
      message: errorMessage,
      stack: errorStack,
      componentStack,
    });

    this.setState({ componentStack });

    const endpoint =
      import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
    const client = new GraphQLClient(endpoint, token);

    const { query, variables } = otherQueries.sendError({
      error: { message: errorMessage, stack: errorStack },
      errorInfo: { componentStack },
      subType: 'Browser',
      source: 'v2',
    });

    client
      .request(query, variables)
      .catch((err) => {
        logger.error('[AppErrorBoundary] Failed to send error to backend:', err);
      });
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  handleReload = () => {
    window.location.reload();
  };

  override render() {
    if (this.state.hasError) {
      const { error, componentStack } = this.state;

      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="w-8 h-8 text-destructive" />
            <h2 className="text-xl font-semibold text-destructive">
              Something went wrong
            </h2>
          </div>

          <p className="text-muted-foreground mb-6 text-center max-w-md">
            An unexpected error occurred. You can try again or reload the page.
          </p>

          {error && (
            <details className="mb-6 text-left max-w-lg w-full">
              <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                Technical Details
              </summary>
              <div className="mt-2 p-3 bg-muted rounded text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">
                {error.message}
                {error.stack ? `\n\n${error.stack}` : ''}
                {componentStack ? `\n\nComponent stack:${componentStack}` : ''}
              </div>
            </details>
          )}

          <div className="flex gap-3">
            <Button onClick={this.handleRetry} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
            <Button onClick={this.handleReload} variant="destructive">
              Reload Page
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
