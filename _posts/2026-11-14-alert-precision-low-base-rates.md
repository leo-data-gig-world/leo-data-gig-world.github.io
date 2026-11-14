---
title: "Tuning fraud alerts when fraud is rare"
description: At low base rates, accuracy is meaningless and precision collapses. How to tune alert thresholds on the numbers that matter, and the label bias most teams miss.
date: 2026-11-14 11:00:00 +0000
tags: [fraud, statistics]
---

Suppose 1 in 1,000 transactions is fraudulent, and a rule catches 90% of fraud while wrongly flagging just 1% of good transactions. That sounds excellent. On a million transactions it catches 900 frauds, and it also raises about **10,000 false alerts**. Fewer than 1 alert in 10 is real.

This is the base-rate problem, and it's why fraud and AML teams drown in alerts from rules that look accurate on paper.

## Measure precision, not accuracy

At a 0.1% base rate, a rule that flags nothing is 99.9% accurate. Accuracy tells you nothing. The numbers that matter are:

- **Precision:** of the alerts raised, how many were real? This is what analysts feel every day.
- **Recall:** of the real cases, how many did we catch? This is what regulators and losses feel.
- **Alert volume:** the queue the team actually has to work.

## Tune thresholds against cost, not a default

Every threshold is a trade between analyst time and missed risk. A practical approach:

1. **Grid search the rule parameters** (amount bands, velocity windows, counterparties) over historical labelled alerts.
2. **Set a floor on recall** for the risk the rule exists to catch, then maximise precision above that floor.
3. **Price the trade-off:** analyst minutes per false alert against expected loss per missed case. The best threshold is the one with the lowest total cost, not the highest score.
4. **Make it explainable.** A threshold a compliance officer can read and sign off beats a better black box that can't be defended.

Done this way, rule tuning in my own work raised alert precision about tenfold.

## The label bias most teams miss

Labels come from investigated alerts, and only alerted transactions get investigated. So the training data says nothing about fraud the current rules never flagged. Tune only on those labels, and every iteration gets better at finding the fraud you already find.

Two habits reduce this:

- **Sample below the threshold.** Send a small random share of non-alerted activity for review, so you learn what the rules miss.
- **Track population drift.** When customer behaviour shifts, last quarter's thresholds quietly lose both precision and recall. Recheck the distributions on a schedule, not after an incident.

Rare events punish intuition. Tune on precision, recall and cost, and keep sampling the cases your rules don't see.
