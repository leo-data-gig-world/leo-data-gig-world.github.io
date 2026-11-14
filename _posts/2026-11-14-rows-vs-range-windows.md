---
title: "ROWS vs RANGE: the window frame that lies when a day goes missing"
description: A trailing 7-day average built with ROWS silently becomes a 9-day average the first time a pipeline misses a day. Why RANGE frames matter for time series, with a tested example.
date: 2026-11-14 12:00:00 +0000
tags: [SQL, data quality]
---

Most trailing averages in SQL look like this:

```sql
avg(price) over (
    partition by card_id
    order by price_date
    rows between 7 preceding and 1 preceding
)
```

It reads as "the previous 7 days". It isn't. It's **the previous 7 rows**, and the two only match while every day has exactly one row. The first time a pipeline misses a day, or a source skips a weekend, the window quietly stretches to cover more than a week. Nothing errors, and every number downstream is subtly wrong.

## The fix: frame by value, not by row

```sql
avg(price) over (
    partition by card_id
    order by price_date
    range between interval 7 days preceding and interval 1 day preceding
)
```

A `RANGE` frame is defined by the **values** of the ordering column, so the window is always the 7 calendar days before the current row, however many rows that turns out to be. A missing day just means fewer rows in the window, which is the truth.

The syntax differs by warehouse. DuckDB and Postgres accept intervals as above. BigQuery's `RANGE` needs a single numeric ordering key, so order by `UNIX_DATE(price_date)` and write `range between 7 preceding and 1 preceding`.

## The same trap in `lag()`

"Change vs yesterday" is usually written with `lag(price) over (... order by price_date)`. `lag()` is row-based too: if yesterday is missing, it silently compares against two days ago, and a two-day move gets reported as a one-day move.

The exact version reads yesterday with a one-day `RANGE` frame and returns `NULL` when there is no yesterday:

```sql
max(price) over (
    partition by card_id order by price_date
    range between interval 1 day preceding and interval 1 day preceding
) as prev_price
```

`NULL` is the honest answer. A downstream alert that skips a day is better than one that fires on a fake one-day jump.

## Guardrails for anomaly scores built on these windows

When a trailing window feeds a z-score, as in spike or fraud detection, three guards keep it honest:

1. **Minimum history.** Require a minimum number of observations in the window before scoring. With two points, almost anything looks like an outlier.
2. **Minimum magnitude.** Ignore series where the value is tiny. A price moving from 0.10 to 0.30 is a 200% jump and means nothing.
3. **Unit tests on the edge cases.** A dbt unit test with a deliberate gap in the input proves the window does what the comment claims.

My [card price pipeline](https://github.com/leo-data-gig-world/pokemon-price-pipeline) uses exactly this: a 7-calendar-day `RANGE` window, an exact-yesterday change, and unit tests for a normal week, a spike, and a missing day.

`ROWS` frames are fine for "the last N events". For anything that means time, frame by time.
