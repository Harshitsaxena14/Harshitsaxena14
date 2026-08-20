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

  <linearGradient id="forest" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#071426"/>
    <stop offset="1" stop-color="#02060d"/>
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
    <stop offset="1" stop-color="#ff969b"/>
  </linearGradient>

  <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
    <path d="M32 0H0V32"
      fill="none"
      stroke="#16283e"
      opacity=".22"/>
  </pattern>

  <filter id="glow">
    <feGaussianBlur stdDeviation="4" result="blur"/>
    <feMerge>
      <feMergeNode in="blur"/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  </filter>

</defs>

<!-- BACKGROUND -->

<rect
  x="8"
  y="8"
  width="1184"
  height="1104"
  rx="26"
  fill="#050910"
  stroke="#24364e"
  stroke-width="2"/>

<rect
  x="18"
  y="18"
  width="1164"
  height="1084"
  rx="20"
  fill="url(#grid)"/>


<!-- TERMINAL HEADER -->

<rect
  x="${left}"
  y="34"
  width="${right-left}"
  height="58"
  rx="12"
  fill="#0b1422"
  stroke="#2a3d58"/>

<circle cx="66" cy="63" r="6" fill="#ff5f57"/>
<circle cx="88" cy="63" r="6" fill="#febc2e"/>
<circle cx="110" cy="63" r="6" fill="#28c840"/>

<text
  x="138"
  y="69"
  fill="#9aabc0"
  font-family="monospace"
  font-size="17">
  harshit@devos ~ $ dsa --monitor --live
</text>

<text
  x="1128"
  y="69"
  text-anchor="end"
  fill="#00e5ff"
  font-family="monospace"
  font-size="13">
  ● LEETCODE CONNECTED
</text>


<!-- ATMOSPHERIC HERO -->

<rect
  x="${left}"
  y="112"
  width="${right-left}"
  height="190"
  rx="18"
  fill="url(#forest)"
  stroke="#263950"/>

<!-- moon -->

<circle
  cx="1040"
  cy="157"
  r="25"
  fill="#d9f4ff"
  opacity=".9"/>

<circle
  cx="1051"
  cy="148"
  r="25"
  fill="#071426"/>

<!-- stars -->

<circle cx="920" cy="145" r="2" fill="#7cecff"/>
<circle cx="970" cy="181" r="2" fill="#7cecff"/>
<circle cx="1100" cy="132" r="2" fill="#7cecff"/>
<circle cx="865" cy="170" r="2" fill="#7cecff"/>

<!-- mountains -->

<path
  d="M42 280 L170 175 L235 235 L320 155 L430 280 Z"
  fill="#0a1c2e"/>

<path
  d="M320 280 L455 165 L540 230 L650 145 L780 280 Z"
  fill="#0b2032"/>

<path
  d="M680 280 L810 175 L900 235 L1000 155 L1158 280 Z"
  fill="#091a2b"/>


<!-- trees -->

<g fill="#06121e">

  <path d="M80 276 L105 220 L130 276 Z"/>
  <path d="M125 276 L155 205 L185 276 Z"/>
  <path d="M190 276 L220 210 L250 276 Z"/>

  <path d="M925 276 L955 205 L985 276 Z"/>
  <path d="M980 276 L1010 215 L1040 276 Z"/>
  <path d="M1060 276 L1090 200 L1120 276 Z"/>

</g>


<!-- CREATURE -->

<g transform="translate(175 178)">

  <!-- glow -->
  <ellipse
    cx="58"
    cy="76"
    rx="52"
    ry="12"
    fill="#00e5ff"
    opacity=".12"
    filter="url(#glow)"/>

  <!-- antenna -->
  <line
    x1="58"
    y1="12"
    x2="58"
    y2="0"
    stroke="#55e8ff"
    stroke-width="3"/>

  <circle
    cx="58"
    cy="0"
    r="4"
    fill="#00e5ff"/>

  <!-- head -->
  <rect
    x="25"
    y="15"
    width="66"
    height="46"
    rx="16"
    fill="#0b1725"
    stroke="#5a7895"
    stroke-width="2"/>

  <!-- eyes -->
  <circle
    cx="45"
    cy="37"
    r="6"
    fill="#00e5ff"
    filter="url(#glow)"/>

  <circle
    cx="72"
    cy="37"
    r="6"
    fill="#00e5ff"
    filter="url(#glow)"/>

  <!-- body -->
  <rect
    x="34"
    y="59"
    width="48"
    height="32"
    rx="10"
    fill="#0d2030"
    stroke="#36526d"/>

  <!-- core -->
  <circle
    cx="58"
    cy="75"
    r="6"
    fill="#7c5cff"/>

  <!-- legs -->
  <path
    d="M45 91 L38 105 M71 91 L78 105"
    stroke="#5d7b95"
    stroke-width="5"
    stroke-linecap="round"/>

