<p align="center">
  <img src="favicon.png" alt="Aniclipse logo" width="160">
</p>

# Aniclipse

**Track your anime challenge, discover what's worth watching next, and level up while you do it.**

🌐 **Live app:** https://www.aniclipse.online/

Aniclipse is a personal anime tracker and discovery app that runs entirely in the browser. Plan a daily watching challenge, keep a backlog, follow live trends, and earn achievements as your list grows.

## Features

- **Challenge planner & AniPace** — log anime day by day, track your watching pace, and see your projected completion date
- **Backlog** — rate titles, move them between backlog and today, add entries manually, and find anything fast with forgiving word-based search (no exact spelling needed) plus genre, year, and type filters
- **Discover & Trends** — live AniList feeds (Trending, Currently Airing, Highest Rated, Most Anticipated) with filters that combine: 18 genres, format, episode length, and AniList tags such as Harem, Isekai, School, and Shounen — plus search and a Surprise Me random pick
- **Full labels on every anime** — each title carries AniList's genres and all of its non-spoiler tags (strongest first). Read Story shows the synopsis, characters, the complete tag list, and where to watch
- **Achievements & stats** — 106 achievements with icons and tiered XP, ranks from Newbie to Veteran, and analytics charts for your genres and studios
- **Backup & restore** — export your whole library to a JSON file and import it back anytime, with automatic safety copies before a restore
- **Cloud sync & leaderboard** — guest cloud sync with a shareable profile code and a global XP leaderboard
- **Social Lounge** — includes a Binge Planner that builds a watching session from your own library

## Data & APIs

- **AniList** (GraphQL) — the main data source: search, feeds, genres, tags, characters, scores
- **Kitsu** — used only for streaming ("where to watch") links
- **Firebase** — anonymous sign-in and cloud storage for your library

Your anime library lives in your browser and your cloud account — not in the APIs. The APIs only fetch information about new titles, so your saved data is never affected by API changes.

## Tech

A single-page app built with plain HTML, CSS, and JavaScript — no build step, no framework. Just open `index.html`, or serve the folder with any static server:

```bash
python3 -m http.server
# then visit http://localhost:8000
```

## Roadmap

- Airing calendar with next-episode countdowns
- Recommendations based on your highest-rated anime
- Episode-by-episode tracking, personal reviews, and custom lists
