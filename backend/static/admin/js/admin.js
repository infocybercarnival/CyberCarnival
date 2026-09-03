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

  function populateEventFilter() {
    var sel = document.getElementById("reg-event-filter");
    var curVal = sel.value;
    sel.innerHTML = '<option value="">All events</option>' + currentEvents.map(function (e) {
      return '<option value="' + e.id + '">' + escapeHtml(e.name) + "</option>";
    }).join("");
    sel.value = curVal;
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

  function fetchRegistrations() {
    var eventId = document.getElementById("reg-event-filter").value;
    var qs = eventId ? "?event_id=" + encodeURIComponent(eventId) : "";
    document.getElementById("export-link").href = "/admin/api/registrations/export.csv" + qs;
    return api("/admin/api/registrations" + qs).then(function (rows) {
      var tbody = document.querySelector("#reg-table tbody");
      if (!rows || !rows.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="table-empty-state">NO REGISTRATIONS RECORDED YET</td></tr>';
        return;
      }
      tbody.innerHTML = rows.map(function (r) {
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

        return '<tr data-reg-id="' + r.id + '">' +
          '<td class="td-registrant"><div class="cell-registrant"><div class="registrant-name" title="' + escapeHtml(r.leader_name) + '">' + escapeHtml(r.leader_name) + '</div><div class="registrant-email" title="' + escapeHtml(r.leader_email) + '">' + escapeHtml(r.leader_email) + '</div></div></td>' +
          '<td class="td-event"><div class="cell-event-name" title="' + escapeHtml(r.event_name) + '">' + escapeHtml(r.event_name) + '</div></td>' +
          '<td class="td-team"><div class="cell-team-members"><div class="team-title" title="' + escapeHtml(r.team_name || "Solo") + '">' + teamDisplay + '</div><div class="team-sub">' + teamSub + '</div></div></td>' +
          '<td class="td-payment"><div class="cell-payment-summary"><div class="payment-amount-main">' + amountDisplay + '</div><div class="payment-txn-sub">' + txnHTML + proofHTML + '</div></div></td>' +
          '<td class="td-status">' + statusPill + '</td>' +
          '<td class="td-date">' + whenHTML + '</td>' +
        '</tr>';
      }).join("");
    });
  }

  document.getElementById("reg-event-filter").addEventListener("change", function () {
    fetchRegistrations().then(markConnectionSuccess).catch(markConnectionError);
  });

  // --- Participants -------------------------------------------------------------------
  function loadParticipants() {
    return api("/admin/api/participants").then(function (data) {
      var regBody = document.querySelector("#participants-registered-table tbody");
      if (!data.registered || !data.registered.length) {
        regBody.innerHTML = '<tr><td colspan="6" class="table-empty-state">NO REGISTERED PARTICIPANTS YET</td></tr>';
      } else {
        regBody.innerHTML = data.registered.map(function (u) {
          return "<tr>" +
            "<td>" + escapeHtml(u.cybercarnival_token) + "</td>" +
            "<td>" + escapeHtml(u.full_name || "\u2014") + "</td>" +
            "<td>" + escapeHtml(u.username) + "</td>" +
            "<td>" + escapeHtml(u.email) + "</td>" +
            "<td>" + escapeHtml(u.phone || "\u2014") + "</td>" +
            "<td>" + escapeHtml(u.college || "\u2014") + "</td>" +
          "</tr>";
        }).join("");
      }

      var unregBody = document.querySelector("#participants-unregistered-table tbody");
      if (!data.not_registered || !data.not_registered.length) {
        unregBody.innerHTML = '<tr><td colspan="6" class="table-empty-state">NO UNREGISTERED ACCOUNTS YET</td></tr>';
      } else {
        unregBody.innerHTML = data.not_registered.map(function (u) {
          return "<tr>" +
            "<td>" + escapeHtml(u.cybercarnival_token) + "</td>" +
            "<td>" + escapeHtml(u.full_name || "\u2014") + "</td>" +
            "<td>" + escapeHtml(u.username) + "</td>" +
            "<td>" + escapeHtml(u.email) + "</td>" +
            "<td>" + escapeHtml(u.phone || "\u2014") + "</td>" +
            "<td>" + (u.profile_completed ? "Yes" : "No") + "</td>" +
          "</tr>";
        }).join("");
      }
    });
  }

  // --- Events -----------------------------------------------------------------------
  var editingEventId = null;

  function resetEventForm() {
    editingEventId = null;
    var form = document.getElementById("event-form");
    form.reset();
    document.getElementById("event-id").value = "";
    document.getElementById("event-submit-btn").textContent = "Add event";
    document.getElementById("event-cancel-edit").hidden = true;
  }

  function loadEvents() {
    return api("/admin/api/events").then(function (rows) {
      currentEvents = rows;
      var tbody = document.querySelector("#events-table tbody");
      if (!rows || !rows.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="table-empty-state">NO EVENTS RECORDED YET</td></tr>';
        return;
      }
      tbody.innerHTML = rows.map(function (e) {
        var seats = e.max_teams == null ? "Unlimited" : (e.seats_available + " / " + e.max_teams);
        var poster = e.poster_url
          ? '<img src="' + escapeHtml(e.poster_url) + '" alt="" class="poster-thumb" />'
          : '<span class="poster-thumb poster-thumb-empty">\u2014</span>';
        var teamSize = (e.min_team_size || "?") + "\u2013" + (e.max_team_size || "?");
        return "<tr>" +
          "<td>" + poster + "</td>" +
          "<td>" + escapeHtml(e.name) + "</td>" +
          "<td>" + escapeHtml(e.fee || "\u2014") + "</td>" +
          "<td>" + teamSize + "</td>" +
          "<td>" + seats + "</td>" +
          "<td>" + escapeHtml(e.venue || "\u2014") + "</td>" +
          "<td>" + escapeHtml(e.date || "\u2014") + "</td>" +
          "<td>" + (e.active ? "Yes" : "No") + "</td>" +
          '<td class="row-actions">' +
            '<button data-action="edit" data-id="' + e.id + '">Edit</button>' +
            '<button data-action="toggle" data-id="' + e.id + '" data-active="' + e.active + '">' + (e.active ? "Deactivate" : "Activate") + "</button>" +
            '<button data-action="delete" data-id="' + e.id + '">Delete</button>' +
          "</td>" +
        "</tr>";
      }).join("");
    });
  }

  document.getElementById("event-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var form = e.target;
    var formData = new FormData(form);
    formData.delete("event_id");

    var url = editingEventId ? "/admin/api/events/" + editingEventId : "/admin/api/events";
    var method = editingEventId ? "PUT" : "POST";

    api(url, { method: method, body: formData })
      .then(function () { resetEventForm(); return loadEvents(); })
      .then(markConnectionSuccess)
      .catch(showError);
  });

  document.getElementById("event-cancel-edit").addEventListener("click", resetEventForm);

  document.querySelector("#events-table tbody").addEventListener("click", function (e) {
    var btn = e.target.closest("button");
    if (!btn) return;
    var id = btn.dataset.id;

    if (btn.dataset.action === "delete") {
      if (!confirm("Delete this event? Existing registrations for it are kept but the event will disappear from lists.")) return;
      api("/admin/api/events/" + id, { method: "DELETE" }).then(loadEvents).then(markConnectionSuccess).catch(showError);
      return;
    }

    if (btn.dataset.action === "toggle") {
      var nowActive = btn.dataset.active === "true";
      api("/admin/api/events/" + id + "/toggle", {
        method: "POST",
        body: JSON.stringify({ active: !nowActive }),
      }).then(loadEvents).then(markConnectionSuccess).catch(showError);
      return;
    }

    if (btn.dataset.action === "edit") {
      var ev = currentEvents.filter(function (e) { return e.id === id; })[0];
      if (!ev) return;
      editingEventId = ev.id;
      var form = document.getElementById("event-form");
      form.name.value = ev.name || "";
      form.category.value = ev.category || "TECHNICAL";
      form.tag.value = ev.tag || "";
      form.fee.value = ev.fee || "";
      form.min_team_size.value = ev.min_team_size || "";
      form.max_team_size.value = ev.max_team_size || "";
      form.max_teams.value = ev.max_teams == null ? "" : ev.max_teams;
      form.venue.value = ev.venue || "";
      form.date.value = ev.date || "";
      form.start_date.value = ev.start_date || "";
      form.end_date.value = ev.end_date || "";
      form.fee_rupees.value = ev.fee_amount ? (ev.fee_amount / 100).toFixed(2).replace(/\.00$/, "") : "";
      form.time.value = ev.time || "";
      form.prize.value = ev.prize || "";
      form.description.value = ev.description || "";
      document.getElementById("event-id").value = ev.id;
      document.getElementById("event-submit-btn").textContent = "Save changes";
      document.getElementById("event-cancel-edit").hidden = false;
      form.scrollIntoView({ behavior: "smooth" });
    }
  });

  // --- Audit log --------------------------------------------------------------------
  function loadAudit() {
    return api("/admin/api/audit-log").then(function (rows) {
      var tbody = document.querySelector("#audit-table tbody");
      if (!rows || !rows.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="table-empty-state">NO AUDIT LOGS RECORDED YET</td></tr>';
        return;
      }
      tbody.innerHTML = rows.map(function (r) {
        var when = new Date(r.timestamp * 1000).toLocaleString();
        return "<tr>" +
          "<td>" + when + "</td>" +
          "<td>" + escapeHtml(r.actor) + "</td>" +
          "<td>" + escapeHtml(r.action) + "</td>" +
          "<td>" + escapeHtml(r.detail) + "</td>" +
          "<td>" + escapeHtml(r.ip) + "</td>" +
        "</tr>";
      }).join("");
    });
  }

  function showError(err) {
    markConnectionError();
    alert(err.message || "Something went wrong.");
  }

  // Initial load and polling start
  loadTab("overview");
  startRealtimePolling();
})();