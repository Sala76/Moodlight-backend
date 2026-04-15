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
    console.log("Supabase insert error:", error.message);
    return res.status(500).json({ error: error.message });
  }

  res.json({
    success: true,
    saved: data,
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