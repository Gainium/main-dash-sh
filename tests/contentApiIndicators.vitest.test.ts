import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

/**
 * Indicator pages are served by `/indicators`, outside the `/help` listings.
 * The Help Center must load them from there, and keep working against a
 * content server that has no `/indicators` endpoint yet (404).
 */

type Route = { status?: number; body?: unknown };

const INDICATOR = {
  slug: "rsi",
  name: "Relative Strength Index (RSI)",
  kind: "native",
  aliases: ["RSI"],
  category: "momentum",
  description: "What RSI is.",
  tldr: "RSI measures momentum.",
  catalogKeys: ["rsi"],
  updatedAt: "2026-10-01T00:00:00.000Z",
};

const HELP_RSI = {
  metadata: {
    id: 1,
    name: "Relative Strength Index (RSI)",
    slug: "rsi",
    title: "Relative Strength Index (RSI)",
    description: "Old help copy.",
    categories: ["technical-indicators"],
    tags: [],
    tldr: "",
    createdAt: "2023-01-01T00:00:00.000Z",
    updatedAt: "2023-01-01T00:00:00.000Z",
    publishedAt: "2023-01-01T00:00:00.000Z",
    locale: "en",
  },
  content: "help body",
};

const HELP_LISTED = {
  slug: "2fa",
  title: "Enabling 2FA",
  description: "",
  categories: ["account-management"],
  tags: [],
  tldr: "",
  updatedAt: "2024-01-01T00:00:00.000Z",
  publishedAt: "2024-01-01T00:00:00.000Z",
};

const page = (data: unknown[]) => ({
  data,
  pagination: {
    total: data.length,
    page: 1,
    limit: 100,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  },
});

let routes: Record<string, Route>;
let requested: string[];
let signals: (AbortSignal | undefined)[];
/** Paths whose response never arrives (until the request is aborted). */
let hanging: Set<string>;

function installFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input, "http://dashboard.local");
      const key = url.pathname;
      requested.push(key);
      signals.push(init?.signal ?? undefined);
      if (hanging.has(key)) {
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("timed out", "TimeoutError"))
          );
        });
      }
      const route = routes[key] ?? { status: 404, body: "Not found" };
      const status = route.status ?? 200;
      return new Response(
        typeof route.body === "string"
          ? route.body
          : JSON.stringify(route.body),
        { status }
      );
    })
  );
}

async function load() {
  vi.resetModules();
  const api = await import("@/services/contentApi");
  const cache = await import("@/utils/helpArticlesCache");
  return { api, cache };
}

