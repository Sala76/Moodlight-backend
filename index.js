require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ----------------------------------------------------
// 🧠 LEARNING MODE LOGGING (USER LABELLED DATA)
// ----------------------------------------------------
app.post("/log-mood", async (req, res) => {
  const { user_id, bpm, mood } = req.body;

  if (!user_id || !bpm || !mood) {
    return res.status(400).json({ error: "Missing fields" });
  }

  // 1. get user created_at + learning status
  const { data: userData, error: userError } = await supabase
    .from("users")
    .select("created_at, learning_complete")
    .eq("id", user_id)
    .single();

  if (userError) {
    return res.status(500).json({ error: userError.message });
  }

  // 2. check 3-day rule
  const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;

  const isExpired =
    Date.now() - new Date(userData.created_at).getTime() >= THREE_DAYS;

  if (!userData.learning_complete && isExpired) {
    await supabase
      .from("users")
      .update({ learning_complete: true })
      .eq("id", user_id);
  }

  // 3. insert mood log
  const { data, error } = await supabase
    .from("mood_logs")
    .insert([
      {
        user_id,
        bpm,
        mood,
      },
    ])
    .select();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({
    success: true,
    saved: data,
    learning_complete: isExpired,
  });
});

app.post("/finish-learning/:user_id", async (req, res) => {
  const { user_id } = req.params;

  // 1. get logs
  const { data, error } = await supabase
    .from("mood_logs")
    .select("bpm, mood")
    .eq("user_id", user_id);

  if (error) return res.status(500).json({ error: error.message });

  if (!data || data.length === 0) {
    return res.json({ error: "No data" });
  }

  // 2. group
  const groups = { sleep: [], calm: [], focus: [] };

  data.forEach((r) => {
    if (groups[r.mood]) groups[r.mood].push(r.bpm);
  });

  const avg = (arr) =>
    arr.length ? arr.reduce((a, b) => a + b) / arr.length : null;

  const thresholds = {
    sleep: avg(groups.sleep),
    calm: avg(groups.calm),
    focus: avg(groups.focus),
  };

  // 3. save to users table
  const { error: updateError } = await supabase
    .from("users")
    .update({
      sleep_avg: thresholds.sleep,
      calm_avg: thresholds.calm,
      focus_avg: thresholds.focus,
      learning_complete: true,
    })
    .eq("id", user_id);

  if (updateError) return res.status(500).json({ error: updateError.message });

  res.json({
    success: true,
    thresholds,
  });
});

// ----------------------------------------------------
// 🧪 OLD AUTO MAPPING (KEEP FOR TESTING ONLY)
// ----------------------------------------------------
app.post("/calculateMood", async (req, res) => {
  const { bpm, user_id } = req.body;

  if (!bpm || isNaN(bpm)) {
    return res.status(400).json({ error: "Invalid BPM" });
  }

  let mood = "calm";

  if (bpm < 60) {
    mood = "sleep";
  } else if (bpm > 100) {
    mood = "focus";
  }

  console.log("BPM:", bpm, "Mood:", mood);

  const { error } = await supabase.from("mood_logs").insert([
    {
      user_id: user_id || null,
      bpm,
      mood,
    },
  ]);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ mood, saved: true });
});

// ----------------------------------------------------
// 🧠 LEARNING ENGINE (PERSONAL USER AVERAGES)
// ----------------------------------------------------
app.get("/learn/:user_id", async (req, res) => {
  const { user_id } = req.params;

  const { data, error } = await supabase
    .from("mood_logs")
    .select("bpm, mood")
    .eq("user_id", user_id);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  if (!data || data.length === 0) {
    return res.json({
      message: "No learning data yet",
      averages: null,
    });
  }

  const groups = {
    sleep: [],
    calm: [],
    focus: [],
  };

  for (const row of data) {
    if (groups[row.mood]) {
      groups[row.mood].push(row.bpm);
    }
  }

  const avg = (arr) =>
    arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  res.json({
    user_id,
    total_logs: data.length,
    averages: {
      sleep: avg(groups.sleep),
      calm: avg(groups.calm),
      focus: avg(groups.focus),
    },
  });
});

// ----------------------------------------------------
// 🧪 DB TEST
// ----------------------------------------------------
app.get("/test-db", async (req, res) => {
  const { data, error } = await supabase.from("users").select("*");

  if (error) return res.status(500).json({ error: error.message });

  res.json({ success: true, data });
});

// ----------------------------------------------------
// 🌐 HEALTH CHECK
// ----------------------------------------------------
app.get("/", (req, res) => {
  res.send("MoodLight API running");
});

// ----------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

app.post("/predict-mood", async (req, res) => {
  const { user_id, bpm } = req.body;

  if (!user_id || !bpm) {
    return res.status(400).json({ error: "Missing fields" });
  }

  // 1. check if user finished learning
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("learning_complete")
    .eq("id", user_id)
    .single();

  if (userError) {
    return res.status(500).json({ error: userError.message });
  }

  if (!user.learning_complete) {
    return res.json({
      error: "Still in learning mode",
    });
  }

  // 2. get learned averages
  const { data, error } = await supabase
    .from("mood_logs")
    .select("bpm, mood")
    .eq("user_id", user_id);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const groups = { sleep: [], calm: [], focus: [] };

  for (const row of data) {
    if (groups[row.mood]) {
      groups[row.mood].push(row.bpm);
    }
  }

  const avg = (arr) =>
    arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  const thresholds = {
    sleep: avg(groups.sleep),
    calm: avg(groups.calm),
    focus: avg(groups.focus),
  };

  // 3. predict based on closest match
  let bestMood = "calm";
  let smallestDiff = Infinity;

  for (const mood of Object.keys(thresholds)) {
    if (thresholds[mood] === null) continue;

    const diff = Math.abs(bpm - thresholds[mood]);

    if (diff < smallestDiff) {
      smallestDiff = diff;
      bestMood = mood;
    }
  }

  res.json({
    mood: bestMood,
    bpm,
    thresholds,
  });
});