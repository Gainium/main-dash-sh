import { loggerStorage } from './loggerStorage';

// Environment detection
const isDevelopment = import.meta.env.MODE === 'development';
const isProduction = import.meta.env.MODE === 'production';

// Log levels
export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

// Parse log level from environment variable
const parseLogLevelFromEnv = (): LogLevel => {
  const envLogLevel = import.meta.env.VITE_LOG_LEVEL;
  if (envLogLevel) {
    const upperLevel = envLogLevel.toUpperCase();
    if (upperLevel in LogLevel) {
      return LogLevel[upperLevel as keyof typeof LogLevel];
    }
    console.warn(
      `[Logger] Invalid VITE_LOG_LEVEL: ${envLogLevel}. Using default.`
    );
  }
  return isDevelopment ? LogLevel.DEBUG : LogLevel.INFO;
};

// Global minimum log level from environment
const globalMinLogLevel = parseLogLevelFromEnv();

// Category is now just a string
export type LogCategory = string;

export interface LogEntry {
  id: string;
  timestamp: string;
  level: string;
  category: string;
  message: string;
  data?: unknown;
  args?: unknown[];
  stack?: string;
  count?: number; // Number of times this message was repeated
}

export interface CategoryConfig {
  enabled: boolean;
  minLevel: LogLevel;
}

export interface LoggerConfig {
  categories: Record<string, CategoryConfig>;
  duplicateThreshold: number; // Show exact count if message repeated more than this
}

class Logger {
  private listeners: ((logs: LogEntry[]) => void)[] = [];
  private isActive: boolean = isDevelopment; // Auto-enable in development
  private config: LoggerConfig;
  private logsCache: LogEntry[] = []; // In-memory cache for performance
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    // Browser-only logger, no file path needed

    // Default configuration - no predefined categories, all enabled dynamically
    this.config = {
      duplicateThreshold: 10,
      categories: {},
    };

