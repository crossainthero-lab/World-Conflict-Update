function decodeHtmlEntities(text) {
  return text
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

const NEWS_FEEDS = [
  { name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { name: "The Guardian World", url: "https://www.theguardian.com/world/rss" },
  { name: "NPR World", url: "https://feeds.npr.org/1004/rss.xml" },
  { name: "France 24", url: "https://www.france24.com/en/rss" },
  { name: "DW News", url: "https://rss.dw.com/xml/rss-en-all" },
  { name: "UN News", url: "https://news.un.org/feed/subscribe/en/news/all/rss.xml" },
  { name: "AP Top News", url: "https://apnews.com/hub/ap-top-news?output=rss" },
  { name: "Sky News World", url: "https://feeds.skynews.com/feeds/rss/world.xml" },
  { name: "CBS World", url: "https://www.cbsnews.com/latest/rss/world" },
  { name: "ABC News International", url: "https://abcnews.go.com/abcnews/internationalheadlines" },
  { name: "Euronews World", url: "https://www.euronews.com/rss?level=theme&name=news" },
  { name: "The Hill International", url: "https://thehill.com/policy/international/feed/" },
  { name: "The Moscow Times", url: "https://www.themoscowtimes.com/rss/news" },
  { name: "Meduza English", url: "https://meduza.io/rss/en/all" },
  { name: "RFE/RL Ukraine", url: "https://www.rferl.org/api/zrqiteuuir" },
  { name: "Kyiv Independent", url: "https://kyivindependent.com/news-archive/rss/" },
  { name: "Ukrinform", url: "https://www.ukrinform.net/rss/block-lastnews" },
  { name: "Euromaidan Press", url: "https://euromaidanpress.com/feed/" },
  { name: "Militarnyi English", url: "https://militarnyi.com/en/feed/" },
  { name: "Jerusalem Post", url: "https://www.jpost.com/rss/rssfeedsheadlines.aspx" },
  { name: "Middle East Eye", url: "https://www.middleeasteye.net/rss" },
  { name: "Arab News", url: "https://www.arabnews.com/rss.xml" }
];

function stripHtml(text) {
  return decodeHtmlEntities(text || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function severityScore(text) {
  const haystack = text.toLowerCase();
  if (/(condemn|warn|urge|call for|says|said|statement|responds|reaction|backs|supports)/.test(haystack) && !/(in|near|at|over)\s+[a-z .'-]{2,40}\s+(?:after|as|when|following)?\s*(?:attack|strike|airstrike|bombing|explosion|blast|shelling)/.test(haystack)) return 1;
  if (/(nuclear|nuke|assassinat|massacre|mass casualty|hundreds killed|chemical weapon)/.test(haystack)) return 5;
  if (/(killed|dead|fatal|airstrike|bombing|explosion|missile strike|major attack)/.test(haystack)) return 4;
  if (/(missile|drone|shelling|strike|attack|raid|blast|retaliation|clash|troop|military|intercept|deployment|warning)/.test(haystack)) return 3;
  if (/(aid|ceasefire|evacuation|humanitarian|talks|sanction|protest|election|government|president|parliament|oil|pipeline|refinery|tanker)/.test(haystack)) return 2;
  return 1;
}

function confidenceFromLocation(location, title, description) {
  if (!location) return 1;

  const combined = `${title} ${description}`.toLowerCase();
  const hits = location.keywords.reduce((count, keyword) => {
    return combined.includes(keyword.toLowerCase()) ? count + 1 : count;
  }, 0);

  if (location.exactness === "exact") {
    return hits >= 2 ? 5 : 4;
  }

  return hits >= 2 ? 3 : 2;
}

function parseXmlTag(block, tagName) {
  const match = block.match(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</${tagName}>`, "i"));
  return match ? decodeHtmlEntities(match[1].trim()) : "";
}

function parseRssItems(xmlText, sourceName = "RSS") {
  const rssItems = [...xmlText.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => {
    const block = match[1];
    return {
      title: parseXmlTag(block, "title"),
      link: parseXmlTag(block, "link"),
      description: parseXmlTag(block, "description"),
      pubDate: parseXmlTag(block, "pubDate"),
      sourceName
    };
  });

  const atomItems = [...xmlText.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].map((match) => {
    const block = match[1];
    const linkMatch = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i);
    return {
      title: parseXmlTag(block, "title"),
      link: linkMatch ? decodeHtmlEntities(linkMatch[1]) : parseXmlTag(block, "link"),
      description: parseXmlTag(block, "summary") || parseXmlTag(block, "content"),
      pubDate: parseXmlTag(block, "updated") || parseXmlTag(block, "published"),
      sourceName
    };
  });

  return [...rssItems, ...atomItems].filter((item) => item.title && item.link);
}

function parsePublishedAt(pubDate) {
  const timestamp = Date.parse(pubDate || "");
  return Number.isNaN(timestamp) ? null : timestamp;
}

function filterRecentItems(items, maxAgeHours) {
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
  const now = Date.now();

  return items
    .map((item) => ({
      ...item,
      _publishedAt: parsePublishedAt(item.pubDate)
    }))
    .filter((item) => item._publishedAt && now - item._publishedAt <= maxAgeMs)
    .sort((a, b) => b._publishedAt - a._publishedAt);
}

function normalizeGdeltDate(seenDate) {
  const raw = `${seenDate || ""}`.replace(/\D/g, "");
  if (raw.length < 14) {
    return null;
  }

  const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}Z`;
  const timestamp = Date.parse(iso);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function createGdeltUrl(query, timespan) {
  const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  url.searchParams.set("query", query);
  url.searchParams.set("mode", "artlist");
  url.searchParams.set("format", "json");
  url.searchParams.set("maxrecords", "25");
  url.searchParams.set("sort", "datedesc");
  url.searchParams.set("timespan", timespan || "24h");
  return url;
}

async function fetchGdeltDoc(query, timespan, context) {
  const url = createGdeltUrl(query, timespan);
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const cacheKey = new Request(`https://world-conflict-update.local/gdelt-doc?${url.searchParams.toString()}`);
  const cachedResponse = cache ? await cache.match(cacheKey) : null;

  if (cachedResponse) {
    return {
      ...(await cachedResponse.json()),
      _cacheStatus: "hit"
    };
  }

  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": "WorldConflictUpdate/1.0 (+https://world-conflict-update.pages.dev)"
    },
    cf: {
      cacheEverything: true,
      cacheTtl: 1800
    }
  });

  if (!response.ok) {
    throw new Error(`GDELT DOC failed: ${response.status}`);
  }

  const payload = await response.json();

  if (cache) {
    const responseToCache = Response.json(payload, {
      headers: {
        "Cache-Control": "public, max-age=1800"
      }
    });
    context?.waitUntil?.(cache.put(cacheKey, responseToCache));
  }

  return {
    ...payload,
    _cacheStatus: "live"
  };
}

const INCIDENT_TERMS = [
  "airstrike",
  "missile strike",
  "strike",
  "bombing",
  "explosion",
  "blast",
  "shelling",
  "drone",
  "attack",
  "raid",
  "clash",
  "fighting",
  "killed",
  "dead",
  "fatal"
];

const ATTRIBUTION_TERMS = [
  "condemn",
  "warn",
  "urge",
  "says",
  "said",
  "statement",
  "minister",
  "president",
  "parliament",
  "government",
  "official",
  "spokesperson",
  "calls for",
  "claim",
  "claims",
  "claimed",
  "backs",
  "supports",
  "announces"
];

const MILITARY_ASSET_TERMS = [
  "warship",
  "destroyer",
  "carrier",
  "vessel",
  "ship",
  "base",
  "troops",
  "forces",
  "soldiers",
  "navy",
  "military",
  "aircraft",
  "jet",
  "drone",
  "missile"
];

const WEAK_LOCATION_WORDS = new Set([
  "chinese",
  "russian",
  "american",
  "israeli",
  "iranian",
  "ukrainian",
  "lebanese",
  "british",
  "turkish",
  "indian",
  "pakistani",
  "u.s.",
  "usa",
  "us military",
  "united states"
]);

function countTermProximity(haystack, keyword, terms, radius = 70) {
  const index = haystack.indexOf(keyword);
  if (index < 0) return 0;
  const start = Math.max(0, index - radius);
  const end = Math.min(haystack.length, index + keyword.length + radius);
  const window = haystack.slice(start, end);
  return terms.reduce((count, term) => count + (window.includes(term) ? 1 : 0), 0);
}

function isCountryScaleLocation(location) {
  return location.exactness !== "exact" && location.country === location.name;
}

function hasIncidentPreposition(haystack, keyword) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b(?:in|near|at|over|around|outside|inside|across)\\s+(?:the\\s+)?${escaped}\\b`, "i").test(haystack);
}

function hasPoliticalSubjectAnchor(haystack, keyword) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b.{0,80}\\b(?:election|president|government|parliament|minister|coalition|vote|party|opposition|political|crisis)\\b|\\b(?:election|president|government|parliament|minister|coalition|vote|party|opposition|political|crisis)\\b.{0,80}\\b${escaped}\\b`, "i").test(haystack);
}

function hasSubjectOnlyPreposition(haystack, keyword) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b(?:about|against|over|toward|towards|concerning|regarding)\\s+(?:the\\s+)?${escaped}\\b`, "i").test(haystack);
}

function hasHeadlineMention(haystack, keyword) {
  return haystack.slice(0, 140).includes(keyword);
}

function hasActorAttribution(haystack, keyword) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b.{0,45}\\b(?:${ATTRIBUTION_TERMS.join("|")})\\b|\\b(?:${ATTRIBUTION_TERMS.join("|")})\\b.{0,45}\\b${escaped}\\b`, "i").test(haystack);
}

function hasMilitaryAssetNear(haystack, keyword) {
  return countTermProximity(haystack, keyword, MILITARY_ASSET_TERMS, 35) > 0;
}

function findLocation(text, locations) {
  const haystack = text.toLowerCase();
  let bestMatch = null;
  let bestScore = 0;

  for (const location of locations) {
    for (const keyword of location.keywords) {
      const normalizedKeyword = keyword.toLowerCase();
      const escaped = normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, "i");

      if (pattern.test(haystack)) {
        const explicitIncidentAnchor = hasIncidentPreposition(haystack, normalizedKeyword);
        const politicalSubjectAnchor = hasPoliticalSubjectAnchor(haystack, normalizedKeyword);
        const actorAttribution = hasActorAttribution(haystack, normalizedKeyword);
        const militaryAssetMention = hasMilitaryAssetNear(haystack, normalizedKeyword);
        const subjectOnlyMention = hasSubjectOnlyPreposition(haystack, normalizedKeyword);
        const weakCountryMention =
          isCountryScaleLocation(location) &&
          !explicitIncidentAnchor &&
          (actorAttribution || militaryAssetMention || subjectOnlyMention || WEAK_LOCATION_WORDS.has(normalizedKeyword));

        if (weakCountryMention) {
          continue;
        }

        let score = normalizedKeyword.length;
        if (location.exactness === "exact") score += 18;
        if (hasHeadlineMention(haystack, normalizedKeyword)) score += 12;
        if (explicitIncidentAnchor) score += 35;
        if (politicalSubjectAnchor) score += 18;
        score += countTermProximity(haystack, normalizedKeyword, INCIDENT_TERMS) * 9;
        score -= countTermProximity(haystack, normalizedKeyword, ATTRIBUTION_TERMS) * 11;
        if (WEAK_LOCATION_WORDS.has(normalizedKeyword)) score -= 12;
        if (location.exactness !== "exact" && hasMilitaryAssetNear(haystack, normalizedKeyword) && !explicitIncidentAnchor) score -= 35;
        if (actorAttribution) score -= 25;

        if (score > bestScore) {
          bestScore = score;
          bestMatch = location;
        }
      }
    }
  }

  return bestScore >= 18 ? bestMatch : null;
}

function deduplicateEvents(events) {
  const seen = new Set();
  return events.filter((event) => {
    const normalizedTitle = event.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const key = `${normalizedTitle}|${event.locationName}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const CONFLICT_RELEVANCE = {
  "russia-ukraine": {
    requiredAny: [
      "ukraine",
      "ukrainian",
      "kyiv",
      "kiev",
      "kharkiv",
      "odesa",
      "odessa",
      "dnipro",
      "zaporizh",
      "sumy",
      "kherson",
      "donetsk",
      "luhansk",
      "crimea",
      "donbas",
      "pokrovsk",
      "kupiansk",
      "kramatorsk",
      "sloviansk",
      "toretsk",
      "bakhmut",
      "avdiivka",
      "belgorod",
      "kursk",
      "taganrog"
    ],
    contextAny: ["russia", "russian", "drone", "missile", "shelling", "strike", "attack", "frontline", "war"]
  },
  "israel-gaza": {
    requiredAny: [
      "gaza",
      "rafah",
      "khan younis",
      "deir al-balah",
      "deir al balah",
      "jabalia",
      "beit hanoun",
      "west bank",
      "jenin",
      "tulkarm",
      "palestinian",
      "palestine",
      "hamas"
    ],
    contextAny: ["israel", "israeli", "idf", "strike", "raid", "shelling", "aid", "ceasefire", "hostage", "rocket"]
  },
  lebanon: {
    requiredAny: [
      "lebanon",
      "lebanese",
      "hezbollah",
      "beirut",
      "tyre",
      "sidon",
      "nabatieh",
      "baalbek",
      "bekaa",
      "litani",
      "blue line",
      "southern lebanon",
      "south lebanon"
    ],
    contextAny: [
      "israel",
      "israeli",
      "idf",
      "border",
      "strike",
      "airstrike",
      "drone",
      "missile",
      "shelling",
      "attack",
      "clash",
      "rocket",
      "displacement",
      "evacuation"
    ]
  },
  "israel-iran-usa": {
    requiredAny: [
      "iran",
      "iranian",
      "tehran",
      "isfahan",
      "natanz",
      "fordow",
      "hormuz",
      "persian gulf",
      "gulf of oman",
      "red sea",
      "houthi",
      "yemen",
      "sanaa"
    ],
    contextAny: [
      "israel",
      "israeli",
      "united states",
      "u.s.",
      "us navy",
      "us military",
      "missile",
      "drone",
      "strike",
      "attack",
      "retaliation",
      "intercept",
      "deployment"
    ]
  }
};

const LOW_VALUE_FEED_TERMS = [
  "sports",
  "entertainment",
  "celebrity",
  "movie",
  "football",
  "basketball",
  "transfer",
  "stock market",
  "recipe"
];

const MARKER_ACTION_TERMS = [
  "airstrike",
  "strike",
  "shelling",
  "missile",
  "drone",
  "attack",
  "clash",
  "clashes",
  "fighting",
  "killed",
  "dead",
  "injured",
  "explosion",
  "blast",
  "raid",
  "rocket",
  "intercept",
  "interception",
  "deployment",
  "deployed",
  "evacuation",
  "evacuated",
  "displacement",
  "displaced",
  "incursion",
  "frontline",
  "border fire",
  "aid convoy",
  "unrest",
  "sanction",
  "pipeline",
  "refinery",
  "tanker"
];

function includesAny(text, terms = []) {
  return terms.some((term) => text.includes(term));
}

function matchesConflictKeywords(item, conflict) {
  if (conflict.id === "world-events") return true;

  const text = `${item.normalizedTitle || item.title || ""} ${item.normalizedDescription || item.description || ""}`.toLowerCase();
  const rule = CONFLICT_RELEVANCE[conflict.id];
  if (!rule) return includesAny(text, conflict.sourceKeywords || []);
  if (includesAny(text, LOW_VALUE_FEED_TERMS)) return false;

  const hasRequiredAnchor = includesAny(text, rule.requiredAny);
  const hasContext = includesAny(text, rule.contextAny);
  const hasMarkerAction = includesAny(text, MARKER_ACTION_TERMS);

  return hasRequiredAnchor && hasContext && hasMarkerAction;
}

async function loadStaticJson(origin, path) {
  const response = await fetch(`${origin}${path}`);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }

  return response.json();
}

async function fetchGoogleNewsRss(query) {
  const url = new URL("https://news.google.com/rss/search");
  url.searchParams.set("q", query);
  url.searchParams.set("hl", "en-AU");
  url.searchParams.set("gl", "AU");
  url.searchParams.set("ceid", "AU:en");

  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": "WorldConflictUpdate/1.0 (+https://world-conflict-update.pages.dev)"
    }
  });

  if (!response.ok) {
    throw new Error(`Google News RSS failed: ${response.status}`);
  }

  return response.text();
}

function getGoogleQueries(conflict) {
  const queries = Array.isArray(conflict.rssQueries) && conflict.rssQueries.length
    ? conflict.rssQueries
    : [conflict.rssQuery];

  return queries.filter(Boolean).slice(0, 12);
}

async function fetchRssFeed(feed) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);

  const response = await fetch(feed.url, {
    signal: controller.signal,
    headers: {
      "User-Agent": "WorldConflictUpdate/1.0 (+https://world-conflict-update.pages.dev)"
    }
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    throw new Error(`${feed.name} RSS failed: ${response.status}`);
  }

  return {
    sourceName: feed.name,
    text: await response.text()
  };
}

function toEvent(item, conflict, locations, index) {
  const title = item.normalizedTitle;
  const sourceLabel = item.normalizedSourceLabel;
  const description = item.normalizedDescription;

  if (!matchesConflictKeywords(item, conflict)) {
    return null;
  }

  const location = findLocation(`${title} ${description}`, locations);

  if (!location) {
    return null;
  }

  const mappedLocation = location;

  const severity = severityScore(`${title} ${description}`);
  const confidence = confidenceFromLocation(mappedLocation, title, description);

  return {
    id: `${conflict.id}-${item.sourceType}-${index}`,
    title,
    description: description.slice(0, 240),
    locationName: mappedLocation.name,
    coords: mappedLocation.coords,
    severity,
    confidence,
    exactness: mappedLocation.exactness,
    reportedAt: item.reportedAt,
    category: severity >= 4 ? "Attack" : severity === 3 ? "Military" : "Developing",
    sourceLabel,
    sourceUrl: item.link,
    sourceType: item.sourceType
  };
}

function normalizeGoogleNewsItems(items, maxAgeHours) {
  return filterRecentItems(items, maxAgeHours).map((item) => {
    const sourceMatch = item.title.match(/^(.*) - ([^-]+)$/);
    return {
      ...item,
      normalizedTitle: sourceMatch ? sourceMatch[1].trim() : item.title,
      normalizedSourceLabel: sourceMatch ? sourceMatch[2].trim() : "Google News",
      normalizedDescription: stripHtml(item.description) || "Live article mapped from Google News RSS.",
      reportedAt: item.pubDate,
      sourceType: "google-news-rss"
    };
  });
}

function normalizePublisherRssItems(items, maxAgeHours) {
  return filterRecentItems(items, maxAgeHours).map((item) => ({
    ...item,
    normalizedTitle: item.title,
    normalizedSourceLabel: item.sourceName || "RSS",
    normalizedDescription: stripHtml(item.description) || "Live article mapped from publisher RSS.",
    reportedAt: item.pubDate,
    sourceType: "publisher-rss"
  }));
}

function normalizeGdeltItems(payload, maxAgeHours) {
  const articles = Array.isArray(payload?.articles) ? payload.articles : [];
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
  const now = Date.now();

  return articles
    .map((article) => {
      const publishedAt = normalizeGdeltDate(article.seendate || article.socialimage_timestamp || article.date);
      return {
        title: article.title || "",
        link: article.url || article.url_mobile || "",
        normalizedTitle: article.title || "",
        normalizedSourceLabel: article.domain || article.sourcecountry || "GDELT",
        normalizedDescription:
          article.snippet ||
          article.title ||
          "Live article mapped from GDELT DOC 2.0.",
        reportedAt: publishedAt ? new Date(publishedAt).toISOString() : "",
        _publishedAt: publishedAt,
        sourceType: "gdelt-doc"
      };
    })
    .filter((item) => item.normalizedTitle && item.link && item._publishedAt && now - item._publishedAt <= maxAgeMs)
    .sort((a, b) => b._publishedAt - a._publishedAt);
}

async function getOptionalSource(label, fetcher) {
  try {
    return {
      label,
      ok: true,
      value: await fetcher()
    };
  } catch (error) {
    return {
      label,
      ok: false,
      error: error.message
    };
  }
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const conflictId = url.searchParams.get("conflict");

  if (!conflictId) {
    return Response.json({ error: "Missing conflict parameter." }, { status: 400 });
  }

  const origin = url.origin;
  const [conflicts, locationsMap, fallbackMap] = await Promise.all([
    loadStaticJson(origin, "/data/conflicts.json"),
    loadStaticJson(origin, "/data/locations.json"),
    loadStaticJson(origin, "/data/fallback-events.json")
  ]);

  const conflict = conflicts.find((item) => item.id === conflictId);
  if (!conflict) {
    return Response.json({ error: "Unknown conflict id." }, { status: 404 });
  }

  let payload;

  try {
    const googleQueries = getGoogleQueries(conflict);
    const [gdeltResult, ...sourceResults] = await Promise.all([
      getOptionalSource("GDELT DOC", () => fetchGdeltDoc(conflict.gdeltQuery, conflict.gdeltTimespan || "24h", context)),
      ...googleQueries.map((query) =>
        getOptionalSource(`Google News: ${query}`, () => fetchGoogleNewsRss(query))
      ),
      ...NEWS_FEEDS.map((feed) =>
        getOptionalSource(feed.name, () => fetchRssFeed(feed))
      )
    ]);
    const googleResults = sourceResults.slice(0, googleQueries.length);
    const publisherResults = sourceResults.slice(googleQueries.length);

    const publisherItems = publisherResults.flatMap((result) => {
      if (!result.ok || !result.value?.text) return [];
      return parseRssItems(result.value.text, result.value.sourceName);
    });
    const googleItems = googleResults.flatMap((result) => {
      if (!result.ok || !result.value) return [];
      return parseRssItems(result.value, "Google News");
    });

    const items = [
      ...normalizeGoogleNewsItems(
        googleItems,
        conflict.maxAgeHours || 24
      ),
      ...normalizePublisherRssItems(
        publisherItems,
        conflict.maxAgeHours || 24
      ),
      ...(gdeltResult.ok
        ? normalizeGdeltItems(
            gdeltResult.value,
            conflict.maxAgeHours || 24
          )
        : [])
    ].sort((a, b) => Date.parse(b.reportedAt) - Date.parse(a.reportedAt)).slice(0, 120);

    const locations = [
      ...(locationsMap[conflict.id] || []),
      ...(conflict.id === "world-events" ? locationsMap["world-events"] || [] : [])
    ];
    const events = deduplicateEvents(
      items
        .map((item, index) => toEvent(item, conflict, locations, index + 1))
        .filter(Boolean)
    );

    if (!events.length) {
      throw new Error("No sufficiently recent live events were returned from the RSS feed.");
    }

    const failedSources = [gdeltResult, ...googleResults, ...publisherResults]
      .filter((result) => !result.ok)
      .map((result) => `${result.label}: ${result.error}`)
      .slice(0, 4);
    const gdeltCacheStatus = gdeltResult.ok ? gdeltResult.value?._cacheStatus : "failed";

    payload = {
      conflictId: conflict.id,
      sourceLabel: "Google News + GDELT + publisher RSS bundle",
      status: "live",
      refreshIntervalSeconds: conflict.refreshIntervalSeconds,
      lastFetchedAt: new Date().toISOString(),
      message: failedSources.length
        ? `Live events loaded with partial source failures: ${failedSources.join("; ")}`
        : gdeltResult.ok
          ? `Live events were refreshed from Google News, ${gdeltCacheStatus === "hit" ? "cached GDELT" : "live GDELT"}, and publisher RSS feeds with recency filtering.`
          : "Live events were refreshed from Google News and publisher RSS. GDELT is still unavailable for this request.",
      events
    };
  } catch (error) {
    payload = {
      conflictId: conflict.id,
      sourceLabel: "Fallback cache",
      status: "fallback",
      refreshIntervalSeconds: conflict.refreshIntervalSeconds,
      lastFetchedAt: new Date().toISOString(),
      message: `Live refresh failed, so the app returned fallback data. ${error.message}`,
      events: fallbackMap[conflict.id] || []
    };
  }

  const response = Response.json(payload, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
  return response;
}
