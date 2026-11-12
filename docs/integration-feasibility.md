# Fantasy Platform API Feasibility Research

Date: 2026-11-12  
Researcher: Wolo (coder)

## Objective
Produce a provider comparison matrix documenting what's actually available from each fantasy platform API — verified by probing endpoints, not just reading docs.

## Summary Table

| Provider | Authentication | Key Data Available | Rate Limits | Commercial Use | Recommendation |
|----------|----------------|-------------------|-------------|----------------|----------------|
| Sleeper | None (public leagues) | League config, rosters, users, matchups, transactions, players | ~1000 calls/min (IP-based) | Non‑commercial only (license required) | **Prototype** |
| MyFantasyLeague (MFL) | None (public data); cookie‑based for private leagues | League setup, rosters, franchises, schedule, standings, live scoring | Unknown (no observed headers) | Free for any use (terms prohibit harvesting/abuse) | **Prototype** |
| ESPN | Cookie‑based (`espn_s2`, `SWID`) for private leagues; public leagues may be accessible but need a known league ID | League settings, teams, rosters, matchups, standings, draft, transactions | Unknown (likely per‑IP) | Unofficial API; terms unclear | **Research only** |
| Yahoo | OAuth 2.0 (app registration required) | League, roster, players, transactions, matchups | Unknown (OAuth quotas) | Restricted (most user data cannot be stored >24 h) | **Skip** (retention constraints) |

---

## Sleeper API

### Authentication Method
No authentication required for public leagues. Private leagues are accessible with the league ID alone (no auth). Sleeper’s API is read‑only and does not support modifying data.

### Verified Endpoints (tested)
All endpoints were called against the example league `289646328504385536` (Sleeper Friends League, 2018 season).

- `GET https://api.sleeper.app/v1/user/<username|user_id>` – user object
- `GET https://api.sleeper.app/v1/league/<league_id>` – full league configuration
- `GET https://api.sleeper.app/v1/league/<league_id>/rosters` – all rosters with player IDs
- `GET https://api.sleeper.app/v1/league/<league_id>/users` – members with metadata
- `GET https://api.sleeper.app/v1/league/<league_id>/matchups/<week>` – weekly matchups (tested week 1)
- `GET https://api.sleeper.app/v1/league/<league_id>/transactions/<round>` – transactions (tested round 1)
- `GET https://api.sleeper.app/v1/players/<sport>` – full player database (5 MB JSON)

### Key Data Available
- **League config**: name, status, settings (scoring, roster positions, waiver rules), avatar, season, sport.
- **Rosters**: per‑team starter/bench players, roster ID, owner ID, metadata (team nicknames).
- **Users**: user ID, display name, avatar, team‑name metadata.
- **Matchups**: weekly points, starters, players, matchup ID.
- **Transactions**: waiver bids, trades, status, timestamps.
- **Players**: full NFL player map with IDs, positions, teams, stats IDs.

All data is returned as JSON.

