/* Shared rendering helpers for the mockups. */
(function () {
  var A = window.ALMANAC;

  /** GitHub-style column-per-week grid, with month labels that cannot collide. */
  function calendar(host, opts) {
    opts = opts || {};
    var slice = A.days.slice(A.days.length - (opts.days || 371));
    var weeks = Math.ceil(slice.length / 7);
    var cells = "", months = "", lastMonth = -1, col = 1, seen = {};

    slice.forEach(function (d, i) {
      var lvl = A.level(d.seconds);
      var title = d.date + " · " + (d.seconds ? A.fmt(d.seconds) : "nothing tracked");
      cells += '<div class="cell' + (d.date === A.today ? " today" : "") +
        '" data-level="' + lvl + '" title="' + title + '"></div>';
      if (i % 7 === 0) {
        col = Math.floor(i / 7) + 1;
        var m = d.day.getMonth();
        if (m !== lastMonth && !seen[m]) { seen[m] = col; lastMonth = m; }
      }
    });

    var keys = Object.keys(seen).map(Number).sort(function (a, b) { return seen[a] - seen[b]; });
    keys.forEach(function (m, i) {
      var start = seen[m];
      var end = i + 1 < keys.length ? seen[keys[i + 1]] : weeks + 1;
      var span = end - start;
      if (span < 3) { months += '<span style="grid-column:' + start + ' / span ' + span + '"></span>'; return; }
      months += '<span style="grid-column:' + start + ' / span ' + span + '">' + A.MONTHS[m] + "</span>";
    });

    var gutter = A.WEEKDAYS.map(function (w, i) {
      return "<span>" + (i % 2 === 1 ? w : "") + "</span>";
    }).join("");

    host.innerHTML =
      '<div class="heat">' +
        '<div class="heat-gutter">' + gutter + "</div>" +
        '<div class="heat-body">' +
          '<div class="heat-months" style="grid-template-columns:repeat(' + weeks +
            ',calc(var(--cell,13px) + var(--cellgap,3px)))">' + months + "</div>" +
          '<div class="heat-grid">' + cells + "</div>" +
        "</div>" +
      "</div>";
  }

  /** One real month, weekday columns, day numbers in the squares. */
  function monthGrid(host, monthsBack) {
    var out = "";
    for (var b = monthsBack - 1; b >= 0; b--) {
      var ref = new Date(2026, 7 - b, 1);
      var first = ref.getDay();
      var len = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
      var squares = "";
      for (var f = 0; f < first; f++) squares += '<div class="mcell empty"></div>';
      for (var d = 1; d <= len; d++) {
        var k = ref.getFullYear() + "-" + String(ref.getMonth() + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
        var rec = A.days.filter(function (x) { return x.date === k; })[0];
        var secs = rec ? rec.seconds : 0;
        var future = k > A.today;
        squares += '<div class="mcell' + (future ? " future" : "") + (k === A.today ? " today" : "") +
          '" data-level="' + (future ? 0 : A.level(secs)) + '" title="' + k + " · " +
          (secs ? A.fmt(secs) : "nothing tracked") + '"><span>' + d + "</span></div>";
      }
      out += '<div class="month"><div class="month-name up muted">' + A.MONTHS[ref.getMonth()] + " " + ref.getFullYear() +
        '</div><div class="month-dow">' + A.WEEKDAYS.map(function (w) { return "<span>" + w[0] + "</span>"; }).join("") +
        '</div><div class="month-grid">' + squares + "</div></div>";
    }
    host.innerHTML = out;
  }

  /** Weekday x hour-of-day matrix. */
  function punchMatrix(host) {
    var out = '<div class="pm-head"><span></span>';
    for (var h = 0; h < 24; h++) out += "<span>" + (h % 3 === 0 ? String(h).padStart(2, "0") : "") + "</span>";
    out += "</div>";
    A.matrix.forEach(function (row, w) {
      out += '<div class="pm-row"><span class="pm-label">' + A.WEEKDAYS[w] + "</span>";
      row.forEach(function (v, h) {
        var q = v / A.matrixMax;
        var lvl = v === 0 ? 0 : q < 0.25 ? 1 : q < 0.5 ? 2 : q < 0.75 ? 3 : 4;
        out += '<span class="cell" data-level="' + lvl + '" title="' + A.WEEKDAYS[w] + " " +
          String(h).padStart(2, "0") + ":00 · " + A.fmt(v) + '"></span>';
      });
      out += "</div>";
    });
    host.innerHTML = out;
  }

  function bars(host, rows, opt) {
    opt = opt || {};
    host.innerHTML = rows.map(function (r) {
      var right = opt.right ? opt.right(r) : A.fmt(r.seconds);
      return '<div class="bar-row"><div class="top"><span>' + r.label +
        '</span><span class="mono small muted">' + right + '</span></div>' +
        '<div class="bar"><i style="width:' + (r.share * 100).toFixed(1) + '%"></i></div></div>';
    }).join("");
  }

  function legend(host, note) {
    var stops = [
      [0, "none"], [1, "under 1h"], [2, "1 - 3h"], [3, "3 - 5h"], [4, "5h+"]
    ].map(function (s) {
      return '<span class="stop"><span class="cell" data-level="' + s[0] + '"></span>' + s[1] + "</span>";
    }).join("");
    host.innerHTML = '<span class="muted">Less</span>' + stops + '<span class="muted">More</span>' +
      (note ? '<span class="muted" style="margin-left:auto">' + note + "</span>" : "");
  }

  function themeToggle() {
    var b = document.createElement("button");
    b.className = "btn themer";
    b.textContent = "Light / dark";
    b.onclick = function () {
      var el = document.documentElement;
      el.dataset.theme = el.dataset.theme === "light" ? "dark" : "light";
    };
    document.body.appendChild(b);
  }

  window.R = { calendar: calendar, monthGrid: monthGrid, punchMatrix: punchMatrix, bars: bars, legend: legend, themeToggle: themeToggle };
  document.addEventListener("DOMContentLoaded", themeToggle);
})();
