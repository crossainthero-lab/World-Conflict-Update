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

function stripHtml(text) {
  return decodeHtmlEntities(text).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseXmlTag(block, tagName) {
  const match = block.match(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</${tagName}>`, "i"));
  return match ? decodeHtmlEntities(match[1].trim()) : "";
}

function parseRssItems(xmlText, sourceName = "RSS") {
  return [...xmlText.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
    .map((match) => {
      const block = match[1];
      return {
        title: parseXmlTag(block, "title"),
        link: parseXmlTag(block, "link"),
        description: stripHtml(parseXmlTag(block, "description")),
        pubDate: parseXmlTag(block, "pubDate"),
        sourceName
      };
    })
    .filter((item) => item.title && item.link);
}

function parsePublishedAt(pubDate) {
  const timestamp = Date.parse(pubDate || "");
  return Number.isNaN(timestamp) ? null : timestamp;
}

function normalizeCountryName(country) {
  const aliases = {
    "United States of America": "United States",
    "Dem. Rep. Congo": "Democratic Republic of the Congo",
    "Central African Rep.": "Central African Republic",
    "Dominican Rep.": "Dominican Republic",
    "Eq. Guinea": "Equatorial Guinea",
    "eSwatini": "Eswatini",
    "Bosnia and Herz.": "Bosnia and Herzegovina",
    "S. Sudan": "South Sudan",
    "W. Sahara": "Western Sahara",
    "C\u00f4te d'Ivoire": "Ivory Coast"
  };

  return aliases[country] || country;
}

async function fetchCountryOverview(country) {
  const searchName = normalizeCountryName(country);
  const url = new URL(`https://restcountries.com/v3.1/name/${encodeURIComponent(searchName)}`);
  url.searchParams.set("fields", "name,capital,region,subregion,population");

  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": "WorldConflictUpdate/1.0 (+https://world-conflict-update.pages.dev)"
    }
  });

  if (!response.ok) {
    throw new Error(`Country overview failed: ${response.status}`);
  }

  const [countryData] = await response.json();
  const officialName = countryData?.name?.common || searchName;
  const region = [countryData?.region, countryData?.subregion].filter(Boolean).join(" / ");

  return {
    country: officialName,
    overview: {
      capital: countryData?.capital?.[0] || "",
      region,
      population: countryData?.population || 0,
      summary: `${officialName} is in ${region || "an unspecified region"}. This panel tracks recent reporting connected to the country and nearby security events.`
    }
  };
}

async function fetchGoogleNews(country) {
  const queryCountry = normalizeCountryName(country);
  const url = new URL("https://news.google.com/rss/search");
  url.searchParams.set("q", `"${queryCountry}" conflict OR military OR strike OR protest OR sanctions OR election OR crisis when:3d`);
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

function normalizeNews(items, country) {
  const countryNeedle = normalizeCountryName(country).toLowerCase();
  const maxAgeMs = 72 * 60 * 60 * 1000;
  const now = Date.now();

  return items
    .map((item) => {
      const sourceMatch = item.title.match(/^(.*) - ([^-]+)$/);
      const title = sourceMatch ? sourceMatch[1].trim() : item.title;
      const sourceLabel = sourceMatch ? sourceMatch[2].trim() : item.sourceName;
      const publishedAt = parsePublishedAt(item.pubDate);

      return {
        title,
        sourceLabel,
        sourceUrl: item.link,
        reportedAt: publishedAt ? new Date(publishedAt).toISOString() : "",
        _publishedAt: publishedAt,
        _haystack: `${title} ${item.description}`.toLowerCase()
      };
    })
    .filter((item) => {
      return (
        item._publishedAt &&
        now - item._publishedAt <= maxAgeMs &&
        item._haystack.includes(countryNeedle)
      );
    })
    .sort((a, b) => b._publishedAt - a._publishedAt)
    .slice(0, 8)
    .map(({ _publishedAt, _haystack, ...item }) => item);
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const country = url.searchParams.get("country");

  if (!country) {
    return Response.json({ error: "Missing country parameter." }, { status: 400 });
  }

  let overviewPayload = {
    country: normalizeCountryName(country),
    overview: {
      capital: "",
      region: "",
      population: 0,
      summary: "Country overview is temporarily unavailable. Recent reporting is shown below when available."
    }
  };

  try {
    overviewPayload = await fetchCountryOverview(country);
  } catch {
    // Keep the country click useful even if the overview service is unavailable.
  }

  let news = [];
  let message = "Recent country news loaded from Google News RSS.";

  try {
    const rssText = await fetchGoogleNews(country);
    news = normalizeNews(parseRssItems(rssText, "Google News"), country);
  } catch (error) {
    message = `Recent country news failed: ${error.message}`;
  }

  return Response.json(
    {
      ...overviewPayload,
      message,
      news
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
