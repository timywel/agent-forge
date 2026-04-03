import * as fs from "node:fs";

const report = JSON.parse(fs.readFileSync("reports/agent-review-report-2026-04-03.json", "utf-8"));

const issueStats: Record<string, {count:number, severity:string, dimension:string, desc:string, locs:string[]}> = {};
for (const agent of report.allAgents) {
  for (const issue of agent.issues) {
    if (!issueStats[issue.code]) issueStats[issue.code] = { count:0, severity:issue.severity, dimension:issue.dimension, desc:issue.description, locs:[] };
    issueStats[issue.code].count++;
    issueStats[issue.code].locs.push(issue.location || "");
  }
}

const sorted = Object.entries(issueStats).sort((a,b) => b[1].count - a[1].count);
for (const [code, s] of sorted.slice(0, 15)) {
  const icon = s.severity === "error" ? "🔴" : s.severity === "warning" ? "⚠️" : "💡";
  console.log(icon + " [" + s.dimension + "] " + code + " (" + s.count + "次): " + s.desc.slice(0, 90));
  const sample = s.locs[0] || "";
  console.log("    示例: " + sample.split("/").slice(-2).join("/"));
}

console.log("\n=== Top 5 高分 Agent ===");
const top = [...report.allAgents].sort((a,b) => b.overallScore - a.overallScore).slice(0,5);
for (const a of top) console.log("  " + a.overallScore + " " + a.id + " (" + a.issues.length + "个问题)");

console.log("\n=== 维度均分 ===");
const dimScores: Record<string, number[]> = {};
for (const agent of report.allAgents) {
  for (const [dim, data] of Object.entries(agent.dimensions as Record<string, {score:number}>)) {
    if (!dimScores[dim]) dimScores[dim] = [];
    dimScores[dim].push(data.score);
  }
}
for (const [dim, scores] of Object.entries(dimScores)) {
  const avg = scores.reduce((a,b) => a+b, 0)/scores.length;
  console.log("  " + dim + ": " + avg.toFixed(1) + "/10");
}
