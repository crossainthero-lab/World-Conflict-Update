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
  { name: "Reuters World", url: "https://feeds.reuters.com/reuters/worldNews" },
  { name: "AP Top News", url: "https://apnews.com/hub/ap-top-news?output=rss" },
  { name: "Sky News World", url: "https://feeds.skynews.com/feeds/rss/world.xml" },
  { name: "CBS World", url: "https://www.cbsnews.com/latest/rss/world" },
  { name: "ABC News International", url: "https://abcnews.go.com/abcnews/internationalheadlines" },
  { name: "CBC World", url: "https://www.cbc.ca/cmlink/rss-world" },
  { name: "Euronews World", url: "https://www.euronews.com/rss?level=theme&name=news" },
  { name: "RFE/RL Ukraine", url: "https://www.rferl.org/api/zrqiteuuir" },
  { name: "Kyiv Independent", url: "https://kyivindependent.com/news-archive/rss/" },
  { name: "Ukrinform", url: "https://www.ukrinform.net/rss/block-lastnews" }
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

async function fetchGdeltDoc(query, timespan) {
  const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  url.searchParams.set("query", query);
  url.searchParams.set("mode", "artlist");
  url.searchParams.set("format", "json");
  url.searchParams.set("maxrecords", "50");
  url.searchParams.set("sort", "datedesc");
  url.searchParams.set("timespan", timespan);

  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": "WorldConflictUpdate/1.0 (+https://world-conflict-update.pages.dev)"
    }
  });

  if (!response.ok) {
    throw new Error(`GDELT DOC failed: ${response.status}`);
  }

  return response.json();
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

function hasIncidentPreposition(haystack, keyword) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b(?:in|near|at|over|around|outside|inside|across)\\s+(?:the\\s+)?${escaped}\\b`, "i").test(haystack);
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
        let score = normalizedKeyword.length;
        if (location.exactness === "exact") score += 18;
        if (hasIncidentPreposition(haystack, normalizedKeyword)) score += 22;
        score += countTermProximity(haystack, normalizedKeyword, INCIDENT_TERMS) * 9;
        score -= countTermProximity(haystack, normalizedKeyword, ATTRIBUTION_TERMS) * 11;
        if (WEAK_LOCATION_WORDS.has(normalizedKeyword)) score -= 12;
        if (location.exactness !== "exact" && hasMilitaryAssetNear(haystack, normalizedKeyword) && !hasIncidentPreposition(haystack, normalizedKeyword)) score -= 35;
        if (hasActorAttribution(haystack, normalizedKeyword)) score -= 25;

        if (score > bestScore) {
          bestScore = score;
          bestMatch = location;
        }
      }
    }
  }

  return bestScore >= 12 ? bestMatch : null;
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

function matchesConflictKeywords(item, keywords) {
  if (!keywords?.length) return true;
  const text = `${item.title} ${item.description} ${item.normalizedDescription || ""}`.toLowerCase();
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
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
  const response = await fetch(feed.url, {
    headers: {
      "User-Agent": "WorldConflictUpdate/1.0 (+https://world-conflict-update.pages.dev)"
    }
  });

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
  const location = findLocation(`${title} ${description}`, locations);

  if (!location && conflict.id === "world-events") {
    return null;
  }

  const mappedLocation = location || {
    name: `${conflict.title} region`,
    coords: conflict.focus.center,
    exactness: "approximate",
    keywords: []
  };

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
      getOptionalSource("GDELT DOC", () => fetchGdeltDoc(conflict.gdeltQuery, conflict.gdeltTimespan || "6h")),
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
      ).filter((item) => matchesConflictKeywords(item, conflict.sourceKeywords)),
      ...(gdeltResult.ok
        ? normalizeGdeltItems(
            gdeltResult.value,
            conflict.maxAgeHours || 24
          )
        : [])
    ].sort((a, b) => Date.parse(b.reportedAt) - Date.parse(a.reportedAt)).slice(0, 120);

    const locations = [
      ...(locationsMap[conflict.id] || []),
      ...(conflict.id === "world-events" ? [] : locationsMap["world-events"] || [])
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
      .map((result) => `${result.label}: ${result.error}`);

    payload = {
      conflictId: conflict.id,
      sourceLabel: "Google News + GDELT + publisher RSS bundle",
      status: "live",
      refreshIntervalSeconds: conflict.refreshIntervalSeconds,
      lastFetchedAt: new Date().toISOString(),
      message: failedSources.length
        ? `Live events loaded with partial source failures: ${failedSources.join("; ")}`
        : "Live events were refreshed from Google News, GDELT, and multiple publisher RSS feeds with recency filtering.",
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
