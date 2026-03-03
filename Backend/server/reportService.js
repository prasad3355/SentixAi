const ExcelJS = require("exceljs");

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseMetricNumber(value) {
  if (typeof value === "number") return value;
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) return 0;
  const multiplier = raw.endsWith("M") ? 1_000_000 : raw.endsWith("K") ? 1_000 : 1;
  const normalized = multiplier > 1 ? raw.slice(0, -1) : raw;
  const parsed = Number(normalized.replace(/,/g, ""));
  if (!Number.isFinite(parsed)) return 0;
  return parsed * multiplier;
}

function safeKeywordSlug(keyword) {
  return String(keyword || "technology").replace(/[^a-zA-Z0-9_-]+/g, "_");
}

function styleHeader(row) {
  row.font = { bold: true, color: { argb: "FF0F172A" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
}

function styleSectionTitle(row) {
  row.font = { bold: true, size: 12, color: { argb: "FF1E293B" } };
}

function styleMetricLabel(cell) {
  cell.font = { bold: true, color: { argb: "FF334155" } };
}

function autoSizeSheetColumns(worksheet) {
  const totalColumns = Math.max(worksheet.columnCount, 2);
  for (let i = 1; i <= totalColumns; i += 1) {
    let maxLength = 10;
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      const cell = row.getCell(i);
      const value = cell.value;
      let text = "";
      if (value instanceof Date) {
        text = value.toISOString();
      } else if (value && typeof value === "object" && value.richText) {
        text = value.richText.map((chunk) => chunk.text || "").join("");
      } else {
        text = String(value ?? "");
      }
      maxLength = Math.max(maxLength, text.length + 2);
    });
    worksheet.getColumn(i).width = clamp(maxLength, 10, 60);
  }
}

function addTableSection(worksheet, title, headers, rows) {
  worksheet.addRow([title]);
  styleSectionTitle(worksheet.getRow(worksheet.rowCount));

  worksheet.addRow(headers);
  styleHeader(worksheet.getRow(worksheet.rowCount));

  const dataStart = worksheet.rowCount + 1;
  rows.forEach((row) => worksheet.addRow(row));
  const dataEnd = worksheet.rowCount;
  worksheet.addRow([]);

  return { dataStart, dataEnd };
}

function buildSentimentStats(payload) {
  const distribution = payload.dashboard?.distribution || {};
  const totalMentions = Math.round(asNumber(payload.dashboard?.kpis?.totalMentions || 0));
  const tweets = Array.isArray(payload.liveFeed?.tweets) ? payload.liveFeed.tweets : [];

  const sampleCounts = { positive: 0, neutral: 0, negative: 0 };
  tweets.forEach((tweet) => {
    const sentiment = String(tweet?.sentiment || "").trim().toLowerCase();
    if (sentiment.includes("positive")) sampleCounts.positive += 1;
    else if (sentiment.includes("negative")) sampleCounts.negative += 1;
    else sampleCounts.neutral += 1;
  });

  const sentimentRows = [
    { sentiment: "Positive", percent: asNumber(distribution.positive || 0) },
    { sentiment: "Neutral", percent: asNumber(distribution.neutral || 0) },
    { sentiment: "Negative", percent: asNumber(distribution.negative || 0) },
  ];

  return sentimentRows.map((row) => {
    const key = row.sentiment.toLowerCase();
    const estimatedCount = Math.round(totalMentions * (row.percent / 100));
    return {
      sentiment: row.sentiment,
      percentage: row.percent / 100,
      estimatedCount,
      sampleCount: sampleCounts[key] || 0,
    };
  });
}

function addSummarySheet(workbook, payload) {
  const ws = workbook.addWorksheet("Summary Metrics");

  const kpis = payload.dashboard?.kpis || {};
  const changes = kpis.changes || {};

  const metrics = [
    ["Keyword", payload.keyword || ""],
    ["Generated At", new Date()],
    ["Updated At", payload.updatedAt ? new Date(payload.updatedAt) : ""],
    ["Source", payload.sourceLabel || payload.source || ""],
    ["Total Mentions", Math.round(asNumber(kpis.totalMentions || 0))],
    ["Average Sentiment", asNumber(kpis.avgSentiment || 0)],
    ["Social Reach", Math.round(asNumber(kpis.socialReach || 0))],
    ["Engagement Rate", asNumber(kpis.engagementRate || 0) / 100],
    ["Total Mentions Change", changes.totalMentions || "0.0%"],
    ["Avg Sentiment Change", changes.avgSentiment || "0.0%"],
    ["Social Reach Change", changes.socialReach || "0.0%"],
    ["Engagement Rate Change", changes.engagementRate || "0.0%"],
  ];

  const { dataStart } = addTableSection(ws, "Core KPI Summary", ["Metric", "Value"], metrics);

  for (let rowNo = dataStart; rowNo < dataStart + metrics.length; rowNo += 1) {
    styleMetricLabel(ws.getCell(rowNo, 1));
  }

  ws.getCell(`B${dataStart + 1}`).numFmt = "yyyy-mm-dd hh:mm:ss";
  if (payload.updatedAt) ws.getCell(`B${dataStart + 2}`).numFmt = "yyyy-mm-dd hh:mm:ss";
  ws.getCell(`B${dataStart + 4}`).numFmt = "#,##0";
  ws.getCell(`B${dataStart + 5}`).numFmt = "0";
  ws.getCell(`B${dataStart + 6}`).numFmt = "#,##0";
  ws.getCell(`B${dataStart + 7}`).numFmt = "0.00%";

  const sentimentStats = buildSentimentStats(payload);
  const sentimentRows = sentimentStats.map((item) => [
    item.sentiment,
    item.estimatedCount,
    item.sampleCount,
    item.percentage,
  ]);

  const sentimentRange = addTableSection(
    ws,
    "Sentiment Totals and Percentages",
    ["Sentiment", "Total Tweets (Estimated)", "Total Tweets (Live Sample)", "Percentage"],
    sentimentRows
  );

  for (let rowNo = sentimentRange.dataStart; rowNo <= sentimentRange.dataEnd; rowNo += 1) {
    ws.getCell(`B${rowNo}`).numFmt = "#,##0";
    ws.getCell(`C${rowNo}`).numFmt = "#,##0";
    ws.getCell(`D${rowNo}`).numFmt = "0.00%";
  }

  autoSizeSheetColumns(ws);
}

