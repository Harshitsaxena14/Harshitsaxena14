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
  const allSubmissions = getStat(ac, "All", "submissions");

  const easyTotal = getStat(data.allQuestionsCount, "Easy");
  const medTotal = getStat(data.allQuestionsCount, "Medium");
  const hardTotal = getStat(data.allQuestionsCount, "Hard");

  const acceptance = allSubmissions
    ? ((total / allSubmissions) * 100).toFixed(2)
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

  const W = 1200, H = 1080;
  const left = 42, right = 1158;
  let svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <linearGradient id="edge" x1="0" x2="1">
    <stop offset="0" stop-color="#00e5ff"/><stop offset=".5" stop-color="#7c5cff"/><stop offset="1" stop-color="#00e5ff"/>
  </linearGradient>
  <linearGradient id="easy" x1="0" x2="1"><stop stop-color="#14b866"/><stop offset="1" stop-color="#65f39a"/></linearGradient>
  <linearGradient id="med" x1="0" x2="1"><stop stop-color="#d8a72c"/><stop offset="1" stop-color="#ffd76a"/></linearGradient>
  <linearGradient id="hard" x1="0" x2="1"><stop stop-color="#ef5960"/><stop offset="1" stop-color="#ff8b91"/></linearGradient>
  <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#1a2940" opacity=".28"/></pattern>
</defs>

<rect x="8" y="8" width="1184" height="1064" rx="24" fill="#070b14" stroke="#26364e" stroke-width="2"/>
<rect x="18" y="18" width="1164" height="1044" rx="18" fill="url(#grid)"/>

<rect x="${left}" y="38" width="${right-left}" height="58" rx="12" fill="#0d1523" stroke="#2b3d58"/>
<circle cx="66" cy="67" r="6" fill="#ff5f57"/><circle cx="88" cy="67" r="6" fill="#febc2e"/><circle cx="110" cy="67" r="6" fill="#28c840"/>
<text x="138" y="73" fill="#9aabc0" font-family="monospace" font-size="18">harshit@devos ~ $ dsa --monitor --live</text>
<text x="1128" y="73" text-anchor="end" fill="#00e5ff" font-family="monospace" font-size="14">● LEETCODE CONNECTED</text>

<text x="${left}" y="138" fill="#00e5ff" font-family="monospace" font-size="15">DSA.MONITOR</text>
<text x="1128" y="138" text-anchor="end" fill="#5f7692" font-family="monospace" font-size="13">harshit_saxena14</text>
<line x1="${left}" y1="153" x2="${right}" y2="153" stroke="url(#edge)" opacity=".65"/>

<!-- KPI tiles -->
${[
  ["SOLVED",fmt(total),"#f3f6fb",left],
  ["EASY",`${fmt(easy)} / ${fmt(easyTotal)}`,"#65f39a",320],
  ["MEDIUM",`${fmt(medium)} / ${fmt(medTotal)}`,"#ffd76a",598],
  ["HARD",`${fmt(hard)} / ${fmt(hardTotal)}`,"#ff8b91",876]
].map(([label,val,col,x])=>`
<rect x="${x}" y="178" width="250" height="116" rx="14" fill="#0b1220" stroke="#263950"/>
<text x="${x+22}" y="207" fill="#617894" font-family="monospace" font-size="12">${label}</text>
<text x="${x+22}" y="256" fill="${col}" font-family="monospace" font-size="30" font-weight="700">${val}</text>
`).join("")}

<!-- acceptance / streak / contest -->
<rect x="${left}" y="318" width="358" height="132" rx="14" fill="#0b1220" stroke="#263950"/>
<text x="64" y="348" fill="#617894" font-family="monospace" font-size="12">ACCEPTANCE</text>
<text x="64" y="399" fill="#f3f6fb" font-family="monospace" font-size="38" font-weight="700">${acceptance}%</text>
<text x="64" y="428" fill="#607895" font-family="monospace" font-size="12">${fmt(allSubmissions)} accepted submissions</text>

<rect x="442" y="318" width="358" height="132" rx="14" fill="#0b1220" stroke="#263950"/>
<text x="468" y="348" fill="#617894" font-family="monospace" font-size="12">STREAK</text>
<text x="468" y="399" fill="#ff9d42" font-family="monospace" font-size="38" font-weight="700">${currentStreak}d</text>
<text x="468" y="428" fill="#607895" font-family="monospace" font-size="12">longest observed: ${longest}d</text>

