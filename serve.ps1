param(
  [int]$Port = 8080
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataRoot = Join-Path $root "data"
$cacheRoot = Join-Path $dataRoot "cache"
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")

if (-not (Test-Path -LiteralPath $cacheRoot)) {
  New-Item -ItemType Directory -Path $cacheRoot | Out-Null
}

$contentTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".svg"  = "image/svg+xml"
  ".ico"  = "image/x-icon"
}

function Read-JsonFile {
  param([string]$Path)
  return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
}

function Write-JsonResponse {
  param(
    [System.Net.HttpListenerResponse]$Response,
    [object]$Object,
    [int]$StatusCode = 200
  )

  $payload = $Object | ConvertTo-Json -Depth 12
  $buffer = [System.Text.Encoding]::UTF8.GetBytes($payload)
  $Response.StatusCode = $StatusCode
  $Response.ContentType = "application/json; charset=utf-8"
  $Response.ContentLength64 = $buffer.Length
  $Response.OutputStream.Write($buffer, 0, $buffer.Length)
}

function Write-TextResponse {
  param(
    [System.Net.HttpListenerResponse]$Response,
    [string]$Text,
    [int]$StatusCode = 200
  )

  $buffer = [System.Text.Encoding]::UTF8.GetBytes($Text)
  $Response.StatusCode = $StatusCode
  $Response.ContentType = "text/plain; charset=utf-8"
  $Response.ContentLength64 = $buffer.Length
  $Response.OutputStream.Write($buffer, 0, $buffer.Length)
}

function Get-TargetPath {
  param([string]$RequestedPath)

  $cleanPath = $RequestedPath.Split("?")[0].TrimStart("/")
  if ([string]::IsNullOrWhiteSpace($cleanPath)) {
    $cleanPath = "index.html"
  }

  $relativePath = $cleanPath -replace "/", "\"
  $candidate = Join-Path $root $relativePath

  if (-not (Test-Path -LiteralPath $candidate) -and -not [System.IO.Path]::GetExtension($candidate)) {
    $candidate = Join-Path $candidate "index.html"
  }

  return $candidate
}

function Strip-Html {
  param([string]$Text)

  if ([string]::IsNullOrWhiteSpace($Text)) {
    return ""
  }

  $decoded = [System.Net.WebUtility]::HtmlDecode($Text)
  return ([regex]::Replace($decoded, "<[^>]+>", " ")).Trim()
}

