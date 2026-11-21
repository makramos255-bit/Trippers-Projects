(function (window) {
  "use strict";
  // A new version lets existing installs see the corrected intro once; the
  // completion is saved under this key and will not replay on later visits.
  var KEY = "trippers.intro.completed.v5";
  var STARTED_KEY = "trippers.intro.started.v3";
  var running = false;

  function completed() {
    try { return window.localStorage.getItem(KEY) === "1"; }
    catch (e) { return false; }
  }

  function prepareWordmark(intro) {
    var wordmark = intro.querySelector(".intro-wordmark");
    if (!wordmark || wordmark.dataset.split === "1") return;
    var label = wordmark.textContent || "TRIPPERS COFFEE";
    wordmark.setAttribute("aria-label", label);
    wordmark.setAttribute("aria-hidden", "true");
    wordmark.textContent = "";
    Array.from(label).forEach(function (character, index) {
      var letter = document.createElement("span");
      letter.className = character === " " ? "intro-letter intro-letter-space" : "intro-letter";
      letter.textContent = character === " " ? "\u00a0" : character;
      letter.style.animationDelay = (2600 + index * 48) + "ms";
      wordmark.appendChild(letter);
    });
    wordmark.dataset.split = "1";
  }

  function playIfNeeded() {
    // Run once per document load. In-app logout does not reload the document,
    // so it continues to return directly to login without replaying the intro.
    if (running) return false;
    var intro = document.getElementById("brandIntro");
    if (!intro) return false;
    // A started marker without a completion marker means a previous intro was
    // interrupted (for example, by refreshing). Allow the full animation to run again.
    try { window.localStorage.removeItem(STARTED_KEY); window.localStorage.setItem(STARTED_KEY, "1"); }
    catch (e) { /* Playback can continue if browser storage is unavailable. */ }
    running = true;
    prepareWordmark(intro);
    intro.classList.remove("hidden", "is-leaving", "is-playing");
    void intro.offsetWidth;
    intro.classList.add("is-playing");
    intro.setAttribute("aria-hidden", "false");
    var reduceMotion = false;
    try { reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
    catch (e) { /* use the full animation when motion settings are unavailable */ }

    window.setTimeout(function () {
      try { window.localStorage.setItem(KEY, "1"); }
      catch (e) { /* The intro still completes if browser storage is unavailable. */ }
      try { window.localStorage.removeItem(STARTED_KEY); } catch (e) { /* optional cleanup */ }
      intro.classList.add("is-leaving");
      window.setTimeout(function () {
        intro.classList.add("hidden");
        intro.classList.remove("is-leaving", "is-playing");
        intro.setAttribute("aria-hidden", "true");
        running = false;
      }, reduceMotion ? 520 : 1020);
    }, reduceMotion ? 3000 : 6800);
    return true;
  }

  function reset() {
    try {
      window.localStorage.removeItem(KEY);
      window.localStorage.removeItem("trippers.intro.completed.v4");
      window.localStorage.removeItem("trippers.intro.completed.v3");
      window.localStorage.removeItem(STARTED_KEY);
      return true;
    }
    catch (e) { return false; }
  }

  window.BrandIntro = { playIfNeeded: playIfNeeded, hasCompleted: completed, reset: reset };

  // Start independently of app boot so an unrelated startup error cannot
  // prevent the intro from appearing. App.boot may call this too; running and
  // the completion flag make that second call harmless.
  if (window.document.readyState === "loading") {
    window.document.addEventListener("DOMContentLoaded", playIfNeeded, { once: true });
  } else {
    window.setTimeout(playIfNeeded, 0);
  }
})(window);
