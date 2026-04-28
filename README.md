# MANT Race Planner

A static web tool for planning race schedules in Uma Musume's Trackblazer (Make A New Track) scenario. Build a three-year race schedule, track epithet progress, and understand the trade-offs of each race choice.

## Features

### Plan race schedules and view epithet progress
Select races across all 59 time slots spanning Junior, Classic, and Senior years. The epithet tracker updates in real time as you build your schedule, showing which epithets are earned, in progress, or not yet started.

### Review earned epithets and assess the impact of skipping races
Toggle individual races on and off to see how skipping affects your epithet progress. Epithets that would be lost by skipping a race are flagged as "At Risk" with a clear warning showing which race is blocking them.

### Understand which epithets are close to qualifying
Count-based epithets (region wins, dirt races, name patterns) show progress toward their thresholds. Epithets with partial progress are highlighted as "In Progress" so you can identify which ones are within reach with small schedule adjustments.

### Experimental features
- **Optimizer**: Automatically swap races toward a target distance category (Sprint, Mile, Medium, Long) without reducing earned epithets or downgrading race grades.
- **Crucial race detection**: Identify which races in your schedule cannot be skipped without losing an earned epithet.
- **Import/Export**: Save and load schedules as JSON files to share or back up your plans.
- **Browser persistence**: Optionally save your current schedule to localStorage so it persists across page reloads.

## Data sources

Race data is sourced from [GameTora](https://gametora.com/umamusume/races) and epithet requirements from [uma.guide](https://uma.guide/guides/trackblazer#epithets).

## License

MIT
