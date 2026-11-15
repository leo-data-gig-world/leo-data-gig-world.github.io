// Pipeline monitoring charts. No libraries: small SVG charts styled by CSS tokens,
// so light/dark mode and colours live in style.css, not here.
(async () => {
  const SRC = ["https://raw.githubusercontent.com/leo-data-gig-world/pokemon-price-pipeline/main/lake/_health/history.json",
               "https://cdn.jsdelivr.net/gh/leo-data-gig-world/pokemon-price-pipeline@main/lake/_health/history.json"];
  const $ = (id) => document.getElementById(id);
  const NS = "http://www.w3.org/2000/svg";
  const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmtDate = (d, opt = { day: "numeric", month: "short" }) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { ...opt, timeZone: "UTC" });
  const num = (v, dp = 0) => (v == null ? "–" : Number(v).toLocaleString("en-GB", { maximumFractionDigits: dp }));
  const STAGE_GROUPS = [["extract", "Extract", "s1"], ["dbt", "dbt build", "s2"], ["other", "Checks + publish", "s3"]];

  let hist = null;
  for (const u of SRC) { try { const r = await fetch(u, { cache: "no-store" }); if (r.ok) { hist = await r.json(); break; } } catch (e) {} }
  const pill = $("mon-pill");
  if (!hist || !hist.days || !hist.days.length) { pill.lastElementChild.textContent = "Run history unavailable right now"; return; }

  // ---- shared tooltip -------------------------------------------------------
  const tip = $("tip");
  const showTip = (html, x, y) => {
    tip.innerHTML = html; tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(window.innerWidth - w - 8, Math.max(8, x - w / 2)) + "px";
    tip.style.top = (y - h - 12 < 8 ? y + 16 : y - h - 12) + "px";
  };
  const hideTip = () => { tip.hidden = true; };
  const hover = (el, html) => {
    el.addEventListener("mousemove", (e) => showTip(html, e.clientX, e.clientY));
    el.addEventListener("mouseleave", hideTip);
    el.addEventListener("focus", () => { const b = el.getBoundingClientRect(); showTip(html, b.left + b.width / 2, b.top); });
    el.addEventListener("blur", hideTip);
  };

  // ---- days: fill gaps so missed runs are visible ---------------------------
  const byDate = Object.fromEntries(hist.days.map((d) => [d.date, d]));
  const todayStr = new Date().toISOString().slice(0, 10);
  const allDates = [];
  for (let d = new Date(hist.days[0].date + "T00:00:00Z"); d.toISOString().slice(0, 10) <= todayStr; d.setUTCDate(d.getUTCDate() + 1)) {
    allDates.push(d.toISOString().slice(0, 10));
  }
  const stateOf = (date) => {
    const d = byDate[date];
    if (d && d.status) return d.status;            // passed | failed
    return date === todayStr ? "pending" : "missed";
  };
  const days = hist.days.filter((d) => d.status);   // days that actually ran

  // ---- KPIs -----------------------------------------------------------------
  const last = days[days.length - 1];
  const judged = allDates.filter((d) => stateOf(d) !== "pending");
  const passed = judged.filter((d) => stateOf(d) === "passed").length;
  const totals = days.map((d) => d.seconds && Object.values(d.seconds).reduce((a, b) => a + (b || 0), 0)).filter((v) => v);
  $("k-last").textContent = last.status === "passed" ? "✓ Passed" : "✕ Failed";
  $("k-last-sub").textContent = fmtDate(last.date, { weekday: "short", day: "numeric", month: "short" }) +
    (last.failed_stage ? " · failed at " + last.failed_stage : "") + (last.trigger ? " · " + (last.trigger === "schedule" ? "scheduled" : "manual") : "");
  $("k-rate").textContent = judged.length ? Math.round((passed / judged.length) * 100) + "%" : "–";
  $("k-rate-sub").textContent = `${passed} of ${judged.length} days passed (missed days count as not passed)`;
  $("k-days").textContent = allDates.length;
  $("k-time").textContent = totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) + "s" : "–";
  const healthy = last.status === "passed" && (stateOf(todayStr) !== "missed");
  pill.classList.add(healthy ? "ok" : "warn");
  pill.lastElementChild.textContent = (last.status === "passed" ? "Healthy" : "Last run failed") + " · last run " + fmtDate(last.date);

  // ---- run calendar ---------------------------------------------------------
  const cal = $("c-calendar");
  const ICON = { passed: "✓", failed: "✕", missed: "–", pending: "·" };
  const LABEL = { passed: "Passed", failed: "Failed", missed: "No run", pending: "Not run yet today" };
  allDates.slice(-90).forEach((date) => {
    const st = stateOf(date), d = byDate[date] || {};
    const el = document.createElement(d.run_url ? "a" : "span");
    el.className = "day st-" + st; el.textContent = ICON[st]; el.tabIndex = 0;
    if (d.run_url) { el.href = d.run_url; el.target = "_blank"; el.rel = "noopener"; }
    el.setAttribute("aria-label", `${fmtDate(date)}: ${LABEL[st]}`);
    hover(el, `<strong>${fmtDate(date, { weekday: "short", day: "numeric", month: "short" })}</strong><br>${ICON[st]} ${LABEL[st]}` +
      (d.failed_stage ? `<br>Failed at: ${esc(d.failed_stage)}` : "") + (d.rows ? `<br>${num(d.rows)} rows` : "") +
      (d.run_url ? "<br><span class='muted'>Click for the run log</span>" : ""));
    cal.appendChild(el);
  });

  // ---- generic SVG charts ---------------------------------------------------
  const svgEl = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent && parent.appendChild(e); return e; };
  const niceMax = (v) => { if (!(v > 0)) return 1; const p = 10 ** Math.floor(Math.log10(v)); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };
  const tableView = (host, head, rows) => {
    const det = document.createElement("details"); det.className = "datatable";
    det.innerHTML = `<summary>Data table</summary><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>` +
      `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    host.after(det);
  };
  const legend = (host, items) => {
    const lg = document.createElement("div"); lg.className = "legend";
    lg.innerHTML = items.map(([label, cls]) => `<span><i class="sw ${cls}"></i>${esc(label)}</span>`).join("");
    host.before(lg);
  };

  function frame(host, H, yMax, yFmt) {
    host.innerHTML = "";
    const W = Math.max(280, host.clientWidth), M = { t: 10, r: 12, b: 26, l: 44 };
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", height: H, role: "img" }, host);
    const y = (v) => M.t + (H - M.t - M.b) * (1 - v / yMax);
    for (let i = 0; i <= 4; i++) {
      const v = (yMax / 4) * i;
      svgEl("line", { x1: M.l, x2: W - M.r, y1: y(v), y2: y(v), class: "gridline" }, svg);
      svgEl("text", { x: M.l - 6, y: y(v) + 4, class: "axis", "text-anchor": "end" }, svg).textContent = yFmt(v);
    }
    return { svg, W, M, y, plotW: W - M.l - M.r };
  }

  // Columns (single or stacked). Rounded 4px top on the last segment, square at the baseline,
  // 2px surface gap between stacked segments, the whole day band is the hover target.
  function columns(host, pts, series, { yFmt = (v) => num(v), tipFmt, H = 200 } = {}) {
    const total = (p) => series.reduce((a, s) => a + (p[s.key] || 0), 0);
    const yMax = niceMax(Math.max(...pts.map(total)) * 1.1);
    const { svg, M, y, plotW } = frame(host, H, yMax, yFmt);
    const band = plotW / Math.max(pts.length, 1), bw = Math.min(24, band * 0.6);
    pts.forEach((p, i) => {
      const cx = M.l + band * i + band / 2;
      let base = 0;
      const segs = series.filter((s) => p[s.key] > 0);
      segs.forEach((s, j) => {
        const v = p[s.key], y0 = y(base), y1 = y(base + v), top = j === segs.length - 1;
        const h = Math.max(0, y0 - y1 - (j > 0 ? 2 : 0)), x = cx - bw / 2, r = top ? Math.min(4, h) : 0;
        const yb = y0 - (j > 0 ? 2 : 0);
        svgEl("path", { class: "bar " + s.cls, d: `M${x},${yb} V${yb - h + r} Q${x},${yb - h} ${x + r},${yb - h} H${x + bw - r} Q${x + bw},${yb - h} ${x + bw},${yb - h + r} V${yb} Z` }, svg);
        base += v;
      });
      svgEl("text", { x: cx, y: H - 8, class: "axis", "text-anchor": "middle" }, svg).textContent =
        pts.length <= 14 || i % Math.ceil(pts.length / 10) === 0 ? fmtDate(p.date) : "";
      const hit = svgEl("rect", { x: cx - band / 2, y: M.t, width: band, height: H - M.t - M.b, class: "hit", tabindex: 0 }, svg);
      hover(hit, tipFmt(p));
    });
  }

  // Single line, 2px, end-dot markers with a surface ring, crosshair + tooltip per point.
  function line(host, pts, key, { yFmt = (v) => num(v), tipFmt, threshold, H = 200, yMaxHint = 0 } = {}) {
    const vals = pts.map((p) => p[key]).filter((v) => v != null);
    const yMax = niceMax(Math.max(...vals, threshold || 0, yMaxHint) * 1.15);
    const { svg, M, y, plotW } = frame(host, H, yMax, yFmt);
    const x = (i) => M.l + (pts.length === 1 ? plotW / 2 : (plotW * i) / (pts.length - 1));
    if (threshold) {
      svgEl("line", { x1: M.l, x2: M.l + plotW, y1: y(threshold), y2: y(threshold), class: "threshold" }, svg);
      svgEl("text", { x: M.l + plotW, y: y(threshold) - 6, class: "axis", "text-anchor": "end" }, svg).textContent = "limit " + yFmt(threshold);
    }
    const d = pts.map((p, i) => (p[key] == null ? null : `${x(i)},${y(p[key])}`)).filter(Boolean);
    if (d.length > 1) svgEl("polyline", { points: d.join(" "), class: "line s1" }, svg);
    const cross = svgEl("line", { y1: M.t, y2: H - M.b, class: "cross", visibility: "hidden" }, svg);
    pts.forEach((p, i) => {
      if (p[key] == null) return;
      svgEl("circle", { cx: x(i), cy: y(p[key]), r: 4, class: "dot s1" }, svg);
      svgEl("text", { x: x(i), y: H - 8, class: "axis", "text-anchor": "middle" }, svg).textContent =
        pts.length <= 14 || i % Math.ceil(pts.length / 10) === 0 ? fmtDate(p.date) : "";
      const w = pts.length === 1 ? plotW : plotW / Math.max(pts.length - 1, 1);
      const hit = svgEl("rect", { x: x(i) - w / 2, y: M.t, width: w, height: H - M.t - M.b, class: "hit", tabindex: 0 }, svg);
      hit.addEventListener("mouseenter", () => { cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.setAttribute("visibility", "visible"); });
      hit.addEventListener("mouseleave", () => cross.setAttribute("visibility", "hidden"));
      hover(hit, tipFmt(p));
    });
  }

  // ---- the charts -----------------------------------------------------------
  const ranDays = days.slice(-60);
  const timePts = ranDays.map((d) => {
    const s = d.seconds || {};
    return { date: d.date, extract: s.extract, dbt: s.dbt, other: (s.checks || 0) + (s.summary || 0) + (s.spikes || 0) || null, known: !!d.seconds };
  });
  const testPts = ranDays.map((d) => ({ date: d.date, pass: d.tests_pass, fail: d.tests_fail }));

  function draw() {
    columns($("c-rows"), ranDays, [{ key: "rows", cls: "s1" }], {
      tipFmt: (p) => `<strong>${fmtDate(p.date)}</strong><br>${num(p.rows)} rows<br>${p.status === "passed" ? "✓ passed" : "✕ failed"}`,
    });
    line($("c-fresh"), ranDays, "source_age_hours", {
      threshold: 48, yFmt: (v) => num(v) + "h",
      tipFmt: (p) => `<strong>${fmtDate(p.date)}</strong><br>${num(p.source_age_hours, 1)} hours old`,
    });
    columns($("c-tests"), testPts, [{ key: "pass", cls: "st-good" }, { key: "fail", cls: "st-bad" }], {
      tipFmt: (p) => p.pass == null ? `<strong>${fmtDate(p.date)}</strong><br>Not recorded (before monitoring)`
        : `<strong>${fmtDate(p.date)}</strong><br>✓ ${p.pass} passed<br>✕ ${p.fail || 0} failed`,
    });
    columns($("c-time"), timePts, STAGE_GROUPS.map(([key, , cls]) => ({ key, cls })), {
      yFmt: (v) => num(v) + "s",
      tipFmt: (p) => !p.known ? `<strong>${fmtDate(p.date)}</strong><br>Not recorded (before monitoring)`
        : `<strong>${fmtDate(p.date)}</strong>` + STAGE_GROUPS.map(([k, label]) => `<br>${label}: ${num(p[k], 1)}s`).join(""),
    });
    const wrap = $("c-watch"); wrap.innerHTML = "";
    (hist.watchlist.cards || []).forEach((c) => {
      const fig = document.createElement("figure"); fig.className = "card chart mini";
      const lastP = c.points[c.points.length - 1];
      fig.innerHTML = `<figcaption><h3>${esc(c.card)}</h3><p class="muted small">${esc(c.set)} · ${esc(c.variant)}</p>` +
        `<div class="stat">$${num(lastP?.usd, 2)}</div></figcaption><div></div>`;
      wrap.appendChild(fig);
      line(fig.lastElementChild, c.points.map((p) => ({ date: p.date, usd: p.usd })), "usd", {
        H: 120, yFmt: (v) => "$" + num(v), tipFmt: (p) => `<strong>${fmtDate(p.date)}</strong><br>$${num(p.usd, 2)}`,
      });
    });
  }
  draw();

  // legends (>= 2 series) and table views, once
  legend($("c-tests"), [["Passed", "st-good"], ["Failed", "st-bad"]]);
  legend($("c-time"), STAGE_GROUPS.map(([, label, cls]) => [label, cls]));
  tableView($("c-rows"), ["Date", "Rows", "Status"], ranDays.map((d) => [d.date, d.rows ?? "–", d.status]));
  tableView($("c-fresh"), ["Date", "Hours old"], ranDays.map((d) => [d.date, d.source_age_hours ?? "–"]));
  tableView($("c-tests"), ["Date", "Passed", "Failed"], testPts.map((p) => [p.date, p.pass ?? "–", p.fail ?? "–"]));
  tableView($("c-time"), ["Date", "Extract s", "dbt s", "Other s"], timePts.map((p) => [p.date, p.extract ?? "–", p.dbt ?? "–", p.other ?? "–"]));

  let t; window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(draw, 150); });
})();
