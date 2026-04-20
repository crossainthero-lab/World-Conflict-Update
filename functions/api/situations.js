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
  { name: "Euronews World", url: "https://www.euronews.com/rss?level=theme&name=news" }
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

const COUNTRY_FLAGS = {
  Bulgaria: "\ud83c\udde7\ud83c\uddec",
  Russia: "\ud83c\uddf7\ud83c\uddfa",
  Ukraine: "\ud83c\uddfa\ud83c\udde6",
  Israel: "\ud83c\uddee\ud83c\uddf1",
  Palestine: "\ud83c\uddf5\ud83c\uddf8",
  Iran: "\ud83c\uddee\ud83c\uddf7",
  "United States": "\ud83c\uddfa\ud83c\uddf8",
  China: "\ud83c\udde8\ud83c\uddf3",
  Taiwan: "\ud83c\uddf9\ud83c\uddfc",
  "North Korea": "\ud83c\uddf0\ud83c\uddf5",
  "South Korea": "\ud83c\uddf0\ud83c\uddf7",
  Syria: "\ud83c\uddf8\ud83c\uddfe",
  Lebanon: "\ud83c\uddf1\ud83c\udde7",
  Yemen: "\ud83c\uddfe\ud83c\uddea",
  Iraq: "\ud83c\uddee\ud83c\uddf6",
  Pakistan: "\ud83c\uddf5\ud83c\uddf0",
  India: "\ud83c\uddee\ud83c\uddf3",
  Sudan: "\ud83c\uddf8\ud83c\udde9",
  Myanmar: "\ud83c\uddf2\ud83c\uddf2",
  Venezuela: "\ud83c\uddfb\ud83c\uddea",
  Poland: "\ud83c\uddf5\ud83c\uddf1",
  Romania: "\ud83c\uddf7\ud83c\uddf4",
  Moldova: "\ud83c\uddf2\ud83c\udde9",
  Turkey: "\ud83c\uddf9\ud83c\uddf7",
  "United Kingdom": "\ud83c\uddec\ud83c\udde7"
};

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
  "pakistani"
]);

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

  let bestMatch = null;
  let bestScore = 0;

  for (const location of rankedLocations) {
    for (const keyword of location.keywords) {
      const normalizedKeyword = keyword.toLowerCase();
      const pattern = new RegExp(`(^|[^a-z])${normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`, "i");

      if (pattern.test(haystack)) {
        let score = normalizedKeyword.length;
        if (location.exactness === "exact") score += 15;
        if (location.country && normalizedKeyword === location.country.toLowerCase()) score += 10;
        if (WEAK_LOCATION_WORDS.has(normalizedKeyword)) score -= 12;

        if (score > bestScore) {
          bestScore = score;
          bestMatch = location;
        }
      }
    }
  }

  return bestScore >= 5 ? bestMatch : null;
}

function getCountryName(location) {
  return location.country || location.name.split(",").pop().trim();
}

function getCountryFlag(countryName) {
  return COUNTRY_FLAGS[countryName] || "";
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

function buildSituationGroups(items, locations) {
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
      countryName: getCountryName(location),
      countryFlag: getCountryFlag(getCountryName(location)),
      title: `${getCountryFlag(getCountryName(location))} ${location.name} ${topic.label}`.trim(),
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

  const situations = [...groups.values()]
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
      return Date.parse(b.latestAt) - Date.parse(a.latestAt);
    })
    .slice(0, 36);

  const countryGroups = new Map();
  situations.forEach((situation) => {
    const key = situation.countryName;
    const group = countryGroups.get(key) || {
      id: `country-${key.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`,
      type: "group",
      title: `${getCountryFlag(key)} ${key} Situation Group`.trim(),
      countryName: key,
      countryFlag: getCountryFlag(key),
      locationName: key,
      coords: situation.coords,
      exactness: "approximate",
      severity: 1,
      sourceCount: 0,
      latestAt: situation.latestAt,
      situations: []
    };

    group.situations.push(situation);
    group.severity = Math.max(group.severity, situation.severity);
    group.latestAt =
      Date.parse(situation.latestAt) > Date.parse(group.latestAt)
        ? situation.latestAt
        : group.latestAt;
    countryGroups.set(key, group);
  });

  return [...countryGroups.values()]
    .map((group) => {
      const sourceLabels = new Set(
        group.situations.flatMap((situation) =>
          situation.timeline.map((item) => item.sourceLabel)
        )
      );
      const sortedSituations = group.situations.sort((a, b) => Date.parse(b.latestAt) - Date.parse(a.latestAt));

      const totalUpdates = sortedSituations.reduce((count, situation) => {
        return count + situation.timeline.length;
      }, 0);

      if (totalUpdates === 1) {
        return {
          type: "single",
          ...sortedSituations[0]
        };
      }

      return {
        ...group,
        sourceCount: sourceLabels.size,
        updateCount: totalUpdates,
        situations: sortedSituations.slice(0, 8),
        timeline: sortedSituations.flatMap((situation) => situation.timeline).sort((a, b) => Date.parse(b.reportedAt) - Date.parse(a.reportedAt)).slice(0, 10)
      };
    })
    .sort((a, b) => Date.parse(b.latestAt) - Date.parse(a.latestAt))
    .slice(0, 16);
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

    const situations = buildSituationGroups(items, worldLocations);
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
