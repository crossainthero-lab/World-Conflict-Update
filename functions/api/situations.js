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
  { name: "AP Top News", url: "https://apnews.com/hub/ap-top-news?output=rss" },
  { name: "Sky News World", url: "https://feeds.skynews.com/feeds/rss/world.xml" },
  { name: "CBS World", url: "https://www.cbsnews.com/latest/rss/world" },
  { name: "ABC News International", url: "https://abcnews.go.com/abcnews/internationalheadlines" },
  { name: "Euronews World", url: "https://www.euronews.com/rss?level=theme&name=news" },
  { name: "The Hill International", url: "https://thehill.com/policy/international/feed/" },
  { name: "The Moscow Times", url: "https://www.themoscowtimes.com/rss/news" },
  { name: "Meduza English", url: "https://meduza.io/rss/en/all" },
  { name: "Kyiv Independent", url: "https://kyivindependent.com/news-archive/rss/" },
  { name: "Ukrinform", url: "https://www.ukrinform.net/rss/block-lastnews" },
  { name: "Euromaidan Press", url: "https://euromaidanpress.com/feed/" },
  { name: "Militarnyi English", url: "https://militarnyi.com/en/feed/" },
  { name: "Jerusalem Post", url: "https://www.jpost.com/rss/rssfeedsheadlines.aspx" },
  { name: "Middle East Eye", url: "https://www.middleeasteye.net/rss" },
  { name: "Arab News", url: "https://www.arabnews.com/rss.xml" }
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

const COUNTRY_ALIASES = {
  Bulgaria: ["bulgaria", "bulgarian"],
  Russia: ["russia", "russian", "moscow", "kremlin"],
  Ukraine: ["ukraine", "ukrainian", "kyiv", "kiev"],
  Israel: ["israel", "israeli", "idf"],
  Palestine: ["palestine", "palestinian", "gaza", "hamas", "west bank"],
  Iran: ["iran", "iranian", "tehran"],
  "United States": ["united states", "u.s.", "usa", "us protest", "us protests", "us protesters", "us demonstrators", "us navy", "us military", "american", "washington"],
  China: ["china", "chinese", "beijing"],
  Taiwan: ["taiwan", "taiwanese", "taipei"],
  "North Korea": ["north korea", "pyongyang"],
  "South Korea": ["south korea", "seoul"],
  Syria: ["syria", "syrian", "damascus"],
  Lebanon: ["lebanon", "lebanese", "hezbollah", "beirut"],
  Yemen: ["yemen", "yemeni", "houthi", "sanaa", "sana'a"],
  Iraq: ["iraq", "iraqi", "baghdad"],
  Pakistan: ["pakistan", "pakistani", "islamabad"],
  India: ["india", "indian", "new delhi"],
  Sudan: ["sudan", "sudanese", "khartoum", "darfur"],
  Myanmar: ["myanmar", "burma"],
  Venezuela: ["venezuela", "venezuelan", "caracas"],
  Poland: ["poland", "polish", "warsaw"],
  Romania: ["romania", "romanian", "bucharest"],
  Moldova: ["moldova", "moldovan", "chisinau", "transnistria"],
  Turkey: ["turkey", "turkish", "ankara", "istanbul"],
  "United Kingdom": ["united kingdom", "u.k.", "uk ", "britain", "british", "london"]
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
  "pakistani",
  "u.s.",
  "usa",
  "us military",
  "united states"
]);

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
  "fatal",
  "protest",
  "riot",
  "unrest",
  "border",
  "incursion",
  "pipeline",
  "refinery",
  "tanker"
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

