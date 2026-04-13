const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// 🔥 Your logic moved here
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