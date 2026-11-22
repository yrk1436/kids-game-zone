/* ==========================================================================
   Shared overlay + visibility pause helpers (vanilla games, no bundler).
   ========================================================================== */
(function (global) {
  "use strict";

  /**
   * @param {object} opts
   * @param {() => boolean} opts.isRunning - true while core gameplay should advance
   * @param {(detail: { reason: string }) => void} opts.onPause
   * @param {(detail: { reason: string }) => void} opts.onResume
   * @param {string[]} [opts.overlayIds] - overlay element ids to watch (visible when not .is-hidden)
   * @param {boolean} [opts.resumeOnVisible=true] - auto-resume when tab visible after hidden-pause
   */
  function installVisibilityPause(opts) {
    const resumeOnVisible = opts.resumeOnVisible !== false;
    let pausedForHidden = false;

    function onHidden() {
      if (!opts.isRunning()) return;
      pausedForHidden = true;
      opts.onPause({ reason: "hidden" });
    }

    function onVisible() {
      if (!resumeOnVisible || !pausedForHidden) return;
      pausedForHidden = false;
      opts.onResume({ reason: "visible" });
    }

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) onHidden();
      else onVisible();
    });
  }

  /**
   * Shifts a wall-clock deadline forward by the time spent paused (ms).
   * @param {number} deadlineMs - Date.now()-style deadline
   * @param {number} pauseStartedMs
   * @param {number} pauseEndedMs
   * @returns {number}
   */
  function shiftDeadline(deadlineMs, pauseStartedMs, pauseEndedMs) {
    if (pauseEndedMs <= pauseStartedMs) return deadlineMs;
    return deadlineMs + (pauseEndedMs - pauseStartedMs);
  }

  global.BadriOverlayPause = {
    installVisibilityPause: installVisibilityPause,
    shiftDeadline: shiftDeadline,
  };
})(typeof window !== "undefined" ? window : globalThis);