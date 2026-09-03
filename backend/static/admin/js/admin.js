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

  // --- Tabs -----------------------------------------------------------------------
  document.querySelectorAll(".tab").forEach(function (tabBtn) {
    tabBtn.addEventListener("click", function () {
      document.querySelectorAll(".tab").forEach(function (t) { t.classList.remove("active"); });
      document.querySelectorAll(".panel").forEach(function (p) { p.classList.remove("active"); });
      tabBtn.classList.add("active");
      document.getElementById("tab-" + tabBtn.dataset.tab).classList.add("active");
      loadTab(tabBtn.dataset.tab);
    });
  });

  function loadTab(name) {
    if (name === "overview") loadOverview();
    if (name === "registrations") loadRegistrations();
    if (name === "participants") loadParticipants();
    if (name === "events") loadEvents();
    if (name === "coordinators") loadCoordinators();
    if (name === "audit") loadAudit();
  }

  // --- Overview ---------------------------------------------------------------------
  function loadOverview() {
    api("/admin/api/summary").then(function (data) {
      document.getElementById("overview-cards").innerHTML =
        '<div class="card"><div class="num">' + data.total_registrations + '</div><div class="label">Team registrations</div></div>' +
        '<div class="card"><div class="num">' + data.total_events + '</div><div class="label">Events</div></div>' +
        '<div class="card"><div class="num">' + data.total_accounts + '</div><div class="label">Accounts created</div></div>' +
        '<div class="card"><div class="num">' + data.accounts_never_registered + '</div><div class="label">Never registered</div></div>';

      var tbody = document.querySelector("#overview-table tbody");
      tbody.innerHTML = data.by_event.map(function (row) {
        return "<tr><td>" + escapeHtml(row.event_name) + "</td><td>" + row.count + "</td></tr>";
      }).join("");
    }).catch(showError);
  }

  // --- Registrations ------------------------------------------------------------------
  var currentEvents = [];

  function populateEventFilter() {
    var sel = document.getElementById("reg-event-filter");
    sel.innerHTML = '<option value="">All events</option>' + currentEvents.map(function (e) {
      return '<option value="' + e.id + '">' + escapeHtml(e.name) + "</option>";
    }).join("");
  }

  function loadRegistrations() {
    api("/admin/api/events").then(function (evs) {
      currentEvents = evs;
      populateEventFilter();
      return fetchRegistrations();
    }).catch(showError);
  }

  function fetchRegistrations() {
    var eventId = document.getElementById("reg-event-filter").value;
    var qs = eventId ? "?event_id=" + encodeURIComponent(eventId) : "";
    document.getElementById("export-link").href = "/admin/api/registrations/export.csv" + qs;
    return api("/admin/api/registrations" + qs).then(function (rows) {
      var tbody = document.querySelector("#reg-table tbody");
      tbody.innerHTML = rows.map(function (r) {
        var when = new Date(r.created_at * 1000).toLocaleString();
        var memberNames = r.members.map(function (m) {
          return '<button type="button" class="member-detail-btn" data-member="' + escapeHtml(memberPayload(m)) + '">' + escapeHtml(m.name) + '</button>' + (m.is_leader ? " (leader)" : "");
        }).join(", ");
        return "<tr>" +
          "<td>" + escapeHtml(r.team_name || "\u2014") + "</td>" +
          "<td>" + (function(){ var lm=r.members.filter(function(m){return m.is_leader;})[0]; return lm ? '<button type="button" class="member-detail-btn" data-member="' + escapeHtml(memberPayload(lm)) + '">' + escapeHtml(r.leader_name) + '</button>' : escapeHtml(r.leader_name); })() + "</td>" +
          "<td>" + escapeHtml(r.leader_email) + "</td>" +
          "<td>" + escapeHtml(r.event_name) + "</td>" +
          "<td>" + memberNames + "</td>" +
          "<td>" + escapeHtml(r.transaction_id || "—") + (r.payment_amount ? "<br><small>₹" + (r.payment_amount / 100).toFixed(2) + "</small>" : "") + "</td>" +
          '<td><span class="status-pill status-' + r.status + '">' + r.status + "</span></td>" +
          "<td>" + when + "</td>" +
          '<td class="row-actions">' +
            '<button data-action="confirm" data-id="' + r.id + '">Confirm</button>' +
            '<button data-action="cancel" data-id="' + r.id + '">Cancel</button>' +
            '<button data-action="delete" data-id="' + r.id + '">Delete</button>' +
          "</td>" +
        "</tr>";
      }).join("");
    });
  }

  document.getElementById("reg-event-filter").addEventListener("change", fetchRegistrations);

  document.querySelector("#reg-table tbody").addEventListener("click", function (e) {
    var memberBtn = e.target.closest(".member-detail-btn");
    if (memberBtn) {
      try { showMemberDetails(JSON.parse(decodeURIComponent(memberBtn.dataset.member))); } catch (_) {}
      return;
    }
    var btn = e.target.closest("button");
    if (!btn) return;
    var id = btn.dataset.id;
    var action = btn.dataset.action;

    if (action === "delete") {
      if (!confirm("Delete this registration? This cannot be undone.")) return;
      api("/admin/api/registrations/" + id, { method: "DELETE" }).then(fetchRegistrations).catch(showError);
      return;
    }

    var status = action === "confirm" ? "confirmed" : "cancelled";
    api("/admin/api/registrations/" + id + "/status", {
      method: "POST",
      body: JSON.stringify({ status: status }),
    }).then(fetchRegistrations).catch(showError);
  });

  // --- Participants -------------------------------------------------------------------
  function loadParticipants() {
    api("/admin/api/participants").then(function (data) {
      var regBody = document.querySelector("#participants-registered-table tbody");
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

      var unregBody = document.querySelector("#participants-unregistered-table tbody");
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
    }).catch(showError);
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
    }).catch(showError);
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
      .catch(showError);
  });

  document.getElementById("event-cancel-edit").addEventListener("click", resetEventForm);

  document.querySelector("#events-table tbody").addEventListener("click", function (e) {
    var btn = e.target.closest("button");
    if (!btn) return;
    var id = btn.dataset.id;

    if (btn.dataset.action === "delete") {
      if (!confirm("Delete this event? Existing registrations for it are kept but the event will disappear from lists.")) return;
      api("/admin/api/events/" + id, { method: "DELETE" }).then(loadEvents).catch(showError);
      return;
    }

    if (btn.dataset.action === "toggle") {
      var nowActive = btn.dataset.active === "true";
      api("/admin/api/events/" + id + "/toggle", {
        method: "POST",
        body: JSON.stringify({ active: !nowActive }),
      }).then(loadEvents).catch(showError);
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

  // --- Coordinators -------------------------------------------------------------------
  function loadCoordinators() {
    // events tab may not have loaded yet in this session — fetch fresh so
    // the assignment <select> always has the full current event list.
    return Promise.all([
      api("/admin/api/events"),
      api("/admin/api/coordinators"),
    ]).then(function (results) {
      var allEvents = results[0];
      var coordinatorRows = results[1];

      var select = document.querySelector('#coordinator-form select[name="event_ids"]');
      select.innerHTML = allEvents.map(function (e) {
        return '<option value="' + e.id + '">' + escapeHtml(e.name) + "</option>";
      }).join("");

      var tbody = document.querySelector("#coordinators-table tbody");
      tbody.innerHTML = coordinatorRows.map(function (c) {
        return "<tr>" +
          "<td>" + escapeHtml(c.full_name || "\u2014") + "</td>" +
          "<td>" + escapeHtml(c.username) + "</td>" +
          "<td>" + escapeHtml(c.phone || "\u2014") + "</td>" +
          "<td>" + escapeHtml(c.event_names.join(", ") || "\u2014") + "</td>" +
          "<td>" + (c.is_active ? "Yes" : "No") + "</td>" +
          '<td class="row-actions">' +
            '<button data-action="toggle" data-id="' + c.id + '" data-active="' + c.is_active + '">' + (c.is_active ? "Deactivate" : "Activate") + "</button>" +
            '<button data-action="delete" data-id="' + c.id + '">Delete</button>' +
          "</td>" +
        "</tr>";
      }).join("");
    }).catch(showError);
  }

  document.getElementById("coordinator-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var form = e.target;
    var eventIds = Array.from(form.event_ids.selectedOptions).map(function (o) { return o.value; });
    if (!eventIds.length) {
      alert("Select at least one event for this coordinator.");
      return;
    }

    api("/admin/api/coordinators", {
      method: "POST",
      body: JSON.stringify({
        full_name: form.full_name.value,
        phone: form.phone.value,
        event_ids: eventIds,
      }),
    }).then(function (coord) {
      var box = document.getElementById("coordinator-credentials");
      box.hidden = false;
      box.innerHTML =
        "<strong>Coordinator created \u2014 copy these now and send over WhatsApp:</strong><br/>" +
        "Username: <code>" + escapeHtml(coord.username) + "</code><br/>" +
        "Password: <code>" + escapeHtml(coord.password) + "</code><br/>" +
        "Login page: <code>/coordinator/login</code>";
      form.reset();
      loadCoordinators();
    }).catch(showError);
  });

  document.querySelector("#coordinators-table tbody").addEventListener("click", function (e) {
    var btn = e.target.closest("button");
    if (!btn) return;
    var id = btn.dataset.id;

    if (btn.dataset.action === "delete") {
      if (!confirm("Delete this coordinator's login? This cannot be undone.")) return;
      api("/admin/api/coordinators/" + id, { method: "DELETE" }).then(loadCoordinators).catch(showError);
      return;
    }

    if (btn.dataset.action === "toggle") {
      var nowActive = btn.dataset.active === "true";
      api("/admin/api/coordinators/" + id + "/toggle", {
        method: "POST",
        body: JSON.stringify({ active: !nowActive }),
      }).then(loadCoordinators).catch(showError);
    }
  });

  // --- Audit log --------------------------------------------------------------------
  function loadAudit() {
    api("/admin/api/audit-log").then(function (rows) {
      var tbody = document.querySelector("#audit-table tbody");
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
    }).catch(showError);
  }

  function showError(err) {
    alert(err.message || "Something went wrong.");
  }

  // --- Speakers -----------------------------------------------------------------------

  var editingSpeakerId = null;

  function resetSpeakerForm() {
    editingSpeakerId = null;
    var form = document.getElementById("speaker-form");
    form.reset();
    form.id.value = "";
    document.getElementById("speaker-submit-btn").textContent = "Add speaker";
    document.getElementById("speaker-cancel-btn").hidden = true;
  }

  function renderSpeakersTable(list) {
    var tbody = document.querySelector("#speakers-table tbody");
    tbody.innerHTML = list.map(function (s) {
      var portrait = s.portrait_url
        ? '<img src="' + escapeHtml(s.portrait_url) + '" alt="" style="width:36px;height:36px;object-fit:cover;border-radius:4px;" />'
        : "—";
      return (
        "<tr>" +
          "<td>" + portrait + "</td>" +
          "<td>" + escapeHtml(s.name) + (s.designation ? "<br><span class='hint'>" + escapeHtml(s.designation) + "</span>" : "") + "</td>" +
          "<td>" + escapeHtml(s.category) + "</td>" +
          "<td>" + (s.is_featured ? "Yes" : "—") + "</td>" +
          "<td>" + (s.active ? "Yes" : "No") + "</td>" +
          "<td>" +
            '<button data-action="edit-speaker" data-id="' + s.id + '">Edit</button> ' +
            '<button data-action="delete-speaker" data-id="' + s.id + '">Delete</button>' +
          "</td>" +
        "</tr>"
      );
    }).join("");
  }

  function loadSpeakers() {
    api("/admin/api/speakers").then(renderSpeakersTable).catch(function (err) {
      alert(err.message);
    });
  }

  document.getElementById("speaker-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var form = e.target;
    var fd = new FormData(form);
    fd.set("is_featured", form.is_featured.checked ? "true" : "false");
    fd.set("active", "true");

    var url = editingSpeakerId ? "/admin/api/speakers/" + editingSpeakerId : "/admin/api/speakers";
    var method = editingSpeakerId ? "PUT" : "POST";

    api(url, { method: method, body: fd })
      .then(function () {
        resetSpeakerForm();
        loadSpeakers();
      })
      .catch(function (err) { alert(err.message); });
  });

  document.getElementById("speaker-cancel-btn").addEventListener("click", resetSpeakerForm);

  document.querySelector("#speakers-table tbody").addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-action]");
    if (!btn) return;
    var id = btn.dataset.id;

    if (btn.dataset.action === "delete-speaker") {
      if (!confirm("Delete this speaker?")) return;
      api("/admin/api/speakers/" + id, { method: "DELETE" })
        .then(loadSpeakers)
        .catch(function (err) { alert(err.message); });
      return;
    }

    if (btn.dataset.action === "edit-speaker") {
      api("/admin/api/speakers").then(function (list) {
        var s = list.find(function (x) { return x.id === id; });
        if (!s) return;
        editingSpeakerId = s.id;
        var form = document.getElementById("speaker-form");
        form.id.value = s.id;
        form.name.value = s.name || "";
        form.designation.value = s.designation || "";
        form.organization.value = s.organization || "";
        form.category.value = s.category || "INDUSTRY";
        form.expertise.value = (s.expertise || []).join(", ");
        form.bio.value = s.bio || "";
        form.session_title.value = s.session_title || "";
        form.session_time.value = s.session_time || "";
        form.session_venue.value = s.session_venue || "";
        form.twitter_url.value = (s.socials && s.socials.twitter) || "";
        form.linkedin_url.value = (s.socials && s.socials.linkedin) || "";
        form.github_url.value = (s.socials && s.socials.github) || "";
        form.is_featured.checked = !!s.is_featured;
        document.getElementById("speaker-submit-btn").textContent = "Save changes";
        document.getElementById("speaker-cancel-btn").hidden = false;
      });
    }
  });

  document.querySelector('button[data-tab="speakers"]').addEventListener("click", loadSpeakers);

  // Initial load
  loadOverview();
})();