function Get-RegexMatchValue {
  param(
    [string]$Text,
    [string]$Pattern
  )

  if ([string]::IsNullOrWhiteSpace($Text)) {
    return $null
  }

  $match = [regex]::Match($Text, $Pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if ($match.Success) {
    return $match.Groups[1].Value
  }

  return $null
}

function Get-PropertyValue {
  param(
    [object]$Object,
    [string[]]$Names
  )

  if ($null -eq $Object) {
    return $null
  }

  foreach ($name in $Names) {
    $property = $Object.PSObject.Properties[$name]
    if ($property -and $null -ne $property.Value -and "$($property.Value)".Trim() -ne "") {
      return $property.Value
    }
  }

  return $null
}

function Get-SeverityScore {
  param([string]$Text)

  $haystack = $Text.ToLowerInvariant()
  if ($haystack -match "congress|senate|house committee|hearing|bill|resolution|lawmakers" -and $haystack -notmatch "attack|strike|killed|dead|fatal|protest|sanction|oil|pipeline|missile|drone|border|troop|deployment|assassinat") { return 1 }
  if ($haystack -match "condemn|warn|urge|call for|calls for|says|said|statement|responds|reaction|backs|supports" -and $haystack -notmatch "(in|near|at|over)\s+[a-z .'-]{2,40}\s+(after|as|when|following)?\s*(attack|strike|airstrike|bombing|explosion|blast|shelling|protest|riot)") { return 1 }
  if ($haystack -match "nuclear|nuke|assassinat|massacre|mass casualty|hundreds killed|chemical weapon") { return 5 }
  if ($haystack -match "killed|dead|fatal|airstrike|bombing|explosion|missile strike|major attack") { return 4 }
  if ($haystack -match "missile|drone|shelling|strike|attack|raid|blast|retaliation|clash|troop|military|intercept|deployment|warning") { return 3 }
  if ($haystack -match "aid|ceasefire|evacuation|humanitarian|talks|sanction|protest|election|government|president|parliament|oil|pipeline|refinery|tanker") { return 2 }
  return 1
}

function Get-ConflictDefinition {
  param([string]$ConflictId)

  $conflicts = Read-JsonFile -Path (Join-Path $dataRoot "conflicts.json")
  return $conflicts | Where-Object { $_.id -eq $ConflictId } | Select-Object -First 1
}

function Get-FallbackFeed {
  param([object]$Conflict)

  $fallbacks = Read-JsonFile -Path (Join-Path $dataRoot "fallback-events.json")
  return [PSCustomObject]@{
    conflictId = $Conflict.id
    sourceLabel = "Fallback cache"
    status = "fallback"
    refreshIntervalSeconds = $Conflict.refreshIntervalSeconds
    lastFetchedAt = (Get-Date).ToString("o")
    message = "Live RSS ingestion was unavailable, so the app returned the local fallback cache."
    events = $fallbacks.$($Conflict.id)
  }
}

function Get-ConflictLocations {
  param([string]$ConflictId)

  $locations = Read-JsonFile -Path (Join-Path $dataRoot "locations.json")
  return $locations.$ConflictId
}

function Get-GoogleNewsRssItems {
  param([string]$Query)

  $encodedQuery = [System.Uri]::EscapeDataString($Query)
  $url = "https://news.google.com/rss/search?q=$encodedQuery&hl=en-AU&gl=AU&ceid=AU:en"
  $response = Invoke-WebRequest -Uri $url -Headers @{ "User-Agent" = "ConflictAtlasLocalhost/0.1 (+localhost)" }
  [xml]$rss = $response.Content
  return @($rss.rss.channel.item)
}

function Get-GoogleQueries {
  param([object]$Conflict)

  if ($Conflict.PSObject.Properties["rssQueries"] -and $Conflict.rssQueries.Count -gt 0) {
    return @($Conflict.rssQueries | Select-Object -First 12)
  }

  return @($Conflict.rssQuery)
}

function Get-PublishedTimestamp {
  param([string]$PubDate)

  try {
    return [datetimeoffset]::Parse($PubDate).UtcDateTime
  } catch {
    return $null
  }
}

function Filter-RecentRssItems {
  param(
    [object[]]$Items,
    [int]$MaxAgeHours
  )

  $cutoff = (Get-Date).ToUniversalTime().AddHours(-1 * $MaxAgeHours)

  return $Items |
    ForEach-Object {
      $publishedAt = Get-PublishedTimestamp -PubDate ([string]$_.pubDate)
      [PSCustomObject]@{
        Item = $_
        PublishedAt = $publishedAt
      }
    } |
    Where-Object { $null -ne $_.PublishedAt -and $_.PublishedAt -ge $cutoff } |
    Sort-Object PublishedAt -Descending |
    ForEach-Object { $_.Item }
}

function Get-MatchedLocation {
  param(
    [string]$Text,
    [object[]]$Locations
  )

  $haystack = $Text.ToLowerInvariant()
  $weakWords = @("chinese", "russian", "american", "israeli", "iranian", "ukrainian", "lebanese", "british", "turkish", "indian", "pakistani")
  $incidentTerms = @("airstrike", "missile strike", "strike", "bombing", "explosion", "blast", "shelling", "drone", "attack", "raid", "clash", "fighting", "killed", "dead", "fatal", "protest", "riot", "unrest", "border", "incursion", "pipeline", "refinery", "tanker")
  $attributionTerms = @("condemn", "warn", "urge", "says", "said", "statement", "minister", "president", "parliament", "government", "official", "spokesperson", "calls for", "backs", "supports", "announces")
  $bestMatch = $null
  $bestScore = 0

  foreach ($location in $Locations) {
    foreach ($keyword in $location.keywords) {
      $normalizedKeyword = $keyword.ToLowerInvariant()
      $pattern = "(^|[^a-z])$([regex]::Escape($normalizedKeyword))([^a-z]|$)"

      if ($haystack -match $pattern) {
        $score = $normalizedKeyword.Length
        if ($location.exactness -eq "exact") { $score += 18 }
        if ($haystack -match "\b(in|near|at|over|around|outside|inside|across)\s+(the\s+)?$([regex]::Escape($normalizedKeyword))\b") { $score += 22 }
        $start = [Math]::Max(0, $haystack.IndexOf($normalizedKeyword) - 80)
        $length = [Math]::Min($haystack.Length - $start, $normalizedKeyword.Length + 160)
        $window = $haystack.Substring($start, $length)
        foreach ($term in $incidentTerms) {
          if ($window.Contains($term)) { $score += 9 }
        }
        foreach ($term in $attributionTerms) {
          if ($window.Contains($term)) { $score -= 11 }
        }
        $attributionPattern = "\b$([regex]::Escape($normalizedKeyword))\b.{0,50}\b($($attributionTerms -join '|'))\b|\b($($attributionTerms -join '|'))\b.{0,50}\b$([regex]::Escape($normalizedKeyword))\b"
        if ($haystack -match $attributionPattern) { $score -= 25 }
        if ($location.PSObject.Properties["country"] -and $normalizedKeyword -eq $location.country.ToLowerInvariant()) { $score += 4 }
        if ($weakWords -contains $normalizedKeyword) { $score -= 12 }

        if ($score -gt $bestScore) {
          $bestScore = $score
          $bestMatch = $location
        }
      }
    }
  }

  if ($bestScore -ge 12) {
    return $bestMatch
  }

  return $null
}

function Get-ConfidenceFromLocation {
  param(
    [object]$Location,
    [string]$Title,
    [string]$Description
  )

  if ($null -eq $Location) {
    return 1
  }

  $combined = "$Title $Description".ToLowerInvariant()
  $keywordHits = 0
  foreach ($keyword in $Location.keywords) {
    if ($combined.Contains($keyword.ToLowerInvariant())) {
      $keywordHits += 1
    }
  }

  if ($Location.exactness -eq "exact") {
    if ($keywordHits -ge 2) { return 5 }
    return 4
  }

  if ($keywordHits -ge 2) { return 3 }
  return 2
}

function Convert-RssItemToEvent {
  param(
    [object]$Item,
    [object]$Conflict,
    [object[]]$Locations,
    [int]$Index
  )

  $rawTitle = [string]$Item.title
  $description = Strip-Html -Text ([string]$Item.description)
  $combinedText = "$rawTitle $description"
  $location = Get-MatchedLocation -Text $combinedText -Locations $Locations

  if ($null -eq $location) {
    $location = [PSCustomObject]@{
      name = "$($Conflict.title) region"
      coords = $Conflict.focus.center
      exactness = "approximate"
      keywords = @()
    }
  }

  $sourceLabel = "Google News"
  $title = $rawTitle
  if ($rawTitle -match "^(.*) - ([^-]+)$") {
    $title = $matches[1].Trim()
    $sourceLabel = $matches[2].Trim()
  }

  $severity = Get-SeverityScore -Text "$title $description"
  $confidence = Get-ConfidenceFromLocation -Location $location -Title $title -Description $description

  return [PSCustomObject]@{
    id = "$($Conflict.id)-rss-$Index"
    title = $title
    description = if ([string]::IsNullOrWhiteSpace($description)) { "Live article mapped from Google News RSS." } else { $description.Substring(0, [Math]::Min(240, $description.Length)) }
    locationName = $location.name
    coords = @([double]$location.coords[0], [double]$location.coords[1])
    severity = $severity
    confidence = $confidence
    exactness = $location.exactness
    reportedAt = [string]$Item.pubDate
    category = if ($severity -ge 4) { "Attack" } elseif ($severity -eq 3) { "Military" } else { "Developing" }
    sourceLabel = $sourceLabel
    sourceUrl = [string]$Item.link
    sourceType = "google-news-rss"
  }
}

function Deduplicate-Events {
  param([object[]]$Events)

  $seen = New-Object "System.Collections.Generic.HashSet[string]"
  $results = New-Object System.Collections.ArrayList

  foreach ($event in $Events) {
    $key = "$($event.title)|$($event.locationName)"
    if (-not $seen.Contains($key)) {
      [void]$seen.Add($key)
      [void]$results.Add($event)
    }
  }

  return $results
}

function Get-SituationTopic {
  param([string]$Text)

  $haystack = $Text.ToLowerInvariant()
  if ($haystack -match "oil|pipeline|refinery|tanker|fuel|gas|lng|energy|crude") { return "Oil And Energy" }
  if ($haystack -match "president|government|parliament|election|minister|coalition|resign|vote|political") { return "Political Crisis" }
  if ($haystack -match "border|frontier|incursion|cross-border|territory") { return "Border Crisis" }
  if ($haystack -match "military|troop|deployment|army|defence|defense|mobilisation|mobilization") { return "Military Escalation" }
  if ($haystack -match "drone|uav|missile|rocket|intercept|air defence|air defense") { return "Drone And Missile Activity" }
  if ($haystack -match "attack|strike|airstrike|bombing|explosion|blast|raid|shelling") { return "Attack Timeline" }
  if ($haystack -match "sanction|embargo|tariff|asset freeze|blacklist") { return "Sanctions Pressure" }
  if ($haystack -match "protest|riot|unrest|demonstration|clashes|police") { return "Civil Unrest" }
  return "Developing Situation"
}

function Get-CountryName {
  param([object]$Location)

  if ($Location.PSObject.Properties["country"] -and -not [string]::IsNullOrWhiteSpace([string]$Location.country)) {
    return [string]$Location.country
  }

  return ([string]$Location.name).Split(",")[-1].Trim()
}

function Get-CountryFlag {
  param([string]$CountryName)

  $flags = @{
    "Bulgaria" = "🇧🇬"
    "Russia" = "🇷🇺"
    "Ukraine" = "🇺🇦"
    "Israel" = "🇮🇱"
    "Palestine" = "🇵🇸"
    "Iran" = "🇮🇷"
    "United States" = "🇺🇸"
    "China" = "🇨🇳"
    "Taiwan" = "🇹🇼"
    "North Korea" = "🇰🇵"
    "South Korea" = "🇰🇷"
    "Syria" = "🇸🇾"
    "Lebanon" = "🇱🇧"
    "Yemen" = "🇾🇪"
    "Iraq" = "🇮🇶"
    "Pakistan" = "🇵🇰"
    "India" = "🇮🇳"
    "Sudan" = "🇸🇩"
    "Myanmar" = "🇲🇲"
    "Venezuela" = "🇻🇪"
    "Poland" = "🇵🇱"
    "Romania" = "🇷🇴"
    "Moldova" = "🇲🇩"
    "Turkey" = "🇹🇷"
    "United Kingdom" = "🇬🇧"
  }

  if ($flags.ContainsKey($CountryName)) {
    return $flags[$CountryName]
  }

  return ""
}

function Test-LowSignalPoliticalDocument {
  param([string]$Text)

  $haystack = $Text.ToLowerInvariant()
  return (
    $haystack -match "congress|senate|house committee|hearing|bill|resolution|lawmakers|subcommittee" -and
    $haystack -notmatch "attack|strike|killed|dead|fatal|protest|sanction|oil|pipeline|missile|drone|border|troop|deployment|assassinat|coup"
  )
}

function Test-WeakArticle {
  param([string]$Text)

  $haystack = $Text.ToLowerInvariant()
  return $haystack -match "opinion|analysis:|explainer|what we know|what to know|factbox|live updates|newsletter|podcast"
}

function Get-SituationsFeed {
  $cachePath = Join-Path $cacheRoot "situations.json"
  if (Test-Path -LiteralPath $cachePath) {
    $cached = Read-JsonFile -Path $cachePath
    $cacheAge = (Get-Date) - [datetime]$cached.lastFetchedAt
    if ($cacheAge.TotalMinutes -lt 10) {
      return $cached
    }
  }

  try {
    $locations = Get-ConflictLocations -ConflictId "world-events"
    $queries = @(
      "(war OR conflict OR crisis OR military OR strike OR drone OR missile OR protest OR sanctions OR border OR election OR government OR president OR parliament OR attack) when:2d",
      "Bulgaria election president government parliament Russia EU crisis when:7d",
      "Bulgaria political crisis president election government Russia when:7d",
      "oil pipeline refinery tanker energy crisis attack sanctions when:3d",
      "Ukraine frontline Kherson Crimea Donetsk Luhansk Pokrovsk when:2d",
      "Gaza aid Rafah Khan Younis Jabalia strike crisis when:2d",
      "Iran Israel missile drone Hormuz Red Sea crisis when:3d"
    )
    $rssItems = @()
    foreach ($query in $queries) {
      try {
        $rssItems += Get-GoogleNewsRssItems -Query $query
      } catch {
        Write-Warning "Situation query failed: $query"
      }
    }
    $items = Filter-RecentRssItems -Items $rssItems -MaxAgeHours 168
    $groups = @{}

    foreach ($item in $items | Select-Object -First 60) {
      $rawTitle = [string]$item.title
      $description = Strip-Html -Text ([string]$item.description)
      $text = "$rawTitle $description"
      if ((Test-LowSignalPoliticalDocument -Text $text) -or (Test-WeakArticle -Text $text)) { continue }

      $location = Get-MatchedLocation -Text $text -Locations $locations
      if ($null -eq $location) { continue }

      $topic = Get-SituationTopic -Text $text
      $severity = Get-SeverityScore -Text $text
      if ($topic -eq "Developing Situation" -and $severity -lt 3) { continue }
      if ($topic -eq "Political Crisis" -and $severity -lt 2) { continue }
      if (($topic -eq "Political Crisis" -or $topic -eq "Sanctions Pressure") -and $text -notmatch "crisis|resign|collapse|snap election|mass protest|sanction|embargo|asset freeze|blacklist|coup|unrest") { continue }

      $sourceLabel = "Google News"
      $title = $rawTitle
      if ($rawTitle -match "^(.*) - ([^-]+)$") {
        $title = $matches[1].Trim()
        $sourceLabel = $matches[2].Trim()
      }

      $key = "$($location.name)|$topic"
      if (-not $groups.ContainsKey($key)) {
        $countryName = Get-CountryName -Location $location
        $countryFlag = Get-CountryFlag -CountryName $countryName
        $groups[$key] = [PSCustomObject]@{
          id = ($key.ToLowerInvariant() -replace "[^a-z0-9]+", "-").Trim("-")
          title = "$countryFlag $($location.name) $topic".Trim()
          countryName = $countryName
          countryFlag = $countryFlag
          locationName = $location.name
          coords = @([double]$location.coords[0], [double]$location.coords[1])
          exactness = $location.exactness
          topic = $topic
          severity = 1
          confidence = if ($location.exactness -eq "exact") { 4 } else { 3 }
          sourceCount = 1
          latestAt = [string]$item.pubDate
          timeline = @()
        }
      }

      if ($severity -gt $groups[$key].severity) {
        $groups[$key].severity = $severity
      }

      $groups[$key].timeline += [PSCustomObject]@{
        title = $title
        description = if ([string]::IsNullOrWhiteSpace($description)) { "Recent article mapped from Google News RSS." } else { $description.Substring(0, [Math]::Min(180, $description.Length)) }
        reportedAt = [string]$item.pubDate
        sourceLabel = $sourceLabel
        sourceUrl = [string]$item.link
        sourceType = "google-news-rss"
        severity = $severity
      }
    }

    $situations = @($groups.Values) |
      ForEach-Object {
        $_.timeline = @($_.timeline | Sort-Object { [datetimeoffset]::Parse($_.reportedAt) } -Descending | Select-Object -First 8)
        $_.sourceCount = @($_.timeline | Select-Object -ExpandProperty sourceLabel -Unique).Count
        if ($_.topic -eq "Political Crisis" -or $_.topic -eq "Sanctions Pressure") {
          if ($_.timeline.Count -ge 2 -and $_.sourceCount -ge 2) { $_ }
        } elseif ($_.timeline.Count -ge 2 -or $_.sourceCount -ge 2 -or ($_.severity -ge 4 -and $_.exactness -eq "exact")) {
          $_
        }
      } |
      Sort-Object severity -Descending |
      Select-Object -First 12

    $feed = [PSCustomObject]@{
      status = if ($situations.Count -gt 0) { "live" } else { "empty" }
      lastFetchedAt = (Get-Date).ToString("o")
      message = "Situations generated from recent Google News RSS articles."
      situations = $situations
    }

    $feed | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $cachePath -Encoding UTF8
    return $feed
  } catch {
    if (Test-Path -LiteralPath $cachePath) {
      return Read-JsonFile -Path $cachePath
    }

    return [PSCustomObject]@{
      status = "error"
      lastFetchedAt = (Get-Date).ToString("o")
      message = "Situation scan failed: $($_.Exception.Message)"
      situations = @()
    }
  }
}

function Get-LiveFeed {
  param([object]$Conflict)

  $cachePath = Join-Path $cacheRoot "$($Conflict.id).json"
  if (Test-Path -LiteralPath $cachePath) {
    $cached = Read-JsonFile -Path $cachePath
    $cacheAge = (Get-Date) - [datetime]$cached.lastFetchedAt
    if ($cacheAge.TotalSeconds -lt $Conflict.refreshIntervalSeconds) {
      return $cached
    }
  }

  try {
    $locations = Get-ConflictLocations -ConflictId $Conflict.id
    $rssItems = @()
    foreach ($query in (Get-GoogleQueries -Conflict $Conflict)) {
      try {
        $rssItems += Get-GoogleNewsRssItems -Query $query
      } catch {
        Write-Warning "Google News query failed: $query"
      }
    }
    $items = Filter-RecentRssItems -Items $rssItems -MaxAgeHours $Conflict.maxAgeHours
    $events = @()
    $index = 0

    foreach ($item in $items | Select-Object -First 90) {
      $index += 1
      $events += Convert-RssItemToEvent -Item $item -Conflict $Conflict -Locations $locations -Index $index
    }

    $events = Deduplicate-Events -Events $events
    if ($events.Count -eq 0) {
      throw "No sufficiently recent live events were returned from the RSS feed."
    }

    $feed = [PSCustomObject]@{
      conflictId = $Conflict.id
      sourceLabel = "Google News RSS via localhost mapper"
      status = "live"
      refreshIntervalSeconds = $Conflict.refreshIntervalSeconds
      lastFetchedAt = (Get-Date).ToString("o")
      message = "Live events were refreshed from Google News RSS and mapped onto conflict-specific locations."
      events = $events
    }

    $feed | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $cachePath -Encoding UTF8
    return $feed
  } catch {
    if (Test-Path -LiteralPath $cachePath) {
      $cached = Read-JsonFile -Path $cachePath
      $cached.status = "fallback"
      $cached.message = "Live refresh failed, so the app is serving the most recent cached RSS dataset."
      return $cached
    }

    return Get-FallbackFeed -Conflict $Conflict
  }
}

function Handle-ApiRequest {
  param(
    [System.Net.HttpListenerContext]$Context
  )

  $path = $Context.Request.Url.AbsolutePath
  switch ($path) {
    "/api/conflicts" {
      Write-JsonResponse -Response $Context.Response -Object (Read-JsonFile -Path (Join-Path $dataRoot "conflicts.json"))
      return $true
    }
    "/api/events" {
      $conflictId = $Context.Request.QueryString["conflict"]
      if ([string]::IsNullOrWhiteSpace($conflictId)) {
        Write-JsonResponse -Response $Context.Response -Object @{ error = "Missing conflict parameter." } -StatusCode 400
        return $true
      }

      $conflict = Get-ConflictDefinition -ConflictId $conflictId
      if ($null -eq $conflict) {
        Write-JsonResponse -Response $Context.Response -Object @{ error = "Unknown conflict id." } -StatusCode 404
        return $true
      }

      Write-JsonResponse -Response $Context.Response -Object (Get-LiveFeed -Conflict $conflict)
      return $true
    }
    "/api/situations" {
      Write-JsonResponse -Response $Context.Response -Object (Get-SituationsFeed)
      return $true
    }
    default {
      return $false
    }
  }
}

try {
  $listener.Start()
  Write-Host "Serving $root at http://localhost:$Port"
  Write-Host "Open http://localhost:$Port in your browser."
  Write-Host "Press Ctrl+C to stop."

  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $response = $context.Response

    try {
      if (Handle-ApiRequest -Context $context) {
        continue
      }

      $requestedPath = $context.Request.Url.AbsolutePath
      $targetPath = Get-TargetPath -RequestedPath $requestedPath
      $resolvedPath = [System.IO.Path]::GetFullPath($targetPath)

      if (-not $resolvedPath.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Blocked path traversal."
      }

      if (-not (Test-Path -LiteralPath $resolvedPath -PathType Leaf)) {
        Write-TextResponse -Response $response -Text "Not Found" -StatusCode 404
        continue
      }

      $extension = [System.IO.Path]::GetExtension($resolvedPath).ToLowerInvariant()
      $response.ContentType = $contentTypes[$extension]
      if (-not $response.ContentType) {
        $response.ContentType = "application/octet-stream"
      }

      $bytes = [System.IO.File]::ReadAllBytes($resolvedPath)
      $response.ContentLength64 = $bytes.Length
      $response.OutputStream.Write($bytes, 0, $bytes.Length)
    } catch {
      Write-TextResponse -Response $response -Text "Server Error: $($_.Exception.Message)" -StatusCode 500
    } finally {
      $response.OutputStream.Close()
    }
  }
} finally {
  if ($listener.IsListening) {
    $listener.Stop()
  }
  $listener.Close()
}
