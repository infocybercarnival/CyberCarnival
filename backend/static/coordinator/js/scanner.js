(function () {
  "use strict";

  var eventId = window.EVENT_ID;

  var csrfMeta = document.querySelector(
    'meta[name="csrf-token"]'
  );

  var CSRF_TOKEN = csrfMeta
    ? csrfMeta.content
    : "";

  var html5QrCode = null;
  var isScanning = false;
  var cameraStarted = false;
  var cameraStarting = false;
  var autoResetTimer = null;

  function el(id) {
    return document.getElementById(id);
  }

  function escapeHtml(str) {
    var div = document.createElement("div");

    div.textContent =
      str == null
        ? ""
        : String(str);

    return div.innerHTML;
  }

  function setStatus(text, bg, color) {
    var bar = el("scanner-status-bar");

    if (!bar) return;

    bar.style.background = bg;
    bar.style.color = color;
    bar.innerHTML = text;
  }

  function showCameraError(title, detail) {
    el("reader").style.display = "none";
    el("camera-fallback-msg").style.display = "block";

    el("camera-error-title").textContent = title;
    el("camera-error-detail").textContent = detail;

    setStatus(
      "✕ CAMERA UNAVAILABLE",
      "rgba(239,68,68,.18)",
      "#ef4444"
    );
  }

  function hideCameraError() {
    el("camera-fallback-msg").style.display = "none";
    el("reader").style.display = "block";
  }

  function cameraErrorText(err) {
    var name =
      err && err.name
        ? err.name
        : "";

    var msg =
      err && err.message
        ? err.message
        : String(err || "");

    if (!window.isSecureContext) {
      return [
        "SECURE CONNECTION REQUIRED",
        "Open this scanner using HTTPS. Camera access will not work on normal HTTP."
      ];
    }

    if (
      name === "NotAllowedError" ||
      /permission|denied|not allowed/i.test(msg)
    ) {
      return [
        "CAMERA PERMISSION BLOCKED",
        "Open Site Settings → Camera → Allow, then tap RETRY CAMERA."
      ];
    }

    if (
      name === "NotFoundError" ||
      /not found|no camera/i.test(msg)
    ) {
      return [
        "NO CAMERA FOUND",
        "No usable camera was detected on this device."
      ];
    }

    if (
      name === "NotReadableError" ||
      /in use|not readable|could not start/i.test(msg)
    ) {
      return [
        "CAMERA IS BUSY",
        "Close other apps or browser tabs using the camera, then retry."
      ];
    }

    return [
      "CAMERA COULD NOT START",
      "Tap RETRY CAMERA and choose Allow when the browser asks for camera access."
    ];
  }

  function apiCheckIn(payload) {
    return fetch(
      "/coordinator/api/events/" +
        encodeURIComponent(eventId) +
        "/check-in",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": CSRF_TOKEN
        },

        credentials: "same-origin",

        body: JSON.stringify(payload)
      }
    ).then(function (res) {
      return res.json().then(function (body) {
        return {
          ok: res.ok,
          status: res.status,
          body: body
        };
      });
    });
  }

  function updateLiveCount() {
    fetch(
      "/coordinator/api/events/" +
        encodeURIComponent(eventId),
      {
        credentials: "same-origin"
      }
    )
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (data.attendance_stats) {
          el("scanner-present-count").textContent =
            data.attendance_stats.present || 0;
        }
      })
      .catch(function () {});
  }

  function processScanResult(qrString) {
    if (!qrString || isScanning) return;

    isScanning = true;

    if (
      html5QrCode &&
      html5QrCode.isScanning
    ) {
      try {
        html5QrCode.pause(true);
      } catch (e) {}
    }

    setStatus(
      "⏳ VALIDATING TICKET...",
      "rgba(255,255,255,.1)",
      "#fff"
    );

    apiCheckIn({
      qr_data: qrString
    })
      .then(function (res) {
        displayResult(res.body);
        updateLiveCount();
      })
      .catch(function (err) {
        displayResult({
          success: false,
          status: "ERROR",
          message:
            err.message ||
            "Failed to validate ticket"
        });
      });
  }

  function displayResult(res) {
    var card =
      el("scan-result-card");

    var badge =
      el("result-badge");

    var title =
      el("result-title");

    var details =
      el("result-details");

    card.style.display = "block";

    var pName =
      (res.participant &&
        res.participant.name) ||
      res.participant_name ||
      "—";

    var pEmail =
      (res.participant &&
        res.participant.email) ||
      res.participant_email ||
      "—";

    var eName =
      res.event ||
      res.event_name ||
      "";

    var timeStr =
      res.checked_in_at ||
      "Just now";

    var checkedBy =
      res.checked_in_by ||
      "Coordinator";

    if (
      res.success &&
      (
        res.status === "PRESENT" ||
        res.status === "VALID"
      )
    ) {
      setStatus(
        "✓ ATTENDANCE MARKED",
        "rgba(16,185,129,.2)",
        "#10b981"
      );

      badge.style.background =
        "rgba(16,185,129,.2)";

      badge.style.color =
        "#10b981";

      badge.style.border =
        "1px solid #10b981";

      badge.textContent =
        "ATTENDANCE MARKED — PRESENT";

      title.style.color =
        "#10b981";

      title.textContent =
        "✓ ATTENDANCE MARKED";

      details.innerHTML =
        '<dt style="color:#a8a8b3;">Student Name:</dt>' +
        '<dd><strong>' +
        escapeHtml(pName) +
        "</strong></dd>" +

        '<dt style="color:#a8a8b3;">Email:</dt>' +
        "<dd>" +
        escapeHtml(pEmail) +
        "</dd>" +

        '<dt style="color:#a8a8b3;">Event Name:</dt>' +
        "<dd>" +
        escapeHtml(eName) +
        "</dd>" +

        '<dt style="color:#a8a8b3;">Status:</dt>' +
        '<dd><strong style="color:#10b981;">PRESENT</strong></dd>' +

        '<dt style="color:#a8a8b3;">Time:</dt>' +
        "<dd>" +
        escapeHtml(timeStr) +
        "</dd>";

    } else if (
      res.status === "ALREADY_PRESENT" ||
      res.status === "ALREADY_CHECKED_IN"
    ) {
      setStatus(
        "⚠ ALREADY PRESENT",
        "rgba(245,158,11,.2)",
        "#f59e0b"
      );

      badge.style.background =
        "rgba(245,158,11,.2)";

      badge.style.color =
        "#f59e0b";

      badge.style.border =
        "1px solid #f59e0b";

      badge.textContent =
        "ALREADY PRESENT";

      title.style.color =
        "#f59e0b";

      title.textContent =
        "⚠ ALREADY PRESENT";

      details.innerHTML =
        '<dt style="color:#a8a8b3;">Student Name:</dt>' +
        '<dd><strong>' +
        escapeHtml(pName) +
        "</strong></dd>" +

        '<dt style="color:#a8a8b3;">Message:</dt>' +
        '<dd style="color:#f59e0b;">' +
        "This student has already been marked present." +
        "</dd>" +

        '<dt style="color:#a8a8b3;">Check-in Time:</dt>' +
        "<dd>" +
        escapeHtml(timeStr) +
        "</dd>" +

        '<dt style="color:#a8a8b3;">Checked By:</dt>' +
        "<dd>" +
        escapeHtml(checkedBy) +
        "</dd>";

    } else {
      var msg =
        res.message ||
        "Invalid ticket code";

      var label =
        (res.status ||
          "INVALID_TICKET")
          .replace(/_/g, " ");

      setStatus(
        "✕ " + label,
        "rgba(239,68,68,.2)",
        "#ef4444"
      );

      badge.style.background =
        "rgba(239,68,68,.2)";

      badge.style.color =
        "#ef4444";

      badge.style.border =
        "1px solid #ef4444";

      badge.textContent =
        label;

      title.style.color =
        "#ef4444";

      title.textContent =
        "✕ " + label;

      details.innerHTML =
        '<dt style="color:#a8a8b3;">Message:</dt>' +
        '<dd style="color:#ef4444;">' +
        escapeHtml(msg) +
        "</dd>";
    }

    if (autoResetTimer) {
      clearTimeout(autoResetTimer);
    }

    autoResetTimer =
      setTimeout(
        resetToReady,
        5000
      );
  }

  function resetToReady() {
    if (autoResetTimer) {
      clearTimeout(autoResetTimer);
    }

    autoResetTimer = null;
    isScanning = false;

    el("scan-result-card").style.display =
      "none";

    setStatus(
      cameraStarted
        ? "● READY TO SCAN"
        : "● CAMERA NOT STARTED",

      "rgba(0,240,255,.1)",
      "#00f0ff"
    );

    if (
      html5QrCode &&
      html5QrCode.isScanning
    ) {
      try {
        html5QrCode.resume();
      } catch (e) {}
    }
  }

  function startCameraScanner() {
    if (
      cameraStarting ||
      cameraStarted
    ) {
      return;
    }

    if (!window.isSecureContext) {
      showCameraError(
        "SECURE CONNECTION REQUIRED",
        "Open this scanner using HTTPS. Camera access will not work on normal HTTP."
      );

      return;
    }

    if (
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      showCameraError(
        "CAMERA API NOT AVAILABLE",
        "Try the latest Chrome or Safari on this phone."
      );

      return;
    }

    if (
      typeof Html5Qrcode === "undefined"
    ) {
      showCameraError(
        "QR SCANNER LIBRARY FAILED TO LOAD",
        "The scanner library did not load. Refresh the page and try again."
      );

      return;
    }

    cameraStarting = true;

    hideCameraError();

    el("btn-start-camera").disabled =
      true;

    el("btn-start-camera").textContent =
      "STARTING CAMERA...";

    el("btn-retry-camera").disabled =
      true;

    setStatus(
      "⏳ REQUESTING CAMERA ACCESS...",
      "rgba(255,255,255,.1)",
      "#fff"
    );

    if (!html5QrCode) {
      html5QrCode =
        new Html5Qrcode("reader");
    }

    var config = {
      fps: 10,

      qrbox: function (w, h) {
        var size =
          Math.floor(
            Math.min(w, h) * 0.72
          );

        size =
          Math.max(
            180,
            Math.min(
              size,
              280
            )
          );

        return {
          width: size,
          height: size
        };
      },

      disableFlip: false
    };

    html5QrCode
      .start(
        {
          facingMode: {
            ideal: "environment"
          }
        },

        config,

        function (decodedText) {
          processScanResult(
            decodedText
          );
        },

        function () {}
      )
      .then(function () {
        cameraStarted = true;
        cameraStarting = false;

        el("btn-start-camera").style.display =
          "none";

        el("btn-start-camera").disabled =
          false;

        el("btn-retry-camera").disabled =
          false;

        setStatus(
          "● READY TO SCAN",
          "rgba(0,240,255,.1)",
          "#00f0ff"
        );
      })
      .catch(function (err) {
        cameraStarted = false;
        cameraStarting = false;

        el("btn-start-camera").style.display =
          "block";

        el("btn-start-camera").disabled =
          false;

        el("btn-start-camera").textContent =
          "📷 START CAMERA";

        el("btn-retry-camera").disabled =
          false;

        console.warn(
          "Camera start failed:",
          err
        );

        var explained =
          cameraErrorText(err);

        showCameraError(
          explained[0],
          explained[1]
        );
      });
  }

  el("btn-next-scan")
    .addEventListener(
      "click",
      resetToReady
    );

  el("manual-scan-form")
    .addEventListener(
      "submit",
      function (e) {
        e.preventDefault();

        var val =
          el("manual-ticket-input")
            .value
            .trim();

        if (val) {
          processScanResult(val);

          el("manual-ticket-input").value =
            "";
        }
      }
    );

  el("btn-start-camera")
    .addEventListener(
      "click",
      startCameraScanner
    );

  el("btn-retry-camera")
    .addEventListener(
      "click",
      startCameraScanner
    );

  window.addEventListener(
    "pagehide",
    function () {
      if (
        html5QrCode &&
        html5QrCode.isScanning
      ) {
        try {
          html5QrCode.stop();
        } catch (e) {}
      }
    }
  );

  updateLiveCount();

  // IMPORTANT:
  // Do not auto-start on mobile.
  // User must tap START CAMERA so browser
  // can show permission prompt reliably.
})();
