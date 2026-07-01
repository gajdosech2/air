// Vercel Serverless Function — proxies Supabase reads so the service key
// stays server-side.  Deploy env vars SUPABASE_URL and SUPABASE_SERVICE_KEY
// in the Vercel dashboard.

export default async function handler(req, res) {
  // CORS (allow the frontend origin)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: "Missing Supabase env vars" });
  }

  // Optional query params: range (1h, 6h, 24h, 7d, 30d, all), limit
  const range = req.query.range || "24h";
  const limit = Math.min(parseInt(req.query.limit) || 2000, 5000);

  let filter = "";
  if (range !== "all") {
    const ms = {
      "1h": 3600000,
      "6h": 21600000,
      "24h": 86400000,
      "7d": 604800000,
      "30d": 2592000000,
    }[range];
    if (ms) {
      const since = new Date(Date.now() - ms).toISOString();
      filter = `&recorded_at=gte.${since}`;
    }
  }

  const url =
    `${SUPABASE_URL}/rest/v1/readings?select=*` +
    `&order=recorded_at.asc` +
    filter +
    `&limit=${limit}`;

  try {
    const response = await fetch(url, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: text });
    }

    const data = await response.json();
    // Cache for 60 seconds on Vercel edge
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