beforeEach(() => {
  routes = {};
  requested = [];
  signals = [];
  hanging = new Set();
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("getHelpArticle", () => {
  test("a known indicator slug loads from /indicators", async () => {
    routes["/indicators/rsi"] = {
      body: { metadata: INDICATOR, content: "indicator body" },
    };
    const { api } = await load();

    const doc = await api.getHelpArticle("rsi", true);

    expect(doc.source).toBe("indicator");
    expect(doc.content).toBe("indicator body");
    expect(doc.metadata.title).toBe(INDICATOR.name);
    expect(doc.metadata.categories).toEqual(["technical-indicators"]);
    expect(requested).toEqual(["/indicators/rsi"]);
  });

  test("a content server without /indicators falls back to /help", async () => {
    routes["/help/rsi"] = { body: HELP_RSI };
    const { api } = await load();

    const doc = await api.getHelpArticle("rsi", true);

    expect(doc.source).toBe("help");
    expect(doc.content).toBe("help body");
    expect(requested).toEqual(["/indicators/rsi", "/help/rsi"]);
  });

  test("an unknown slug is a help doc, with no indicator request", async () => {
    routes["/help/rsi"] = { body: HELP_RSI };
    const { api } = await load();

    const doc = await api.getHelpArticle("rsi");

    expect(doc.source).toBe("help");
    expect(requested).toEqual(["/help/rsi"]);
  });

  test("a help doc without a title is titled by its name", async () => {
    const { title: _omit, ...metadata } = HELP_RSI.metadata;
    routes["/help/rsi"] = { body: { ...HELP_RSI, metadata } };
    const { api } = await load();

    const doc = await api.getHelpArticle("rsi");

    expect(doc.metadata.title).toBe("Relative Strength Index (RSI)");
  });

  test("a help doc marked movedTo loads the indicator page", async () => {
    routes["/help/rsi"] = {
      body: { ...HELP_RSI, movedTo: "/indicators/rsi" },
    };
    routes["/indicators/rsi"] = {
      body: { metadata: INDICATOR, content: "indicator body" },
    };
    const { api } = await load();

    const doc = await api.getHelpArticle("rsi");

    expect(doc.source).toBe("indicator");
    expect(doc.content).toBe("indicator body");
  });

  test("a help 404 tries the indicator page", async () => {
    routes["/indicators/rsi"] = {
      body: { metadata: INDICATOR, content: "indicator body" },
    };
    const { api } = await load();

    const doc = await api.getHelpArticle("rsi");

    expect(doc.source).toBe("indicator");
  });

  test("missing everywhere rejects with the help 404", async () => {
    const { api } = await load();

    await expect(api.getHelpArticle("nope")).rejects.toMatchObject({
      status: 404,
    });
  });

  test("a help server error is not masked by an indicator lookup", async () => {
    routes["/help/rsi"] = { status: 500, body: "boom" };
    const { api } = await load();

    await expect(api.getHelpArticle("rsi")).rejects.toMatchObject({
      status: 500,
    });
    expect(requested).toEqual(["/help/rsi"]);
  });
});

describe("getAllIndicators", () => {
  test("404 means no indicator pages", async () => {
    const { api } = await load();
    await expect(api.getAllIndicators()).resolves.toEqual([]);
  });

  test("other errors propagate", async () => {
    routes["/indicators"] = { status: 503, body: "down" };
    const { api } = await load();
    await expect(api.getAllIndicators()).rejects.toMatchObject({
      status: 503,
    });
  });
});

describe("help-articles cache", () => {
  test("merges live indicator pages into the static help list", async () => {
    routes["/help-articles.json"] = {
      body: { fetchedAt: "x", articles: [HELP_LISTED] },
    };
    routes["/indicators"] = { body: page([INDICATOR]) };
    const { cache } = await load();

    // the static list answers without the indicator pages ...
    const fast = await cache.loadCachedHelpArticles();
    expect(fast.map((a) => a.slug)).toEqual(["2fa"]);
    // ... and the merged list adds them once they load
    const articles = await cache.loadHelpArticlesWithIndicators();
    expect(articles.map((a) => a.slug)).toEqual(["2fa", "rsi"]);
    expect(articles[1].title).toBe(INDICATOR.name);
    await expect(cache.isIndicatorSlug("rsi")).resolves.toBe(true);
    await expect(cache.isIndicatorSlug("2fa")).resolves.toBe(false);
  });

  test("uses indicator pages bundled in the static file without an API call", async () => {
    routes["/help-articles.json"] = {
      body: { fetchedAt: "x", articles: [], indicators: [INDICATOR] },
    };
    const { cache } = await load();

    const articles = await cache.loadCachedHelpArticles();

    expect(articles.map((a) => a.slug)).toEqual(["rsi"]);
    await cache.loadHelpArticlesWithIndicators();
    expect(requested).toEqual(["/help-articles.json"]);
  });

  test("an indicator page replaces the help doc with the same slug", async () => {
    const { cache } = await load();
    const merged = cache.mergeHelpAndIndicators(
      [{ ...HELP_LISTED, slug: "rsi", title: "Old" }, HELP_LISTED],
      [INDICATOR as never]
    );
    expect(merged.map((a) => [a.slug, a.title])).toEqual([
      ["rsi", INDICATOR.name],
      ["2fa", HELP_LISTED.title],
    ]);
  });

  test("no indicators endpoint keeps today's help list", async () => {
    routes["/help-articles.json"] = {
      body: { fetchedAt: "x", articles: [HELP_LISTED] },
    };
    const { cache } = await load();

    const articles = await cache.loadHelpArticlesWithIndicators();

    expect(articles).toEqual([HELP_LISTED]);
    await expect(cache.isIndicatorSlug("rsi")).resolves.toBe(false);
  });
});

describe("compat: indicator pages served as help items", () => {
  const MOVED = {
    ...HELP_LISTED,
    slug: "rsi",
    title: "Relative Strength Index (RSI)",
    categories: ["technical-indicators"],
    movedTo: "/indicators/rsi",
    kind: "native",
  };

  test("a help item marked as moved is an indicator slug", async () => {
    routes["/help-articles.json"] = {
      body: { fetchedAt: "x", articles: [HELP_LISTED, MOVED] },
    };
    const { cache } = await load();

    await expect(cache.isIndicatorSlug("rsi")).resolves.toBe(true);
    await expect(cache.isIndicatorSlug("2fa")).resolves.toBe(false);
  });

  test("the merged list has one entry per slug", async () => {
    routes["/help-articles.json"] = {
      body: { fetchedAt: "x", articles: [HELP_LISTED, MOVED] },
    };
    routes["/indicators"] = { body: page([INDICATOR]) };
    const { cache } = await load();

    const articles = await cache.loadHelpArticlesWithIndicators();

    expect(articles.map((a) => a.slug)).toEqual(["2fa", "rsi"]);
  });

  test("search keeps one result per article, preferring the indicator page", async () => {
    const hit = (source: string, slug: string, extra = {}) => ({
      source,
      slug,
      title: slug,
      description: "",
      match: "",
      relevance: 1,
      ...extra,
    });
    routes["/search"] = {
      body: {
        query: "rsi",
        data: [
          hit("help", "rsi", { movedTo: "/indicators/rsi", kind: "native" }),
          hit("help", "2fa"),
          hit("indicator", "rsi"),
          hit("blog", "rsi"),
          hit("help", "rsi", { movedTo: "/indicators/rsi", kind: "native" }),
        ],
        pagination: page([]).pagination,
      },
    };
    const { api } = await load();

    const res = await api.searchContent("rsi");

    expect(res.data.map((r) => `${r.source}:${r.slug}`)).toEqual([
      "indicator:rsi",
      "help:2fa",
      "blog:rsi",
    ]);
  });

  test("isMovedIndicatorItem", async () => {
    const { api } = await load();
    expect(api.isMovedIndicatorItem({ movedTo: "/indicators/rsi" })).toBe(true);
    expect(api.isMovedIndicatorItem({ kind: "native" })).toBe(true);
    expect(api.isMovedIndicatorItem({})).toBe(false);
    expect(api.isMovedIndicatorItem({ movedTo: "/blog/x" })).toBe(false);
  });
});

describe("request timeout", () => {
  test("every content request carries an abort signal", async () => {
    routes["/help/rsi"] = { body: HELP_RSI };
    const { api } = await load();

    await api.getHelpArticle("rsi");

    expect(signals[0]).toBeInstanceOf(AbortSignal);
  });

  test("a hanging /indicators cannot hold back the static titles", async () => {
    routes["/help-articles.json"] = {
      body: { fetchedAt: "x", articles: [HELP_LISTED] },
    };
    hanging.add("/indicators");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    // drive AbortSignal.timeout from the fake clock
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockImplementation((ms: number) => {
        const controller = new AbortController();
        setTimeout(
          () => controller.abort(new DOMException("timed out", "TimeoutError")),
          ms
        );
        return controller.signal;
      });
    const { cache } = await load();

    const fast = await cache.loadCachedHelpArticles();
    expect(fast.map((a) => a.slug)).toEqual(["2fa"]);

    const merged = cache.loadHelpArticlesWithIndicators();
    await vi.advanceTimersByTimeAsync(8000);
    await expect(merged).resolves.toEqual([HELP_LISTED]);
    expect(timeout).toHaveBeenCalledWith(8000);
    timeout.mockRestore();
  });
});

describe("toInAppArticleHref", () => {
  test("indicator links open the in-app Help Center", async () => {
    const { toInAppArticleHref } = await import("@/utils/helpUrl");
    expect(toInAppArticleHref("/indicators/rsi")).toBe("/help/rsi");
    expect(toInAppArticleHref("https://gainium.io/indicators/rsi")).toBe(
      "/help/rsi"
    );
    expect(toInAppArticleHref("https://www.gainium.io/indicators/rsi/")).toBe(
      "/help/rsi"
    );
    expect(
      toInAppArticleHref("https://gainium.io/indicators/macd?x=1#signal")
    ).toBe("/help/macd#signal");
  });

  test("other links are unchanged", async () => {
    const { toInAppArticleHref } = await import("@/utils/helpUrl");
    for (const href of [
      undefined,
      "/help/2fa",
      "https://gainium.io/blog/rsi",
      "https://gainium.io/indicators",
      "https://example.com/indicators/rsi",
      "https://gainium.io.evil.com/indicators/rsi",
      "mailto:hi@example.com",
      "#faq",
    ]) {
      expect(toInAppArticleHref(href)).toBe(href);
    }
  });
});
