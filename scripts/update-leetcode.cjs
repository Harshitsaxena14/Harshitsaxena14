#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const USERNAME = process.env.LEETCODE_USERNAME || "harshit_saxena14";
const OUTPUT = process.env.OUTPUT || path.join(process.cwd(), "generated", "leetcode.svg");

const query = `
query UserDashboard($username: String!, $year: Int) {
  allQuestionsCount {
    difficulty
    count
  }
  matchedUser(username: $username) {
    username
    profile {
      ranking
    }
    submitStats: submitStatsGlobal {
      acSubmissionNum {
        difficulty
        count
        submissions
      }
      totalSubmissionNum {
        difficulty
        count
        submissions
      }
    }
    userCalendar(year: $year) {
      activeYears
      streak
      totalActiveDays
      dccBadges {
        timestamp
        badge { name icon }
      }
      submissionCalendar
    }
    badges {
      name
      displayName
      icon
      creationDate
    }
  }
  userContestRanking(username: $username) {
    attendedContestsCount
    rating
    globalRanking
    totalParticipants
    topPercentage
    badge { name }
  }
}
`;

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmt(n) {
  return new Intl.NumberFormat("en-US").format(Number(n || 0));
}

function getStat(arr, difficulty, field = "count") {
  const x = (arr || []).find(v => v.difficulty === difficulty);
  return Number(x?.[field] || 0);
}

function colorForLevel(level) {
  if (level === 0) return "#111a28";
  if (level === 1) return "#123524";
  if (level === 2) return "#176b3b";
  if (level === 3) return "#21a657";
  if (level === 4) return "#62e98b";
  return "#b4ffc8";
}

function heatLevel(value, max) {
  if (!value) return 0;
  const r = value / Math.max(1, max);
  if (r <= 0.2) return 1;
  if (r <= 0.45) return 2;
  if (r <= 0.7) return 3;
  if (r <= 0.9) return 4;
  return 5;
}

function maxStreak(calendar) {
  const days = Object.entries(calendar || {})
    .map(([ts, count]) => [Number(ts), Number(count)])
    .filter(([, c]) => c > 0)
    .sort((a,b) => a[0] - b[0]);

  if (!days.length) return 0;
  const day = 86400;
  let best = 1, run = 1;
  for (let i = 1; i < days.length; i++) {
    const diff = Math.round((days[i][0] - days[i-1][0]) / day);
    if (diff === 1) run++;
    else if (diff > 1) run = 1;
    best = Math.max(best, run);
  }
  return best;
}

function buildHeatmap(calendar) {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 364);

  // Align to Sunday so the grid looks like a real calendar.
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());

  const cells = [];
  let max = 0;
  const map = calendar || {};
  for (const v of Object.values(map)) max = Math.max(max, Number(v || 0));

  const d = new Date(start);
  while (d <= end) {
    const ts = Math.floor(d.getTime() / 1000);
    const count = Number(map[String(ts)] || 0);
    cells.push({ date: new Date(d), count });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return { cells, max };
}

async function fetchData() {
  const year = new Date().getUTCFullYear();
  const response = await fetch("https://leetcode.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 HarshitOS-LeetCode-Dashboard"
    },
    body: JSON.stringify({
      operationName: "UserDashboard",
      variables: { username: USERNAME, year },
      query
    })
  });

  if (!response.ok) throw new Error(`LeetCode HTTP ${response.status}`);
  const json = await response.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  if (!json.data?.matchedUser) throw new Error("LeetCode user not found");
  return json.data;
}