<rect x="824" y="318" width="334" height="132" rx="14" fill="#0b1220" stroke="#263950"/>
<text x="850" y="348" fill="#617894" font-family="monospace" font-size="12">CONTEST</text>
<text x="850" y="392" fill="#b9a8ff" font-family="monospace" font-size="28" font-weight="700">${rating}</text>
<text x="850" y="418" fill="#607895" font-family="monospace" font-size="12">${contests} contests • rank ${contestRank}</text>

<!-- difficulty progress -->
<text x="${left}" y="490" fill="#00e5ff" font-family="monospace" font-size="14">DIFFICULTY.PROGRESS</text>
${[
  ["EASY",easy,easyTotal,"easy",0],
  ["MEDIUM",medium,medTotal,"med",1],
  ["HARD",hard,hardTotal,"hard",2]
].map(([label,count,maxQ,key,i])=>{
  const y=522+i*46;
  const pct=Math.min(100,(count/Math.max(1,maxQ))*100);
  const fillW=Math.max(8, 690*pct/100);
  const color=key==="easy"?"#65f39a":key==="med"?"#ffd76a":"#ff8b91";
  return `<text x="${left}" y="${y+15}" fill="#93a6bd" font-family="monospace" font-size="12">${label}</text>
  <rect x="145" y="${y}" width="690" height="18" rx="9" fill="#111b2a"/>
  <rect x="145" y="${y}" width="${fillW}" height="18" rx="9" fill="${color}"/>
  <text x="860" y="${y+15}" fill="#e8edf5" font-family="monospace" font-size="12">${fmt(count)} / ${fmt(maxQ)}</text>`;
}).join("")}

<!-- activity -->
<rect x="${left}" y="690" width="${right-left}" height="220" rx="16" fill="#0a111e" stroke="#263950"/>
<text x="66" y="722" fill="#00e5ff" font-family="monospace" font-size="14">SUBMISSION.ACTIVITY</text>
<text x="1128" y="722" text-anchor="end" fill="#71859e" font-family="monospace" font-size="12">${fmt(activeDays)} active days • ${fmt(allSubmissions)} accepted</text>
`;

  const gridX=66, gridY=748, cell=14, gap=4;
  const cols=Math.ceil(cells.length/7);
  for(let i=0;i<cells.length;i++){
    const c=cells[i], col=Math.floor(i/7), row=i%7;
    const x=gridX+col*(cell+gap), y=gridY+row*(cell+gap);
    if(x>1115) continue;
    const lvl=heatLevel(c.count,max);
    svg += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3" fill="${colorForLevel(lvl)}"><title>${c.date.toISOString().slice(0,10)}: ${c.count} submissions</title></rect>`;
  }

  // month labels
  const monthSeen = new Set();
  for(let i=0;i<cells.length;i++){
    const c=cells[i], col=Math.floor(i/7);
    const month=c.date.getUTCMonth();
    const key=`${c.date.getUTCFullYear()}-${month}`;
    if(c.date.getUTCDay()===0 && !monthSeen.has(key)){
      monthSeen.add(key);
      const x=gridX+col*(cell+gap);
      svg += `<text x="${x}" y="895" fill="#657b95" font-family="monospace" font-size="10">${c.date.toLocaleString("en-US",{month:"short",timeZone:"UTC"})}</text>`;
    }
  }

  // bottom strip
  svg += `
<line x1="${left}" y1="932" x2="${right}" y2="932" stroke="url(#edge)" opacity=".35"/>
<text x="66" y="962" fill="#617894" font-family="monospace" font-size="12">BADGES</text>
${badgeNames.slice(0,3).map((name,i)=>{
  const x=66+i*255;
  return `<rect x="${x}" y="980" width="230" height="34" rx="17" fill="#101b2b" stroke="#30445f"/>
  <circle cx="${x+18}" cy="997" r="5" fill="${i===0?"#62e98b":i===1?"#62b8ff":"#b9a8ff"}"/>
  <text x="${x+32}" y="1001" fill="#dbe5f1" font-family="monospace" font-size="10">${esc(name).slice(0,29)}</text>`;
}).join("")}
<text x="1128" y="962" text-anchor="end" fill="#617894" font-family="monospace" font-size="12">FOCUS</text>
<text x="1128" y="997" text-anchor="end" fill="#e5ebf4" font-family="monospace" font-size="12">C++ • Patterns • Optimization</text>
<text x="1128" y="1018" text-anchor="end" fill="#5d738e" font-family="monospace" font-size="10">LEETCODE / ${esc(USERNAME)}</text>
<text x="66" y="1045" fill="#4f6783" font-family="monospace" font-size="10">harshit@devos:~$ echo "keep solving."</text>
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
