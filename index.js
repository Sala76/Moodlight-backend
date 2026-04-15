require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Supabase client (after env loads)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// 🔥 Mood logic
app.post("/calculateMood", async (req, res) => {
  const { bpm, user_id } = req.body;

  if (!bpm || isNaN(bpm)) {
    return res.status(400).json({ error: "Invalid BPM" });
  }

  // 1. mood logic
  let mood = "calm";

  if (bpm < 60) {
    mood = "sleep";
  } else if (bpm > 100) {
    mood = "focus";
  }

  console.log("BPM:", bpm, "Mood:", mood);

  // 2. SAVE TO SUPABASE
  const { data, error } = await supabase.from("mood_logs").insert([
    {
      user_id: user_id || null,
      bpm: bpm,
      mood: mood,
    },
  ]);

  if (error) {
    console.log("Supabase insert error:", error.message);
    return res.status(500).json({ error: error.message });
  }

  // 3. return result
  res.json({
    mood,
    saved: true,
  });
});

// 🧪 Test Supabase connection
app.get("/test-db", async (req, res) => {
  const { data, error } = await supabase.from("users").select("*");

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true, data });
});

// 🌐 Health check
app.get("/", (req, res) => {
  res.send("MoodLight API running");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});