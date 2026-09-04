(function () {
  "use strict";

  var CSRF_TOKEN = document.querySelector('meta[name="csrf-token"]').content;

  function escapeHtml(str) {
    // Defense in depth: even though server-side validation already restricts
    // characters, never trust stored data when injecting into innerHTML.
    var div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function api(path, options) {
    options = options || {};
    options.headers = Object.assign({}, options.headers, {
      "X-CSRFToken": CSRF_TOKEN,
    });
    if (options.body && !(options.body instanceof FormData)) {
      options.headers["Content-Type"] = "application/json";
    }
    return fetch(path, options).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          throw new Error(body.error || "request failed (" + res.status + ")");
        });
      }
      var ct = res.headers.get("content-type") || "";
      return ct.indexOf("application/json") !== -1 ? res.json() : res.text();
    });
  }


  function memberPayload(m) { return encodeURIComponent(JSON.stringify(m)); }

  function showMemberDetails(m) {
    var existing = document.getElementById("member-detail-modal");
    if (existing) existing.remove();
    var modal = document.createElement("div");
    modal.id = "member-detail-modal";
    modal.className = "member-modal-backdrop";
    modal.innerHTML = '<div class="member-modal-card">' +
      '<button type="button" class="member-modal-close" aria-label="Close">×</button>' +
      '<h3>Participant details</h3>' +
      '<dl>' +
      '<dt>Name</dt><dd>' + escapeHtml(m.name || "—") + '</dd>' +
      '<dt>CyberCarnival token</dt><dd><code>' + escapeHtml(m.cybercarnival_token || "—") + '</code></dd>' +
      '<dt>Register number</dt><dd>' + escapeHtml(m.register_number || "—") + '</dd>' +
      '<dt>Email</dt><dd>' + escapeHtml(m.email || "—") + '</dd>' +
      '<dt>Phone</dt><dd>' + escapeHtml(m.phone || "—") + '</dd>' +
      '<dt>College</dt><dd>' + escapeHtml(m.college || "—") + '</dd>' +
      '<dt>Role</dt><dd>' + (m.is_leader ? 'Team leader' : 'Team member') + '</dd>' +
      '</dl></div>';
    document.body.appendChild(modal);
    function close() { modal.remove(); }
    modal.querySelector('.member-modal-close').addEventListener('click', close);
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
  }

  var activeTab = "overview";
  var lastSuccessTimestamp = Date.now();
  var pollIntervalTimer = null;
  var statusTimer = null;

  function markConnectionSuccess() {
    lastSuccessTimestamp = Date.now();
    var badge = document.getElementById("live-status-badge");
    var text = document.getElementById("live-status-text");
    if (badge) badge.classList.remove("status-error");
    if (text) text.textContent = "LIVE";
    updateLiveTimeDisplay();
  }

  function markConnectionError() {
    var badge = document.getElementById("live-status-badge");
    var text = document.getElementById("live-status-text");
    if (badge) badge.classList.add("status-error");
    if (text) text.textContent = "CONNECTION ISSUE";
    updateLiveTimeDisplay();
  }

  function updateLiveTimeDisplay() {
    var timeEl = document.getElementById("live-status-time");
    if (!timeEl) return;
    var secAgo = Math.floor((Date.now() - lastSuccessTimestamp) / 1000);
    if (secAgo < 5) {
      timeEl.textContent = "Just now";
    } else if (secAgo < 60) {
      timeEl.textContent = secAgo + "s ago";
    } else {
      timeEl.textContent = Math.floor(secAgo / 60) + "m ago";
    }
  }

  if (!statusTimer) {
    statusTimer = setInterval(updateLiveTimeDisplay, 1000);
  }

  function startRealtimePolling() {
    if (pollIntervalTimer) clearInterval(pollIntervalTimer);
    pollIntervalTimer = setInterval(function () {
      loadTab(activeTab, true);
    }, 12000);
  }

  window.retryActiveTab = function () {
    loadTab(activeTab);
  };

  function renderInlineError(containerId, message) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML =
      '<div class="api-error-box">' +
        '<span>UNABLE TO LOAD DATA: ' + escapeHtml(message) + '</span>' +
        '<button type="button" class="btn-retry" onclick="retryActiveTab()">RETRY</button>' +
      '</div>';
  }

  function memberPayload(m) { return encodeURIComponent(JSON.stringify(m)); }

  function showMemberDetails(m) {
    var existing = document.getElementById("member-detail-modal");
    if (existing) existing.remove();
    var modal = document.createElement("div");
    modal.id = "member-detail-modal";
    modal.className = "member-modal-backdrop";
    modal.innerHTML = '<div class="member-modal-card">' +
      '<button type="button" class="member-modal-close" aria-label="Close">×</button>' +
      '<h3>Participant details</h3>' +
      '<dl>' +
      '<dt>Participant Name</dt><dd>' + escapeHtml(m.participant_name || m.name || "—") + '</dd>' +
      '<dt>Participant Email</dt><dd>' + escapeHtml(m.participant_email || m.email || "—") + '</dd>' +
      '<dt>College Name</dt><dd>' + escapeHtml(m.college_name || m.college || "—") + '</dd>' +
      '<dt>Contact Phone</dt><dd>' + escapeHtml(m.participant_phone || m.phone || "—") + '</dd>' +
      '<dt>CyberCarnival Token</dt><dd><code>' + escapeHtml(m.cybercarnival_token || "—") + '</code></dd>' +
      '<dt>Role</dt><dd>' + (m.is_leader ? 'Team leader' : 'Team member') + '</dd>' +
      '</dl></div>';
    document.body.appendChild(modal);
    function close() { modal.remove(); }
    modal.querySelector('.member-modal-close').addEventListener('click', close);
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
  }

  // --- Tabs -----------------------------------------------------------------------
  document.querySelectorAll(".tab").forEach(function (tabBtn) {
    tabBtn.addEventListener("click", function () {
      document.querySelectorAll(".tab").forEach(function (t) { t.classList.remove("active"); });
      document.querySelectorAll(".panel").forEach(function (p) { p.classList.remove("active"); });
      tabBtn.classList.add("active");
      activeTab = tabBtn.dataset.tab;
      document.getElementById("tab-" + activeTab).classList.add("active");
      loadTab(activeTab);
    });
  });

  function loadTab(name, isSilentPoll) {
    activeTab = name || activeTab;
    var p;
    if (activeTab === "overview") p = loadOverview();
    else if (activeTab === "registrations") p = loadRegistrations();
    else if (activeTab === "participants") p = loadParticipants();
    else if (activeTab === "events") p = loadEvents();
    else if (activeTab === "audit") p = loadAudit();

    if (p && p.then) {
      p.then(markConnectionSuccess).catch(function (err) {
        markConnectionError();
        if (!isSilentPoll) showError(err);
      });
    }
  }

  // --- Overview ---------------------------------------------------------------------
  function loadOverview() {
    return api("/admin/api/summary").then(function (data) {
      document.getElementById("overview-cards").innerHTML =
        '<div class="card"><div class="num">' + data.total_registrations + '</div><div class="label">Team registrations</div></div>' +
        '<div class="card"><div class="num">' + data.total_events + '</div><div class="label">Events</div></div>' +
        '<div class="card"><div class="num">' + data.total_accounts + '</div><div class="label">Accounts created</div></div>' +
        '<div class="card"><div class="num">' + data.accounts_never_registered + '</div><div class="label">Never registered</div></div>';

      var tbody = document.querySelector("#overview-table tbody");
      if (!data.by_event || !data.by_event.length) {
        tbody.innerHTML = '<tr><td colspan="2" class="table-empty-state">NO EVENT REGISTRATION STATS RECORDED YET</td></tr>';
      } else {
        tbody.innerHTML = data.by_event.map(function (row) {
          return "<tr><td>" + escapeHtml(row.event_name) + "</td><td>" + row.count + "</td></tr>";
        }).join("");
      }
    });
  }

  // --- Registrations ------------------------------------------------------------------
  var currentEvents = [];

  function ensureEventsLoaded() {
    if (currentEvents && currentEvents.length > 0) {
      return Promise.resolve(currentEvents);
    }
    return api("/admin/api/events").then(function (evs) {
      currentEvents = evs || [];
      return currentEvents;
    }).catch(function () {
      currentEvents = [];
      return [];
    });
  }

  function populateEventFilter() {
    var sel = document.getElementById("reg-event-filter");
    if (!sel) return Promise.resolve();
    var curVal = sel.value;
    return ensureEventsLoaded().then(function (evsList) {
      sel.innerHTML = '<option value="">All events</option>' + evsList.map(function (e) {
        return '<option value="' + escapeHtml(e.id) + '"' + (e.id === curVal ? ' selected' : '') + '>' + escapeHtml(e.name) + "</option>";
      }).join("");
    });
  }

  function loadRegistrations() {
    return api("/admin/api/events").then(function (evs) {
      currentEvents = evs;
      populateEventFilter();
      return fetchRegistrations();
    });
  }

  function formatAdminDate(timestampSec) {
    if (!timestampSec) return '<span class="muted">—</span>';
    var d = new Date(timestampSec * 1000);
    var realMonths = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    var month = realMonths[d.getMonth()];
    var day = (d.getDate() < 10 ? "0" : "") + d.getDate();
    var year = d.getFullYear();
    var hours = d.getHours();
    var minutes = (d.getMinutes() < 10 ? "0" : "") + d.getMinutes();
    var ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12;
    var hh = (hours < 10 ? "0" : "") + hours;
    return '<div class="date-cell"><span class="date-main">' + month + ' ' + day + ', ' + year + '</span><span class="date-sub">' + hh + ':' + minutes + ' ' + ampm + '</span></div>';
  }

  var PAGE_SIZE = 10;
  var registrationsCurrentPage = 1;
  var auditLogCurrentPage = 1;
  var participantsCurrentPage = 1;
  var PARTICIPANTS_PAGE_SIZE = 10;
  var currentAuditLogs = [];

  function renderPaginationControls(containerId, currentPage, totalPages, totalRecords, itemLabel, onPageChange) {
    var container = document.getElementById(containerId);
    if (!container) return;

    if (!totalRecords || totalRecords <= 0) {
      container.innerHTML = "";
      return;
    }

    var startItem = (currentPage - 1) * PAGE_SIZE + 1;
    var endItem = Math.min(currentPage * PAGE_SIZE, totalRecords);
    var summaryText = "Showing " + startItem + "–" + endItem + " of " + totalRecords + " " + itemLabel;

    if (totalPages <= 1) {
      container.innerHTML = '<div class="pagination-summary">' + summaryText + '</div>';
      return;
    }

    var pagesToDisplay = [];
    if (totalPages <= 7) {
      for (var i = 1; i <= totalPages; i++) {
        pagesToDisplay.push(i);
      }
    } else {
      pagesToDisplay.push(1);
      var startPage = Math.max(2, currentPage - 1);
      var endPage = Math.min(totalPages - 1, currentPage + 1);

      if (currentPage <= 3) {
        endPage = 4;
      }
      if (currentPage >= totalPages - 2) {
        startPage = totalPages - 3;
      }

      if (startPage > 2) {
        pagesToDisplay.push("...");
      }

      for (var p = startPage; p <= endPage; p++) {
        pagesToDisplay.push(p);
      }

      if (endPage < totalPages - 1) {
        pagesToDisplay.push("...");
      }

      pagesToDisplay.push(totalPages);
    }

    var html = '<div class="pagination-summary">' + summaryText + '</div>' +
      '<div class="pagination-controls">' +
        '<button type="button" class="pg-btn pg-btn-prev"' + (currentPage === 1 ? ' disabled' : '') + '>PREV</button>';

    for (var j = 0; j < pagesToDisplay.length; j++) {
      var item = pagesToDisplay[j];
      if (item === "...") {
        html += '<span class="pg-ellipsis">...</span>';
      } else {
        var activeClass = item === currentPage ? ' active' : '';
        html += '<button type="button" class="pg-btn' + activeClass + '" data-page="' + item + '">' + item + '</button>';
      }
    }

    html += '<button type="button" class="pg-btn pg-btn-next"' + (currentPage === totalPages ? ' disabled' : '') + '>NEXT</button>' +
      '</div>';

    container.innerHTML = html;

    container.querySelectorAll(".pg-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.disabled) return;
        if (btn.classList.contains("pg-btn-prev")) {
          if (currentPage > 1) onPageChange(currentPage - 1);
        } else if (btn.classList.contains("pg-btn-next")) {
          if (currentPage < totalPages) onPageChange(currentPage + 1);
        } else if (btn.dataset.page) {
          var pNum = parseInt(btn.dataset.page, 10);
          if (pNum && pNum !== currentPage) onPageChange(pNum);
        }
      });
    });
  }

  var currentRegistrations = [];

  function fetchRegistrations() {
    var eventId = document.getElementById("reg-event-filter").value;
    var qs = eventId ? "?event_id=" + encodeURIComponent(eventId) : "";
    return api("/admin/api/registrations" + qs).then(function (rows) {
      currentRegistrations = rows || [];
      renderFilteredRegistrations();
    });
  }

  function renderFilteredRegistrations() {
    var eventId = document.getElementById("reg-event-filter") ? document.getElementById("reg-event-filter").value : "";
    var statusFilter = document.getElementById("reg-status-filter") ? document.getElementById("reg-status-filter").value : "";

    var params = [];
    if (eventId) params.push("event_id=" + encodeURIComponent(eventId));
    if (statusFilter) params.push("status=" + encodeURIComponent(statusFilter));
    var qs = params.length ? "?" + params.join("&") : "";
    var exportBtn = document.getElementById("export-link");
    if (exportBtn) exportBtn.href = "/admin/api/registrations/export.csv" + qs;

    var filteredRows = currentRegistrations.filter(function (r) {
      if (statusFilter === "verified") {
        if (r.status !== "confirmed") return false;
      } else if (statusFilter === "unverified") {
        if (r.status !== "pending_payment" && r.status !== "pending_verification") return false;
      } else if (statusFilter === "declined") {
        if (r.status !== "rejected") return false;
      }
      return true;
    });

    var countBadge = document.getElementById("reg-count-badge");
    if (countBadge) {
      var labelStr = filteredRows.length === 1 ? "1 registration" : filteredRows.length + " registrations";
      countBadge.textContent = labelStr;
    }

    var tbody = document.querySelector("#reg-table tbody");
    if (!tbody) return;

    var totalRecords = filteredRows.length;
    var totalPages = Math.ceil(totalRecords / PAGE_SIZE);

    if (registrationsCurrentPage > totalPages && totalPages > 0) {
      registrationsCurrentPage = totalPages;
    } else if (registrationsCurrentPage < 1) {
      registrationsCurrentPage = 1;
    }

    if (!filteredRows || !filteredRows.length) {
      var emptyMsg = (statusFilter || eventId)
        ? "No registrations match the selected filters."
        : "NO REGISTRATIONS RECORDED YET";
      tbody.innerHTML = '<tr><td colspan="7" class="table-empty-state">' + escapeHtml(emptyMsg) + '</td></tr>';
      renderPaginationControls("reg-pagination", 1, 0, 0, "registrations", function () {});
      return;
    }

    var startIndex = (registrationsCurrentPage - 1) * PAGE_SIZE;
    var paginatedRows = filteredRows.slice(startIndex, startIndex + PAGE_SIZE);

    tbody.innerHTML = paginatedRows.map(function (r) {
      var whenHTML = formatAdminDate(r.created_at);
      var memberCount = r.members ? r.members.length : 0;
      var teamDisplay = r.team_name ? escapeHtml(r.team_name) : "Solo";
      var teamSub = memberCount > 1 ? memberCount + " participants" : "1 participant";

      var rawTxn = r.transaction_id ? String(r.transaction_id).trim() : "";
      var txnShort = rawTxn ? (rawTxn.length > 12 ? rawTxn.substring(0, 10) + "…" : rawTxn) : "—";
      var txnHTML = rawTxn ? '<span class="txn-code-sub" title="' + escapeHtml(rawTxn) + '">' + escapeHtml(txnShort) + '</span>' : '<span class="muted">—</span>';
      var proofHTML = r.payment_proof_url
        ? ' <a href="' + escapeHtml(r.payment_proof_url) + '" target="_blank" class="btn-proof-mini" title="View Proof Screenshot">📷 PROOF</a>'
        : '';

      var amountDisplay = r.payment_amount
        ? '₹' + (r.payment_amount / 100).toFixed(2)
        : '—';

      var statusMap = {
        "pending_payment": "PENDING PAYMENT",
        "pending_verification": "PENDING VERIFY",
        "confirmed": "CONFIRMED",
        "cancelled": "CANCELLED",
        "rejected": "REJECTED"
      };
      var statusLabel = statusMap[r.status] || (r.status || "").toUpperCase().replace(/_/g, " ");
      var statusPill = '<span class="status-pill status-' + escapeHtml(r.status) + '">' + escapeHtml(statusLabel) + '</span>';
      
      var actionsHTML = '<div class="reg-actions">' +
        '<button type="button" class="reg-btn reg-btn-view" data-reg-id="' + escapeHtml(r.id) + '">VIEW</button>';
      
      var normStatus = String(r.status || "").trim().toLowerCase();
      if (normStatus === "pending_verification") {
        actionsHTML += '<button type="button" class="reg-btn reg-btn-approve" data-reg-id="' + escapeHtml(r.id) + '">APPROVE</button>';
      }

      actionsHTML += '<button type="button" class="reg-btn reg-btn-delete" data-reg-id="' + escapeHtml(r.id) + '">DELETE</button>' +
        '</div>';

      return '<tr data-reg-id="' + r.id + '">' +
        '<td class="td-registrant"><div class="cell-registrant"><div class="registrant-name" title="' + escapeHtml(r.leader_name) + '">' + escapeHtml(r.leader_name) + '</div><div class="registrant-email" title="' + escapeHtml(r.leader_email) + '">' + escapeHtml(r.leader_email) + '</div></div></td>' +
        '<td class="td-event"><div class="cell-event-name" title="' + escapeHtml(r.event_name) + '">' + escapeHtml(r.event_name) + '</div></td>' +
        '<td class="td-team"><div class="cell-team-members"><div class="team-title" title="' + escapeHtml(r.team_name || "Solo") + '">' + teamDisplay + '</div><div class="team-sub">' + teamSub + '</div></div></td>' +
        '<td class="td-payment"><div class="cell-payment-summary"><div class="payment-amount-main">' + amountDisplay + '</div><div class="payment-txn-sub">' + txnHTML + proofHTML + '</div></div></td>' +
        '<td class="td-status">' + statusPill + '</td>' +
        '<td class="td-date">' + whenHTML + '</td>' +
        '<td class="td-actions">' + actionsHTML + '</td>' +
      '</tr>';
    }).join("");

    renderPaginationControls(
      "reg-pagination",
      registrationsCurrentPage,
      totalPages,
      totalRecords,
      "registrations",
      function (newPage) {
        registrationsCurrentPage = newPage;
        renderFilteredRegistrations();
      }
    );
  }

  function showViewRegistrationModal(r) {
    var existing = document.getElementById("registration-view-modal");
    if (existing) existing.remove();

    var modal = document.createElement("div");
    modal.id = "registration-view-modal";
    modal.className = "member-modal-backdrop";

    var submittedAtText = r.payment_submitted_at ? new Date(r.payment_submitted_at * 1000).toLocaleString() : "—";
    var reviewedAtText = r.payment_reviewed_at ? new Date(r.payment_reviewed_at * 1000).toLocaleString() : "—";
    var verifiedAtText = r.payment_verified_at ? new Date(r.payment_verified_at * 1000).toLocaleString() : "—";
    var createdAtText = r.created_at ? new Date(r.created_at * 1000).toLocaleString() : "—";

    var membersHTML = (r.members || []).map(function(m) {
      return '<div style="margin-bottom: 8px; padding: 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px;">' +
        '<div style="display: flex; justify-content: space-between; align-items: center;">' +
          '<strong>' + escapeHtml(m.participant_name || m.name || "—") + '</strong>' +
          (m.is_leader ? '<span style="color: #a855f7; font-size: 11px; font-weight: bold; background: rgba(168,85,247,0.15); padding: 2px 6px; border-radius: 3px;">TEAM LEADER</span>' : '<span style="color: #94a3b8; font-size: 11px;">MEMBER</span>') +
        '</div>' +
        '<div style="font-size: 12px; color: #cbd5e1; margin-top: 4px;">' +
          'Email: <strong>' + escapeHtml(m.participant_email || m.email || "—") + '</strong><br/>' +
          'Phone: ' + escapeHtml(m.participant_phone || m.phone || "—") + ' | College: ' + escapeHtml(m.college_name || m.college || "—") + '<br/>' +
          'User ID: <code>' + escapeHtml(m.user_id || "—") + '</code> | Token: <code>' + escapeHtml(m.cybercarnival_token || "—") + '</code>' +
        '</div>' +
      '</div>';
    }).join("");

    var proofSectionHTML = r.payment_proof_url
      ? '<div style="margin-top: 14px; padding: 12px; border: 1px solid rgba(168,85,247,0.3); border-radius: 6px; background: rgba(168,85,247,0.05);">' +
          '<div style="font-weight: bold; margin-bottom: 6px; color: #a855f7;">PAYMENT PROOF FILE</div>' +
          '<a href="' + escapeHtml(r.payment_proof_url) + '" target="_blank" class="reg-btn reg-btn-view" style="display: inline-block; padding: 6px 12px; text-decoration: none; margin-bottom: 8px;">📷 VIEW PAYMENT PROOF</a><br/>' +
          '<img src="' + escapeHtml(r.payment_proof_url) + '" alt="Payment Proof" style="max-height: 240px; width: auto; max-width: 100%; border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; display: block;"/>' +
        '</div>'
      : '<div style="margin-top: 14px; color: #94a3b8; font-size: 12px;">Payment Proof File: <em>None uploaded</em></div>';

    var statusMap = {
      "pending_payment": "PENDING PAYMENT",
      "pending_verification": "PENDING VERIFICATION",
      "confirmed": "CONFIRMED",
      "rejected": "REJECTED"
    };
    var statusLabel = statusMap[r.status] || (r.status || "").toUpperCase();

    modal.innerHTML = '<div class="member-modal-card" style="max-width: 650px; text-align: left; max-height: 90vh; overflow-y: auto;">' +
      '<button type="button" class="member-modal-close" aria-label="Close">×</button>' +
      '<h3 style="margin-top: 0; color: #a855f7; display: flex; justify-content: space-between; align-items: center; padding-right: 24px;">' +
        '<span>Registration Details</span>' +
        '<span class="status-pill status-' + escapeHtml(r.status) + '" style="font-size: 11px;">' + escapeHtml(statusLabel) + '</span>' +
      '</h3>' +
      '<p style="font-size: 12px; color: #888; margin-bottom: 16px;">Registration ID: <code>' + escapeHtml(r.id) + '</code></p>' +

      '<h4 style="color: #38bdf8; margin: 12px 0 6px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em;">1. Event & Registration Metadata</h4>' +
      '<dl style="margin-top: 6px; gap: 8px 16px;">' +
        '<dt>Event Name</dt><dd><strong>' + escapeHtml(r.event_name) + '</strong> (ID: <code>' + escapeHtml(r.event_id) + '</code>)</dd>' +
        '<dt>Registration Date</dt><dd>' + createdAtText + '</dd>' +
        '<dt>Participant Mode</dt><dd>' + escapeHtml((r.participant_mode || "individual").toUpperCase()) + '</dd>' +
        '<dt>Current Status</dt><dd><strong style="color: var(--primary);">' + escapeHtml(statusLabel) + '</strong></dd>' +
      '</dl>' +

      '<h4 style="color: #38bdf8; margin: 16px 0 6px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em;">2. Leader / Participant Details</h4>' +
      '<dl style="margin-top: 6px; gap: 8px 16px;">' +
        '<dt>Full Name</dt><dd>' + escapeHtml(r.leader_name || "—") + '</dd>' +
        '<dt>Email Address</dt><dd>' + escapeHtml(r.leader_email || "—") + '</dd>' +
        '<dt>Phone Number</dt><dd>' + escapeHtml(r.leader_phone || "—") + '</dd>' +
        '<dt>College Name</dt><dd>' + escapeHtml(r.leader_college || "—") + '</dd>' +
        '<dt>Leader User ID</dt><dd><code>' + escapeHtml(r.leader_user_id || "—") + '</code></dd>' +
      '</dl>' +

      '<h4 style="color: #38bdf8; margin: 16px 0 6px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em;">3. Team Members (' + (r.members ? r.members.length : 0) + ')</h4>' +
      '<div style="margin-top: 6px;">' +
        (r.team_name ? '<div style="margin-bottom: 6px; font-size: 12px;"><strong>Team Name:</strong> ' + escapeHtml(r.team_name) + '</div>' : '') +
        membersHTML +
      '</div>' +

      '<h4 style="color: #38bdf8; margin: 16px 0 6px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em;">4. Payment Audit Lifecycle</h4>' +
      '<dl style="margin-top: 6px; gap: 8px 16px;">' +
        '<dt>Expected Fee</dt><dd>₹' + escapeHtml(r.expected_amount_rupees || "0.00") + '</dd>' +
        '<dt>Submitted UTR/Txn</dt><dd><code style="color: #a855f7; font-weight: bold;">' + escapeHtml(r.transaction_id || "—") + '</code></dd>' +
        '<dt>Submitted At</dt><dd>' + submittedAtText + '</dd>' +
        '<dt>Reviewed At</dt><dd>' + reviewedAtText + '</dd>' +
        '<dt>Reviewed By</dt><dd>' + escapeHtml(r.payment_reviewed_by || "—") + '</dd>' +
        '<dt>Verified At</dt><dd>' + verifiedAtText + '</dd>' +
        '<dt>Verified By</dt><dd>' + escapeHtml(r.payment_verified_by || "—") + '</dd>' +
        (r.rejection_reason ? '<dt style="color: #ef4444;">Rejection Reason</dt><dd style="color: #ef4444; font-weight: bold;">' + escapeHtml(r.rejection_reason) + '</dd>' : '') +
      '</dl>' +

      proofSectionHTML +

      '<div style="margin-top: 20px; text-align: right; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 14px;">' +
        '<button type="button" class="member-modal-close-btn reg-btn" style="padding: 8px 16px; font-size: 12px;">CLOSE</button>' +
      '</div>' +
    '</div>';

    document.body.appendChild(modal);

    function close() { modal.remove(); }
    modal.querySelector('.member-modal-close').addEventListener('click', close);
    modal.querySelector('.member-modal-close-btn').addEventListener('click', close);
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
  }

  function showPaymentReviewModal(r) {
    var existing = document.getElementById("payment-review-modal");
    if (existing) existing.remove();

    var modal = document.createElement("div");
    modal.id = "payment-review-modal";
    modal.className = "member-modal-backdrop";

    var submittedAtText = r.payment_submitted_at
      ? new Date(r.payment_submitted_at * 1000).toLocaleString()
      : "—";

    var membersHTML = (r.members || []).map(function(m) {
      return '<div style="margin-bottom: 8px; padding: 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 4px;">' +
        '<strong>' + escapeHtml(m.participant_name || m.name || "—") + '</strong> ' +
        (m.is_leader ? '<span style="color: #a855f7; font-size: 11px; font-weight: bold;">[TEAM LEADER]</span>' : '') + '<br/>' +
        '<span style="color: #aaa;">Email:</span> ' + escapeHtml(m.participant_email || m.email || "—") + '<br/>' +
        '<span style="color: #aaa;">College:</span> ' + escapeHtml(m.college_name || m.college || "—") + ' | <span style="color: #aaa;">Phone:</span> ' + escapeHtml(m.participant_phone || m.phone || "—") +
      '</div>';
    }).join("");

    var proofPreviewHTML = r.payment_proof_url
      ? '<div style="margin-top: 10px;"><a href="' + escapeHtml(r.payment_proof_url) + '" target="_blank" style="color: #a855f7; text-decoration: underline; font-weight: bold;">📷 Open Proof Screenshot in New Tab</a><br/><img src="' + escapeHtml(r.payment_proof_url) + '" alt="Payment Proof" style="max-height: 220px; width: auto; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; margin-top: 6px;"/></div>'
      : '<p style="color: #ef4444;">No proof file uploaded</p>';

    modal.innerHTML = '<div class="member-modal-card" style="max-width: 580px; text-align: left;">' +
      '<button type="button" class="member-modal-close" aria-label="Close">×</button>' +
      '<h3 style="margin-top: 0; color: #a855f7;">Verify Payment</h3>' +
      '<p style="font-size: 12px; color: #888; margin-bottom: 12px;">Registration ID: <code>' + escapeHtml(r.id) + '</code></p>' +
      
      '<div style="margin: 12px 0; padding: 12px; border: 1px solid rgba(168,85,247,0.3); border-radius: 6px; background: rgba(168,85,247,0.05); font-size: 13px; line-height: 1.6;">' +
        '<div><strong>Registrant:</strong> ' + escapeHtml(r.leader_name || "—") + ' (' + escapeHtml(r.leader_email || "—") + ')</div>' +
        '<div><strong>Event:</strong> ' + escapeHtml(r.event_name) + '</div>' +
        '<div><strong>Expected Fee:</strong> ₹' + escapeHtml(r.expected_amount_rupees || "0.00") + '</div>' +
        '<div><strong>Submitted Transaction ID (UTR):</strong> <code style="color: #a855f7; font-weight: bold;">' + escapeHtml(r.transaction_id || "—") + '</code></div>' +
        '<div><strong>Submitted Timestamp:</strong> ' + submittedAtText + '</div>' +
        proofPreviewHTML +
      '</div>' +

      '<h4 style="margin-bottom: 6px; margin-top: 14px;">Participant & Team Details</h4>' +
      membersHTML +

      '<div id="modal-error-box" style="display: none; color: #ef4444; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); padding: 8px; border-radius: 4px; margin: 10px 0; font-size: 12px; font-weight: bold;"></div>' +

      '<div style="margin-top: 20px; display: flex; flex-direction: column; gap: 12px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 14px;">' +
        '<button type="button" id="btn-approve-payment" style="background: #22c55e; color: #000; border: none; padding: 12px; font-weight: bold; border-radius: 4px; cursor: pointer; font-size: 12px; letter-spacing: 0.05em;">✓ APPROVE PAYMENT & CONFIRM REGISTRATION</button>' +
        '<div style="display: flex; flex-direction: column; gap: 6px; margin-top: 6px;">' +
          '<label style="font-size: 11px; color: #aaa; font-weight: bold;">Rejection Reason (Required if rejecting):</label>' +
          '<input type="text" id="input-rejection-reason" placeholder="e.g. UTR mismatch or proof image unreadable" style="padding: 8px; border-radius: 4px; border: 1px solid #444; background: #111; color: #fff; font-size: 12px;"/>' +
          '<button type="button" id="btn-reject-payment" style="background: #ef4444; color: #fff; border: none; padding: 10px; font-weight: bold; border-radius: 4px; cursor: pointer; font-size: 12px; letter-spacing: 0.05em;">✕ REJECT PAYMENT</button>' +
        '</div>' +
      '</div>' +
    '</div>';

    document.body.appendChild(modal);

    function close() { modal.remove(); }
    modal.querySelector('.member-modal-close').addEventListener('click', close);
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });

    var errBox = modal.querySelector('#modal-error-box');
    var approveBtn = modal.querySelector('#btn-approve-payment');
    var rejectBtn = modal.querySelector('#btn-reject-payment');

    approveBtn.addEventListener('click', function() {
      if (!confirm("Are you sure you want to APPROVE this payment and confirm the registration?")) return;
      approveBtn.disabled = true;
      rejectBtn.disabled = true;
      approveBtn.textContent = 'APPROVING PAYMENT...';

      api('/admin/api/registrations/' + encodeURIComponent(r.id) + '/verify', {
        method: 'POST',
        body: JSON.stringify({ approved: true })
      }).then(function() {
        close();
        loadRegistrations();
        if (typeof window.loadOverview === "function") window.loadOverview();
      }).catch(function(err) {
        approveBtn.disabled = false;
        rejectBtn.disabled = false;
        approveBtn.textContent = '✓ APPROVE PAYMENT & CONFIRM REGISTRATION';
        errBox.style.display = 'block';
        errBox.textContent = err.message || 'Failed to approve registration';
      });
    });

    rejectBtn.addEventListener('click', function() {
      var reason = (modal.querySelector('#input-rejection-reason').value || '').trim();
      if (!reason) {
        errBox.style.display = 'block';
        errBox.textContent = 'Please enter a rejection reason before clicking Reject.';
        return;
      }
      if (!confirm("Are you sure you want to REJECT this payment registration?")) return;
      approveBtn.disabled = true;
      rejectBtn.disabled = true;
      rejectBtn.textContent = 'REJECTING PAYMENT...';

      api('/admin/api/registrations/' + encodeURIComponent(r.id) + '/verify', {
        method: 'POST',
        body: JSON.stringify({ approved: false, rejection_reason: reason })
      }).then(function() {
        close();
        loadRegistrations();
        if (typeof window.loadOverview === "function") window.loadOverview();
      }).catch(function(err) {
        approveBtn.disabled = false;
        rejectBtn.disabled = false;
        rejectBtn.textContent = '✕ REJECT PAYMENT';
        errBox.style.display = 'block';
        errBox.textContent = err.message || 'Failed to reject registration';
      });
    });
  }

  function showDeleteConfirmationModal(r) {
    var existing = document.getElementById("delete-confirmation-modal");
    if (existing) existing.remove();

    var modal = document.createElement("div");
    modal.id = "delete-confirmation-modal";
    modal.className = "member-modal-backdrop";

    modal.innerHTML = '<div class="member-modal-card" style="max-width: 480px; text-align: left;">' +
      '<button type="button" class="member-modal-close" aria-label="Close">×</button>' +
      '<h3 style="margin-top: 0; color: #ef4444;">Delete Registration</h3>' +
      
      '<div style="margin: 16px 0; color: #f87171; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); padding: 14px; border-radius: 6px; font-size: 13px; line-height: 1.5;">' +
        '<strong>Delete this registration permanently?</strong><br/>' +
        '<span style="color: #cbd5e1; font-size: 12px;">This action cannot be undone.</span>' +
      '</div>' +

      '<div style="font-size: 12px; color: var(--muted); margin-bottom: 16px; background: rgba(0,0,0,0.3); padding: 10px; border-radius: 4px;">' +
        '<div>Registration ID: <code>' + escapeHtml(r.id) + '</code></div>' +
        '<div>Registrant: <strong>' + escapeHtml(r.leader_name || "—") + '</strong> (' + escapeHtml(r.leader_email || "—") + ')</div>' +
        '<div>Event: <strong>' + escapeHtml(r.event_name || "—") + '</strong></div>' +
      '</div>' +

      '<div id="delete-modal-error" style="display: none; color: #ef4444; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); padding: 8px; border-radius: 4px; margin-bottom: 12px; font-size: 12px; font-weight: bold;"></div>' +

      '<div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 14px;">' +
        '<button type="button" id="btn-cancel-delete" style="background: transparent; border: 1px solid var(--border); color: var(--text); padding: 8px 16px; border-radius: 4px; cursor: pointer; font-family: var(--font-mono); font-size: 12px; font-weight: 700;">CANCEL</button>' +
        '<button type="button" id="btn-confirm-delete" style="background: #ef4444; border: 1px solid #dc2626; color: #ffffff; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-family: var(--font-mono); font-size: 12px; font-weight: 800; letter-spacing: 0.05em;">DELETE REGISTRATION</button>' +
      '</div>' +
    '</div>';

    document.body.appendChild(modal);

    function close() { modal.remove(); }
    modal.querySelector('.member-modal-close').addEventListener('click', close);
    modal.querySelector('#btn-cancel-delete').addEventListener('click', close);
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });

    var errBox = modal.querySelector('#delete-modal-error');
    var confirmBtn = modal.querySelector('#btn-confirm-delete');
    var cancelBtn = modal.querySelector('#btn-cancel-delete');

    confirmBtn.addEventListener('click', function() {
      confirmBtn.disabled = true;
      cancelBtn.disabled = true;
      confirmBtn.textContent = 'DELETING...';

      api('/admin/api/registrations/' + encodeURIComponent(r.id), {
        method: 'DELETE'
      }).then(function() {
        close();
        loadRegistrations();
        if (typeof window.loadOverview === "function") window.loadOverview();
      }).catch(function(err) {
        confirmBtn.disabled = false;
        cancelBtn.disabled = false;
        confirmBtn.textContent = 'DELETE REGISTRATION';
        errBox.style.display = 'block';
        errBox.textContent = err.message || 'Failed to delete registration';
      });
    });
  }

  document.querySelector("#reg-table tbody").addEventListener("click", function (e) {
    var viewBtn = e.target.closest(".reg-btn-view");
    var approveBtn = e.target.closest(".reg-btn-approve") || e.target.closest(".reg-btn-verify");
    var deleteBtn = e.target.closest(".reg-btn-delete");

    if (viewBtn) {
      var regId = viewBtn.dataset.regId;
      var r = currentRegistrations.filter(function (item) { return item.id === regId; })[0];
      if (r) {
        api('/admin/api/registrations/' + encodeURIComponent(regId)).then(function(fullReg) {
          showViewRegistrationModal(fullReg);
        }).catch(function() {
          showViewRegistrationModal(r);
        });
      }
      return;
    }

    if (approveBtn) {
      var regId = approveBtn.dataset.regId;
      var r = currentRegistrations.filter(function (item) { return item.id === regId; })[0];
      if (r) {
        showPaymentReviewModal(r);
      }
      return;
    }

    if (deleteBtn) {
      var regId = deleteBtn.dataset.regId;
      var r = currentRegistrations.filter(function (item) { return item.id === regId; })[0];
      if (r) {
        showDeleteConfirmationModal(r);
      }
      return;
    }
  });

  document.getElementById("reg-event-filter").addEventListener("change", function () {
    registrationsCurrentPage = 1;
    fetchRegistrations().then(markConnectionSuccess).catch(markConnectionError);
  });

  var statusFilterEl = document.getElementById("reg-status-filter");
  if (statusFilterEl) {
    statusFilterEl.addEventListener("change", function () {
      registrationsCurrentPage = 1;
      renderFilteredRegistrations();
    });
  }

  var currentParticipantsData = [];

  function populateParticipantEventFilter() {
    var sel = document.getElementById("part-event-filter");
    if (!sel) return Promise.resolve();
    var curVal = sel.value;
    return ensureEventsLoaded().then(function (eventsList) {
      sel.innerHTML = '<option value="">ALL EVENTS</option>' + (eventsList || []).map(function (e) {
        return '<option value="' + escapeHtml(e.id) + '"' + (e.id === curVal ? ' selected' : '') + '>' + escapeHtml(e.name) + '</option>';
      }).join("");
    });
  }

  function showParticipantDetailsModal(p) {
    var existing = document.getElementById("participant-detail-modal");
    if (existing) existing.remove();

    var modal = document.createElement("div");
    modal.id = "participant-detail-modal";
    modal.className = "member-modal-backdrop";

    var isPresent = p.overall_attendance === "PRESENT";
    var overallBadge = isPresent
      ? '<span class="status-pill status-confirmed" style="background: rgba(34,197,94,0.15); color: #22c55e; border: 1px solid rgba(34,197,94,0.4); font-weight: bold;">🟢 PRESENT</span>'
      : '<span class="status-pill status-pending_payment" style="background: rgba(148,163,184,0.15); color: #94a3b8; border: 1px solid rgba(148,163,184,0.3); font-weight: bold;">⚪ NOT ATTENDED</span>';

    var attendedHTML = (p.attended_events || []).length > 0
      ? p.attended_events.map(function(ev) {
          return '<div style="margin-bottom: 10px; padding: 12px; background: rgba(34,197,94,0.05); border: 1px solid rgba(34,197,94,0.25); border-radius: 6px;">' +
            '<div style="display: flex; justify-content: space-between; align-items: center;">' +
              '<strong style="color: #f8fafc; font-size: 14px;">' + escapeHtml(ev.event_name) + '</strong>' +
              '<span style="color: #22c55e; font-size: 11px; font-weight: bold; background: rgba(34,197,94,0.15); padding: 2px 8px; border-radius: 4px;">🟢 PRESENT</span>' +
            '</div>' +
            '<div style="font-size: 12px; color: #cbd5e1; margin-top: 6px; line-height: 1.6;">' +
              'Checked-in: <strong>' + escapeHtml(ev.checked_in_at_formatted || "—") + '</strong><br/>' +
              'Verified by: <strong>' + escapeHtml(ev.checked_in_by || "—") + '</strong><br/>' +
              'Registration ID: <code>' + escapeHtml(ev.registration_id) + '</code>' +
            '</div>' +
          '</div>';
        }).join("")
      : '<div style="color: #94a3b8; font-size: 12px; font-style: italic; padding: 8px; background: rgba(255,255,255,0.02); border-radius: 4px;">No checked-in events recorded.</div>';

    var unattendedHTML = (p.unattended_events || []).length > 0
      ? p.unattended_events.map(function(ev) {
          var statusMap = { "pending_payment": "PENDING PAYMENT", "pending_verification": "PENDING VERIFICATION", "confirmed": "CONFIRMED", "rejected": "REJECTED" };
          var stLabel = statusMap[ev.status] || (ev.status || "").toUpperCase();
          return '<div style="margin-bottom: 10px; padding: 12px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px;">' +
            '<div style="display: flex; justify-content: space-between; align-items: center;">' +
              '<strong style="color: #e2e8f0; font-size: 13px;">' + escapeHtml(ev.event_name) + '</strong>' +
              '<span style="color: #94a3b8; font-size: 11px; font-weight: bold; background: rgba(148,163,184,0.1); padding: 2px 8px; border-radius: 4px;">⚪ NOT ATTENDED</span>' +
            '</div>' +
            '<div style="font-size: 12px; color: #94a3b8; margin-top: 6px;">' +
              'Registration Status: <strong style="color: #38bdf8;">' + escapeHtml(stLabel) + '</strong> | Registration ID: <code>' + escapeHtml(ev.registration_id) + '</code>' +
            '</div>' +
          '</div>';
        }).join("")
      : '<div style="color: #64748b; font-size: 12px; font-style: italic; padding: 4px;">None</div>';

    modal.innerHTML = '<div class="member-modal-card" style="max-width: 620px; text-align: left; max-height: 90vh; overflow-y: auto;">' +
      '<button type="button" class="member-modal-close" aria-label="Close">×</button>' +
      '<h3 style="margin-top: 0; color: #a855f7; display: flex; justify-content: space-between; align-items: center; padding-right: 24px;">' +
        '<span>Participant Profile & Attendance</span>' +
        overallBadge +
      '</h3>' +
      '<p style="font-size: 12px; color: #888; margin-bottom: 16px;">CyberCarnival Token: <code style="color: #38bdf8; font-weight: bold;">' + escapeHtml(p.cybercarnival_token || "—") + '</code></p>' +

      '<h4 style="color: #38bdf8; margin: 12px 0 6px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em;">1. Account Profile Details</h4>' +
      '<dl style="margin-top: 6px; gap: 8px 16px;">' +
        '<dt>Full Name</dt><dd><strong>' + escapeHtml(p.full_name || "—") + '</strong></dd>' +
        '<dt>Username</dt><dd>' + escapeHtml(p.username || "—") + '</dd>' +
        '<dt>Email Address</dt><dd>' + escapeHtml(p.email || "—") + '</dd>' +
        '<dt>Phone Number</dt><dd>' + escapeHtml(p.phone || "—") + '</dd>' +
        '<dt>College Name</dt><dd>' + escapeHtml(p.college || "—") + '</dd>' +
        '<dt>Register Number</dt><dd>' + escapeHtml(p.register_number || "—") + '</dd>' +
        '<dt>Account ID</dt><dd><code>' + escapeHtml(p.id) + '</code></dd>' +
      '</dl>' +

      '<h4 style="color: #38bdf8; margin: 18px 0 8px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em;">2. Attended Events (' + (p.attended_events ? p.attended_events.length : 0) + ')</h4>' +
      attendedHTML +

      '<h4 style="color: #38bdf8; margin: 18px 0 8px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em;">3. Registered But Not Attended (' + (p.unattended_events ? p.unattended_events.length : 0) + ')</h4>' +
      unattendedHTML +

      '<div style="margin-top: 20px; text-align: right; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 14px;">' +
        '<button type="button" class="member-modal-close-btn reg-btn" style="padding: 8px 16px; font-size: 12px;">CLOSE</button>' +
      '</div>' +
    '</div>';

    document.body.appendChild(modal);

    function close() { modal.remove(); }
    modal.querySelector('.member-modal-close').addEventListener('click', close);
    modal.querySelector('.member-modal-close-btn').addEventListener('click', close);
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
  }

  // --- Participants -------------------------------------------------------------------
  function loadParticipants() {
    var attFilterEl = document.getElementById("part-attendance-filter");
    var evtFilterEl = document.getElementById("part-event-filter");
    var attFilter = attFilterEl ? attFilterEl.value : "";
    var evtFilter = evtFilterEl ? evtFilterEl.value : "";

    return populateParticipantEventFilter().then(function () {
      attFilter = attFilterEl ? attFilterEl.value : "";
      evtFilter = evtFilterEl ? evtFilterEl.value : "";
      var queryPath = "/admin/api/participants?attendance=" + encodeURIComponent(attFilter) +
                      "&event_id=" + encodeURIComponent(evtFilter) +
                      "&page=" + encodeURIComponent(participantsCurrentPage) +
                      "&per_page=" + PARTICIPANTS_PAGE_SIZE;

      return api(queryPath).then(function (data) {
        currentParticipantsData = data.participants || [];
        var pagination = data.pagination || { page: 1, per_page: PARTICIPANTS_PAGE_SIZE, total: currentParticipantsData.length, total_pages: 1 };

        if (participantsCurrentPage > pagination.total_pages && pagination.total_pages > 0) {
          participantsCurrentPage = pagination.total_pages;
        }

        // 1. Render Summary Cards
        var cardsEl = document.getElementById("participant-cards");
        if (cardsEl && data.summary) {
          cardsEl.innerHTML =
            '<div class="card"><div class="num">' + data.summary.total_participants + '</div><div class="label">Total Accounts</div></div>' +
            '<div class="card"><div class="num" style="color: #22c55e;">' + data.summary.present_count + '</div><div class="label">Present (Attended)</div></div>' +
            '<div class="card"><div class="num" style="color: #94a3b8;">' + data.summary.not_attended_count + '</div><div class="label">Not Attended</div></div>' +
            '<div class="card"><div class="num" style="color: #a855f7;">' + data.summary.unregistered_count + '</div><div class="label">Unregistered</div></div>';
        }

        // 2. Render Main Participants Table
        var tbody = document.querySelector("#participants-table tbody");
        var countBadge = document.getElementById("part-count-badge");

        if (countBadge) {
          var badgeText = pagination.total === 0 ? "Showing 0 participant(s)" : "Showing " + pagination.total + " participant(s)";
          countBadge.textContent = badgeText;
        }

        if (tbody) {
          if (!currentParticipantsData || !currentParticipantsData.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="table-empty-state">NO PARTICIPANTS FOUND MATCHING FILTERS</td></tr>';
          } else {
            tbody.innerHTML = currentParticipantsData.map(function (u) {
              var isPresent = u.overall_attendance === "PRESENT";
              var attBadge = isPresent
                ? '<span class="status-pill status-confirmed" style="background: rgba(34,197,94,0.15); color: #22c55e; border: 1px solid rgba(34,197,94,0.4); font-weight: bold;">🟢 PRESENT</span>'
                : '<span class="status-pill status-pending_payment" style="background: rgba(148,163,184,0.15); color: #94a3b8; border: 1px solid rgba(148,163,184,0.3); font-weight: bold;">⚪ NOT ATTENDED</span>';

              var attendedEventsTags = (u.attended_events && u.attended_events.length > 0)
                ? u.attended_events.map(function (ev) {
                    return '<span style="display: inline-block; background: rgba(56,189,248,0.15); color: #38bdf8; border: 1px solid rgba(56,189,248,0.3); font-size: 11px; padding: 2px 6px; border-radius: 4px; margin: 2px;">' + escapeHtml(ev.event_name) + '</span>';
                  }).join("")
                : '<span style="color: #64748b; font-size: 11px; font-style: italic;">None</span>';

              return "<tr>" +
                "<td><code style=\"color: #38bdf8; font-weight: bold;\">" + escapeHtml(u.cybercarnival_token || "—") + "</code></td>" +
                "<td><strong>" + escapeHtml(u.full_name || u.username) + "</strong><br/><span style=\"color: #888; font-size: 11px;\">@" + escapeHtml(u.username) + "</span></td>" +
                "<td>" + escapeHtml(u.email) + "<br/><span style=\"color: #888; font-size: 11px;\">" + escapeHtml(u.phone || "—") + "</span></td>" +
                "<td>" + escapeHtml(u.college || "—") + "</td>" +
                "<td>" + attBadge + "</td>" +
                "<td>" + attendedEventsTags + "</td>" +
                '<td><button type="button" class="reg-btn btn-part-view" data-part-id="' + escapeHtml(u.id) + '">VIEW DETAILS</button></td>' +
              "</tr>";
            }).join("");
          }
        }

        // 3. Render Pagination Controls
        renderPaginationControls(
          "part-pagination",
          pagination.page,
          pagination.total_pages,
          pagination.total,
          "participants",
          function (newPage) {
            participantsCurrentPage = newPage;
            loadParticipants();
          }
        );

        // 4. Render Unregistered Accounts Table
        var unregBody = document.querySelector("#participants-unregistered-table tbody");
        if (unregBody) {
          if (!data.not_registered || !data.not_registered.length) {
            unregBody.innerHTML = '<tr><td colspan="6" class="table-empty-state">NO UNREGISTERED ACCOUNTS YET</td></tr>';
          } else {
            unregBody.innerHTML = data.not_registered.map(function (u) {
              return "<tr>" +
                "<td><code style=\"color: #888;\">" + escapeHtml(u.cybercarnival_token) + "</code></td>" +
                "<td>" + escapeHtml(u.full_name || "—") + "</td>" +
                "<td>" + escapeHtml(u.username) + "</td>" +
                "<td>" + escapeHtml(u.email) + "</td>" +
                "<td>" + escapeHtml(u.phone || "—") + "</td>" +
                "<td>" + (u.profile_completed ? "Yes" : "No") + "</td>" +
              "</tr>";
            }).join("");
          }
        }
      });
    });
  }

  var partAttFilterEl = document.getElementById("part-attendance-filter");
  if (partAttFilterEl) {
    partAttFilterEl.addEventListener("change", function () {
      participantsCurrentPage = 1;
      loadParticipants();
    });
  }

  var partEvtFilterEl = document.getElementById("part-event-filter");
  if (partEvtFilterEl) {
    partEvtFilterEl.addEventListener("change", function () {
      participantsCurrentPage = 1;
      loadParticipants();
    });
  }

  var partTableEl = document.getElementById("participants-table");
  if (partTableEl) {
    partTableEl.addEventListener("click", function (e) {
      var viewBtn = e.target.closest(".btn-part-view");
      if (viewBtn) {
        var partId = viewBtn.dataset.partId;
        var p = currentParticipantsData.filter(function (item) { return item.id === partId; })[0];
        if (p) {
          showParticipantDetailsModal(p);
        }
      }
    });
  }

  // --- Events -----------------------------------------------------------------------
  var currentEvents = [];

  function loadEvents() {
    return api("/admin/api/events").then(function (rows) {
      currentEvents = rows || [];
      var tbody = document.querySelector("#events-table tbody");
      if (!tbody) return;
      if (!rows || !rows.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="table-empty-state">NO EVENTS RECORDED YET</td></tr>';
        return;
      }
      tbody.innerHTML = rows.map(function (e) {
        var seats = e.max_teams == null ? "Unlimited" : ((e.seats_available !== undefined ? e.seats_available : (e.max_teams - (e.teams_registered || 0))) + " / " + e.max_teams);
        var poster = e.poster_url
          ? '<img src="' + escapeHtml(e.poster_url) + '" alt="" class="poster-thumb" style="width: 44px; height: 44px; object-fit: cover; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2);" />'
          : '<span class="poster-thumb poster-thumb-empty" style="display: inline-block; width: 44px; height: 44px; line-height: 44px; text-align: center; background: rgba(255,255,255,0.05); color: #888; border-radius: 4px;">—</span>';
        var teamSize = (e.min_team_size || "1") + "–" + (e.max_team_size || "1");
        var feeRupees = e.fee_amount ? ("₹" + (e.fee_amount / 100).toFixed(2).replace(/\.00$/, "")) : (e.fee || "Free");
        var activeBadge = e.active
          ? '<span style="color: #22c55e; font-weight: bold; background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.3); padding: 2px 6px; border-radius: 4px; font-size: 11px;">ACTIVE</span>'
          : '<span style="color: #ef4444; font-weight: bold; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); padding: 2px 6px; border-radius: 4px; font-size: 11px;">INACTIVE</span>';

        return "<tr>" +
          "<td>" + poster + "</td>" +
          "<td><strong>" + escapeHtml(e.name) + "</strong></td>" +
          "<td><span style=\"color: #38bdf8; font-size: 11px; font-weight: bold;\">" + escapeHtml(e.category || "TECHNICAL") + "</span></td>" +
          "<td>" + escapeHtml(feeRupees) + "</td>" +
          "<td>" + teamSize + "</td>" +
          "<td>" + seats + "</td>" +
          "<td>" + escapeHtml(e.venue || "—") + "</td>" +
          "<td>" + activeBadge + "</td>" +
          '<td class="row-actions">' +
            '<button type="button" class="reg-btn" data-action="view" data-id="' + e.id + '" style="margin-right: 4px;">VIEW</button>' +
            '<button type="button" class="reg-btn" data-action="edit" data-id="' + e.id + '" style="margin-right: 4px;">EDIT</button>' +
            '<button type="button" class="reg-btn" data-action="toggle" data-id="' + e.id + '" data-active="' + e.active + '" style="margin-right: 4px;">' + (e.active ? "HIDE" : "SHOW") + '</button>' +
            '<button type="button" class="reg-btn btn-danger" data-action="delete" data-id="' + e.id + '">DELETE</button>' +
          "</td>" +
        "</tr>";
      }).join("");
    });
  }

  var masterCoordinators = [];

  function fetchMasterCoordinators() {
    return api("/admin/api/coordinators").then(function (rows) {
      masterCoordinators = rows || [];
      return masterCoordinators;
    }).catch(function() {
      masterCoordinators = [];
      return [];
    });
  }

  function renderCoordPreviewHtml(coord) {
    if (!coord) return '<span style="color: #666; font-style: italic;">No coordinator selected</span>';
    var activeTag = coord.is_active
      ? '<span style="color: #22c55e; font-weight: bold; font-size: 10px; margin-left: 6px;">[ACTIVE]</span>'
      : '<span style="color: #ef4444; font-weight: bold; font-size: 10px; margin-left: 6px;">[INACTIVE]</span>';
    return '<div><strong>Name:</strong> ' + escapeHtml(coord.full_name || coord.name || coord.username) + activeTag + '</div>' +
      '<div><strong>Email:</strong> <code style="color: #38bdf8;">' + escapeHtml(coord.email || "—") + '</code></div>' +
      '<div><strong>Phone:</strong> ' + escapeHtml(coord.phone || "—") + '</div>';
  }

  function createCoordRowElement(role, initialCoordId) {
    var row = document.createElement("div");
    row.className = "coord-assign-row";
    row.style.cssText = "margin-bottom: 10px; padding: 10px; background: rgba(0,0,0,0.4); border: 1px solid var(--border); border-radius: 6px;";

    var optionsHtml = '<option value="">[ Select ' + (role === "FACULTY" ? "Faculty" : "Student") + ' Coordinator ▼ ]</option>';
    masterCoordinators.forEach(function (c) {
      var sel = initialCoordId && (c.id === initialCoordId) ? ' selected="selected"' : "";
      var inactiveLabel = c.is_active ? "" : " [INACTIVE]";
      var emailLabel = c.email ? (" (" + c.email + ")") : "";
      optionsHtml += '<option value="' + escapeHtml(c.id) + '"' + sel + '>' + escapeHtml(c.full_name || c.username) + emailLabel + inactiveLabel + '</option>';
    });

    row.innerHTML = '<div style="display: flex; gap: 8px; align-items: center; margin-bottom: 6px;">' +
      '<select class="coord-select" data-role="' + role + '" style="flex: 1; padding: 8px; border-radius: 4px; background: rgba(14, 11, 22, 0.9); border: 1px solid var(--border); color: var(--text); font-size: 12px;">' +
        optionsHtml +
      '</select>' +
      '<button type="button" class="btn-remove-coord btn-danger" style="padding: 6px 12px; font-size: 11px; font-weight: bold; cursor: pointer; border-radius: 4px;">REMOVE</button>' +
    '</div>' +
    '<div class="coord-preview-box" style="font-size: 11px; color: var(--muted); font-family: var(--font-mono); line-height: 1.5; padding: 6px 8px; background: rgba(255,255,255,0.02); border-radius: 4px;">' +
      renderCoordPreviewHtml(initialCoordId ? masterCoordinators.filter(function(x){ return x.id === initialCoordId; })[0] : null) +
    '</div>';

    var selectEl = row.querySelector('.coord-select');
    var previewEl = row.querySelector('.coord-preview-box');
    var removeBtn = row.querySelector('.btn-remove-coord');

    selectEl.addEventListener('change', function() {
      var selectedId = selectEl.value;
      var match = masterCoordinators.filter(function(x) { return x.id === selectedId; })[0];
      previewEl.innerHTML = renderCoordPreviewHtml(match);
    });

    removeBtn.addEventListener('click', function() {
      row.remove();
    });

    return row;
  }

  function showEventEditorModal(ev) {
    var existing = document.getElementById("event-editor-modal");
    if (existing) existing.remove();

    fetchMasterCoordinators().then(function() {
      _buildAndShowEventEditorModal(ev);
    });
  }

  function _buildAndShowEventEditorModal(ev) {
    var isEdit = !!ev;
    var modal = document.createElement("div");
    modal.id = "event-editor-modal";
    modal.className = "member-modal-backdrop";

    var feeRupeesVal = ev && ev.fee_amount ? (ev.fee_amount / 100).toFixed(2).replace(/\.00$/, "") : "";

    modal.innerHTML = '<div class="member-modal-card" style="max-width: 720px; text-align: left; max-height: 90vh; overflow-y: auto;">' +
      '<button type="button" class="member-modal-close" aria-label="Close">×</button>' +
      '<h3 style="margin-top: 0; color: #a855f7;">' + (isEdit ? "Edit Event" : "Create New Event") + '</h3>' +
      (isEdit ? '<p style="font-size: 11px; color: #888; margin-top: -8px;">ID: <code>' + escapeHtml(ev.id) + '</code></p>' : '') +

      '<form id="event-modal-form" enctype="multipart/form-data">' +
        '<div class="form-section-title">1. Basic Event Information</div>' +
        '<div class="form-field-group">' +
          '<label>Event Name *</label>' +
          '<input type="text" name="name" required maxlength="150" placeholder="e.g. RED TEAM x BLUE TEAM" value="' + escapeHtml(ev ? ev.name || "" : "") + '" />' +
        '</div>' +
        '<div class="form-grid-2">' +
          '<div class="form-field-group">' +
            '<label>Category</label>' +
            '<select name="category">' +
              '<option value="TECHNICAL"' + (ev && ev.category === "TECHNICAL" ? " selected" : "") + '>TECHNICAL</option>' +
              '<option value="NON-TECHNICAL"' + (ev && ev.category === "NON-TECHNICAL" ? " selected" : "") + '>NON-TECHNICAL</option>' +
              '<option value="WORKSHOP"' + (ev && ev.category === "WORKSHOP" ? " selected" : "") + '>WORKSHOP</option>' +
              '<option value="GAMING"' + (ev && ev.category === "GAMING" ? " selected" : "") + '>GAMING</option>' +
              '<option value="FLAGSHIP"' + (ev && ev.category === "FLAGSHIP" ? " selected" : "") + '>FLAGSHIP</option>' +
              '<option value="SYMPOSIUM"' + (ev && ev.category === "SYMPOSIUM" ? " selected" : "") + '>SYMPOSIUM</option>' +
              '<option value="CONCLAVE"' + (ev && ev.category === "CONCLAVE" ? " selected" : "") + '>CONCLAVE</option>' +
            '</select>' +
          '</div>' +
          '<div class="form-field-group">' +
            '<label>Tag (Badge Label)</label>' +
            '<input type="text" name="tag" maxlength="40" placeholder="e.g. COMPETITION, CTF, AI" value="' + escapeHtml(ev ? ev.tag || "" : "") + '" />' +
          '</div>' +
        '</div>' +
        '<div class="form-field-group">' +
          '<label>Description</label>' +
          '<textarea name="description" rows="3" placeholder="Full event summary, rules, and details..." maxlength="2000">' + escapeHtml(ev ? ev.description || "" : "") + '</textarea>' +
        '</div>' +

        '<div class="form-section-title">2. Schedule & Venue</div>' +
        '<div class="form-grid-2">' +
          '<div class="form-field-group">' +
            '<label>Display Date Text</label>' +
            '<input type="text" name="date" maxlength="60" placeholder="e.g. 7 & 8 OCTOBER 2026" value="' + escapeHtml(ev ? ev.date || "" : "") + '" />' +
          '</div>' +
          '<div class="form-field-group">' +
            '<label>Display Time Text</label>' +
            '<input type="text" name="time" maxlength="60" placeholder="e.g. 10:00 AM - 04:00 PM" value="' + escapeHtml(ev ? ev.time || "" : "") + '" />' +
          '</div>' +
        '</div>' +
        '<div class="form-grid-3">' +
          '<div class="form-field-group">' +
            '<label>Start Date (ISO Calendar)</label>' +
            '<input type="date" name="start_date" value="' + escapeHtml(ev ? ev.start_date || "" : "") + '" />' +
          '</div>' +
          '<div class="form-field-group">' +
            '<label>End Date (ISO Calendar)</label>' +
            '<input type="date" name="end_date" value="' + escapeHtml(ev ? ev.end_date || "" : "") + '" />' +
          '</div>' +
          '<div class="form-field-group">' +
            '<label>Venue Location</label>' +
            '<input type="text" name="venue" maxlength="200" placeholder="e.g. TP-402, TECH PARK" value="' + escapeHtml(ev ? ev.venue || "" : "") + '" />' +
          '</div>' +
        '</div>' +

        '<div class="form-section-title">3. Registration & Fee Structure</div>' +
        '<div class="form-grid-2">' +
          '<div class="form-field-group">' +
            '<label>Fee Display Text</label>' +
            '<input type="text" name="fee" maxlength="60" placeholder="e.g. ₹250 PER TEAM" value="' + escapeHtml(ev ? ev.fee || "" : "") + '" />' +
          '</div>' +
          '<div class="form-field-group">' +
            '<label>Authoritative Fee in ₹ (Numeric)</label>' +
            '<input type="number" name="fee_rupees" min="0" step="0.01" placeholder="250" value="' + escapeHtml(feeRupeesVal) + '" />' +
          '</div>' +
        '</div>' +
        '<div class="form-grid-3">' +
          '<div class="form-field-group">' +
            '<label>Min Team Size</label>' +
            '<input type="number" name="min_team_size" min="1" placeholder="1" value="' + escapeHtml(ev && ev.min_team_size != null ? ev.min_team_size : "") + '" />' +
          '</div>' +
          '<div class="form-field-group">' +
            '<label>Max Team Size</label>' +
            '<input type="number" name="max_team_size" min="1" placeholder="1" value="' + escapeHtml(ev && ev.max_team_size != null ? ev.max_team_size : "") + '" />' +
          '</div>' +
          '<div class="form-field-group">' +
            '<label>Max Teams (Capacity)</label>' +
            '<input type="number" name="max_teams" min="0" placeholder="Unlimited" value="' + escapeHtml(ev && ev.max_teams != null ? ev.max_teams : "") + '" />' +
          '</div>' +
        '</div>' +
        '<div class="form-field-group">' +
          '<label>Prize Pool</label>' +
          '<input type="text" name="prize" maxlength="120" placeholder="e.g. ₹50,000 CASH PRIZE" value="' + escapeHtml(ev ? ev.prize || "" : "") + '" />' +
        '</div>' +

        '<div class="form-section-title">4. Visibility & Registration Status</div>' +
        '<div class="form-grid-2">' +
          '<div class="form-checkbox-row">' +
            '<input type="checkbox" name="active" id="chk-event-active"' + (!ev || ev.active ? " checked" : "") + ' />' +
            '<label for="chk-event-active" style="font-weight: bold; cursor: pointer;">Active (Visible on Website)</label>' +
          '</div>' +
          '<div class="form-checkbox-row">' +
            '<input type="checkbox" name="registration_open" id="chk-reg-open"' + (!ev || ev.registration_open ? " checked" : "") + ' />' +
            '<label for="chk-reg-open" style="font-weight: bold; cursor: pointer;">Registration Open (Accepting Entries)</label>' +
          '</div>' +
        '</div>' +

        '<div class="form-section-title">5. Coordinators</div>' +
        '<div style="margin-bottom: 14px;">' +
          '<h4 style="color: #a855f7; font-size: 12px; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em;">Faculty Coordinators</h4>' +
          '<div id="faculty-coords-wrapper"></div>' +
          '<button type="button" id="btn-add-faculty-coord" class="reg-btn" style="padding: 6px 12px; font-size: 11px; margin-top: 4px;">+ ADD FACULTY COORDINATOR</button>' +
        '</div>' +
        '<div style="margin-bottom: 14px;">' +
          '<h4 style="color: #a855f7; font-size: 12px; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em;">Student Coordinators</h4>' +
          '<div id="student-coords-wrapper"></div>' +
          '<button type="button" id="btn-add-student-coord" class="reg-btn" style="padding: 6px 12px; font-size: 11px; margin-top: 4px;">+ ADD STUDENT COORDINATOR</button>' +
        '</div>' +

        '<div class="form-section-title">6. Event Poster / Media Image</div>' +
        '<div class="form-field-group">' +
          '<label>Upload New Poster (.jpg, .jpeg, .png, .webp — Max 5 MB)</label>' +
          '<input type="file" name="poster" id="input-event-poster" accept=".png,.jpg,.jpeg,.webp" />' +
          '<div id="poster-preview-area" class="poster-preview-box"' + (ev && ev.poster_url ? "" : ' style="display: none;"') + '>' +
            '<img id="poster-preview-img" src="' + escapeHtml(ev && ev.poster_url ? ev.poster_url : "") + '" class="poster-preview-thumb" alt="Poster Preview" />' +
            '<div id="poster-preview-info" class="poster-preview-info">' + (ev && ev.poster_url ? "Current Poster Image" : "") + '</div>' +
          '</div>' +
        '</div>' +

        '<div id="event-modal-error" style="display: none; color: #ef4444; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); padding: 10px; border-radius: 4px; margin-top: 14px; font-size: 12px; font-weight: bold;"></div>' +

        '<div style="margin-top: 24px; display: flex; justify-content: flex-end; gap: 12px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 16px;">' +
          '<button type="button" class="member-modal-close-btn reg-btn" style="padding: 10px 18px;">CANCEL</button>' +
          '<button type="submit" id="btn-save-event" class="btn-primary">' + (isEdit ? "SAVE CHANGES" : "SAVE EVENT") + '</button>' +
        '</div>' +
      '</form>' +
    '</div>';

    document.body.appendChild(modal);

    function close() { modal.remove(); }
    modal.querySelector('.member-modal-close').addEventListener('click', close);
    modal.querySelector('.member-modal-close-btn').addEventListener('click', close);
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });

    var facultyWrapper = modal.querySelector('#faculty-coords-wrapper');
    var studentWrapper = modal.querySelector('#student-coords-wrapper');
    var addFacultyBtn = modal.querySelector('#btn-add-faculty-coord');
    var addStudentBtn = modal.querySelector('#btn-add-student-coord');

    // Populate existing coordinators if editing
    var existingFaculty = (ev && ev.coordinators && ev.coordinators.faculty) ? ev.coordinators.faculty : [];
    var existingStudent = (ev && ev.coordinators && ev.coordinators.student) ? ev.coordinators.student : [];

    if (existingFaculty.length > 0) {
      existingFaculty.forEach(function(c) {
        facultyWrapper.appendChild(createCoordRowElement("FACULTY", c.id));
      });
    }
    if (existingStudent.length > 0) {
      existingStudent.forEach(function(c) {
        studentWrapper.appendChild(createCoordRowElement("STUDENT", c.id));
      });
    }

    addFacultyBtn.addEventListener('click', function() {
      facultyWrapper.appendChild(createCoordRowElement("FACULTY", null));
    });

    addStudentBtn.addEventListener('click', function() {
      studentWrapper.appendChild(createCoordRowElement("STUDENT", null));
    });

    var formEl = modal.querySelector('#event-modal-form');
    var fileInput = modal.querySelector('#input-event-poster');
    var previewArea = modal.querySelector('#poster-preview-area');
    var previewImg = modal.querySelector('#poster-preview-img');
    var previewInfo = modal.querySelector('#poster-preview-info');
    var errBox = modal.querySelector('#event-modal-error');
    var saveBtn = modal.querySelector('#btn-save-event');

    // Live file preview listener
    fileInput.addEventListener('change', function() {
      if (fileInput.files && fileInput.files[0]) {
        var f = fileInput.files[0];
        var sizeMB = (f.size / (1024 * 1024)).toFixed(2);
        if (f.size > 5 * 1024 * 1024) {
          errBox.style.display = 'block';
          errBox.textContent = 'Selected file exceeds the 5 MB limit (' + sizeMB + ' MB).';
          fileInput.value = '';
          return;
        }
        errBox.style.display = 'none';
        var reader = new FileReader();
        reader.onload = function(e) {
          previewImg.src = e.target.result;
          previewInfo.innerHTML = '<strong>Selected:</strong> ' + escapeHtml(f.name) + '<br/>Size: ' + sizeMB + ' MB';
          previewArea.style.display = 'flex';
        };
        reader.readAsDataURL(f);
      }
    });

    formEl.addEventListener('submit', function(e) {
      e.preventDefault();
      errBox.style.display = 'none';
      var formData = new FormData(formEl);
      formData.set("active", modal.querySelector('#chk-event-active').checked ? "true" : "false");
      formData.set("registration_open", modal.querySelector('#chk-reg-open').checked ? "true" : "false");

      // Collect assigned coordinators
      var facultyIds = [];
      facultyWrapper.querySelectorAll('.coord-select').forEach(function(sel) {
        if (sel.value) facultyIds.push(sel.value);
      });

      var studentIds = [];
      studentWrapper.querySelectorAll('.coord-select').forEach(function(sel) {
        if (sel.value) studentIds.push(sel.value);
      });

      formData.set("coordinators_json", JSON.stringify({ faculty: facultyIds, student: studentIds }));

      var url = isEdit ? "/admin/api/events/" + encodeURIComponent(ev.id) : "/admin/api/events";
      var method = isEdit ? "PUT" : "POST";

      saveBtn.disabled = true;
      saveBtn.textContent = 'SAVING...';

      api(url, { method: method, body: formData })
        .then(function() {
          close();
          loadEvents();
          if (typeof window.loadOverview === "function") window.loadOverview();
        })
        .catch(function(err) {
          saveBtn.disabled = false;
          saveBtn.textContent = isEdit ? 'SAVE CHANGES' : 'SAVE EVENT';
          errBox.style.display = 'block';
          errBox.textContent = err.message || 'Failed to save event';
        });
    });
  }

  function showEventViewModal(e) {
    var existing = document.getElementById("event-view-modal");
    if (existing) existing.remove();

    var modal = document.createElement("div");
    modal.id = "event-view-modal";
    modal.className = "member-modal-backdrop";

    var seats = e.max_teams == null ? "Unlimited" : ((e.seats_available !== undefined ? e.seats_available : (e.max_teams - (e.teams_registered || 0))) + " / " + e.max_teams);
    var feeRupees = e.fee_amount ? ("₹" + (e.fee_amount / 100).toFixed(2).replace(/\.00$/, "")) : (e.fee || "Free");

    var facultyCoordsHTML = (e.coordinators && e.coordinators.faculty && e.coordinators.faculty.length)
      ? e.coordinators.faculty.map(function(c) {
          return '<div style="padding: 6px 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 4px; margin-bottom: 6px;">' +
            '<strong>' + escapeHtml(c.name) + '</strong> ' + (c.is_active ? '' : '<span style="color:#ef4444;">[INACTIVE]</span>') + '<br/>' +
            '<span style="color:#aaa;">Email:</span> <code>' + escapeHtml(c.email || "—") + '</code> | <span style="color:#aaa;">Phone:</span> ' + escapeHtml(c.phone || "—") +
          '</div>';
        }).join("")
      : '<div style="color: var(--muted); font-style: italic; font-size: 12px;">NO FACULTY COORDINATOR ASSIGNED</div>';

    var studentCoordsHTML = (e.coordinators && e.coordinators.student && e.coordinators.student.length)
      ? e.coordinators.student.map(function(c) {
          return '<div style="padding: 6px 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 4px; margin-bottom: 6px;">' +
            '<strong>' + escapeHtml(c.name) + '</strong> ' + (c.is_active ? '' : '<span style="color:#ef4444;">[INACTIVE]</span>') + '<br/>' +
            '<span style="color:#aaa;">Email:</span> <code>' + escapeHtml(c.email || "—") + '</code> | <span style="color:#aaa;">Phone:</span> ' + escapeHtml(c.phone || "—") +
          '</div>';
        }).join("")
      : '<div style="color: var(--muted); font-style: italic; font-size: 12px;">NO STUDENT COORDINATOR ASSIGNED</div>';

    modal.innerHTML = '<div class="member-modal-card" style="max-width: 640px; text-align: left; max-height: 90vh; overflow-y: auto;">' +
      '<button type="button" class="member-modal-close" aria-label="Close">×</button>' +
      '<h3 style="margin-top: 0; color: #a855f7;">' + escapeHtml(e.name) + '</h3>' +
      '<p style="font-size: 11px; color: #888; margin-top: -6px;">ID: <code>' + escapeHtml(e.id) + '</code></p>' +

      '<div style="display: flex; gap: 16px; margin: 16px 0; padding: 14px; background: rgba(0,0,0,0.4); border: 1px solid var(--border); border-radius: 6px;">' +
        (e.poster_url ? '<img src="' + escapeHtml(e.poster_url) + '" style="max-width: 140px; max-height: 180px; object-fit: cover; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2);" />' : '') +
        '<div style="flex: 1; font-size: 13px; line-height: 1.6;">' +
          '<div><strong>Category:</strong> <span style="color: #38bdf8;">' + escapeHtml(e.category) + '</span></div>' +
          '<div><strong>Tag:</strong> ' + escapeHtml(e.tag || "—") + '</div>' +
          '<div><strong>Authoritative Fee:</strong> ' + escapeHtml(feeRupees) + ' (' + escapeHtml(e.fee || "—") + ')</div>' +
          '<div><strong>Team Size:</strong> ' + (e.min_team_size || 1) + ' to ' + (e.max_team_size || 1) + ' members</div>' +
          '<div><strong>Seats / Capacity:</strong> ' + seats + '</div>' +
          '<div><strong>Venue:</strong> ' + escapeHtml(e.venue || "—") + '</div>' +
          '<div><strong>Date & Time:</strong> ' + escapeHtml(e.date || "—") + ' (' + escapeHtml(e.time || "—") + ')</div>' +
          '<div><strong>Prize Pool:</strong> ' + escapeHtml(e.prize || "—") + '</div>' +
          '<div><strong>Active Status:</strong> ' + (e.active ? '<span style="color: #22c55e;">Active</span>' : '<span style="color: #ef4444;">Inactive</span>') + '</div>' +
          '<div><strong>Registration Open:</strong> ' + (e.registration_open ? '<span style="color: #22c55e;">Open</span>' : '<span style="color: #ef4444;">Closed</span>') + '</div>' +
        '</div>' +
      '</div>' +

      '<h4 style="color: #38bdf8; font-size: 12px; margin-bottom: 6px; text-transform: uppercase;">Faculty Coordinators</h4>' +
      '<div style="margin-bottom: 12px;">' + facultyCoordsHTML + '</div>' +

      '<h4 style="color: #38bdf8; font-size: 12px; margin-bottom: 6px; text-transform: uppercase;">Student Coordinators</h4>' +
      '<div style="margin-bottom: 12px;">' + studentCoordsHTML + '</div>' +

      '<h4 style="color: #38bdf8; font-size: 12px; margin-bottom: 6px; text-transform: uppercase;">Description</h4>' +
      '<div style="font-size: 13px; color: #cbd5e1; background: rgba(255,255,255,0.03); padding: 12px; border-radius: 4px; white-space: pre-wrap; max-height: 150px; overflow-y: auto;">' + escapeHtml(e.description || "No description provided.") + '</div>' +

      '<div style="margin-top: 20px; text-align: right; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 14px;">' +
        '<button type="button" class="member-modal-close-btn reg-btn">CLOSE</button>' +
      '</div>' +
    '</div>';

    document.body.appendChild(modal);

    function close() { modal.remove(); }
    modal.querySelector('.member-modal-close').addEventListener('click', close);
    modal.querySelector('.member-modal-close-btn').addEventListener('click', close);
    modal.addEventListener('click', function (evt) { if (evt.target === modal) close(); });
  }

  function showDeleteEventModal(e) {
    var existing = document.getElementById("delete-event-modal");
    if (existing) existing.remove();

    var modal = document.createElement("div");
    modal.id = "delete-event-modal";
    modal.className = "member-modal-backdrop";

    modal.innerHTML = '<div class="member-modal-card" style="max-width: 480px; text-align: left;">' +
      '<button type="button" class="member-modal-close" aria-label="Close">×</button>' +
      '<h3 style="margin-top: 0; color: #ef4444;">Delete Event</h3>' +

      '<div style="margin: 16px 0; color: #f87171; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); padding: 14px; border-radius: 6px; font-size: 13px; line-height: 1.5;">' +
        '<strong>Delete event "' + escapeHtml(e.name) + '"?</strong><br/>' +
        '<span style="color: #cbd5e1; font-size: 12px;">This action permanently deletes the event and poster from PostgreSQL.</span>' +
      '</div>' +

      '<div id="delete-event-modal-error" style="display: none; color: #ef4444; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); padding: 10px; border-radius: 4px; margin-bottom: 12px; font-size: 12px; font-weight: bold;"></div>' +

      '<div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 14px;">' +
        '<button type="button" id="btn-cancel-delete-event" class="member-modal-close-btn reg-btn">CANCEL</button>' +
        '<button type="button" id="btn-confirm-delete-event" class="btn-danger" style="padding: 8px 16px; font-weight: bold;">DELETE EVENT</button>' +
      '</div>' +
    '</div>';

    document.body.appendChild(modal);

    function close() { modal.remove(); }
    modal.querySelector('.member-modal-close').addEventListener('click', close);
    modal.querySelector('#btn-cancel-delete-event').addEventListener('click', close);
    modal.addEventListener('click', function (evt) { if (evt.target === modal) close(); });

    var errBox = modal.querySelector('#delete-event-modal-error');
    var confirmBtn = modal.querySelector('#btn-confirm-delete-event');

    confirmBtn.addEventListener('click', function() {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'DELETING...';

      api("/admin/api/events/" + encodeURIComponent(e.id), { method: "DELETE" })
        .then(function() {
          close();
          loadEvents();
          if (typeof window.loadOverview === "function") window.loadOverview();
        })
        .catch(function(err) {
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'DELETE EVENT';
          errBox.style.display = 'block';
          errBox.textContent = err.message || 'Failed to delete event';
        });
    });
  }

  // Add Event Button Handler
  var addEventBtn = document.getElementById("btn-open-add-event");
  if (addEventBtn) {
    addEventBtn.addEventListener("click", function() {
      showEventEditorModal(null);
    });
  }

  // Events Table Row Actions Listener
  var eventsTbody = document.querySelector("#events-table tbody");
  if (eventsTbody) {
    eventsTbody.addEventListener("click", function (e) {
      var btn = e.target.closest("button");
      if (!btn) return;
      var id = btn.dataset.id;
      var ev = currentEvents.filter(function (item) { return item.id === id; })[0];
      if (!ev) return;

      var action = btn.dataset.action;
      if (action === "view") {
        showEventViewModal(ev);
      } else if (action === "edit") {
        showEventEditorModal(ev);
      } else if (action === "toggle") {
        var nowActive = btn.dataset.active === "true";
        api("/admin/api/events/" + encodeURIComponent(id) + "/toggle", {
          method: "POST",
          body: JSON.stringify({ active: !nowActive }),
        }).then(function() {
          loadEvents();
          if (typeof window.loadOverview === "function") window.loadOverview();
        }).catch(showError);
      } else if (action === "delete") {
        showDeleteEventModal(ev);
      }
    });
  }

  // --- Audit log --------------------------------------------------------------------
  function loadAudit() {
    return api("/admin/api/audit-log").then(function (rows) {
      currentAuditLogs = rows || [];
      renderAuditLog();
    });
  }

  function renderAuditLog() {
    var tbody = document.querySelector("#audit-table tbody");
    if (!tbody) return;

    var totalRecords = currentAuditLogs.length;
    var totalPages = Math.ceil(totalRecords / PAGE_SIZE);

    if (auditLogCurrentPage > totalPages && totalPages > 0) {
      auditLogCurrentPage = totalPages;
    } else if (auditLogCurrentPage < 1) {
      auditLogCurrentPage = 1;
    }

    if (!currentAuditLogs || !currentAuditLogs.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="table-empty-state">No audit log entries found.</td></tr>';
      renderPaginationControls("audit-pagination", 1, 0, 0, "entries", function () {});
      return;
    }

    var startIndex = (auditLogCurrentPage - 1) * PAGE_SIZE;
    var paginatedRows = currentAuditLogs.slice(startIndex, startIndex + PAGE_SIZE);

    tbody.innerHTML = paginatedRows.map(function (r) {
      var when = new Date(r.timestamp * 1000).toLocaleString();
      return "<tr>" +
        "<td>" + when + "</td>" +
        "<td>" + escapeHtml(r.actor) + "</td>" +
        "<td>" + escapeHtml(r.action) + "</td>" +
        "<td>" + escapeHtml(r.detail) + "</td>" +
        "<td>" + escapeHtml(r.ip) + "</td>" +
      "</tr>";
    }).join("");

    renderPaginationControls(
      "audit-pagination",
      auditLogCurrentPage,
      totalPages,
      totalRecords,
      "entries",
      function (newPage) {
        auditLogCurrentPage = newPage;
        renderAuditLog();
      }
    );
  }

  function showError(err) {
    markConnectionError();
    alert(err.message || "Something went wrong.");
  }

  // Initial load and polling start
  loadTab("overview");
  startRealtimePolling();
})();