// Fractional AI — NPS Survey Submission Handler
// Cloudflare Pages Function format.
// The NOTION_TOKEN lives in Cloudflare env vars, never in the frontend.

const NOTION_DATABASE_ID = "b836b540828f42db833841d044806362";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

// Handle CORS preflight
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// Handle POST submissions
export async function onRequestPost({ request, env }) {
  const NOTION_TOKEN = env.NOTION_TOKEN;

  if (!NOTION_TOKEN) {
    return new Response(
      JSON.stringify({ error: "NOTION_TOKEN not configured" }),
      { status: 500, headers: CORS_HEADERS }
    );
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON" }),
      { status: 400, headers: CORS_HEADERS }
    );
  }

  // Validate required fields
  const { nps_score, overall_experience, team_performance, solution_outcome, client_name, client_email } = payload;
  if ([nps_score, overall_experience, team_performance, solution_outcome].some(v => v === null || v === undefined)) {
    return new Response(
      JSON.stringify({ error: "Missing required fields" }),
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const npsCategory =
    nps_score <= 6 ? "Detractor" :
    nps_score <= 8 ? "Passive"   : "Promoter";

  try {
    const notionRes = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization:    `Bearer ${NOTION_TOKEN}`,
        "Notion-Version": "2022-06-28",
        "Content-Type":   "application/json",
      },
      body: JSON.stringify({
        parent: { database_id: env.NOTION_DATABASE_ID || NOTION_DATABASE_ID },
        properties: {
          "Client":             { title:     [{ text: { content: client_name || "Anonymous" } }] },
          "Email":              { email:     client_email || null },
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
      return new Response(
        JSON.stringify({ error: "Failed to save to Notion" }),
        { status: 502, headers: CORS_HEADERS }
      );
    }

    const data = await notionRes.json();
    return new Response(
      JSON.stringify({ success: true, id: data.id }),
      { status: 200, headers: CORS_HEADERS }
    );

  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
