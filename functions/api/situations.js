function decodeHtmlEntities(text) {
  return (text || "")
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

const SITUATION_QUERIES = [
  "(war OR conflict OR crisis OR military OR strike OR drone OR missile OR protest OR sanctions OR border OR election OR government OR president OR parliament OR attack) when:2d",
  "Bulgaria election president government parliament Russia EU crisis when:7d",
  "Bulgaria political crisis president election government Russia when:7d",
  "oil pipeline refinery tanker energy crisis attack sanctions when:3d",
  "Ukraine frontline Kherson Crimea Donetsk Luhansk Pokrovsk when:2d",
  "Gaza aid Rafah Khan Younis Jabalia strike crisis when:2d",
  "Iran Israel missile drone Hormuz Red Sea crisis when:3d"
];

const TOPICS = [
  {
    label: "Oil And Energy",
    keywords: ["oil", "pipeline", "refinery", "tanker", "fuel", "gas", "lng", "energy", "crude"]
  },
  {
    label: "Political Crisis",
    keywords: ["president", "government", "parliament", "election", "minister", "coalition", "resign", "vote", "political", "party", "opposition"]
  },
  {
    label: "Border Crisis",
    keywords: ["border", "frontier", "incursion", "cross-border", "territory"]
  },
  {
    label: "Military Escalation",
    keywords: ["military", "troop", "deployment", "army", "defence", "defense", "mobilisation", "mobilization"]
  },
  {
    label: "Drone And Missile Activity",
    keywords: ["drone", "uav", "missile", "rocket", "intercept", "air defence", "air defense"]
  },
  {
    label: "Attack Timeline",
    keywords: ["attack", "strike", "airstrike", "bombing", "explosion", "blast", "raid", "shelling"]
  },
  {
    label: "Sanctions Pressure",
    keywords: ["sanction", "embargo", "tariff", "asset freeze", "blacklist"]
  },
  {
    label: "Civil Unrest",
    keywords: ["protest", "riot", "unrest", "demonstration", "clashes", "police"]
  }
];

function stripHtml(text) {
  return decodeHtmlEntities(text).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
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

function filterRecentItems(items, maxAgeHours = 168) {
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

function severityScore(text) {
  const haystack = text.toLowerCase();
  if (/(congress|senate|house committee|hearing|bill|resolution|lawmakers)/.test(haystack) && !/(attack|strike|killed|dead|fatal|protest|sanction|oil|pipeline|missile|drone|border|troop|deployment|assassinat)/.test(haystack)) return 1;
  if (/(nuclear|nuke|assassinat|massacre|mass casualty|hundreds killed|chemical weapon)/.test(haystack)) return 5;
  if (/(killed|dead|fatal|airstrike|bombing|explosion|missile strike|major attack)/.test(haystack)) return 4;
  if (/(missile|drone|shelling|strike|attack|raid|blast|retaliation|clash|troop|military|intercept|deployment|warning)/.test(haystack)) return 3;
  if (/(crisis|sanction|protest|election|government|president|parliament|oil|pipeline|refinery|tanker|energy)/.test(haystack)) return 2;
  return 1;
}

function isLowSignalPoliticalDocument(text) {
  const haystack = text.toLowerCase();
  return (
    /(congress|senate|house committee|hearing|bill|resolution|lawmakers|subcommittee)/.test(haystack) &&
    !/(attack|strike|killed|dead|fatal|protest|sanction|oil|pipeline|missile|drone|border|troop|deployment|assassinat|coup)/.test(haystack)
  );
}

function findLocation(text, locations) {
  const haystack = text.toLowerCase();
  const rankedLocations = [...locations].sort((a, b) => {
    if (a.exactness !== b.exactness) {
      return a.exactness === "exact" ? -1 : 1;
    }

    const longestA = Math.max(...a.keywords.map((keyword) => keyword.length));
    const longestB = Math.max(...b.keywords.map((keyword) => keyword.length));
    return longestB - longestA;
  });

  for (const location of rankedLocations) {
    for (const keyword of location.keywords) {
      if (haystack.includes(keyword.toLowerCase())) {
        return location;
      }
    }
  }

  return null;
}

function detectTopic(text) {
  const haystack = text.toLowerCase();
  return (
    TOPICS.find((topic) =>
      topic.keywords.some((keyword) => haystack.includes(keyword))
    ) || { label: "Developing Situation", keywords: [] }
  );
}

function normalizeGoogleNewsItems(items) {
  return filterRecentItems(items).map((item) => {
    const sourceMatch = item.title.match(/^(.*) - ([^-]+)$/);
    return {
      title: sourceMatch ? sourceMatch[1].trim() : item.title,
      sourceLabel: sourceMatch ? sourceMatch[2].trim() : "Google News",
      description: stripHtml(item.description) || "Recent article mapped from Google News RSS.",
      sourceUrl: item.link,
      reportedAt: new Date(item._publishedAt).toISOString(),
      _publishedAt: item._publishedAt,
      sourceType: "google-news-rss"
    };
  });
}

function normalizePublisherItems(items) {
  return filterRecentItems(items).map((item) => ({
    title: item.title,
    sourceLabel: item.sourceName || "Publisher RSS",
    description: stripHtml(item.description) || "Recent article mapped from publisher RSS.",
    sourceUrl: item.link,
    reportedAt: new Date(item._publishedAt).toISOString(),
    _publishedAt: item._publishedAt,
    sourceType: "publisher-rss"
  }));
}

function dedupeTimeline(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

function buildSituations(items, locations) {
  const groups = new Map();

  items.forEach((item) => {
    const text = `${item.title} ${item.description}`;
    if (isLowSignalPoliticalDocument(text)) {
      return;
    }

    const location = findLocation(text, locations);
    if (!location) return;

    const topic = detectTopic(text);
    const severity = severityScore(text);
    if (topic.label === "Developing Situation" && severity < 3) {
      return;
    }
    if (topic.label === "Political Crisis" && severity < 2) {
      return;
    }

    const groupKey = `${location.name}|${topic.label}`;
    const group = groups.get(groupKey) || {
      id: groupKey.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
      title: `${location.name} ${topic.label}`,
      locationName: location.name,
      coords: location.coords,
      exactness: location.exactness,
      topic: topic.label,
      severity: 1,
      sourceCount: 0,
      latestAt: item.reportedAt,
      timeline: []
    };

    group.severity = Math.max(group.severity, severity);
    group.latestAt =
      Date.parse(item.reportedAt) > Date.parse(group.latestAt)
        ? item.reportedAt
        : group.latestAt;
    group.timeline.push({
      title: item.title,
      description: item.description.slice(0, 180),
      reportedAt: item.reportedAt,
      sourceLabel: item.sourceLabel,
      sourceUrl: item.sourceUrl,
      sourceType: item.sourceType,
      severity
    });

    groups.set(groupKey, group);
  });

  return [...groups.values()]
    .map((group) => {
      const timeline = dedupeTimeline(group.timeline)
        .sort((a, b) => Date.parse(b.reportedAt) - Date.parse(a.reportedAt))
        .slice(0, 8);
      const uniqueSources = new Set(timeline.map((item) => item.sourceLabel));

      return {
        ...group,
        sourceCount: uniqueSources.size,
        timeline,
        confidence: group.exactness === "exact" ? 4 : 3
      };
    })
    .filter((group) => group.timeline.length >= 1)
    .sort((a, b) => {
      const severityDelta = b.severity - a.severity;
      if (severityDelta) return severityDelta;
      return Date.parse(b.latestAt) - Date.parse(a.latestAt);
    })
    .slice(0, 12);
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const origin = url.origin;

  try {
    const locationsMap = await loadStaticJson(origin, "/data/locations.json");
    const worldLocations = locationsMap["world-events"] || [];
    const [googleResults, publisherResults] = await Promise.all([
      Promise.all(
        SITUATION_QUERIES.map((query) =>
          getOptionalSource(`Google News: ${query}`, () => fetchGoogleNewsRss(query))
        )
      ),
      Promise.all(
        NEWS_FEEDS.map((feed) =>
          getOptionalSource(feed.name, () => fetchRssFeed(feed))
        )
      )
    ]);

    const publisherItems = publisherResults.flatMap((result) => {
      if (!result.ok || !result.value?.text) return [];
      return parseRssItems(result.value.text, result.value.sourceName);
    });

    const items = [
      ...normalizeGoogleNewsItems(
        googleResults.flatMap((result) =>
          result.ok ? parseRssItems(result.value, "Google News") : []
        )
      ),
      ...normalizePublisherItems(publisherItems)
    ].sort((a, b) => b._publishedAt - a._publishedAt);

    const situations = buildSituations(items, worldLocations);
    const failedSources = [...googleResults, ...publisherResults]
      .filter((result) => !result.ok)
      .map((result) => `${result.label}: ${result.error}`);

    return Response.json(
      {
        status: situations.length ? "live" : "empty",
        lastFetchedAt: new Date().toISOString(),
        message: failedSources.length
          ? `Situations loaded with partial source failures: ${failedSources.join("; ")}`
          : "Situations generated from recent Google News and publisher RSS articles.",
        situations
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    return Response.json(
      {
        status: "error",
        lastFetchedAt: new Date().toISOString(),
        message: error.message,
        situations: []
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  }
}
