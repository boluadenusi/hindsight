# Hindsight

> **"Predict football’s past."**

Hindsight is a football prediction game built around real historical fixtures. The player is presented with the pre-match picture of a genuine historic fixture (competition, date, teams, recorded formations, and full starting elevens), predicts what happened, locks their predictions, and reveals the real match outcome. Every completed fixture contributes to a career memory score: the average percentage of each match the player remembered.

---

## Core Loop Status (Version 1)

1. **Landing Page ("Turnstiles" Index)**: Engaging, nostalgic entry page featuring time-travel football premise, vintage matchday turnstile pass with player career stats, interactive matchday warmup teaser, 3-step matchday ritual walkthrough, and purist features grid.
2. **Fixture Serving & Pre-Match Screen**: Uniform random selection of complete fixtures without repeats. Shows competition, date, clubs, tactical pitch formation diagram, starting elevens, and substitutes bench.
3. **Pre-Match Form Guide**: Displays the 5 most recent competitive fixtures for each team strictly prior to the matchday (W/D/L pills, scoreline, venue H/A, opponent, competition, and date).
4. **Interactive Tactical Pitch Formation**: Chalkboard pitch visual representation mapping starters into their tactical positions and formation rows, supporting direct tap-to-pick goalscorer selection.
5. **Goalscorer Predictions (Starters & Substitutes Bench)**: Players can pick any starter or substitute from the bench who scored. All predictions are optional and locked atomically.
6. **Staged Reveal & Scoring**: Final whistle scoreline drops first, followed by goalscorers with recorded minutes, clubs, points breakdown, and percentage of maximum possible points earned.
7. **Running Average & Next Fixture**: Running average calculated across all played fixtures, comparative performance banner (`Above your average`, `Below your average`, etc.), career ticker in masthead, and "Next fixture →" button.

---

## Database Architecture & Schema Inspection

The application runs on PostgreSQL against the `core` schema. Below is the complete table inventory and column structure inspected directly from `information_schema.columns`.

### Table Inventory (`core` schema)

| Table | Primary Purpose | Row Count / Key Characteristics |
| :--- | :--- | :--- |
| `game` | Match header, dates, clubs, score, formations, referee | 88,958+ games recorded |
| `competition` | Competition names (e.g., Premier League, Champions League) | Referenced by `game.competition_id` |
| `club` | Club names, stadium names | Referenced by `home_club_id` and `away_club_id` |
| `lineup` | Player match involvement (starters & substitutes) | 3,179,016+ rows; filtered by `type = 'starting'` |
| `player` | Player profiles (name, nationality, position, birth date) | Referenced by `lineup.player_id` and `event.player_id` |
| `event` | Match incidents (Goals, Cards, Substitutions, Shootouts) | Goal events contain minute, scorer, club, description |
| `appearance` | Player match statistics (minutes played, goals, cards) | Tracks appearances, yellow/red cards per player |
| `season` | Season definitions | `competition_id`, `season_year` |
| `squad` | Club squad registrations | `club_id`, `player_id`, `season_id` |
| `transfer` | Player transfer history | `from_club_id`, `to_club_id`, `fee`, `transfer_date` |
| `valuation` | Player market valuation timeline | `market_value_in_eur`, `valuation_date` |
| `detail_stub` | Source metadata tracking | Entity tracking from source data |

### Detailed Column Specifications