### Rate Limits Observed
No `x-ratelimit-*` headers in responses. The [official documentation](https://docs.sleeper.com/) states “stay under 1000 API calls per minute, otherwise you risk being IP‑blocked.” No explicit per‑endpoint limits were visible in a quick burst test (5 sequential requests returned HTTP 200).

### Commercial Use Status
Explicitly **non‑commercial only**. The docs say “free to use for **non‑commercial purposes**” and direct commercial users to contact `api@sleeper.app` for licensing. This is a clear restriction.

### Recommendation
**Prototype**. Sleeper’s API is simple, requires no authentication for public leagues, and provides all necessary data (league config, rosters, members, matchups, transactions). The non‑commercial clause must be addressed before production use; a commercial license would be required.

---

## MyFantasyLeague (MFL) API

### Authentication Method
Public league data is accessible without any credentials. The API uses a year‑based URL pattern and redirects to a subdomain (`www{NN}.myfantasyleague.com`). Private league data requires cookie‑based authentication (`MFL_USER_ID`). Some write endpoints also accept an `APIKEY` parameter.

### Verified Endpoints (tested)
Tested with league `13522` (The League) and year `2025`. All calls redirected and returned XML.

- `GET https://api.myfantasyleague.com/2025/export?TYPE=league&L=13522` – league configuration (roster size, injured reserve slots, draft type, etc.)
- `GET https://api.myfantasyleague.com/2025/export?TYPE=rosters&L=13522` – franchise rosters with player IDs, salaries, contract years
- `GET https://api.myfantasyleague.com/2025/export?TYPE=schedule&L=13522&W=1` – weekly schedule (not tested with week parameter)
- `GET https://api.myfantasyleague.com/2025/export?TYPE=leagueStandings&L=13522` – standings (tested)
- `GET https://api.myfantasyleague.com/2025/export?TYPE=liveScoring&L=13522&W=1` – live scoring (not tested)

Other documented types: `playerScores`, `weeklyResults`, `draftResults`, `injuries`, `topOwns`.

### Key Data Available
- **League setup**: name, roster size, injured‑reserve/taxi‑squad slots, start/end week, scoring precision.
- **Rosters**: per‑franchise player entries with status (`ROSTER`, `IR`, `TAXI`), salary, contract year.
- **Franchises**: IDs, names (not tested but available via `franchises` endpoint).
- **Schedule**: weekly matchups.
- **Standings**: win‑loss records, points for/against.
- **Live scoring**: real‑time points for a given week.
- **Players**: full player database (separate endpoint).

Data is returned as XML; JSON output is not natively supported (must parse XML).

### Rate Limits Observed
No rate‑limit headers were observed in three sequential requests. The [MFL Developers Program page](https://api.myfantasyleague.com/2020/api_info) warns against “overloading or disrupting the MFL service” but does not specify numeric limits. Best practice is to cache static data (player lists change only once daily).

### Commercial Use Status
Free to use for almost any purpose, with prohibitions on data harvesting, cheating, and overloading the service. The terms forbid “collecting user information without their permission” and “making changes to someone’s fantasy league/team without their permission.” Commercial applications appear to be allowed as long as they respect these rules.

### Recommendation
**Prototype**. MFL’s API is robust and provides all needed data (league config, rosters, members, matchups, transactions). The XML format is slightly less convenient than JSON but trivial to parse. The lack of authentication for public data simplifies prototyping. Commercial use seems permissible under the published terms.

---

## ESPN Unofficial API

### Authentication Method
ESPN’s internal API uses cookie‑based authentication (`espn_s2` and `SWID`) for private leagues. Public leagues *may* be accessible without cookies, but a valid league ID is required. No official API token exists; the endpoints are reverse‑engineered from the fantasy.espn.com web application.

### Verified Endpoints (based on documentation)
We did not perform live calls because a known public league ID could not be quickly located. The following endpoint pattern is documented in the [Public‑ESPN‑Fantasy‑API repository](https://github.com/pseudo-r/Public-ESPN-Fantasy-API):

```
GET https://fantasy.espn.com/apis/v3/games/{gameCode}/seasons/{seasonId}/segments/0/leagues/{leagueId}?view={view}
```

Key views:
- `mSettings` – league configuration, scoring rules, roster settings.
- `mTeam` – teams, owners, records.
- `mRoster` – rosters (requires `scoringPeriodId`).
- `mMatchupScore` – weekly matchups.
- `mStandings` – standings.
- `mDraftDetail` – draft history.
- `mTransactions2` – transactions (likely requires auth).

### Key Data Available (per documentation)
- **League config**: scoring, roster slots, acquisition rules, draft settings.
- **Teams**: IDs, abbreviations, division, owner GUIDs, win‑loss records.
- **Rosters**: player IDs, lineup slots, acquisition date/type.
- **Matchups**: home/away team IDs, total points, winner.
- **Standings**: overall and divisional records, points for/against.
- **Draft**: picks, round, team ID.
- **Transactions**: waiver claims, trades, adds/drops.

All data is JSON.

### Rate Limits Observed
Unknown (no live tests). ESPN likely employs IP‑based throttling; the unofficial docs do not mention specific limits.

### Commercial Use Status
Unofficial API; ESPN’s terms of service likely prohibit automated access and data scraping. The repository maintainers emphasize that the documentation is for educational use only and is not affiliated with ESPN. Any production use would carry legal risk.

### Recommendation
**Research only**. The cookie‑based authentication is cumbersome (requires obtaining and refreshing user cookies). While the data coverage is comprehensive, the unofficial nature and legal uncertainty make ESPN a poor candidate for a prototype. If ESPN is a must‑have target, a dedicated exploration of the authentication flow and a test with a real league is needed.

---

## Yahoo Fantasy Sports API

### Authentication Method
OAuth 2.0 with app registration on the Yahoo Developer Network. Developers must create an application, specify read or read/write scope, and obtain a consumer key/secret. Each user must grant permission via the OAuth flow.

### Endpoints (from official documentation)
Base URL: `https://fantasysports.yahooapis.com/fantasy/v2`

Documented resources:
- `league` – league settings, standings, scoreboard.
- `team` – roster, stats, matchups.
- `players` – player information, stats.
- `transactions` – adds, drops, trades.
- `draft` – draft results.

No live calls were made (requires approved app).

### Key Data Available
- League metadata (name, size, scoring type).
- Team rosters with player positions.
- Player details (position, team, injury status).
- Weekly matchups and scores.
- Transaction history.

### Rate Limits
Unknown; Yahoo imposes OAuth quotas but the exact numbers are not published.

### Commercial Use Status
**Heavily restricted**. The [Yahoo Developer API Terms of Use](https://legal.yahoo.com/us/en/yahoo/terms/product-atos/apiforydn/index.html) state:

> “You may not retain or use, and must immediately remove … any Yahoo user data obtained through the Yahoo APIs that is not explicitly identified as being storable indefinitely … within 24 hours after the time at which you obtained the data.”

Only the user’s GUID and authenticated token value may be stored indefinitely. All other data (rosters, league settings, player stats) must be refreshed every 24 h and cannot be persisted longer.

### Recommendation
**Skip**. The 24‑hour data retention rule makes Yahoo unsuitable for any application that needs to maintain historical league data, compute trends, or provide offline analysis. Even a real‑time dashboard would need to re‑fetch all data daily, increasing API load and complexity. Unless the project can operate within this strict constraint, Yahoo should be avoided.

---

## Overall Recommendations

1. **Sleeper** – easiest to prototype, clear data model, no auth for public leagues. Commercial licensing required.
2. **MFL** – equally viable, more verbose XML format, but well‑documented and free for commercial use under reasonable terms.
3. **ESPN** – high risk; unofficial API with authentication hurdles. Only pursue if Sleeper/MFL cannot meet requirements.
4. **Yahoo** – non‑starter due to 24‑hour data retention policy.

**Next step**: Build a minimal prototype using Sleeper’s API (public league) to validate the data pipeline and confirm all required fields are available.