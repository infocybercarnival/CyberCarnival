(function () {
  "use strict";

  var eventId = window.EVENT_ID;
  var CSRF_TOKEN = document.querySelector('meta[name="csrf-token"]') ? document.querySelector('meta[name="csrf-token"]').content : "";
  var html5QrCode = null;
  var isScanning = false;
  var autoResetTimer = null;

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function apiCheckIn(payload) {
    return fetch("/coordinator/api/events/" + encodeURIComponent(eventId) + "/check-in", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": CSRF_TOKEN
      },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().then(function (body) {
        return { ok: res.ok, status: res.status, body: body };
      });
    });
  }

  function updateLiveCount() {
    fetch("/coordinator/api/events/" + encodeURIComponent(eventId))
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.attendance_stats) {
          document.getElementById("scanner-present-count").textContent = data.attendance_stats.present || 0;
        }
      }).catch(function () {});
  }

  function processScanResult(qrString) {
    if (!qrString || isScanning) return;
    isScanning = true;

    if (html5QrCode && html5QrCode.isScanning) {
      try { html5QrCode.pause(true); } catch (e) {}
    }

    var statusBar = document.getElementById("scanner-status-bar");
    statusBar.style.background = "rgba(255, 255, 255, 0.1)";
    statusBar.style.color = "#ffffff";
    statusBar.innerHTML = "⏳ VALIDATING TICKET...";

    apiCheckIn({ qr_data: qrString })
      .then(function (res) {
        displayResult(res.body);
        updateLiveCount();
      })
      .catch(function (err) {
        displayResult({
          success: false,
          status: "ERROR",
          message: err.message || "Failed to validate ticket"
        });
      });
  }

  function displayResult(res) {
    var card = document.getElementById("scan-result-card");
    var badge = document.getElementById("result-badge");
    var title = document.getElementById("result-title");
    var details = document.getElementById("result-details");
    var statusBar = document.getElementById("scanner-status-bar");

    card.style.display = "block";

    var pName = (res.participant && res.participant.name) || res.participant_name || "—";
    var pEmail = (res.participant && res.participant.email) || res.participant_email || "—";
    var eName = res.event || res.event_name || "";
    var timeStr = res.checked_in_at || "Just now";
    var checkedBy = res.checked_in_by || "Coordinator";

    if (res.success && (res.status === "PRESENT" || res.status === "VALID")) {
      statusBar.style.background = "rgba(16, 185, 129, 0.2)";
      statusBar.style.color = "#10b981";
      statusBar.innerHTML = "✓ ATTENDANCE MARKED";

      badge.style.background = "rgba(16, 185, 129, 0.2)";
      badge.style.color = "#10b981";
      badge.style.border = "1px solid #10b981";
      badge.textContent = "ATTENDANCE MARKED — PRESENT";

      title.style.color = "#10b981";
      title.textContent = "✓ ATTENDANCE MARKED";

      details.innerHTML =
        '<dt style="color:#a8a8b3;">Student Name:</dt><dd><strong>' + escapeHtml(pName) + '</strong></dd>' +
        (pEmail ? '<dt style="color:#a8a8b3;">Email:</dt><dd>' + escapeHtml(pEmail) + '</dd>' : '') +
        '<dt style="color:#a8a8b3;">Event Name:</dt><dd>' + escapeHtml(eName) + '</dd>' +
        '<dt style="color:#a8a8b3;">Status:</dt><dd><strong style="color:#10b981;">PRESENT</strong></dd>' +
        '<dt style="color:#a8a8b3;">Time:</dt><dd>' + escapeHtml(timeStr) + '</dd>';
    } else if (res.status === "ALREADY_PRESENT" || res.status === "ALREADY_CHECKED_IN") {
      statusBar.style.background = "rgba(245, 158, 11, 0.2)";
      statusBar.style.color = "#f59e0b";
      statusBar.innerHTML = "⚠ ALREADY PRESENT";

      badge.style.background = "rgba(245, 158, 11, 0.2)";
      badge.style.color = "#f59e0b";
      badge.style.border = "1px solid #f59e0b";
      badge.textContent = "ALREADY PRESENT";

      title.style.color = "#f59e0b";
      title.textContent = "⚠ ALREADY PRESENT";

      details.innerHTML =
        '<dt style="color:#a8a8b3;">Student Name:</dt><dd><strong>' + escapeHtml(pName) + '</strong></dd>' +
        '<dt style="color:#a8a8b3;">Message:</dt><dd style="color:#f59e0b;">This student has already been marked present.</dd>' +
        '<dt style="color:#a8a8b3;">Check-in Time:</dt><dd>' + escapeHtml(timeStr) + '</dd>' +
        '<dt style="color:#a8a8b3;">Checked By:</dt><dd>' + escapeHtml(checkedBy) + '</dd>';
    } else if (res.status === "WRONG_EVENT") {
      statusBar.style.background = "rgba(239, 68, 68, 0.2)";
      statusBar.style.color = "#ef4444";
      statusBar.innerHTML = "✕ WRONG EVENT";

      badge.style.background = "rgba(239, 68, 68, 0.2)";
      badge.style.color = "#ef4444";
      badge.style.border = "1px solid #ef4444";
      badge.textContent = "WRONG EVENT";

      title.style.color = "#ef4444";
      title.textContent = "✕ WRONG EVENT";

      details.innerHTML =
        '<dt style="color:#a8a8b3;">Message:</dt><dd style="color:#ef4444;">This QR ticket belongs to another event.</dd>';
    } else if (res.status === "PAYMENT_NOT_VERIFIED") {
      statusBar.style.background = "rgba(239, 68, 68, 0.2)";
      statusBar.style.color = "#ef4444";
      statusBar.innerHTML = "✕ PAYMENT NOT VERIFIED";

      badge.style.background = "rgba(239, 68, 68, 0.2)";
      badge.style.color = "#ef4444";
      badge.style.border = "1px solid #ef4444";
      badge.textContent = "PAYMENT NOT VERIFIED";

      title.style.color = "#ef4444";
      title.textContent = "✕ PAYMENT NOT VERIFIED";

      details.innerHTML =
        '<dt style="color:#a8a8b3;">Message:</dt><dd style="color:#ef4444;">' + escapeHtml(res.message || "Registration payment verification is pending.") + '</dd>';
    } else if (res.status === "REGISTRATION_REJECTED") {
      statusBar.style.background = "rgba(239, 68, 68, 0.2)";
      statusBar.style.color = "#ef4444";
      statusBar.innerHTML = "✕ REGISTRATION REJECTED";

      badge.style.background = "rgba(239, 68, 68, 0.2)";
      badge.style.color = "#ef4444";
      badge.style.border = "1px solid #ef4444";
      badge.textContent = "REGISTRATION REJECTED";

      title.style.color = "#ef4444";
      title.textContent = "✕ REGISTRATION REJECTED";

      details.innerHTML =
        '<dt style="color:#a8a8b3;">Message:</dt><dd style="color:#ef4444;">' + escapeHtml(res.message || "Registration has been rejected.") + '</dd>';
    } else {
      var msg = res.message || "Invalid ticket code";
      statusBar.style.background = "rgba(239, 68, 68, 0.2)";
      statusBar.style.color = "#ef4444";
      statusBar.innerHTML = "✕ INVALID TICKET";

      badge.style.background = "rgba(239, 68, 68, 0.2)";
      badge.style.color = "#ef4444";
      badge.style.border = "1px solid #ef4444";
      badge.textContent = "INVALID TICKET";

      title.style.color = "#ef4444";
      title.textContent = "✕ INVALID TICKET";

      details.innerHTML = '<dt style="color:#a8a8b3;">Error Detail:</dt><dd style="color:#ef4444;">' + escapeHtml(msg) + '</dd>';
    }

    if (autoResetTimer) clearTimeout(autoResetTimer);
    autoResetTimer = setTimeout(resetToReady, 5000);
  }

  function resetToReady() {
    if (autoResetTimer) clearTimeout(autoResetTimer);
    autoResetTimer = null;
    isScanning = false;

    document.getElementById("scan-result-card").style.display = "none";
    var statusBar = document.getElementById("scanner-status-bar");
    statusBar.style.background = "rgba(0,240,255,0.1)";
    statusBar.style.color = "#00f0ff";
    statusBar.innerHTML = "● READY TO SCAN";

    if (html5QrCode && html5QrCode.isScanning) {
      try { html5QrCode.resume(); } catch (e) {}
    }
  }

  document.getElementById("btn-next-scan").addEventListener("click", resetToReady);

  // Manual Scan Form Handler
  document.getElementById("manual-scan-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var val = document.getElementById("manual-ticket-input").value.trim();
    if (val) {
      processScanResult(val);
      document.getElementById("manual-ticket-input").value = "";
    }
  });

  // Initialize Camera QR Scanner
  function startCameraScanner() {
    if (typeof Html5Qrcode === "undefined") {
      console.warn("Html5Qrcode library not loaded.");
      document.getElementById("camera-fallback-msg").style.display = "block";
      return;
    }

    html5QrCode = new Html5Qrcode("reader");
    var config = { fps: 10, qrbox: { width: 240, height: 240 } };

    html5QrCode.start(
      { facingMode: "environment" },
      config,
      function onScanSuccess(decodedText) {
        processScanResult(decodedText);
      },
      function onScanError(err) {}
    ).catch(function (err) {
      console.warn("Camera start failed:", err);
      document.getElementById("camera-fallback-msg").style.display = "block";
    });
  }

  updateLiveCount();
  startCameraScanner();
})();