    // Initialize asynchronously
    this.initPromise = this.initialize();
  }

  /**
   * Wait for initialization to complete
   */
  async waitForInitialization(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  /**
   * Initialize storage and migrate from localStorage if needed
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Migrate from localStorage if this is the first time
      await loggerStorage.migrateFromLocalStorage();

      // Load config from IndexedDB
      const storedConfig = await loggerStorage.loadConfig();
      if (storedConfig) {
        this.config = storedConfig as LoggerConfig;
      }

      // Load logs into cache (regardless of active state - we want to see existing logs)
      this.logsCache = await loggerStorage.getLogs();

      this.initialized = true;
      console.log('[Logger] Initialized with IndexedDB storage');

      // Notify listeners that logs have been loaded from storage
      this.notifyListeners();
    } catch (error) {
      console.error('[Logger] Failed to initialize:', error);
      this.initialized = true; // Continue anyway
    }
  }

  // Get or create category config
  private getCategoryConfig(category: string): CategoryConfig {
    if (!this.config.categories[category]) {
      this.config.categories[category] = {
        enabled: true,
        minLevel: globalMinLogLevel,
      };
    }
    return this.config.categories[category];
  }

  // Set active state
  setActive(active: boolean): void {
    this.isActive = active;
  }

  // Get active state
  getActive(): boolean {
    return this.isActive;
  }

  // Configuration management
  getConfig(): LoggerConfig {
    return { ...this.config };
  }

  setConfig(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
    this.saveConfig();
  }

  setCategoryConfig(category: string, config: Partial<CategoryConfig>): void {
    const currentConfig = this.getCategoryConfig(category);
    this.config.categories[category] = {
      ...currentConfig,
      ...config,
    };
    this.saveConfig();
  }

  private async saveConfig(): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      await loggerStorage.saveConfig(this.config);
    } catch (error) {
      console.error('Failed to save logger config:', error);
    }
  }

  // Extract category from message if present in format: [Category] message
  private extractCategoryFromMessage(message: string): {
    category: string;
    cleanMessage: string;
  } {
    const categoryMatch = message.match(/^\[([^\]]+)\]\s*/);
    if (categoryMatch) {
      return {
        category: categoryMatch[1],
        cleanMessage: message.slice(categoryMatch[0].length),
      };
    }
    return {
      category: 'general',
      cleanMessage: message,
    };
  }

  // Generate a hash for duplicate detection
  private generateHash(
    level: LogLevel,
    category: string,
    message: string
  ): string {
    return `${level}-${category}-${message}`;
  }

  // Sanitize data for IndexedDB storage (remove functions and non-cloneable objects)
  private sanitizeForStorage(data: unknown): unknown {
    if (data === null || data === undefined) {
      return data;
    }

    // Handle primitive types
    if (typeof data !== 'object') {
      if (typeof data === 'function') {
        return `[Function: ${data.name || 'anonymous'}]`;
      }
      return data;
    }

    // Handle arrays
    if (Array.isArray(data)) {
      return data.map((item) => this.sanitizeForStorage(item));
    }

    // Handle objects
    try {
      const sanitized: Record<string, unknown> = {};
      for (const key in data as Record<string, unknown>) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          const value = (data as Record<string, unknown>)[key];

          if (typeof value === 'function') {
            sanitized[key] = `[Function: ${value.name || 'anonymous'}]`;
          } else if (typeof value === 'object' && value !== null) {
            // Recursively sanitize nested objects
            sanitized[key] = this.sanitizeForStorage(value);
          } else {
            sanitized[key] = value;
          }
        }
      }
      return sanitized;
    } catch {
      // If something goes wrong, return a string representation
      return String(data);
    }
  }

  private formatMessage(
    level: LogLevel,
    category: string,
    message: string,
    data?: unknown
  ): LogEntry {
    // Ensure category is never empty
    const sanitizedCategory =
      category && category.trim() !== '' ? category : 'general';

    // Sanitize data for IndexedDB storage
    const sanitizedData =
      data !== undefined ? this.sanitizeForStorage(data) : undefined;

    const entry: LogEntry = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      level: Object.keys(LogLevel)[Object.values(LogLevel).indexOf(level)],
      category: sanitizedCategory,
      message,
      data: sanitizedData,
      args: sanitizedData ? [sanitizedData] : [],
      count: 1,
    };

    if (level === LogLevel.ERROR) {
      const stack = new Error().stack;
      if (stack) {
        entry.stack = stack;
      }
    }

    return entry;
  }

  private notifyListeners(): void {
    // Notify with computed grouped logs
    this.listeners.forEach((listener) => listener(this.getLogs()));
  }

  private writeToConsole(entry: LogEntry): void {
    const { timestamp, level, category, message, data } = entry;
    const formattedMessage = `[${timestamp}] [${category}] ${level}: ${message}`;

    switch (level) {
      case 'DEBUG':
        console.debug(formattedMessage, data || '');
        break;
      case 'INFO':
        console.info(formattedMessage, data || '');
        break;
      case 'WARN':
        console.warn(formattedMessage, data || '');
        break;
      case 'ERROR':
        console.error(formattedMessage, data || '');
        break;
      default:
        console.log(formattedMessage, data || '');
    }
  }

  private async writeToFile(entry: LogEntry): Promise<void> {
    // Save to IndexedDB
    try {
      await loggerStorage.saveLog(entry);
      // Update cache
      this.logsCache.unshift(entry);
      // Keep cache size manageable
      if (this.logsCache.length > 1000) {
        this.logsCache.splice(1000);
      }
    } catch (error) {
      // Use native console to avoid infinite loop
      if (typeof console !== 'undefined') {
        console.error('Failed to save log to IndexedDB:', error);
        console.error('Log entry that failed:', {
          level: entry.level,
          category: entry.category,
          message: entry.message,
          // Don't log the data that caused the issue to avoid another error
        });
      }
      // Still update cache even if storage failed
      this.logsCache.unshift(entry);
      if (this.logsCache.length > 1000) {
        this.logsCache.splice(1000);
      }
    }

    // Notify listeners - they will compute grouped view if needed
    this.notifyListeners();
  }

  private log(
    level: LogLevel,
    category: string,
    message: string,
    data?: unknown
  ): void {
    const isWarnOrError = level === LogLevel.WARN || level === LogLevel.ERROR;

    // Decide whether anything will be emitted BEFORE building the entry:
    // formatMessage sanitizes (deep-copies) `data`, which on hot paths (e.g.
    // a store update per websocket event) is pure waste when the entry is
    // then dropped — the common case in production.
    // If logger is disabled, or in production, only WARN & ERROR surface
    // (to the console); production never persists logs.
    if (!this.isActive || isProduction) {
      if (isWarnOrError) {
        this.writeToConsole(this.formatMessage(level, category, message, data));
      }
      return;
    }

    // Check if category is enabled and level is sufficient
    const categoryConfig = this.getCategoryConfig(category);
    const effectiveMinLevel = Math.max(
      globalMinLogLevel,
      categoryConfig.minLevel
    );
    if (!categoryConfig.enabled || level <= effectiveMinLevel) {
      // If it's a warning or error, still write it to console for visibility
      if (isWarnOrError) {
        this.writeToConsole(this.formatMessage(level, category, message, data));
      }
      return;
    }

    const entry = this.formatMessage(level, category, message, data);

    // At this point we should persist and/or output according to environment
    // Development: ALWAYS log to console and storage
    if (isDevelopment) {
      this.writeToConsole(entry);
      // Don't await - fire and forget to avoid blocking
      this.writeToFile(entry).catch((error) => {
        console.error('Failed to write log:', error);
      });
    }
  }

  // Convenience methods with automatic category extraction from message
  debug(message: string, data?: unknown): void {
    // Dropped unconditionally when inactive / in production — skip even the
    // category parse.
    if (!this.isActive || isProduction) return;
    const { category, cleanMessage } = this.extractCategoryFromMessage(message);
    this.log(LogLevel.DEBUG, category, cleanMessage, data);
  }

  info(message: string, data?: unknown): void {
    // Dropped unconditionally when inactive / in production — skip even the
    // category parse.
    if (!this.isActive || isProduction) return;
    const { category, cleanMessage } = this.extractCategoryFromMessage(message);
    this.log(LogLevel.INFO, category, cleanMessage, data);
  }

  warn(message: string, data?: unknown): void {
    const { category, cleanMessage } = this.extractCategoryFromMessage(message);
    this.log(LogLevel.WARN, category, cleanMessage, data);
  }

  error(message: string, data?: unknown): void {
    const { category, cleanMessage } = this.extractCategoryFromMessage(message);
    this.log(LogLevel.ERROR, category, cleanMessage, data);
  }

  // Legacy category methods - now just prepend [Category] to message
  // This maintains backward compatibility while using the new extraction system
  debugCategory(category: string, message: string, data?: unknown): void {
    this.debug(`[${category}] ${message}`, data);
  }

  infoCategory(category: string, message: string, data?: unknown): void {
    this.info(`[${category}] ${message}`, data);
  }

  warnCategory(category: string, message: string, data?: unknown): void {
    this.warn(`[${category}] ${message}`, data);
  }

  errorCategory(category: string, message: string, data?: unknown): void {
    this.error(`[${category}] ${message}`, data);
  }

  // Get logs grouped by unique message (computed from ungrouped logs)
  getLogs(): LogEntry[] {
    const ungroupedLogs = this.logsCache; // Use cache for performance
    const grouped: Map<string, LogEntry> = new Map();

    ungroupedLogs.forEach((log) => {
      const hash = this.generateHash(
        LogLevel[log.level as keyof typeof LogLevel],
        log.category,
        log.message
      );

      const existing = grouped.get(hash);
      if (existing) {
        // Increment count and update timestamp to latest
        existing.count = (existing.count || 1) + 1;
        if (log.timestamp > existing.timestamp) {
          existing.timestamp = log.timestamp;
        }
      } else {
        // First occurrence
        grouped.set(hash, { ...log, count: 1 });
      }
    });

    // Return as array, most recent first
    return Array.from(grouped.values()).sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  // Get all unique categories from logs
  getCategories(): string[] {
    const categories = new Set<string>();
    this.getLogs().forEach((log) => {
      // Include all categories, even empty ones (use placeholder for empty)
      const category =
        log.category && log.category.trim() !== ''
          ? log.category
          : 'uncategorized';
      categories.add(category);
    });
    return Array.from(categories).sort();
  }

  // Get logs filtered by category
  getLogsByCategory(category: string): LogEntry[] {
    return this.getLogs().filter((log) => log.category === category);
  }

  // Get log statistics
  getLogStats(): Record<
    string,
    { total: number; byLevel: Record<string, number> }
  > {
    const logs = this.getLogs();
    const categories = this.getCategories();
    const stats: Record<
      string,
      { total: number; byLevel: Record<string, number> }
    > = {};

    // Initialize stats for all categories
    categories.forEach((category) => {
      stats[category] = { total: 0, byLevel: {} };
    });

    logs.forEach((log) => {
      if (!stats[log.category]) {
        stats[log.category] = { total: 0, byLevel: {} };
      }
      stats[log.category].total += log.count || 1;
      stats[log.category].byLevel[log.level] =
        (stats[log.category].byLevel[log.level] || 0) + (log.count || 1);
    });

    return stats;
  }

  // Clear all logs
  async clearLogs(): Promise<void> {
    try {
      await loggerStorage.clearLogs();
      this.logsCache = [];
      // Force notification to update UI
      this.notifyListeners();
    } catch (error) {
      // Use native console.error to avoid creating more logs
      if (typeof console !== 'undefined') {
        console.error('Failed to clear logs:', error);
      }
    }
  }

  // Clear logs by category
  async clearLogsByCategory(category: string): Promise<void> {
    try {
      await loggerStorage.clearLogsByCategory(category);
      // Update cache
      this.logsCache = this.logsCache.filter(
        (log) => log.category !== category
      );
      this.notifyListeners();
    } catch (error) {
      console.error('Failed to clear logs by category:', error);
    }
  }

  // Copy logs to clipboard (only message, timestamp, level, category)
  copyLogs(category?: string): string {
    const logs = category ? this.getLogsByCategory(category) : this.getLogs();
    return logs
      .map((log) => {
        const count = log.count && log.count > 1 ? ` (×${log.count})` : '';
        return `[${log.timestamp}] [${log.category}] ${log.level}: ${log.message}${count}`;
      })
      .join('\n');
  }

  // Get logs without grouping (chronological order, duplicates expanded)
  getLogsUngrouped(): LogEntry[] {
    return this.logsCache;
  }

  // Subscribe to log updates
  subscribe(listener: (logs: LogEntry[]) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
}

// Create singleton instance
export const logger = new Logger();

// Initialize logger active state from persisted store
if (typeof window !== 'undefined') {
  try {
    const persistedState = localStorage.getItem('logger-drawer-storage');
    if (persistedState) {
      const parsed = JSON.parse(persistedState);
      const isEnabled = parsed?.state?.isEnabled ?? true; // Default to enabled if not found
      logger.setActive(isEnabled);
    } else {
      // No persisted state, enable logger in development mode by default
      if (isDevelopment) {
        logger.setActive(true);
      }
    }
  } catch (error) {
    console.error('Failed to load logger enabled state:', error);
    // Fallback: enable in development
    if (isDevelopment) {
      logger.setActive(true);
    }
  }
} else if (isDevelopment) {
  // Server-side or non-browser environment
  logger.setActive(true);
}

// Default export
export default logger;
