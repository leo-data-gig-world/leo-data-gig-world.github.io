---
title: "When BigQuery quietly scans the whole table"
description: Partition pruning fails without an error. The query patterns that turn a cheap query into a full scan, and the guardrails that catch them before the bill does.
date: 2026-11-14 13:00:00 +0000
tags: [BigQuery, cost]
---

A partitioned table only saves money when BigQuery can tell, **before reading any data**, which partitions a query needs. When it can't, it reads everything, and nothing warns you. The query returns the right answer, just at ten or a hundred times the cost.

One query I fixed was scanning over 100 GB per run. It filtered on a date, just not the date the table was partitioned on. Moving the filter to the partition column cut the cost by about 90%. The pattern is common enough that it's worth knowing all the ways it happens.

## Five ways pruning silently fails

**1. Filtering on the wrong date column.** Event tables often carry several dates: event time, ingestion time, settlement date. Only one is the partition column. A filter on any of the others prunes nothing.

**2. Dynamic filter values.** BigQuery prunes on values it knows at planning time. A constant (`'2026-11-01'`) or a simple expression of `CURRENT_DATE()` works. A value that comes from a subquery, like `WHERE event_date = (SELECT MAX(event_date) FROM ...)`, generally can't be used to prune, so the outer table is scanned in full.

**3. Burying the partition column in an expression.** Filters that combine the partition column with other columns, or transform it in ways the planner can't reverse, can't be used for pruning. Keep the partition column isolated on one side of the comparison.

**4. Views that hide the partition column.** A view that renames, casts or wraps the partition column means every query on top of it filters a *derived* column. The filter looks right, but it never reaches the base table's partitions.

**5. Assuming clustering behaves like partitioning.** Clustering also cuts bytes read, but the saving only shows up at run time. A dry run reports the upper bound for clustered tables, so it can't tell you whether your clustering is actually helping.

## Guardrails that catch it early

- **`require_partition_filter = true`** on large tables. A query without a partition filter then fails instead of quietly costing money. It isn't airtight: a filter like `event_date >= '2000-01-01'` satisfies the rule and still reads everything.
- **Dry run every query before it ships.** The dry run returns the bytes a query will scan. Gate it in CI with a threshold per model, so a 100 GB surprise fails review, not the invoice.
- **Watch `INFORMATION_SCHEMA.JOBS`.** A weekly look at the top queries by bytes processed finds the ones that slipped through: scheduled jobs, dashboards, ad-hoc queries.
- **Expose the raw partition column in views** and document which column it is. Analysts can't respect a partition they can't see.

Partitioning is a promise BigQuery keeps only if every query asks the right question. The guardrails make sure it does.
