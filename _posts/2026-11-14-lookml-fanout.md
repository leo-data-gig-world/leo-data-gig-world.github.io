---
title: "Symmetric aggregates in LookML: where they protect you, and where they don't"
description: Looker can de-duplicate fanned-out joins for you, but only under conditions most models quietly break. How it works, four ways it fails, and a review checklist.
tags: [LookML, data modelling]
redirect_from: /blog/2026/11/lookml-fanout/
---

Every LookML developer learns early that joins can fan out: join merchants onto transactions, and each merchant row repeats once per transaction. The usual answer is "Looker handles it with symmetric aggregates". That's true, but only under conditions that many real models quietly break.

## How symmetric aggregates work

When Looker sees a join that can repeat rows, it rewrites a plain `SUM(amount)` into roughly this:

1. Turn each row's primary key into a very large number (a hash).
2. Add that number to the value being summed.
3. Take `SUM(DISTINCT ...)` of the result, so duplicated rows collapse into one.
4. Subtract `SUM(DISTINCT hash)` again, leaving the true total.

It's clever, and it means a measure on the "one" side of a join stays correct even when the join multiplies rows. But it relies on two inputs being right: the **primary key** and the **relationship**.

## Four ways it fails silently

**1. A primary key that isn't unique.** Looker trusts `primary_key: yes` completely. If two rows share a key, their values collapse into one and the total comes out *too low*. Nothing errors. The fix belongs upstream: every view's key should be tested `unique` and `not_null` in dbt, so LookML only ever sits on keys that are guaranteed.

**2. The relationship declared from the wrong side.** `relationship` is read from the explore's base view to the joined view. Starting from `merchants`, joined `transactions` is `one_to_many`, not `many_to_one`. Declare it backwards and Looker protects the wrong side of the join.

**3. Hand-written aggregates.** A measure of `type: number` with `sql: SUM(${TABLE}.fee) ;;` bypasses the rewrite entirely, because Looker can't safely rewrite SQL it didn't generate. Build ratios from other measures (`${total_fees} / NULLIF(${total_volume}, 0)`) instead of writing `SUM` yourself.

**4. Cost at scale.** `SUM(DISTINCT)` over hashed values is far heavier than a plain sum. On a large BigQuery fact table, that's real money and slower dashboards. If an explore always fans out the same way, it's often better to model the right grain in dbt (a pre-aggregated mart) than to let every query pay for de-duplication.

## Review checklist

When I review an explore, I check:

- Does every view have a primary key, and is it tested `unique` + `not_null` in dbt?
- Does the explore start from the fact table, with dimensions joined onto it? Most joins should then be `many_to_one`, the safest kind.
- Is every `relationship` read from the base view's side?
- Are there `type: number` measures with raw `SUM`/`COUNT` inside them?
- In the generated SQL (the SQL tab), does `SUM(DISTINCT` appear where I didn't expect a fanout? That usually means a join is wider than intended.
- Since Looker joins are LEFT JOINs by default, does the base view keep exactly the rows the business question needs?

Symmetric aggregates are a safety net, not a design. The best protection is still a model where each explore sits on a clear, tested grain.