```sql
-- core.game
id                  integer NOT NULL (PK)
source              text NOT NULL
source_id           text
competition_id      integer NOT NULL (FK -> core.competition.id)
season_id           integer NOT NULL (FK -> core.season.id)
game_date           date
home_club_id        integer NOT NULL (FK -> core.club.id)
away_club_id        integer NOT NULL (FK -> core.club.id)
home_goals          integer
away_goals          integer
round               text
stadium             text
referee             text
attendance          bigint
home_formation      text
away_formation      text
home_manager_name   text
away_manager_name   text
last_seen_at        timestamp without time zone NOT NULL

-- core.lineup
id                  integer NOT NULL (PK)
source              text NOT NULL
source_id           text NOT NULL
game_id             integer NOT NULL (FK -> core.game.id)
player_id           integer NOT NULL (FK -> core.player.id)
club_id             integer NOT NULL (FK -> core.club.id)
type                text (e.g., 'starting', 'substitute')
position            text (e.g., 'Goalkeeper', 'Centre-Back')
shirt_number        text
captain             boolean NOT NULL
last_seen_at        timestamp without time zone NOT NULL

-- core.event
id                  integer NOT NULL (PK)
source              text NOT NULL
source_id           text NOT NULL
game_id             integer NOT NULL (FK -> core.game.id)
minute              integer
type                text (e.g., 'Goals', 'Cards', 'Substitutions')
club_id             integer NOT NULL (FK -> core.club.id)
player_id           integer NOT NULL (FK -> core.player.id)
description         text
player_in_id        integer
player_assist_id    integer
last_seen_at        timestamp without time zone NOT NULL

-- core.appearance
id                  integer NOT NULL (PK)
game_id             integer NOT NULL (FK -> core.game.id)
competition_id      integer NOT NULL
player_id           integer NOT NULL (FK -> core.player.id)
club_id             integer NOT NULL (FK -> core.club.id)
appearance_date     date NOT NULL
minutes_played      integer
goals               integer
assists             integer
yellow_cards        integer
red_cards           integer
last_seen_at        timestamp without time zone NOT NULL
```

---

## Field-by-Field Verification & Gap Handling

| Requested Field | Schema Source | Available? | Handling / Strategy |
| :--- | :--- | :--- | :--- |
| **Date** | `core.game.game_date` | **Yes** | Formatted as localized UK long date (`14 May 2011`). |
| **Competition** | `core.competition.name` | **Yes** | Joined via `game.competition_id = competition.id`. |
| **Home & Away Clubs** | `core.club.name` | **Yes** | Joined via `game.home_club_id` and `game.away_club_id`. |
| **Starting Lineups** | `core.lineup` + `core.player` | **Yes** | Queried where `lineup.type = 'starting'`. Strict filter guarantees 11 distinct named starters per side. |
| **Goals (Scorer & Minute)** | `core.event` (`type = 'Goals'`) | **Yes** | Scorer name joined from `player.name`, minute from `event.minute`. Pre-filtered so event goal counts match `home_goals` and `away_goals`. |
| **Cards** | `core.event` & `core.appearance` | **Partial/Inconsistent** | Red card markers in `event` and `appearance` disagree across historic matches. Omitted from v1 to prevent unreliable scoring. |
| **Man of the Match** | *None* | **No (Gap)** | Schema has no table or column for man of the match. Omitted cleanly; motm scoring points are excluded from fixture maximum. |

---

## How to Retrieve Data

