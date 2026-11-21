/* ==========================================================================
   TRIPPERS COFFEE — charts.js
   Dependency-free HTML5 Canvas charts: line, bar, horizontal bar, doughnut.
   Every chart redraws on container resize and supports hover tooltips.
   ========================================================================== */
(function (window) {
  "use strict";

  var GOLD = "#D4AF37";
  var GOLD_LIGHT = "#E8C96A";
  var GRID = "#332e27";
  var AXIS_TEXT = "#8b8375";
  var FONT = '11px "Segoe UI", system-ui, sans-serif';

  var PALETTE = [GOLD, "#3FA675", "#5C8FD6", "#B07D4F", "#8E6AC8", "#D9534F", "#4FB3A5", "#C9A227"];

  function cssVar(name, fallback) {
    try {
      var v = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch (e) {
      return fallback;
    }
  }

  function themeStyle() {
    var light = document.documentElement.getAttribute("data-theme") === "light";
    var accent = cssVar("--gold", GOLD);
    var accentLight = cssVar("--gold-light", GOLD_LIGHT);
    var rgb = cssVar("--gold-rgb", "212, 175, 55");
    PALETTE[0] = accent;
    return {
      light: light,
      accent: accent,
      accentLight: accentLight,
      rgb: rgb,
      grid: light ? "#e8e0d3" : GRID,
      axis: light ? "#8a8174" : AXIS_TEXT,
      center: light ? "#ffffff" : "#24211d",
      centerText: light ? "#241e17" : "#ffffff",
      track: light ? "#eee7db" : "#2e2922",
      label: light ? "#5c5344" : "#b8b0a3",
      labelHover: light ? "#1d1811" : "#e3d6b4",
      value: light ? "#4a4234" : "#d8d0c2"
    };
  }

  function fmtDefault(v) {
    return window.Utils.num(v, 0);
  }

  /** Round an axis maximum up to a friendly 1/2/2.5/5 × 10^n value. */
  function niceMax(value) {
    if (!isFinite(value) || value <= 0) return 10;
    var exp = Math.floor(Math.log(value) / Math.LN10);
    var base = Math.pow(10, exp);
    var f = value / base;
    var nice;
    if (f <= 1) nice = 1;
    else if (f <= 2) nice = 2;
    else if (f <= 2.5) nice = 2.5;
    else if (f <= 5) nice = 5;
    else nice = 10;
    return nice * base;
  }

  function prepare(canvas) {
    var parent = canvas.parentNode;
    var w = Math.max(120, parent.clientWidth || 120);
    var h = Math.max(90, parent.clientHeight || canvas.clientHeight || 180);
    var dpr = window.devicePixelRatio || 1;
    var pw = Math.round(w * dpr);
    var ph = Math.round(h * dpr);
    // Resizing a canvas reallocates it — only do it when the size actually moved,
    // so animation frames stay cheap.
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    if (canvas.style.width !== w + "px") canvas.style.width = w + "px";
    if (canvas.style.height !== h + "px") canvas.style.height = h + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }

  /* ----------------------------------------------------------- animation */
  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function stopAnim(canvas) {
    if (canvas && canvas.__raf) {
      window.cancelAnimationFrame(canvas.__raf);
      canvas.__raf = null;
    }
  }

  /** Plays a draw callback with a 0→1 progress value. */
  function animateChart(canvas, draw, duration) {
    stopAnim(canvas);
    if (prefersReducedMotion() || typeof window.requestAnimationFrame !== "function") {
      draw(1);
      return;
    }
    var started = null;
    function frame(ts) {
      if (started === null) started = ts;
      var t = Math.min(1, (ts - started) / (duration || 620));
      draw(easeOutCubic(t));
      if (t < 1) canvas.__raf = window.requestAnimationFrame(frame);
      else canvas.__raf = null;
    }
    canvas.__raf = window.requestAnimationFrame(frame);
  }

  function empty(canvas, message) {
    var p = prepare(canvas);
    var ctx = p.ctx;
    var th = themeStyle();
    ctx.fillStyle = th.axis;
    ctx.font = FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(message || "No data for this period", p.w / 2, p.h / 2);
  }

  /* -------------------------------------------------------------- tooltip */
  function ensureTip(canvas) {
    var parent = canvas.parentNode;
    var tip = parent.querySelector(".chart-tip");
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "chart-tip";
      parent.appendChild(tip);
    }
    var th = themeStyle();
    tip.style.cssText = "position:absolute;pointer-events:none;opacity:0;transition:opacity .12s ease;" +
      "background:" + (th.light ? "#ffffff" : "#12100e") + ";border:1px solid " + (th.light ? "#e2d9c9" : "#4a4031") + ";" +
      "border-radius:8px;padding:.4rem .55rem;" +
      "font-size:.72rem;color:" + (th.light ? "#241e17" : "#f1ece2") + ";white-space:nowrap;z-index:5;" +
      "box-shadow:0 6px 18px rgba(0,0,0," + (th.light ? ".12" : ".5") + ");" +
      "transform:translate(-50%,-115%);line-height:1.35;";
    return tip;
  }

  function showTip(canvas, x, y, html) {
    var tip = ensureTip(canvas);
    tip.innerHTML = html;
    tip.style.left = x + "px";
    tip.style.top = y + "px";
    tip.style.opacity = "1";
  }

  function hideTip(canvas) {
    var tip = canvas.parentNode.querySelector(".chart-tip");
    if (tip) tip.style.opacity = "0";
  }

  /* -------------------------------------------------------------- line */
  function drawLine(canvas, cfg, hover, progress) {
    var rp = progress === undefined ? 1 : progress;
    var p = prepare(canvas);
    var th = themeStyle();
    var ctx = p.ctx, w = p.w, h = p.h;
    var series = (cfg.series || []).filter(function (s) { return s.data && s.data.length; });
    var labels = cfg.labels || [];
    if (!labels.length || !series.length) { empty(canvas, cfg.emptyText); return; }

    var padL = 50, padR = 14, padT = 14, padB = 30;
    var plotW = w - padL - padR;
    var plotH = h - padT - padB;
    var format = cfg.format || fmtDefault;

    var maxVal = 0;
    series.forEach(function (s) {
      s.data.forEach(function (v) { if (Number(v) > maxVal) maxVal = Number(v); });
    });
    if (maxVal <= 0) { empty(canvas, cfg.emptyText); return; }
    var top = niceMax(maxVal * 1.12);
    var ticks = 4;

    ctx.font = FONT;
    ctx.textBaseline = "middle";

    /* grid + y labels */
    for (var g = 0; g <= ticks; g++) {
      var val = top * g / ticks;
      var y = padT + plotH - (plotH * g / ticks);
      ctx.strokeStyle = th.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, Math.round(y) + .5);
      ctx.lineTo(w - padR, Math.round(y) + .5);
      ctx.stroke();
      ctx.fillStyle = th.axis;
      ctx.textAlign = "right";
      ctx.fillText(format(val, true), padL - 8, y);
    }

    var n = labels.length;
    var stepX = n > 1 ? plotW / (n - 1) : 0;
    var points = [];
    for (var i = 0; i < n; i++) {
      points.push(padL + (n > 1 ? stepX * i : plotW / 2));
    }

    /* x labels — thin out when crowded, keep the first/last edge-aligned */
    ctx.fillStyle = th.axis;
    ctx.textBaseline = "top";
    var maxLabels = Math.max(2, Math.floor(plotW / 62));
    var skip = Math.max(1, Math.ceil((n - 1) / Math.max(1, maxLabels - 1)));
    var shown = [];
    for (var li = 0; li < n; li += skip) shown.push(li);
    if (shown[shown.length - 1] !== n - 1) {
      // Measure real text widths and drop ticks that would collide with the last label.
      var lastLabel = labels[n - 1];
      var lastLeft = points[n - 1] + 2 - ctx.measureText(lastLabel).width;
      while (shown.length) {
        var prevIdx = shown[shown.length - 1];
        var prevW = ctx.measureText(labels[prevIdx]).width;
        var prevRight = prevIdx === 0 ? points[0] - 2 + prevW : points[prevIdx] + prevW / 2;
        if (lastLeft - prevRight >= 10) break;
        shown.pop();
      }
      shown.push(n - 1);
    }
    shown.forEach(function (i) {
      var isFirst = i === 0;
      var isLast = i === n - 1;
      ctx.textAlign = isFirst ? "left" : isLast ? "right" : "center";
      var x = isFirst ? points[0] - 2 : isLast ? points[n - 1] + 2 : points[i];
      ctx.fillText(labels[i], x, h - padB + 8);
    });

    /* series */
    if (rp < 1) {
      // Reveal the plot left → right, like a pen drawing the line.
      ctx.save();
      ctx.beginPath();
      ctx.rect(padL - 6, padT - 12, (plotW + 12) * rp, plotH + 26);
      ctx.clip();
    }
    series.forEach(function (s, si) {
      var color = s.color || PALETTE[si % PALETTE.length];
      var pts = s.data.map(function (v, i) {
        return {
          x: points[i],
          y: padT + plotH - (Math.max(0, Number(v)) / top) * plotH,
          v: Number(v)
        };
      });

      if (si === 0) {
        var grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
        grad.addColorStop(0, "rgba(" + th.rgb + ",.22)");
        grad.addColorStop(1, "rgba(" + th.rgb + ",0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, padT + plotH);
        pts.forEach(function (pt) { ctx.lineTo(pt.x, pt.y); });
        ctx.lineTo(pts[pts.length - 1].x, padT + plotH);
        ctx.closePath();
        ctx.fill();
      }

      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      pts.forEach(function (pt, i) {
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();

      pts.forEach(function (pt, i) {
        var isHover = hover === i;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, isHover ? 4.5 : 2.6, 0, Math.PI * 2);
        ctx.fillStyle = isHover ? "#fff" : color;
        ctx.fill();
        if (isHover) {
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      });
    });

    if (rp < 1) ctx.restore();

    /* hover guide */
    if (hover !== undefined && hover !== null && points[hover] !== undefined) {
      ctx.strokeStyle = "rgba(" + th.rgb + ",.35)";
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(points[hover], padT);
      ctx.lineTo(points[hover], padT + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function line(canvas, cfg) {
    if (!canvas) return;
    canvas.__chart = { type: "line", cfg: cfg };
    animateChart(canvas, function (prog) { drawLine(canvas, cfg, null, prog); }, 680);

    if (!canvas.__bound) {
      canvas.__bound = true;
      canvas.addEventListener("mousemove", function (e) {
        var c = canvas.__chart;
        if (!c || c.type !== "line") return;
        stopAnim(canvas);
        var rect = canvas.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var n = (c.cfg.labels || []).length;
        if (!n) return;
        var padL = 50, padR = 14;
        var plotW = rect.width - padL - padR;
        var idx = n > 1 ? Math.round((x - padL) / (plotW / (n - 1))) : 0;
        idx = Math.max(0, Math.min(n - 1, idx));
        drawLine(canvas, c.cfg, idx);

        var format = c.cfg.format || fmtDefault;
        var th = themeStyle();
        var html = "<strong>" + window.Utils.esc(c.cfg.labels[idx]) + "</strong>";
        (c.cfg.series || []).forEach(function (s) {
          html += "<br><span style='color:" + (s.color || th.accentLight) + "'>●</span> " +
            window.Utils.esc(s.label || "Value") + ": <strong>" + format(s.data[idx]) + "</strong>";
        });
        var px = padL + (n > 1 ? (plotW / (n - 1)) * idx : plotW / 2);
        var maxV = 0;
        (c.cfg.series || []).forEach(function (s) {
          s.data.forEach(function (v) { if (v > maxV) maxV = v; });
        });
        var top = niceMax(maxV * 1.12) || 1;
        var seriesY = rect.height - 30 - ((c.cfg.series[0].data[idx] || 0) / top) * (rect.height - 44);
        showTip(canvas, px, Math.max(24, seriesY), html);
      });
      canvas.addEventListener("mouseleave", function () {
        hideTip(canvas);
        stopAnim(canvas);
        if (canvas.__chart) drawLine(canvas, canvas.__chart.cfg, null);
      });
    }
  }

  /* -------------------------------------------------------------- bar */
  function drawBar(canvas, cfg, hover, progress) {
    var rp = progress === undefined ? 1 : progress;
    var p = prepare(canvas);
    var th = themeStyle();
    var ctx = p.ctx, w = p.w, h = p.h;
    var labels = cfg.labels || [], data = cfg.data || [];
    if (!labels.length) { empty(canvas, cfg.emptyText); return; }

    var padL = 46, padR = 12, padT = 14, padB = 30;
    var plotW = w - padL - padR, plotH = h - padT - padB;
    var format = cfg.format || fmtDefault;
    var maxVal = Math.max.apply(null, data.concat([0]));
    if (maxVal <= 0) { empty(canvas, cfg.emptyText); return; }
    var top = niceMax(maxVal * 1.12);

    ctx.font = FONT;
    ctx.textBaseline = "middle";
    for (var g = 0; g <= 4; g++) {
      var y = padT + plotH - plotH * g / 4;
      ctx.strokeStyle = th.grid;
      ctx.beginPath();
      ctx.moveTo(padL, Math.round(y) + .5);
      ctx.lineTo(w - padR, Math.round(y) + .5);
      ctx.stroke();
      ctx.fillStyle = th.axis;
      ctx.textAlign = "right";
      ctx.fillText(format(top * g / 4, true), padL - 8, y);
    }

    var n = labels.length;
    var slot = plotW / n;
    var bw = Math.min(38, Math.max(8, slot * 0.55));
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    labels.forEach(function (lab, i) {
      var val = Number(data[i]) || 0;
      var bh = (val / top) * plotH * rp;
      var x = padL + slot * i + (slot - bw) / 2;
      var y = padT + plotH - bh;
      var isHover = hover === i;
      ctx.fillStyle = isHover ? th.accentLight : (cfg.color || th.accent);
      roundRect(ctx, x, y, bw, Math.max(bh, val > 0 && rp > .9 ? 2 : 0), 4);
      ctx.fill();

      if (isHover) { ctx.fillStyle = "#fff"; }
      else { ctx.fillStyle = th.axis; }
      var skip = Math.ceil(n / Math.max(3, Math.floor(plotW / 58)));
      if (i % skip === 0 || n <= 8) ctx.fillText(lab, x + bw / 2, h - padB + 8);
    });
    if (hover !== undefined && hover !== null) {
      ctx.fillStyle = th.accentLight;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.font = "600 11px 'Segoe UI', system-ui, sans-serif";
      ctx.fillText(format(data[hover]), padL + slot * hover + slot / 2, padT + 2);
    }
  }

  function bar(canvas, cfg) {
    if (!canvas) return;
    canvas.__chart = { type: "bar", cfg: cfg };
    animateChart(canvas, function (prog) { drawBar(canvas, cfg, null, prog); }, 620);
    if (!canvas.__bound) {
      canvas.__bound = true;
      canvas.addEventListener("mousemove", function (e) {
        var c = canvas.__chart;
        if (!c || c.type !== "bar") return;
        stopAnim(canvas);
        var rect = canvas.getBoundingClientRect();
        var padL = 46, padR = 12;
        var slot = (rect.width - padL - padR) / (c.cfg.labels.length || 1);
        var idx = Math.floor((e.clientX - rect.left - padL) / slot);
        if (idx < 0 || idx >= c.cfg.labels.length) { hideTip(canvas); drawBar(canvas, c.cfg, null); return; }
        drawBar(canvas, c.cfg, idx);
        var format = c.cfg.format || fmtDefault;
        showTip(canvas, padL + slot * idx + slot / 2, 26,
          "<strong>" + window.Utils.esc(c.cfg.labels[idx]) + "</strong><br>" +
          "<span style='color:" + themeStyle().accentLight + "'>●</span> " + format(c.cfg.data[idx]));
      });
      canvas.addEventListener("mouseleave", function () {
        hideTip(canvas);
        stopAnim(canvas);
        if (canvas.__chart) drawBar(canvas, canvas.__chart.cfg, null);
      });
    }
  }

  /* -------------------------------------------------------------- hbar */
  function drawHBar(canvas, cfg, hover, progress) {
    var rp = progress === undefined ? 1 : progress;
    var p = prepare(canvas);
    var th = themeStyle();
    var ctx = p.ctx, w = p.w, h = p.h;
    var labels = cfg.labels || [], data = cfg.data || [];
    if (!labels.length) { empty(canvas, cfg.emptyText); return; }

    var format = cfg.format || fmtDefault;
    var labelW = Math.min(112, Math.max(64, w * 0.33));
    var padR = 54, padT = 8, padB = 8;
    var plotW = w - labelW - padR;
    var maxVal = Math.max.apply(null, data.concat([0]));
    if (maxVal <= 0) { empty(canvas, cfg.emptyText); return; }

    var n = labels.length;
    var rowH = (h - padT - padB) / n;
    var barH = Math.max(10, Math.min(24, rowH * 0.56));

    ctx.font = FONT;
    ctx.textBaseline = "middle";
    labels.forEach(function (lab, i) {
      var y = padT + rowH * i + rowH / 2;
      var val = Number(data[i]) || 0;
      var bw = (val / maxVal) * plotW * rp;
      if (bw > 0) bw = Math.max(2, bw);
      var isHover = hover === i;

      ctx.fillStyle = isHover ? th.labelHover : th.label;
      ctx.textAlign = "left";
      var text = lab.length > 19 ? lab.slice(0, 18) + "…" : lab;
      ctx.fillText(text, 2, y);

      ctx.fillStyle = th.track;
      roundRect(ctx, labelW, y - barH / 2, plotW, barH, barH / 2);
      ctx.fill();

      ctx.fillStyle = isHover ? th.accentLight : (cfg.color || th.accent);
      roundRect(ctx, labelW, y - barH / 2, bw, barH, barH / 2);
      ctx.fill();

      ctx.fillStyle = isHover ? th.centerText : th.value;
      ctx.textAlign = "right";
      ctx.font = isHover ? "600 11px 'Segoe UI', system-ui, sans-serif" : FONT;
      ctx.fillText(format(val), w - 4, y);
      ctx.font = FONT;
    });
  }

  function hbar(canvas, cfg) {
    if (!canvas) return;
    canvas.__chart = { type: "hbar", cfg: cfg };
    animateChart(canvas, function (prog) { drawHBar(canvas, cfg, null, prog); }, 640);
    if (!canvas.__bound) {
      canvas.__bound = true;
      canvas.addEventListener("mousemove", function (e) {
        var c = canvas.__chart;
        if (!c || c.type !== "hbar") return;
        stopAnim(canvas);
        var rect = canvas.getBoundingClientRect();
        var n = c.cfg.labels.length;
        var rowH = (rect.height - 16) / n;
        var idx = Math.floor((e.clientY - rect.top - 8) / rowH);
        if (idx < 0 || idx >= n) { hideTip(canvas); drawHBar(canvas, c.cfg, null); return; }
        if (canvas.__hoverIdx === idx) return;
        canvas.__hoverIdx = idx;
        drawHBar(canvas, c.cfg, idx);
        var format = c.cfg.format || fmtDefault;
        showTip(canvas, rect.width * 0.5, 8 + rowH * idx + rowH / 2,
          "<strong>" + window.Utils.esc(c.cfg.labels[idx]) + "</strong><br>" + format(c.cfg.data[idx]));
      });
      canvas.addEventListener("mouseleave", function () {
        hideTip(canvas);
        canvas.__hoverIdx = -1;
        stopAnim(canvas);
        if (canvas.__chart) drawHBar(canvas, canvas.__chart.cfg, null);
      });
    }
  }

  /* -------------------------------------------------------------- doughnut */
  function drawDoughnut(canvas, cfg, hover, progress) {
    var rp = progress === undefined ? 1 : progress;
    var p = prepare(canvas);
    var th = themeStyle();
    var ctx = p.ctx, w = p.w, h = p.h;
    var labels = cfg.labels || [], data = cfg.data || [];
    var total = data.reduce(function (a, b) { return a + (Number(b) || 0); }, 0);
    if (!labels.length || total <= 0) { empty(canvas, cfg.emptyText); return; }

    var cx = w / 2, cy = h / 2;
    var outer = Math.min(w, h) / 2 - 8;
    var inner = outer * 0.62;
    var start = -Math.PI / 2;

    data.forEach(function (v, i) {
      var angle = (Number(v) || 0) / total * Math.PI * 2 * rp;
      var color = cfg.colors ? cfg.colors[i % cfg.colors.length] : PALETTE[i % PALETTE.length];
      if (angle <= 0) return;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, hover === i ? outer + 2 : outer, start, start + angle);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = th.center;
      ctx.lineWidth = 2;
      ctx.stroke();
      start += angle;
    });

    ctx.beginPath();
    ctx.arc(cx, cy, inner, 0, Math.PI * 2);
    ctx.fillStyle = th.center;
    ctx.fill();

    ctx.globalAlpha = Math.max(0, Math.min(1, (rp - .45) / .55));
    ctx.fillStyle = th.axis;
    ctx.font = "10px 'Segoe UI', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(cfg.centerLabel || "TOTAL", cx, cy - 10);
    ctx.fillStyle = th.centerText;
    ctx.font = "700 15px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText((cfg.format || fmtDefault)(total), cx, cy + 9);
    ctx.globalAlpha = 1;
  }

  function doughnut(canvas, cfg) {
    if (!canvas) return;
    canvas.__chart = { type: "doughnut", cfg: cfg };
    animateChart(canvas, function (prog) { drawDoughnut(canvas, cfg, null, prog); }, 720);
    if (!canvas.__bound) {
      canvas.__bound = true;
      canvas.addEventListener("mousemove", function (e) {
        var c = canvas.__chart;
        if (!c || c.type !== "doughnut") return;
        stopAnim(canvas);
        var rect = canvas.getBoundingClientRect();
        var cx = rect.width / 2, cy = rect.height / 2;
        var dx = e.clientX - rect.left - cx;
        var dy = e.clientY - rect.top - cy;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var outer = Math.min(rect.width, rect.height) / 2 - 8;
        var inner = outer * 0.62;
        if (dist < inner || dist > outer + 2) {
          hideTip(canvas);
          if (canvas.__hoverIdx !== -1) { canvas.__hoverIdx = -1; drawDoughnut(canvas, c.cfg, null); }
          return;
        }
        var ang = Math.atan2(dy, dx) + Math.PI / 2;
        if (ang < 0) ang += Math.PI * 2;
        var total = c.cfg.data.reduce(function (a, b) { return a + (Number(b) || 0); }, 0) || 1;
        var acc = 0, idx = 0;
        for (var i = 0; i < c.cfg.data.length; i++) {
          acc += (Number(c.cfg.data[i]) || 0) / total * Math.PI * 2;
          if (ang <= acc) { idx = i; break; }
          idx = i;
        }
        if (canvas.__hoverIdx === idx) return;
        canvas.__hoverIdx = idx;
        drawDoughnut(canvas, c.cfg, idx);
        var color = c.cfg.colors ? c.cfg.colors[idx % c.cfg.colors.length] : PALETTE[idx % PALETTE.length];
        var format = c.cfg.format || fmtDefault;
        showTip(canvas, rect.width / 2, rect.height / 2 - 6,
          "<span style='color:" + color + "'>●</span> <strong>" + window.Utils.esc(c.cfg.labels[idx]) +
          "</strong><br>" + format(c.cfg.data[idx]) + " · " + Math.round((c.cfg.data[idx] / total) * 100) + "%");
      });
      canvas.addEventListener("mouseleave", function () {
        hideTip(canvas);
        canvas.__hoverIdx = -1;
        stopAnim(canvas);
        if (canvas.__chart) drawDoughnut(canvas, canvas.__chart.cfg, null);
      });
    }
  }

  /* -------------------------------------------------------------- helpers */
  function roundRect(ctx, x, y, w, h, r) {
    if (h <= 0 || w <= 0) { ctx.beginPath(); return; }
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function redraw(canvas) {
    var c = canvas && canvas.__chart;
    if (!c) return;
    stopAnim(canvas);
    if (c.type === "line") drawLine(canvas, c.cfg, null);
    else if (c.type === "bar") drawBar(canvas, c.cfg, null);
    else if (c.type === "hbar") drawHBar(canvas, c.cfg, null);
    else if (c.type === "doughnut") drawDoughnut(canvas, c.cfg, null);
  }

  function redrawAll() {
    all.forEach(function (c) {
      if (c.isConnected && c.offsetParent !== null) redraw(c);
    });
  }

  var all = [];
  function register(canvas) {
    if (all.indexOf(canvas) === -1) all.push(canvas);
  }

  window.addEventListener("resize", window.Utils.debounce(function () {
    all.forEach(function (c) {
      if (c.isConnected && c.offsetParent !== null) redraw(c);
    });
  }, 160));

  window.Charts = {
    line: function (canvas, cfg) { register(canvas); line(canvas, cfg); },
    bar: function (canvas, cfg) { register(canvas); bar(canvas, cfg); },
    hbar: function (canvas, cfg) { register(canvas); hbar(canvas, cfg); },
    doughnut: function (canvas, cfg) { register(canvas); doughnut(canvas, cfg); },
    redraw: redraw,
    redrawAll: redrawAll,
    palette: PALETTE,
    gold: GOLD,
    goldLight: GOLD_LIGHT
  };
})(window);