</g>


<text
  x="330"
  y="160"
  fill="#00e5ff"
  font-family="monospace"
  font-size="13">
  LEETCODE // LIVE
</text>

<text
  x="330"
  y="195"
  fill="#f3f6fb"
  font-family="monospace"
  font-size="28"
  font-weight="700">
  PROBLEM SOLVING INSTANCE
</text>

<text
  x="330"
  y="222"
  fill="#71859e"
  font-family="monospace"
  font-size="13">
  one problem at a time • one pattern at a time
</text>

<text
  x="330"
  y="255"
  fill="#00e5ff"
  font-family="monospace"
  font-size="11">
  ENTITY.STATUS // ONLINE
</text>

<text
  x="1128"
  y="255"
  text-anchor="end"
  fill="#607895"
  font-family="monospace"
  font-size="11">
  ${esc(USERNAME)}
</text>


<!-- KPI -->

${[
  ["SOLVED",fmt(total),"#f3f6fb",left],
  ["EASY",`${fmt(easy)} / ${fmt(easyTotal)}`,"#65f39a",320],
  ["MEDIUM",`${fmt(medium)} / ${fmt(medTotal)}`,"#ffd76a",598],
  ["HARD",`${fmt(hard)} / ${fmt(hardTotal)}`,"#ff8b91",876]
].map(([label,val,col,x])=>`
<rect
  x="${x}"
  y="322"
  width="250"
  height="112"
  rx="14"
  fill="#0b1220"
  stroke="#263950"/>

<text
  x="${x+22}"
  y="350"
  fill="#617894"
  font-family="monospace"
  font-size="11">
  ${label}
</text>

<text
  x="${x+22}"
  y="399"
  fill="${col}"
  font-family="monospace"
  font-size="29"
  font-weight="700">
  ${val}
</text>

<text
  x="${x+22}"
  y="420"
  fill="#40566f"
  font-family="monospace"
  font-size="9">
  LIVE DATA
</text>
`).join("")}


<!-- ACCEPTANCE -->

<rect
  x="${left}"
  y="454"
  width="358"
  height="128"
  rx="14"
  fill="#0b1220"
  stroke="#263950"/>

<text
  x="64"
  y="483"
  fill="#617894"
  font-family="monospace"
  font-size="11">
  ACCEPTANCE
</text>

<text
  x="64"
  y="530"
  fill="#f3f6fb"
  font-family="monospace"
  font-size="34"
  font-weight="700">
  ${acceptance}%
</text>

<circle
  cx="330"
  cy="516"
  r="27"
  fill="none"
  stroke="#142338"
  stroke-width="7"/>

<circle
  cx="330"
  cy="516"
  r="27"
  fill="none"
  stroke="#00e5ff"
  stroke-width="7"
  stroke-dasharray="${Math.min(170, Number(acceptance || 0) * 1.7)} 170"
  transform="rotate(-90 330 516)"/>

<text
  x="64"
  y="560"
  fill="#607895"
  font-family="monospace"
  font-size="10">
  ${fmt(acceptedSubmissions)} accepted submissions
</text>


<!-- STREAK -->

<rect
  x="442"
  y="454"
  width="358"
  height="128"
  rx="14"
  fill="#0b1220"
  stroke="#263950"/>

<text
  x="468"
  y="483"
  fill="#617894"
  font-family="monospace"
  font-size="11">
  STREAK
</text>

<text
  x="468"
  y="530"
  fill="#ff9d42"
  font-family="monospace"
  font-size="34"
  font-weight="700">
  ${currentStreak}d
</text>

<text
  x="468"
  y="560"
  fill="#607895"
  font-family="monospace"
  font-size="10">
  longest observed: ${longest}d
</text>

