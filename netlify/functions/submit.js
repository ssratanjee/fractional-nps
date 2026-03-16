// Fractional AI — NPS Survey Submission Handler
// This serverless function proxies responses to Notion.
// The NOTION_TOKEN lives here (env var), never in the frontend.

const NOTION_TOKEN       = process.env.NOTION_TOKEN;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID || "b836b540828f42db833841d044806362";

const ALLOWED_ORIGINS = [
  "https://fractional-nps.netlify.app",
  // Add your custom domain once configured, e.g.:
  // "https://feedback.fractional.ai",
];

exports.handler = async (event) => {
  const origin = event.headers.origin || "";
  const corsHeaders = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  // Handle preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  if (!NOTION_TOKEN) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "NOTION_TOKEN not configured" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  // Validate required fields
  const { nps_score, overall_experience, team_performance, solution_outcome } = payload;
  if ([nps_score, overall_experience, team_performance, solution_outcome].some(v => v === null || v === undefined)) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Missing required fields" }) };
  }

  const npsCategory =
    nps_score <= 6 ? "Detractor" :
    nps_score <= 8 ? "Passive" : "Promoter";

  try {
    const notionRes = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization:    `Bearer ${NOTION_TOKEN}`,
        "Notion-Version": "2022-06-28",
        "Content-Type":   "application/json",
      },
      body: JSON.stringify({
        parent: { database_id: NOTION_DATABASE_ID },
        properties: {
          "Client":             { title:     [{ text: { content: payload.client_name || "Anonymous" } }] },
          "Date":               { date:      { start: payload.timestamp || new Date().toISOString() } },
          "NPS Score":          { number:    nps_score },
          "NPS Category":       { select:    { name: npsCategory } },
          "Overall Experience": { number:    overall_experience },
          "Team Performance":   { number:    team_performance },
          "Solution Outcome":   { number:    solution_outcome },
          "Feedback":           { rich_text: [{ text: { content: payload.open_feedback || "" } }] },
          "Survey Source":      { rich_text: [{ text: { content: payload.survey_source || "" } }] },
        },
      }),
    });

    if (!notionRes.ok) {
      const err = await notionRes.text();
      console.error("Notion API error:", err);
      return { statusCode: 502, headers: corsHeaders, body: JSON.stringify({ error: "Failed to save to Notion" }) };
    }

    const data = await notionRes.json();
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, id: data.id }),
    };

  } catch (err) {
    console.error("Unexpected error:", err);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Internal server error" }) };
  }
};