### 1. Selecting Eligible Fixtures
`getEligibleFixtureIds()` in [server.mjs](file:///c:/Users/hp/Documents/Not%20Safe%20For%20Work/hindsight/server.mjs):
```sql
SELECT g.id
FROM core.game g
JOIN core.competition competition ON competition.id = g.competition_id
JOIN core.club home ON home.id = g.home_club_id
JOIN core.club away ON away.id = g.away_club_id
JOIN (
  SELECT l.game_id,
    count(DISTINCT l.player_id) FILTER (WHERE l.club_id = g.home_club_id AND p.name IS NOT NULL) AS home_count,
    count(DISTINCT l.player_id) FILTER (WHERE l.club_id = g.away_club_id AND p.name IS NOT NULL) AS away_count
  FROM core.lineup l
  JOIN core.game g ON g.id = l.game_id
  JOIN core.player p ON p.id = l.player_id
  WHERE l.type = 'starting'
  GROUP BY l.game_id, g.home_club_id, g.away_club_id
) starters ON starters.game_id = g.id
WHERE g.game_date IS NOT NULL AND competition.name IS NOT NULL
  AND home.name IS NOT NULL AND away.name IS NOT NULL
  AND starters.home_count = 11 AND starters.away_count = 11;
```
*Note*: Results are cross-verified against `core.event` so that all goal records have named scorers and the sum of home/away goal events exactly matches `game.home_goals` and `game.away_goals`.

### 2. Pre-Match Fixture API (`POST /api/fixtures/next`)
Serves only pre-match information (teams, formations, 11 starting players each with shirt numbers and positions). Never exposes scores, scorers, or post-kickoff events.

### 3. Match Reveal API (`POST /api/fixtures/:id/reveal`)
Returns the actual match result:
```sql
SELECT g.home_goals, g.away_goals,
  COALESCE(json_agg(json_build_object(
    'playerId', e.player_id,
    'playerName', p.name,
    'team', CASE WHEN e.club_id = g.home_club_id THEN 'home' ELSE 'away' END,
    'minute', e.minute
  ) ORDER BY e.minute NULLS LAST, e.id) FILTER (WHERE e.id IS NOT NULL), '[]'::json) AS goals
FROM core.game g
LEFT JOIN core.event e ON e.game_id = g.id AND e.type = 'Goals'
LEFT JOIN core.player p ON p.id = e.player_id
WHERE g.id = $1
GROUP BY g.id;
```

---

## Scoring Rules & Tuning

All scoring defaults are centralized in [src/scoring.ts](file:///c:/Users/hp/Documents/Not%20Safe%20For%20Work/hindsight/src/scoring.ts):

| Prediction Item | Points | Condition |
| :--- | :--- | :--- |
| Correct Result (Win / Draw / Loss) | `+3` | Predicted direction matches final outcome. |
| Exact Scoreline Bonus | `+5` | Exact home & away goals predicted. |
| Correct Goalscorer Pick | `+3` | Picked starting player scored at least 1 goal. |
| Wrong Goalscorer Pick | `-1` | Picked player did not score. |
| Man of the Match | `+4` | *(Inactive: motm data not present in schema)* |

### Fixture Percentage Calculation
```
Fixture % = max(0, Earned Points / Maximum Possible Points × 100)
```
Where `Maximum Possible Points` = `3 (Result) + 5 (Exact score) + (Actual distinct starting scorers × 3)`.
Storing the fixture score as a percentage normalizes fixtures with 0-0 draws against high-scoring thrillers.

---

## Running Average & Career Statistics

Implemented in `calculateCareerStats()`:
- **Total Played**: Count of all revealed and evaluated fixtures.
- **Running Average**: Mean percentage across all completed fixtures.
- **Prior Running Average**: Average prior to the current fixture.
- **Performance Evaluation**:
  - `Above your average`: Fixture % > Prior Average + 0.05%
  - `Below your average`: Fixture % < Prior Average - 0.05%
  - `Level with your average`: Fixture % within ±0.05% of Prior Average
  - `Opening baseline established`: First completed fixture for the player.

---

## Client State & Browser Storage

Hindsight v1 requires no login accounts. Player progress and history are managed in browser `localStorage`:

- `hindsight.playerId`: UUID uniquely identifying the player's browser session.
- `hindsight.predictions`: Ordered array of prediction snapshots, locks, revealed scores, and evaluations.
- `hindsight.playedFixtureIds`: List of all completed/locked fixture IDs sent to `getNextFixture()` to guarantee no duplicate fixtures are ever served.
- `hindsight.activeFixture`: Current uncompleted pre-match fixture, preserving user state across page reloads.

---

## Running Locally

1. Ensure PostgreSQL is accessible with the `core` schema loaded.
2. Configure `.env`:
   ```env
   DATABASE_URL=postgresql://username:password@localhost:5432/hindsight
   DATABASE_SCHEMA=core
   DATABASE_SSL=false
   PORT=5173
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start development server:
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` in your browser.
5. Build production bundle:
   ```bash
   npm run build
   ```

For hosted deployments, set `DATABASE_URL`, `DATABASE_SCHEMA`, and `DATABASE_SSL`
in the hosting provider's environment settings. The local `.env` file is optional;
environment variables supplied by the host take precedence. Start the production
server with `npm start` after building.
