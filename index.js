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

// 🔥 TEST DB CONNECTION
app.get("/test-db", async (req, res) => {
  const { data, error } = await supabase
    .from("mood_logs")
    .insert([
      {
        user_id: "3d57edbe-2631-4f5e-bd39-799709c35e18",
        bpm: 60,
        mood: "calm",
      },
    ]);

  if (error) {
    console.log("DB ERROR:", error);
    return res.status(500).json({ error });
  }

  res.json({ success: true, data });
});

// 🔥 Existing logic
app.post("/calculateMood", (req, res) => {
  const { bpm } = req.body;

  if (!bpm || isNaN(bpm)) {
    return res.status(400).json({ error: "Invalid BPM" });
  }

  let mood = "calm";

  if (bpm < 60) {
    mood = "sleep";
  } else if (bpm > 100) {
    mood = "focus";
  } else {
    mood = "calm";
  }

  console.log("BPM:", bpm, "→ Mood:", mood);

  res.json({ mood });
});

app.get("/", (req, res) => {
  res.send("MoodLight API running");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));