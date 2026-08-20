/* Fake but plausible Almanac data, shared by every mockup. Deterministic. */
(function () {
  var seed = 20260820;
  function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }

  var DAY = 86400;
  var today = new Date(2026, 7, 20);

  function key(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  // 371 days back so the grid starts on a Sunday.
  var days = [];
  for (var i = 370; i >= 0; i--) {
    var d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    var wd = d.getDay();
    var r = rnd();
    var secs;
    if (wd === 0 || wd === 6) secs = r < 0.55 ? 0 : Math.round(r * 9000);
    else if (r < 0.08) secs = 0;
    else secs = Math.round(3600 + r * 22000);
    days.push({ date: key(d), day: d, seconds: secs, weekday: wd });
  }
  days[days.length - 1].seconds = 11460; // today: 3h 11m

  var max = days.reduce(function (m, x) { return Math.max(m, x.seconds); }, 0);

  function level(secs) {
    if (secs <= 0) return 0;
    var q = secs / max;
    if (q < 0.25) return 1;
    if (q < 0.5) return 2;
    if (q < 0.75) return 3;
    return 4;
  }

  function fmt(secs) {
    var h = Math.floor(secs / 3600), m = Math.round((secs % 3600) / 60);
    if (h === 0) return m + "m";
    return h + "h " + String(m).padStart(2, "0") + "m";
  }
  function hours(secs) { return (secs / 3600).toFixed(2); }

  var MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  var WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  window.ALMANAC = {
    today: "2026-08-20",
    from: "2026-08-01",
    to: "2026-08-20",
    days: days,
    max: max,
    level: level,
    fmt: fmt,
    hours: hours,
    MONTHS: MONTHS,
    WEEKDAYS: WEEKDAYS,

    todayTime: "3h 11m",
    windowTime: "48h 22m",
    yearTime: "912h 40m",
    averageDay: "3h 42m",
    activeDays: 14,
    streak: { current: 9, longest: 31 },
    streakAtRisk: false,
    peakHour: "14:00",
    firstTracked: "2025-08-15",

    counts: { edits: 18422, saves: 1204, files: 386, sessions: 61, commits: 74 },
    composition: { typedPercent: 62, typedChars: 412508, blockChars: 252880, blockCount: 1841 },

    languages: [
      { label: "TypeScript", seconds: 96420, share: 1 },
      { label: "Markdown",   seconds: 31200, share: 0.32 },
      { label: "JSON",       seconds: 14880, share: 0.15 },
      { label: "CSS",        seconds: 11040, share: 0.11 },
      { label: "Shell",      seconds: 7320,  share: 0.08 },
      { label: "Python",     seconds: 4260,  share: 0.04 }
    ],
    signals: [
      { label: "Editor",          seconds: 108300, share: 1 },
      { label: "Terminal",        seconds: 42180,  share: 0.39 },
      { label: "Debugging",       seconds: 12600,  share: 0.12 },
      { label: "Tabs and panels", seconds: 8460,   share: 0.08 },
      { label: "Tasks",           seconds: 3120,   share: 0.03 }
    ],
    repositories: [
      { repo: "almanac", total: 92460, share: 1, root: 12600, folders: [
        { name: "src", depth: 0, total: 61200, own: 4200 },
        { name: "core", depth: 1, total: 38400, own: 38400 },
        { name: "ui", depth: 1, total: 18600, own: 18600 },
        { name: "test", depth: 0, total: 18660, own: 18660 }
      ]},
      { repo: "devlabs-web", total: 44280, share: 0.48, root: 8400, folders: [
        { name: "app", depth: 0, total: 27600, own: 27600 },
        { name: "content", depth: 0, total: 8280, own: 8280 }
      ]},
      { repo: "design-system", total: 17400, share: 0.19, root: 17400, folders: [] },
      { repo: "scratch", total: 4980, share: 0.05, root: 4980, folders: [] }
    ],
    milestones: [
      { label: "Hours tracked", value: "912h", next: "1,000h", progress: 0.91 },
      { label: "Longest streak", value: "31 days", next: "50 days", progress: 0.62 },
      { label: "Days active", value: "214", next: "250", progress: 0.86 },
      { label: "Commits", value: "74", next: "100", progress: 0.74 }
    ],
    clients: [
      { client: "Acme Corp", repos: ["devlabs-web", "design-system"], days: 12, seconds: 61680, billable: 64800 },
      { client: "Internal",  repos: ["almanac"],                     days: 14, seconds: 92460, billable: 95400 },
      { client: "scratch",   repos: ["scratch"],                     days: 3,  seconds: 4980,  billable: 7200 }
    ]
  };

  // Hour-of-day totals, 0..23, peaking mid afternoon.
  var hoursArr = [];
  for (var h = 0; h < 24; h++) {
    var base = Math.exp(-Math.pow(h - 14.5, 2) / 26) + (h > 20 ? 0.18 : 0) + (h > 8 && h < 12 ? 0.25 : 0);
    hoursArr.push(Math.round(base * 14000 * (0.75 + rnd() * 0.5)));
  }
  var hmax = Math.max.apply(null, hoursArr);
  window.ALMANAC.hours24 = hoursArr.map(function (v, h) {
    return { hour: h, seconds: v, share: v / hmax };
  });

  // Weekday x hour matrix for the punch heatmap.
  var matrix = [];
  for (var w = 0; w < 7; w++) {
    var row = [];
    for (var hh = 0; hh < 24; hh++) {
      var weekend = (w === 0 || w === 6) ? 0.28 : 1;
      row.push(Math.round(hoursArr[hh] * weekend * (0.4 + rnd() * 1.2) / 7));
    }
    matrix.push(row);
  }
  var mmax = 0;
  matrix.forEach(function (r) { r.forEach(function (v) { mmax = Math.max(mmax, v); }); });
  window.ALMANAC.matrix = matrix;
  window.ALMANAC.matrixMax = mmax;
})();