<text
  x="760"
  y="530"
  text-anchor="end"
  fill="#ff9d42"
  font-family="monospace"
  font-size="11">
  KEEP GOING
</text>


<!-- CONTEST -->

<rect
  x="824"
  y="454"
  width="334"
  height="128"
  rx="14"
  fill="#0b1220"
  stroke="#263950"/>

<text
  x="850"
  y="483"
  fill="#617894"
  font-family="monospace"
  font-size="11">
  CONTEST
</text>

<text
  x="850"
  y="523"
  fill="#b9a8ff"
  font-family="monospace"
  font-size="27"
  font-weight="700">
  ${rating}
</text>

<text
  x="850"
  y="550"
  fill="#607895"
  font-family="monospace"
  font-size="10">
  ${contests} contests
</text>

<text
  x="850"
  y="568"
  fill="#607895"
  font-family="monospace"
  font-size="10">
  rank ${contestRank}
</text>


<!-- DIFFICULTY -->

<text
  x="${left}"
  y="620"
  fill="#00e5ff"
  font-family="monospace"
  font-size="13">
  DIFFICULTY.PROGRESS
</text>

${[
  ["EASY",easy,easyTotal,"easy",0],
  ["MEDIUM",medium,medTotal,"med",1],
  ["HARD",hard,hardTotal,"hard",2]
].map(([label,count,maxQ,key,i])=>{

  const y=648+i*42;
  const pct=Math.min(100,(count/Math.max(1,maxQ))*100);
  const fillW=Math.max(8,690*pct/100);
  const color=
    key==="easy" ? "#65f39a" :
    key==="med" ? "#ffd76a" :
    "#ff8b91";

  return `
<text
  x="${left}"
  y="${y+13}"
  fill="#93a6bd"
  font-family="monospace"
  font-size="11">
  ${label}
</text>

<rect
  x="145"
  y="${y}"
  width="690"
  height="16"
  rx="8"
  fill="#111b2a"/>

<rect
  x="145"
  y="${y}"
  width="${fillW}"
  height="16"
  rx="8"
  fill="${color}"/>

<text
  x="860"
  y="${y+13}"
  fill="#e8edf5"
  font-family="monospace"
  font-size="11">
  ${fmt(count)} / ${fmt(maxQ)}
</text>`;
}).join("")}


<!-- ACTIVITY -->

<rect
  x="${left}"
  y="790"
  width="${right-left}"
  height="220"
  rx="16"
  fill="#09111d"
  stroke="#263950"/>

<text
  x="66"
  y="822"
  fill="#00e5ff"
  font-family="monospace"
  font-size="13">
  SUBMISSION.ACTIVITY
</text>

<text
  x="1128"
  y="822"
  text-anchor="end"
  fill="#71859e"
  font-family="monospace"
  font-size="10">
  ${fmt(activeDays)} active days
</text>
`;

const gridX=66;
const gridY=850;
const cell=14;
const gap=4;
const cols=Math.ceil(cells.length/7);

for(let i=0;i<cells.length;i++){

  const c=cells[i];
  const col=Math.floor(i/7);
  const row=i%7;

  const x=gridX+col*(cell+gap);
  const y=gridY+row*(cell+gap);

  if(x>1115) continue;

  const lvl=heatLevel(c.count,max);

  svg += `
<rect
  x="${x}"
  y="${y}"
  width="${cell}"
  height="${cell}"
  rx="3"
  fill="${colorForLevel(lvl)}">
  <title>${c.date.toISOString().slice(0,10)}: ${c.count} submissions</title>
</rect>`;
}


<!-- FOOTER -->

svg += `

<line
  x1="${left}"
  y1="1035"
  x2="${right}"
  y2="1035"
  stroke="url(#edge)"
  opacity=".35"/>

<text
  x="66"
  y="1060"
  fill="#617894"
  font-family="monospace"
  font-size="10">
  SYSTEM // DSA MONITOR
</text>

<text
  x="600"
  y="1060"
  text-anchor="middle"
  fill="#40566f"
  font-family="monospace"
  font-size="10">
  C++ • PATTERNS • OPTIMIZATION
</text>

<text
  x="1128"
  y="1060"
  text-anchor="end"
  fill="#00e5ff"
  font-family="monospace"
  font-size="10">
  KEEP SOLVING.
</text>

</svg>`;

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
