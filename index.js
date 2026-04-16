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

app.post("/create-user", async (req, res) => {
  const { username, age, gender } = req.body;

  if (!username || !age || !gender) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    const { data, error } = await supabase
      .from("users")
      .insert([
        {
          username,
          age,
          gender,
          sleep_avg: null,
          calm_avg: null,
          focus_avg: null,
          learning_complete: false,
        },
      ])
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({
      user_id: data.id,
      user: data,
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }
});
// ----------------------------------------------------
// 🧠 HELPER FUNCTIONS
// ----------------------------------------------------
const avg = (arr) => {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
};

const clean = (n) => (n === null ? null : Math.round(n));

// ----------------------------------------------------
// 🧠 LOG MOOD (LEARNING DATA)
// ----------------------------------------------------
app.post("/log-mood", async (req, res) => {
  const { user_id, bpm, mood } = req.body;

  if (!user_id || !bpm || !mood) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    // get user
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("created_at, learning_complete")
      .eq("id", user_id)
      .single();

    if (userError) throw userError;

    // check 3-day rule
    const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
    const isExpired =
      Date.now() - new Date(user.created_at).getTime() >= THREE_DAYS;

    // auto-finish learning if expired
    if (!user.learning_complete && isExpired) {
      await finishLearning(user_id);
    }

    // insert log
    const { data, error } = await supabase
      .from("mood_logs")
      .insert([
        {
          user_id,
          bpm: Number(bpm),
          mood,
        },
      ])
      .select();

    if (error) throw error;

    res.json({
      success: true,
      saved: data,
      learning_complete: isExpired,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 🧠 FINISH LEARNING (SAVE MODEL)
// ----------------------------------------------------
async function finishLearning(user_id) {
  const { data, error } = await supabase
    .from("mood_logs")
    .select("bpm, mood")
    .eq("user_id", user_id);

  if (error) throw error;
  if (!data || data.length === 0) throw new Error("No learning data");

  const groups = {
    sleep: [],
    calm: [],
    focus: [],
  };

  data.forEach((row) => {
    if (groups[row.mood]) {
      groups[row.mood].push(Number(row.bpm));
    }
  });

  const updates = {
    sleep_avg: clean(avg(groups.sleep)),
    calm_avg: clean(avg(groups.calm)),
    focus_avg: clean(avg(groups.focus)),
    learning_complete: true,
  };

  const { error: updateError } = await supabase
    .from("users")
    .update(updates)
    .eq("id", user_id);

  if (updateError) throw updateError;

  return updates;
}

// endpoint version (manual trigger)
app.post("/finish-learning/:user_id", async (req, res) => {
  try {
    const updates = await finishLearning(req.params.user_id);

    res.json({
      success: true,
      message: "Learning completed",
      averages: updates,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 🧠 LEARNING VIEW (DEBUG ONLY)
// ----------------------------------------------------
app.get("/learn/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;

    const { data, error } = await supabase
      .from("mood_logs")
      .select("bpm, mood")
      .eq("user_id", user_id);

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.json({
        message: "No learning data yet",
        averages: null,
      });
    }

    const groups = { sleep: [], calm: [], focus: [] };

    data.forEach((row) => {
      if (groups[row.mood]) {
        groups[row.mood].push(Number(row.bpm));
      }
    });

    res.json({
      user_id,
      total_logs: data.length,
      averages: {
        sleep: avg(groups.sleep),
        calm: avg(groups.calm),
        focus: avg(groups.focus),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 🧠 PREDICT MOOD (USES SAVED MODEL)
// ----------------------------------------------------
app.post("/predict-mood", async (req, res) => {
  const { user_id, bpm } = req.body;

  if (!user_id || !bpm) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    // get trained values
    const { data: user, error } = await supabase
      .from("users")
      .select(
        "learning_complete, sleep_avg, calm_avg, focus_avg"
      )
      .eq("id", user_id)
      .single();

    if (error) throw error;

    if (!user.learning_complete) {
      return res.json({ error: "Still in learning mode" });
    }

    const thresholds = {
      sleep: user.sleep_avg,
      calm: user.calm_avg,
      focus: user.focus_avg,
    };

    let bestMood = "calm";
    let smallestDiff = Infinity;

    for (const mood of Object.keys(thresholds)) {
      if (thresholds[mood] === null) continue;

      const diff = Math.abs(Number(bpm) - thresholds[mood]);

      if (diff < smallestDiff) {
        smallestDiff = diff;
        bestMood = mood;
      }
    }

    res.json({
      mood: bestMood,
      bpm: Number(bpm),
      thresholds,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 🧪 OLD TEST ENDPOINT
// ----------------------------------------------------
app.post("/calculateMood", async (req, res) => {
  const { bpm, user_id } = req.body;

  if (!bpm || isNaN(bpm)) {
    return res.status(400).json({ error: "Invalid BPM" });
  }

  let mood = "calm";
  if (bpm < 60) mood = "sleep";
  else if (bpm > 100) mood = "focus";

  const { error } = await supabase.from("mood_logs").insert([
    {
      user_id: user_id || null,
      bpm: Number(bpm),
      mood,
    },
  ]);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ mood, saved: true });
});

// ----------------------------------------------------
// 🧪 DB TEST
// ----------------------------------------------------
app.get("/test-db", async (req, res) => {
  const { data, error } = await supabase.from("users").select("*");

  if (error) return res.status(500).json({ error: error.message });

  res.json({ success: true, data });
});

app.post("/reset-learning/:user_id", async (req, res) => {
  const { user_id } = req.params;

  try {
    // 1. reset user table
    const { error: userError } = await supabase
      .from("users")
      .update({
        sleep_avg: null,
        calm_avg: null,
        focus_avg: null,
        learning_complete: false,
      })
      .eq("id", user_id);

    if (userError) {
      return res.status(500).json({ error: userError.message });
    }

    // 2. delete learning logs
    const { error: logError } = await supabase
      .from("mood_logs")
      .delete()
      .eq("user_id", user_id);

    if (logError) {
      return res.status(500).json({ error: logError.message });
    }

    res.json({
      success: true,
      message: "Full learning reset completed",
    });

  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
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