const WEAK_ARTICLE_TERMS = [
  "opinion",
  "analysis:",
  "explainer",
  "what we know",
  "what to know",
  "factbox",
  "live updates",
  "newsletter",
  "podcast"
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
  if (/(condemn|warn|urge|call for|calls for|says|said|statement|responds|reaction|backs|supports)/.test(haystack) && !/(in|near|at|over)\s+[a-z .'-]{2,40}\s+(?:after|as|when|following)?\s*(?:attack|strike|airstrike|bombing|explosion|blast|shelling|protest|riot)/.test(haystack)) return 1;
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

function isWeakArticle(text) {
  const haystack = text.toLowerCase();
  return WEAK_ARTICLE_TERMS.some((term) => haystack.includes(term));
}

function countTermProximity(haystack, keyword, terms, radius = 80) {
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
  return new RegExp(`\\b${escaped}\\b.{0,50}\\b(?:${ATTRIBUTION_TERMS.join("|")})\\b|\\b(?:${ATTRIBUTION_TERMS.join("|")})\\b.{0,50}\\b${escaped}\\b`, "i").test(haystack);
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
      const pattern = new RegExp(`(^|[^a-z])${normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`, "i");

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
        if (location.country && normalizedKeyword === location.country.toLowerCase()) score += 4;
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

function getCountryName(location) {
  return location.country || location.name.split(",").pop().trim();
}

function getCountryFlag(countryName) {
  return COUNTRY_FLAGS[countryName] || "";
}

function hasAlias(text, alias) {
  const escaped = alias.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, "i").test(text);
}

function extractInvolvedCountries(text, location) {
  const haystack = ` ${text.toLowerCase()} `;
  const countries = new Set();

  if (location) {
    countries.add(getCountryName(location));
  }

  Object.entries(COUNTRY_ALIASES).forEach(([country, aliases]) => {
    if (aliases.some((alias) => hasAlias(haystack, alias))) {
      countries.add(country);
    }
  });

  return [...countries].sort();
}

function formatCountrySet(countries) {
  return countries.join(" / ");
}

function formatCountryFlags(countries) {
  return countries.map(getCountryFlag).filter(Boolean).join(" ");
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
    if (isLowSignalPoliticalDocument(text) || isWeakArticle(text)) {
      return;
    }

    const topic = detectTopic(text);
    const severity = severityScore(text);
    let location = findLocation(text, locations);
    const involvedCountries = extractInvolvedCountries(text, location);
    if (!location) return;

    const involvedCountryName = formatCountrySet(involvedCountries);
    const involvedFlags = formatCountryFlags(involvedCountries);

    if (topic.label === "Developing Situation" && severity < 3) {
      return;
    }
    if (topic.label === "Political Crisis" && severity < 2) {
      return;
    }
    if (["Political Crisis", "Sanctions Pressure"].includes(topic.label) && !/(crisis|resign|collapse|snap election|mass protest|sanction|embargo|asset freeze|blacklist|coup|unrest)/i.test(text)) {
      return;
    }

    const groupKey = `${involvedCountryName}|${location.name}|${topic.label}`;
    const group = groups.get(groupKey) || {
      id: groupKey.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
      countryName: getCountryName(location),
      countryFlag: getCountryFlag(getCountryName(location)),
      involvedCountries,
      involvedFlags,
      title: `${involvedFlags || getCountryFlag(getCountryName(location))} ${involvedCountryName || location.name} ${topic.label}`.trim(),
      locationName: location.name,
      primaryLocationName: location.name,
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
      severity,
      involvedCountries,
      locationName: location.name
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
    .filter((group) => {
      const uniqueSources = new Set(group.timeline.map((item) => item.sourceLabel));
      if (group.topic === "Political Crisis" || group.topic === "Sanctions Pressure") {
        return group.timeline.length >= 2 && uniqueSources.size >= 2;
      }
      return group.timeline.length >= 2 || uniqueSources.size >= 2 || (group.severity >= 4 && group.exactness === "exact");
    })
    .sort((a, b) => {
      return Date.parse(b.latestAt) - Date.parse(a.latestAt);
    })
    .slice(0, 36);

  const countryGroups = new Map();
  situations.forEach((situation) => {
    const key = situation.involvedCountries?.length
      ? formatCountrySet(situation.involvedCountries)
      : situation.countryName;
    const flags = situation.involvedCountries?.length
      ? formatCountryFlags(situation.involvedCountries)
      : getCountryFlag(key);
    const group = countryGroups.get(key) || {
      id: `country-${key.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`,
      type: "group",
      title: `${flags} ${key} Situation Group`.trim(),
      countryName: key,
      countryFlag: flags,
      involvedCountries: situation.involvedCountries || [situation.countryName],
      involvedFlags: flags,
      locationName: key,
      coords: situation.coords,
      exactness: "approximate",
      severity: 1,
      sourceCount: 0,
      latestAt: situation.latestAt,
      situations: []
    };

    group.situations.push(situation);
    group.involvedCountries = [...new Set([...group.involvedCountries, ...(situation.involvedCountries || [])])].sort();
    group.involvedFlags = formatCountryFlags(group.involvedCountries);
    group.title = `${group.involvedFlags} ${formatCountrySet(group.involvedCountries)} Situation Group`.trim();
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
      .map((result) => `${result.label}: ${result.error}`)
      .slice(0, 4);

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