function addDistributionSheet(workbook, payload) {
  const ws = workbook.addWorksheet("Sentiment Distribution");
  const sentimentStats = buildSentimentStats(payload);

  const distributionRows = sentimentStats.map((item) => [
    item.sentiment,
    item.percentage,
    item.estimatedCount,
    item.sampleCount,
  ]);

  const distRange = addTableSection(
    ws,
    "Distribution Breakdown",
    ["Sentiment", "Percentage", "Total Tweets (Estimated)", "Total Tweets (Live Sample)"],
    distributionRows
  );

  for (let rowNo = distRange.dataStart; rowNo <= distRange.dataEnd; rowNo += 1) {
    ws.getCell(`B${rowNo}`).numFmt = "0.00%";
    ws.getCell(`C${rowNo}`).numFmt = "#,##0";
    ws.getCell(`D${rowNo}`).numFmt = "#,##0";
  }

  autoSizeSheetColumns(ws);
}

function addEmotionSheet(workbook, payload) {
  const ws = workbook.addWorksheet("Emotional Intensity");
  const emotions = Array.isArray(payload.dashboard?.emotions) ? payload.dashboard.emotions : [];
  const requiredEmotionOrder = ["Joy", "Surprise", "Anger", "Fear"];
  const emotionMap = new Map();

  emotions.forEach((item) => {
    const name = String(item?.name || "").trim();
    if (!name) return;
    emotionMap.set(name.toLowerCase(), {
      name,
      intensity: asNumber(item.value || 0),
    });
  });

  requiredEmotionOrder.forEach((name) => {
    const key = name.toLowerCase();
    if (!emotionMap.has(key)) {
      emotionMap.set(key, { name, intensity: 0 });
    }
  });

  const prioritized = requiredEmotionOrder.map((name) => emotionMap.get(name.toLowerCase()));
  const extras = Array.from(emotionMap.values())
    .filter((item) => !requiredEmotionOrder.includes(item.name))
    .sort((a, b) => b.intensity - a.intensity);

  const rows = [...prioritized, ...extras]
    .map((item, idx) => [idx + 1, item.name, item.intensity / 100]);

  const range = addTableSection(ws, "Emotion Scores", ["Rank", "Emotion", "Intensity"], rows);

  for (let rowNo = range.dataStart; rowNo <= range.dataEnd; rowNo += 1) {
    ws.getCell(`A${rowNo}`).numFmt = "0";
    ws.getCell(`C${rowNo}`).numFmt = "0.00%";
  }

  autoSizeSheetColumns(ws);
}

function addTimelineSheet(workbook, payload) {
  const ws = workbook.addWorksheet("Timeline Data");
  const timeline = Array.isArray(payload.dashboard?.timeline) ? payload.dashboard.timeline : [];
  const trend = Array.isArray(payload.analytics?.trend) ? payload.analytics.trend : [];
  const updatedAt = payload.updatedAt ? new Date(payload.updatedAt) : new Date();

  const points = Math.max(1, timeline.length);
  const stepMinutes = points > 1 ? Math.max(5, Math.round(180 / (points - 1))) : 10;
  const timelineRows = timeline.map((value, idx) => {
    const minutesAgo = (points - 1 - idx) * stepMinutes;
    const pointTime = new Date(updatedAt.getTime() - minutesAgo * 60_000);
    return [pointTime, asNumber(value), idx === timeline.length - 1 ? "Now" : `${minutesAgo}m ago`];
  });

  const timelineRange = addTableSection(
    ws,
    "Dashboard Timeline Series",
    ["Datetime", "Sentiment Score", "Label"],
    timelineRows
  );

  for (let rowNo = timelineRange.dataStart; rowNo <= timelineRange.dataEnd; rowNo += 1) {
    ws.getCell(`A${rowNo}`).numFmt = "yyyy-mm-dd hh:mm:ss";
    ws.getCell(`B${rowNo}`).numFmt = "0";
  }

  const trendPoints = Math.max(1, trend.length);
  const trendStepMinutes = trendPoints > 1 ? Math.max(15, Math.round(420 / (trendPoints - 1))) : 60;
  const trendRows = trend.map((item, idx) => {
    const minutesAgo = (trendPoints - 1 - idx) * trendStepMinutes;
    const pointTime = new Date(updatedAt.getTime() - minutesAgo * 60_000);
    return [pointTime, item.label || "", asNumber(item.volume), asNumber(item.sentiment)];
  });

  const trendRange = addTableSection(
    ws,
    "Analytics Trend Series",
    ["Datetime", "Trend Label", "Volume", "Sentiment"],
    trendRows
  );

  for (let rowNo = trendRange.dataStart; rowNo <= trendRange.dataEnd; rowNo += 1) {
    ws.getCell(`A${rowNo}`).numFmt = "yyyy-mm-dd hh:mm:ss";
    ws.getCell(`C${rowNo}`).numFmt = "#,##0";
    ws.getCell(`D${rowNo}`).numFmt = "0";
  }

  autoSizeSheetColumns(ws);
}

