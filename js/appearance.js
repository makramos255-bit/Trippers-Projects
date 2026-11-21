/* ==========================================================================
   TRIPPERS COFFEE — appearance.js
   User appearance preferences: theme, accent, sidebar, density, font size.
   Preferences are stored in localStorage and previewed live in Settings.
   ========================================================================== */
(function (window) {
  "use strict";

  var KEY = "trippers.appearance";
  var loadedUser = null;

  function storageKey() {
    if (!window.Store || !window.Store.db) return KEY;
    var user = window.Auth && window.Auth.user ? window.Auth.user() : null;
    return user ? KEY + "." + user.id : KEY;
  }

  var DEFAULTS = {
    theme: "dark",
    accent: "gold",
    customAccent: "#d4af37",
    sidebar: "expanded",
    surface: "classic",
    density: "comfortable",
    font: "medium"
  };

  var PRESETS = {
    gold: "#d4af37",
    brown: "#a9713f",
    black: "#1c1c1c"
  };

  var saved = null;
  var preview = null;
  var boundSettings = false;
  var boundChrome = false;

  /* ------------------------------------------------------------- colour helpers */
  function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

  function parseHex(hex) {
    var h = String(hex || "").trim().replace("#", "");
    if (/^[0-9a-f]{3}$/i.test(h)) h = h.split("").map(function (c) { return c + c; }).join("");
    if (!/^[0-9a-f]{6}$/i.test(h)) return null;
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16)
    };
  }

  function toHex(rgb) {
    function p(n) { var s = clamp(Math.round(n), 0, 255).toString(16); return s.length === 1 ? "0" + s : s; }
    return "#" + p(rgb.r) + p(rgb.g) + p(rgb.b);
  }

  function mix(hex, target, amount) {
    var a = parseHex(hex) || { r: 212, g: 175, b: 55 };
    var t = parseHex(target) || { r: 255, g: 255, b: 255 };
    var p = clamp(Number(amount) || 0, 0, 1);
    return toHex({
      r: a.r + (t.r - a.r) * p,
      g: a.g + (t.g - a.g) * p,
      b: a.b + (t.b - a.b) * p
    });
  }

  function luminance(hex) {
    var c = parseHex(hex);
    if (!c) return 0;
    var channels = [c.r, c.g, c.b].map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  }

  function ensureLum(hex, min, max) {
    var out = hex;
    var guard = 0;
    while (luminance(out) < min && guard++ < 22) out = mix(out, "#ffffff", 0.11);
    guard = 0;
    while (luminance(out) > max && guard++ < 22) out = mix(out, "#000000", 0.11);
    return out;
  }

  function rgbText(hex) {
    var c = parseHex(hex) || { r: 212, g: 175, b: 55 };
    return c.r + ", " + c.g + ", " + c.b;
  }

  function resolvedTheme(prefs) {
    var mode = (prefs && prefs.theme) || DEFAULTS.theme;
    if (mode === "system") {
      try {
        return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      } catch (e) {
        return "dark";
      }
    }
    return mode === "light" ? "light" : "dark";
  }

  function accentPalette(prefs) {
    var name = prefs.accent || "gold";
    var raw = name === "custom" ? (parseHex(prefs.customAccent) ? prefs.customAccent : PRESETS.gold) : (PRESETS[name] || PRESETS.gold);
    var light = resolvedTheme(prefs) === "light";

    // Keep the accent readable on the active background. Dark mode lifts very
    // dark accents (e.g. Black) to graphite; light mode deepens pale customs.
    var base = light ? ensureLum(raw, 0, 0.62) : ensureLum(raw, 0.34, 1);
    var text = light ? ensureLum(mix(base, "#000000", 0.34), 0, 0.45) : ensureLum(mix(base, "#ffffff", 0.26), 0.48, 1);
    var onDark = ensureLum(mix(base, "#ffffff", 0.35), 0.56, 1);

    return {
      base: base,
      text: text,
      onDark: onDark,
      ink: luminance(base) > 0.52 ? "#17130a" : "#ffffff"
    };
  }

  /* ------------------------------------------------------------- storage */
  function read() {
    var raw = null;
    try { raw = window.localStorage.getItem(storageKey()); } catch (e) { raw = null; }
    if (!raw && storageKey() !== KEY) {
      try { raw = window.localStorage.getItem(KEY); } catch (e) { raw = null; }
    }
    var data = {};
    if (raw) {
      try { data = JSON.parse(raw) || {}; } catch (e) { data = {}; }
    }
    var merged = Object.assign({}, DEFAULTS, data);
    if (["dark", "light", "system"].indexOf(merged.theme) === -1) merged.theme = "dark";
    if (["gold", "brown", "black", "custom"].indexOf(merged.accent) === -1) merged.accent = "gold";
    if (["expanded", "collapsed"].indexOf(merged.sidebar) === -1) merged.sidebar = "expanded";
    if (["classic", "espresso", "soft"].indexOf(merged.surface) === -1) merged.surface = "classic";
    if (["comfortable", "compact"].indexOf(merged.density) === -1) merged.density = "comfortable";
    if (["small", "medium", "large"].indexOf(merged.font) === -1) merged.font = "medium";
    if (!parseHex(merged.customAccent)) merged.customAccent = DEFAULTS.customAccent;
    return merged;
  }

  function write(prefs) {
    try {
      window.localStorage.setItem(storageKey(), JSON.stringify(prefs));
      return true;
    } catch (e) {
      if (window.App && window.App.toast) window.App.toast("Could not save appearance preferences.", "danger");
      return false;
    }
  }

  /* ------------------------------------------------------------- apply */
  function apply(prefs, options) {
    prefs = Object.assign({}, DEFAULTS, prefs || {});
    var root = document.documentElement;
    var theme = resolvedTheme(prefs);
    var palette = accentPalette(prefs);

    root.setAttribute("data-theme", theme);
    root.setAttribute("data-accent", prefs.accent);
    root.setAttribute("data-sidebar", prefs.sidebar);
    root.setAttribute("data-surface", prefs.surface || "classic");
    root.setAttribute("data-density", prefs.density);
    root.setAttribute("data-font", prefs.font);

    root.style.setProperty("--gold", palette.base);
    root.style.setProperty("--gold-light", palette.text);
    root.style.setProperty("--gold-rgb", rgbText(palette.base));
    root.style.setProperty("--gold-light-rgb", rgbText(palette.text));
    root.style.setProperty("--gold-on-dark", palette.onDark);
    root.style.setProperty("--accent-ink", palette.ink);

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "light" ? "#f6f2ea" : "#111111");

    if (!options || !options.silentCharts) {
      if (window.Charts && window.Charts.redrawAll) {
        window.setTimeout(function () { window.Charts.redrawAll(); }, 40);
      }
    }
    syncThemeButtons();
  }

  function syncThemeButtons() {
    var light = document.documentElement.getAttribute("data-theme") === "light";
    document.querySelectorAll("[data-theme-toggle]").forEach(function (btn) {
      var icon = btn.querySelector("i");
      if (icon) icon.className = "bi " + (light ? "bi-moon-stars" : "bi-sun");
      btn.setAttribute("title", light ? "Switch to dark mode" : "Switch to light mode");
      btn.setAttribute("aria-label", btn.getAttribute("title"));
    });
  }

  function use(prefs, options) {
    saved = Object.assign({}, DEFAULTS, prefs || read());
    if (!options || !options.keepPreview) preview = null;
    apply(saved, options);
    syncControls();
    return saved;
  }

  function get() { return Object.assign({}, saved || read()); }

  function save(prefs) {
    prefs = Object.assign({}, DEFAULTS, prefs || {});
    if (!write(prefs)) return false;
    saved = prefs;
    preview = null;
    apply(saved);
    syncControls();
    return true;
  }

  function setTheme(theme) {
    var p = get();
    p.theme = theme;
    save(p);
  }

  function toggleTheme() {
    var p = get();
    p.theme = resolvedTheme(p) === "light" ? "dark" : "light";
    save(p);
    if (window.App && window.App.toast) {
      window.App.toast(p.theme === "light" ? "Light mode enabled." : "Dark mode enabled.", "success", 1800);
    }
  }

  function setSidebar(mode) {
    var p = get();
    p.sidebar = mode === "collapsed" ? "collapsed" : "expanded";
    save(p);
  }

  function toggleSidebar() {
    setSidebar(get().sidebar === "collapsed" ? "expanded" : "collapsed");
  }

  function reset() {
    return save(Object.assign({}, DEFAULTS));
  }

  /* ------------------------------------------------------------- settings UI */
  function markGroup(selector, attr, value) {
    document.querySelectorAll(selector).forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute(attr) === value);
      btn.setAttribute("aria-pressed", btn.getAttribute(attr) === value ? "true" : "false");
    });
  }

  function syncControls() {
    var panel = document.getElementById("appearancePanel");
    if (!panel) return;
    var p = preview || saved || read();
    markGroup("[data-app-theme]", "data-app-theme", p.theme);
    markGroup("[data-app-accent]", "data-app-accent", p.accent);
    markGroup("[data-app-sidebar]", "data-app-sidebar", p.sidebar);
    markGroup("[data-app-surface]", "data-app-surface", p.surface || "classic");
    markGroup("[data-app-density]", "data-app-density", p.density);
    markGroup("[data-app-font]", "data-app-font", p.font);

    var custom = document.getElementById("setAccentCustom");
    if (custom) custom.value = p.customAccent || DEFAULTS.customAccent;
    var customWrap = document.getElementById("accentCustomWrap");
    if (customWrap) customWrap.classList.toggle("hidden", p.accent !== "custom");
    updatePreviewNote();
  }

  function updatePreviewNote() {
    var note = document.getElementById("appearancePreviewNote");
    if (!note) return;
    if (preview) {
      note.classList.remove("hidden");
      note.innerHTML = '<i class="bi bi-eye"></i><span>Previewing unsaved changes. Choose <strong>Save changes</strong> to keep them.</span>';
    } else {
      note.classList.add("hidden");
    }
  }

  function draftFromControls() {
    var p = get();
    var theme = document.querySelector("[data-app-theme].active");
    var accent = document.querySelector("[data-app-accent].active");
    var sidebar = document.querySelector("[data-app-sidebar].active");
    var surface = document.querySelector("[data-app-surface].active");
    var density = document.querySelector("[data-app-density].active");
    var font = document.querySelector("[data-app-font].active");
    var custom = document.getElementById("setAccentCustom");
    return {
      theme: theme ? theme.getAttribute("data-app-theme") : p.theme,
      accent: accent ? accent.getAttribute("data-app-accent") : p.accent,
      customAccent: custom ? custom.value : p.customAccent,
      sidebar: sidebar ? sidebar.getAttribute("data-app-sidebar") : p.sidebar,
      surface: surface ? surface.getAttribute("data-app-surface") : (p.surface || "classic"),
      density: density ? density.getAttribute("data-app-density") : p.density,
      font: font ? font.getAttribute("data-app-font") : p.font
    };
  }

  function previewFromControls() {
    var p = draftFromControls();
    preview = p;
    apply(p);
    syncControls();
  }

  function initSettings() {
    if (!document.getElementById("appearancePanel")) return;
    saved = saved || read();
    syncControls();
    if (boundSettings) return;
    boundSettings = true;

    document.querySelectorAll("[data-app-theme]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll("[data-app-theme]").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        previewFromControls();
      });
    });
    document.querySelectorAll("[data-app-accent]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll("[data-app-accent]").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        previewFromControls();
      });
    });
    document.querySelectorAll("[data-app-sidebar]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll("[data-app-sidebar]").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        previewFromControls();
      });
    });
    document.querySelectorAll("[data-app-surface]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll("[data-app-surface]").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        previewFromControls();
      });
    });
    document.querySelectorAll("[data-app-density]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll("[data-app-density]").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        previewFromControls();
      });
    });
    document.querySelectorAll("[data-app-font]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll("[data-app-font]").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        previewFromControls();
      });
    });

    var custom = document.getElementById("setAccentCustom");
    if (custom) {
      custom.addEventListener("input", function () {
        var customBtn = document.querySelector('[data-app-accent="custom"]');
        if (customBtn) {
          document.querySelectorAll("[data-app-accent]").forEach(function (b) { b.classList.remove("active"); });
          customBtn.classList.add("active");
        }
        var wrap = document.getElementById("accentCustomWrap");
        if (wrap) wrap.classList.remove("hidden");
        previewFromControls();
      });
    }

    var saveBtn = document.getElementById("btnAppearanceSave");
    if (saveBtn) {
      saveBtn.addEventListener("click", function () {
        var p = draftFromControls();
        if (!parseHex(p.customAccent)) p.customAccent = DEFAULTS.customAccent;
        if (save(p)) {
          if (window.App) window.App.toast("Appearance saved to your account.", "success");
        }
      });
    }

    var resetBtn = document.getElementById("btnAppearanceReset");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        reset();
        if (window.App) window.App.toast("Appearance reset to the TRIPPERS black & gold default.", "success", 3200);
      });
    }
  }

  function revertPreview() {
    if (!preview) return;
    preview = null;
    apply(get());
    syncControls();
  }

  /* ------------------------------------------------------------- chrome */
  function bindChrome() {
    if (boundChrome) return;
    boundChrome = true;

    document.addEventListener("click", function (e) {
      var themeBtn = e.target.closest("[data-theme-toggle]");
      if (themeBtn) {
        e.preventDefault();
        toggleTheme();
        return;
      }
      var sideBtn = e.target.closest("[data-sidebar-toggle]");
      if (sideBtn) {
        e.preventDefault();
        toggleSidebar();
        return;
      }
    });

    try {
      var media = window.matchMedia("(prefers-color-scheme: dark)");
      var onChange = function () {
        var p = get();
        if (p.theme === "system") apply(p);
      };
      if (media.addEventListener) media.addEventListener("change", onChange);
      else if (media.addListener) media.addListener(onChange);
    } catch (e) { /* system theme is optional */ }
  }

  function init() {
    use(read(), { silentCharts: true });
    bindChrome();
    return saved;
  }

  function loadForUser(user) {
    var id = user ? user.id : null;
    if (loadedUser === id) return;
    loadedUser = id;
    use(read(), { silentCharts: true });
  }

  window.Appearance = {
    defaults: DEFAULTS,
    init: init,
    loadForUser: loadForUser,
    get: get,
    read: read,
    apply: apply,
    use: use,
    save: save,
    reset: reset,
    setTheme: setTheme,
    toggleTheme: toggleTheme,
    setSidebar: setSidebar,
    toggleSidebar: toggleSidebar,
    initSettings: initSettings,
    revertPreview: revertPreview,
    syncControls: syncControls,
    resolvedTheme: function () { return resolvedTheme(get()); }
  };
})(window);