function fallbackData() {
  return {
    allQuestionsCount: [
      {difficulty:"Easy",count:960},
      {difficulty:"Medium",count:2103},
      {difficulty:"Hard",count:966}
    ],
    matchedUser: {
      username: USERNAME,
      profile: { ranking: 87622 },
      submitStats: {
        acSubmissionNum: [
          {difficulty:"All",count:192,submissions:326},
          {difficulty:"Easy",count:116,submissions:160},
          {difficulty:"Medium",count:71,submissions:155},
          {difficulty:"Hard",count:5,submissions:11}
        ],
        totalSubmissionNum: [
          {difficulty:"All",count:192,submissions:386}
        ]
      },
      userCalendar: {
        activeYears:[2026],
        streak:4,
        totalActiveDays:109,
        dccBadges:[],
        submissionCalendar:{}
      },
      badges:[
        {name:"100 Days Badge 2026",displayName:"100 Days Badge 2026",creationDate:"2026-08-19"},
        {name:"50 Days Badge 2026",displayName:"50 Days Badge 2026",creationDate:"2026-06-01"}
      ]
    },
    userContestRanking: null
  };
}

function render(data) {
  const u = data.matchedUser;
  const ac = u.submitStats.acSubmissionNum || [];
  const total = getStat(ac, "All");
  const easy = getStat(ac, "Easy");
  const medium = getStat(ac, "Medium");
  const hard = getStat(ac, "Hard");
  const acceptedSubmissions = getStat(ac, "All", "submissions");
const totalSubmissions = getStat(u.submitStats.totalSubmissionNum, "All", "submissions");

const easyTotal = getStat(data.allQuestionsCount, "Easy");
  const medTotal = getStat(data.allQuestionsCount, "Medium");
  const hardTotal = getStat(data.allQuestionsCount, "Hard");

  const acceptance = totalSubmissions
  ? ((acceptedSubmissions / totalSubmissions) * 100).toFixed(2)
  : "—";

  const calendarRaw = typeof u.userCalendar?.submissionCalendar === "string"
    ? JSON.parse(u.userCalendar.submissionCalendar || "{}")
    : (u.userCalendar?.submissionCalendar || {});

  const { cells, max } = buildHeatmap(calendarRaw);
  const longest = maxStreak(calendarRaw);
  const activeDays = Number(u.userCalendar?.totalActiveDays || 0);
  const currentStreak = Number(u.userCalendar?.streak || 0);

  const contest = data.userContestRanking;
  const rating = contest?.rating ? Math.round(contest.rating) : "—";
  const contestRank = contest?.globalRanking ? `#${fmt(contest.globalRanking)}` : "—";
  const contests = contest?.attendedContestsCount ?? "—";

  const badges = (u.badges || []).slice(0, 3);
const badgeNames = badges.map(b => b.displayName || b.name).filter(Boolean);

const robotState =
  currentStreak >= 30
    ? "OVERDRIVE"
    : activeDays > 0
      ? "ACTIVE"
      : "IDLE";

const robotColor =
  robotState === "OVERDRIVE"
    ? "#ffd76a"
    : robotState === "ACTIVE"
      ? "#00e5ff"
      : "#607895";

const energy = Math.min(
  100,
  Math.round(
    Math.min(60, currentStreak) +
    Math.min(25, total / 10) +
    Math.min(15, acceptance === "—" ? 0 : Number(acceptance) / 10)
  )
);

  const W = 1200, H = 1120;
const left = 42, right = 1158;

let svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">

<defs>

  <linearGradient id="edge" x1="0" x2="1">
    <stop offset="0" stop-color="#00e5ff"/>
    <stop offset=".5" stop-color="#7c5cff"/>
    <stop offset="1" stop-color="#00e5ff"/>
  </linearGradient>

  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#07172c"/>
    <stop offset=".55" stop-color="#061426"/>
    <stop offset="1" stop-color="#020711"/>
  </linearGradient>

  <linearGradient id="mountain" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#102b45"/>
    <stop offset="1" stop-color="#07101d"/>
  </linearGradient>

  <linearGradient id="easy" x1="0" x2="1">
    <stop stop-color="#16c784"/>
    <stop offset="1" stop-color="#64f5a1"/>
  </linearGradient>

  <linearGradient id="med" x1="0" x2="1">
    <stop stop-color="#e0a72f"/>
    <stop offset="1" stop-color="#ffd76a"/>
  </linearGradient>

  <linearGradient id="hard" x1="0" x2="1">
    <stop stop-color="#ef5960"/>
    <stop offset="1" stop-color="#ff8b91"/>
  </linearGradient>

  <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
    <path d="M32 0H0V32"
          fill="none"
          stroke="#19304a"
          opacity=".22"/>
  </pattern>
  <style>
@keyframes robotFloat {
  0%,100% { transform: translateY(0px); }
  50% { transform: translateY(-5px); }
}

@keyframes robotPulse {
  0%,100% { opacity: .45; }
  50% { opacity: 1; }
}

.robot {
  animation: robotFloat 3s ease-in-out infinite;
  transform-box: fill-box;
  transform-origin: center;
}

.robotGlow {
  animation: robotPulse 2s ease-in-out infinite;
}
</style>
<style>
@keyframes heroRobotFloat {
  0%, 100% {
    transform: translateY(0px);
  }

  50% {
    transform: translateY(-7px);
  }
}

@keyframes heroRobotGlow {
  0%, 100% {
    opacity: .05;
  }

  50% {
    opacity: .14;
  }
}

.heroRobot {
  animation: heroRobotFloat 3s ease-in-out infinite;
  transform-box: fill-box;
  transform-origin: center;
}
.heatWorm {
  animation: wormMove 18s linear infinite;
}

.heatWormGlow {
  animation: wormMove 18s linear infinite;
}

.heatWormEye {
  animation: wormMove 18s linear infinite;
}

@keyframes wormMove {
  0% {
    offset-distance: 0%;
  }

  100% {
    offset-distance: 100%;
  }
}
</style>

</defs>

<!-- ===================================================== -->
<!-- OUTER FRAME -->
<!-- ===================================================== -->

<rect
  x="8"
  y="8"
  width="1184"
  height="1104"
  rx="24"
  fill="#050a12"
  stroke="#26364e"
  stroke-width="2"/>

<rect
  x="18"
  y="18"
  width="1164"
  height="1084"
  rx="18"
  fill="url(#grid)"/>

<!-- ===================================================== -->
<!-- TERMINAL BAR -->
<!-- ===================================================== -->

<rect
  x="${left}"
  y="36"
  width="${right-left}"
  height="58"
  rx="12"
  fill="#0c1421"
  stroke="#2a3c57"/>

<circle cx="66" cy="65" r="6" fill="#ff5f57"/>
<circle cx="88" cy="65" r="6" fill="#febc2e"/>
<circle cx="110" cy="65" r="6" fill="#28c840"/>

<text
  x="138"
  y="71"
  fill="#9aabc0"
  font-family="monospace"
  font-size="17">
harshit@devos ~ $ dsa --monitor --live
</text>

<text
  x="1128"
  y="71"
  text-anchor="end"
  fill="#00e5ff"
  font-family="monospace"
  font-size="13">
● LEETCODE CONNECTED
</text>

<!-- ===================================================== -->
<!-- NIGHT WORLD -->
<!-- ===================================================== -->

<rect
  x="${left}"
  y="112"
  width="${right-left}"
  height="190"
  rx="16"
  fill="url(#sky)"
  stroke="#243850"/>

<!-- stars -->

<circle cx="540" cy="143" r="2" fill="#8feaff"/>
<circle cx="590" cy="176" r="2" fill="#ffffff"/>
<circle cx="675" cy="139" r="1.5" fill="#7edfff"/>
<circle cx="760" cy="168" r="2" fill="#ffffff"/>
<circle cx="845" cy="136" r="1.5" fill="#7edfff"/>
<circle cx="930" cy="181" r="2" fill="#ffffff"/>
<circle cx="1020" cy="143" r="1.5" fill="#8feaff"/>
<circle cx="1090" cy="172" r="2" fill="#ffffff"/>

<!-- moon -->

<circle
  cx="1045"
  cy="157"
  r="25"
  fill="#dcecf5"/>

<circle
  cx="1058"
  cy="148"
  r="25"
  fill="#07172c"/>

<!-- distant mountains -->

<path
  d="M42 275
     L145 190
     L215 248
     L310 170
     L390 245
     L470 184
     L555 255
     L650 168
     L735 246
     L825 180
     L910 250
     L1000 165
     L1158 280
     L1158 302
     L42 302 Z"
  fill="#091a2d"/>

<!-- foreground mountains -->

<path
  d="M42 302
     L160 225
     L245 302
     L350 205
     L450 302
     L570 220
     L670 302
     L790 210
     L895 302
     L1010 225
     L1158 302
     Z"
  fill="url(#mountain)"/>

<!-- mountain highlights -->

<path
  d="M160 225 L245 302 L205 270 Z"
  fill="#173957"
  opacity=".75"/>

<path
  d="M350 205 L450 302 L398 257 Z"
  fill="#173957"
  opacity=".65"/>

<path
  d="M790 210 L895 302 L840 255 Z"
  fill="#173957"
  opacity=".7"/>

<!-- ===================================================== -->
<!-- ROBOT -->
<!-- ===================================================== -->

<!-- antenna -->

<line
  x1="205"
  y1="188"
  x2="205"
  y2="165"
  stroke="#63eaff"
  stroke-width="3"/>

<circle
  cx="205"
  cy="160"
  r="5"
  fill="#00e5ff"/>

<!-- robot body -->

<rect
  x="168"
  y="205"
  width="74"
  height="58"
  rx="15"
  fill="#152b42"
  stroke="#4c7797"
  stroke-width="2"/>

<!-- robot head -->

<rect
  x="159"
  y="178"
  width="92"
  height="58"
  rx="18"
  fill="#102236"
  stroke="#6689a2"
  stroke-width="2"/>

<!-- eyes -->

<rect
  x="179"
  y="198"
  width="15"
  height="11"
  rx="4"
  fill="#00e5ff"/>

<rect
  x="216"
  y="198"
  width="15"
  height="11"
  rx="4"
  fill="#00e5ff"/>

<!-- eye glow -->

<circle
  cx="187"
  cy="203"
  r="3"
  fill="#ffffff"/>

<circle
  cx="224"
  cy="203"
  r="3"
  fill="#ffffff"/>

<!-- robot core -->

<circle
  cx="205"
  cy="239"
  r="10"
  fill="#7c5cff"/>

<!-- arms -->

<line
  x1="168"
  y1="222"
  x2="145"
  y2="245"
  stroke="#54768f"
  stroke-width="6"
  stroke-linecap="round"/>

<line
  x1="242"
  y1="222"
  x2="265"
  y2="245"
  stroke="#54768f"
  stroke-width="6"
  stroke-linecap="round"/>

<!-- legs -->

<line
  x1="188"
  y1="263"
  x2="178"
  y2="286"
  stroke="#54768f"
  stroke-width="6"
  stroke-linecap="round"/>

<line
  x1="222"
  y1="263"
  x2="232"
  y2="286"
  stroke="#54768f"
  stroke-width="6"
  stroke-linecap="round"/>
  <!-- ===================================================== -->
<!-- HERO ROBOT -->
<!-- ===================================================== -->

<g class="heroRobot">

  <!-- glow -->
  <circle
    cx="190"
    cy="190"
    r="62"
    fill="${robotColor}"
    opacity=".05"/>

  <circle
    cx="190"
    cy="190"
    r="45"
    fill="none"
    stroke="${robotColor}"
    stroke-width="1"
    opacity=".22"/>

  <!-- antenna -->
  <line
    x1="190"
    y1="137"
    x2="190"
    y2="122"
    stroke="${robotColor}"
    stroke-width="3"
    stroke-linecap="round"/>

  <circle
    cx="190"
    cy="118"
    r="5"
    fill="${robotColor}"/>

  <!-- head -->
  <rect
    x="150"
    y="145"
    width="80"
    height="62"
    rx="16"
    fill="#101c2d"
    stroke="${robotColor}"
    stroke-width="2"/>

  <!-- eyes -->
  <rect
    x="163"
    y="164"
    width="20"
    height="12"
    rx="5"
    fill="${robotColor}"/>

  <rect
    x="197"
    y="164"
    width="20"
    height="12"
    rx="5"
    fill="${robotColor}"/>

  <circle
    cx="173"
    cy="170"
    r="3"
    fill="#07101c"/>

  <circle
    cx="207"
    cy="170"
    r="3"
    fill="#07101c"/>

  <!-- body -->
  <rect
    x="160"
    y="214"
    width="60"
    height="48"
    rx="12"
    fill="#0c1727"
    stroke="${robotColor}"
    stroke-width="2"/>

  <!-- core -->
  <circle
    cx="190"
    cy="237"
    r="9"
    fill="none"
    stroke="${robotColor}"
    stroke-width="2"/>

  <circle
    cx="190"
    cy="237"
    r="3"
    fill="${robotColor}"/>

  <!-- arms -->
  <line
    x1="160"
    y1="225"
    x2="140"
    y2="244"
    stroke="${robotColor}"
    stroke-width="4"
    stroke-linecap="round"/>

  <line
    x1="220"
    y1="225"
    x2="240"
    y2="244"
    stroke="${robotColor}"
    stroke-width="4"
    stroke-linecap="round"/>

  <!-- legs -->
  <line
    x1="175"
    y1="262"
    x2="168"
    y2="280"
    stroke="${robotColor}"
    stroke-width="4"
    stroke-linecap="round"/>

  <line
    x1="205"
    y1="262"
    x2="212"
    y2="280"
    stroke="${robotColor}"
    stroke-width="4"
    stroke-linecap="round"/>

</g>

<!-- ===================================================== -->
<!-- HERO TEXT -->
<!-- ===================================================== -->

<text
  x="300"
  y="155"
  fill="#00e5ff"
  font-family="monospace"
  font-size="13"
  font-weight="700">
LEETCODE // LIVE
</text>

<text
  x="300"
  y="188"
  fill="#f2f7ff"
  font-family="monospace"
  font-size="28"
  font-weight="700">
PROBLEM SOLVING INSTANCE
</text>

<text
  x="300"
  y="214"
  fill="#7890aa"
  font-family="monospace"
  font-size="12">
one problem at a time • one pattern at a time
</text>

<text
  x="300"
  y="244"
  fill="#00e5ff"
  font-family="monospace"
  font-size="11">
&gt; SYSTEM.STATUS // ONLINE
</text>

<text
  x="1128"
  y="272"
  text-anchor="end"
  fill="#58708b"
  font-family="monospace"
  font-size="10">
${esc(USERNAME)}
</text>

<!-- ===================================================== -->
<!-- STATS -->
<!-- ===================================================== -->

${[
  ["SOLVED", fmt(total), "#f3f6fb", left],
  ["EASY", `${fmt(easy)} / ${fmt(easyTotal)}`, "#65f39a", 320],
  ["MEDIUM", `${fmt(medium)} / ${fmt(medTotal)}`, "#ffd76a", 598],
  ["HARD", `${fmt(hard)} / ${fmt(hardTotal)}`, "#ff8b91", 876]
].map(([label,val,col,x]) => `
<rect
  x="${x}"
  y="324"
  width="250"
  height="112"
  rx="14"
  fill="#0b1220"
  stroke="#263950"/>

<text
  x="${x+22}"
  y="352"
  fill="#617894"
  font-family="monospace"
  font-size="11">
${label}
</text>

<text
  x="${x+22}"
  y="397"
  fill="${col}"
  font-family="monospace"
  font-size="29"
  font-weight="700">
${val}
</text>

<text
  x="${x+22}"
  y="418"
  fill="#4f6783"
  font-family="monospace"
  font-size="9">
LIVE DATA
</text>
`).join("")}

<!-- ===================================================== -->
<!-- ACCEPTANCE / STREAK / CONTEST -->
<!-- ===================================================== -->

<rect
  x="${left}"
  y="458"
  width="358"
  height="126"
  rx="14"
  fill="#0b1220"
  stroke="#263950"/>

<text
  x="64"
  y="486"
  fill="#617894"
  font-family="monospace"
  font-size="11">
ACCEPTANCE
</text>

<text
  x="64"
  y="532"
  fill="#f3f6fb"
  font-family="monospace"
  font-size="34"
  font-weight="700">
${acceptance}%
</text>

<text
  x="64"
  y="557"
  fill="#607895"
  font-family="monospace"
  font-size="10">
${fmt(acceptedSubmissions)} accepted submissions
</text>

<!-- acceptance ring -->

<circle
  cx="306"
  cy="520"
  r="27"
  fill="none"
  stroke="#18283b"
  stroke-width="7"/>

<circle
  cx="306"
  cy="520"
  r="27"
  fill="none"
  stroke="#00e5ff"
  stroke-width="7"
  stroke-linecap="round"
  stroke-dasharray="${Math.max(1, Number(acceptance) * 1.696)} 170"
  transform="rotate(-90 306 520)"/>

<rect
  x="442"
  y="458"
  width="358"
  height="126"
  rx="14"
  fill="#0b1220"
  stroke="#263950"/>

<text
  x="468"
  y="486"
  fill="#617894"
  font-family="monospace"
  font-size="11">
STREAK
</text>

<text
  x="468"
  y="532"
  fill="#ff9d42"
  font-family="monospace"
  font-size="34"
  font-weight="700">
${currentStreak}d
</text>

<text
  x="468"
  y="557"
  fill="#607895"
  font-family="monospace"
  font-size="10">
longest observed: ${longest}d
</text>

<text
  x="710"
  y="532"
  fill="#ff9d42"
  font-family="monospace"
  font-size="10">
KEEP GOING
</text>

<rect
  x="824"
  y="458"
  width="334"
  height="126"
  rx="14"
  fill="#0b1220"
  stroke="#263950"/>

<text
  x="850"
  y="486"
  fill="#617894"
  font-family="monospace"
  font-size="11">
CONTEST
</text>

<text
  x="850"
  y="526"
  fill="#b9a8ff"
  font-family="monospace"
  font-size="28"
  font-weight="700">
${rating}
</text>

<text
  x="850"
  y="551"
  fill="#607895"
  font-family="monospace"
  font-size="10">
${contests} contests • rank ${contestRank}
</text>

<!-- ===================================================== -->
<!-- DIFFICULTY -->
<!-- ===================================================== -->

<text
  x="${left}"
  y="624"
  fill="#00e5ff"
  font-family="monospace"
  font-size="13"
  font-weight="700">
DIFFICULTY.PROGRESS
</text>

${[
  ["EASY", easy, easyTotal, "#65f39a", 652],
  ["MEDIUM", medium, medTotal, "#ffd76a", 694],
  ["HARD", hard, hardTotal, "#ff8b91", 736]
].map(([label,count,maxQ,color,y]) => {
  const pct = Math.min(100, (count / Math.max(1,maxQ)) * 100);
  const fillW = Math.max(8, 690 * pct / 100);

  return `
<text
  x="${left}"
  y="${y+13}"
  fill="#93a6bd"
  font-family="monospace"
  font-size="10">
${label}
</text>

<rect
  x="145"
  y="${y}"
  width="690"
  height="15"
  rx="8"
  fill="#111b2a"/>

<rect
  x="145"
  y="${y}"
  width="${fillW}"
  height="15"
  rx="8"
  fill="${color}"/>

<text
  x="860"
  y="${y+13}"
  fill="#e8edf5"
  font-family="monospace"
  font-size="10">
${fmt(count)} / ${fmt(maxQ)}
</text>
`;
}).join("")}

<!-- ===================================================== -->
<!-- SUBMISSION ACTIVITY -->
<!-- ===================================================== -->

<rect
  x="${left}"
  y="786"
  width="${right-left}"
  height="218"
  rx="16"
  fill="#0a111e"
  stroke="#263950"/>

<text
  x="66"
  y="816"
  fill="#00e5ff"
  font-family="monospace"
  font-size="13"
  font-weight="700">
SUBMISSION.ACTIVITY
</text>

<text
  x="1128"
  y="816"
  text-anchor="end"
  fill="#71859e"
  font-family="monospace"
  font-size="10">
${fmt(activeDays)} active days • ${fmt(acceptedSubmissions)} accepted
</text>
`;

const gridX = 66;
const gridY = 842;
const cell = 13;
const gap = 4;
const wormCells = cells
  .filter(c => c.count > 0)
  .slice(-24);
for(let i = 0; i < cells.length; i++){
  

  const c = cells[i];

  const col = Math.floor(i / 7);
  const row = i % 7;

  const x = gridX + col * (cell + gap);
  const y = gridY + row * (cell + gap);

  if(x > 1115) continue;

  const lvl = heatLevel(c.count, max);

  svg += `
<rect
  x="${x}"
  y="${y}"
  width="${cell}"
  height="${cell}"
  rx="3"
  fill="${colorForLevel(lvl)}">
<title>${c.date.toISOString().slice(0,10)}: ${c.count} submissions</title>
</rect>
`;
}
 if (wormCells.length > 1) {

  const wormPoints = wormCells.map(c => {
    const index = cells.indexOf(c);
    const col = Math.floor(index / 7);
    const row = index % 7;

    return {
      x: gridX + col * (cell + gap) + cell / 2,
      y: gridY + row * (cell + gap) + cell / 2
    };
  });

  const wormPath = wormPoints
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  svg += `
  <!-- ================================================= -->
  <!-- HEATMAP WORM -->
  <!-- ================================================= -->

  <defs>

    <filter id="wormGlow">
      <feGaussianBlur
        stdDeviation="3"
        result="blur"/>

      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>

    <path
      id="wormTravelPath"
      d="${wormPath}"
      fill="none"/>
      
  </defs>

  <!-- subtle trail -->

  <path
    d="${wormPath}"
    fill="none"
    stroke="#00e5ff"
    stroke-width="2"
    opacity=".10"
    stroke-linecap="round"
    stroke-linejoin="round"/>


  <!-- WORM -->

  <g class="heatWorm">

    <!-- tail -->

    <circle
      cx="-14"
      cy="0"
      r="2.5"
      fill="#07546a"
      opacity=".65"/>

    <circle
      cx="-8"
      cy="0"
      r="3.5"
      fill="#087f9b"
      opacity=".85"/>

    <!-- body -->

    <circle
      cx="0"
      cy="0"
      r="5"
      fill="#00e5ff"
      filter="url(#wormGlow)"/>

    <!-- eye -->

    <circle
      cx="2"
      cy="-1.5"
      r="1.3"
      fill="#ffffff"/>

    <!-- movement -->

    <animateMotion
      dur="18s"
      repeatCount="indefinite"
      rotate="auto">
      <mpath href="#wormTravelPath"/>
    </animateMotion>

  </g>
  `;
}
<!-- ===================================================== -->
<!-- FOOTER -->
<!-- ===================================================== -->

svg += `

<line
  x1="${left}"
  y1="1024"
  x2="${right}"
  y2="1024"
  stroke="url(#edge)"
  opacity=".3"/>

<!-- tiny DSA symbols -->

<text
  x="66"
  y="1052"
  fill="#38506a"
  font-family="monospace"
  font-size="10">
&lt;/&gt;
</text>

<text
  x="104"
  y="1052"
  fill="#38506a"
  font-family="monospace"
  font-size="10">
C++
</text>

<text
  x="160"
  y="1052"
  fill="#38506a"
  font-family="monospace"
  font-size="10">
{ algorithms }
</text>

<text
  x="1128"
  y="1052"
  text-anchor="end"
  fill="#00e5ff"
  font-family="monospace"
  font-size="10">
KEEP SOLVING.
</text>

<text
  x="66"
  y="1082"
  fill="#30465e"
  font-family="monospace"
  font-size="9">
harshit@devos:~$ echo "one problem at a time."
</text>

</svg>
`;

fs.mkdirSync(path.dirname(OUTPUT), {recursive:true});
fs.writeFileSync(OUTPUT, svg);
console.log(`Wrote ${OUTPUT}`);
}

(async()=>{
  let data;
  try {
    data = await fetchData();
    console.log("Fetched live LeetCode data.");
  } catch (err) {
    console.warn(`Live fetch failed: ${err.message}`);
    console.warn("Generating with current fallback values.");
    data = fallbackData();
  }
  render(data);
})();