function addNetworkSheet(workbook, payload) {
  const ws = workbook.addWorksheet("Influencer Network");
  const influencers = payload.network?.influencers || [];
  const nodes = payload.network?.nodes || [];
  const edges = payload.network?.edges || [];
  const mentions = payload.analytics?.mentions || [];
  const tweets = payload.liveFeed?.tweets || [];

  const influencerRows = influencers.map((item) => [
    asNumber(item.rank || 0),
    item.handle || "",
    parseMetricNumber(item.reach || 0),
    asNumber(item.score || 0),
  ]);

  const influencerRange = addTableSection(
    ws,
    "Top Influencers",
    ["Rank", "Handle", "Reach", "Score"],
    influencerRows
  );

  for (let rowNo = influencerRange.dataStart; rowNo <= influencerRange.dataEnd; rowNo += 1) {
    ws.getCell(`A${rowNo}`).numFmt = "0";
    ws.getCell(`C${rowNo}`).numFmt = "#,##0";
    ws.getCell(`D${rowNo}`).numFmt = "0";
  }

  const nodeRows = nodes.map((node) => [
    node.id || "",
    node.label || "",
    node.sentiment || "",
    asNumber(node.influence || 0),
    asNumber(node.x || 0),
    asNumber(node.y || 0),
  ]);

  const nodeRange = addTableSection(
    ws,
    "Network Nodes",
    ["Node ID", "Label", "Sentiment", "Influence", "X", "Y"],
    nodeRows
  );

  for (let rowNo = nodeRange.dataStart; rowNo <= nodeRange.dataEnd; rowNo += 1) {
    ws.getCell(`D${rowNo}`).numFmt = "0";
    ws.getCell(`E${rowNo}`).numFmt = "0";
    ws.getCell(`F${rowNo}`).numFmt = "0";
  }

  const edgeRows = edges.map((edge) => [edge.from || "", edge.to || ""]);
  addTableSection(ws, "Network Connections", ["From", "To"], edgeRows);

  const mentionRows = mentions.map((item) => [
    item.name || "",
    item.handle || "",
    item.sentiment || "",
    parseMetricNumber(item.reach || 0),
    item.text || "",
  ]);

  const mentionRange = addTableSection(
    ws,
    "Influential Mentions",
    ["Name", "Handle", "Sentiment", "Reach", "Text"],
    mentionRows
  );

  for (let rowNo = mentionRange.dataStart; rowNo <= mentionRange.dataEnd; rowNo += 1) {
    ws.getCell(`D${rowNo}`).numFmt = "#,##0";
  }

  const tweetRows = tweets.map((tweet) => [
    tweet.username || "",
    tweet.handle || "",
    tweet.sentiment || "",
    tweet.time || "",
    asNumber(tweet.stats?.replies || 0),
    asNumber(tweet.stats?.retweets || 0),
    asNumber(tweet.stats?.likes || 0),
    tweet.content || "",
  ]);

  const tweetRange = addTableSection(
    ws,
    "Live Feed Tweets",
    ["User", "Handle", "Sentiment", "Time", "Replies", "Retweets", "Likes", "Content"],
    tweetRows
  );

  for (let rowNo = tweetRange.dataStart; rowNo <= tweetRange.dataEnd; rowNo += 1) {
    ws.getCell(`E${rowNo}`).numFmt = "#,##0";
    ws.getCell(`F${rowNo}`).numFmt = "#,##0";
    ws.getCell(`G${rowNo}`).numFmt = "#,##0";
  }

  autoSizeSheetColumns(ws);
}

async function createExcelReportBuffer(payload) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SentixAI";
  workbook.created = new Date();

  addSummarySheet(workbook, payload);
  addDistributionSheet(workbook, payload);
  addEmotionSheet(workbook, payload);
  addTimelineSheet(workbook, payload);
  addNetworkSheet(workbook, payload);

  return workbook.xlsx.writeBuffer();
}

module.exports = {
  createExcelReportBuffer,
  safeKeywordSlug,
};
