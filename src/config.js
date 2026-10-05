// Milestones and session lengths.
//
// The note texts here are the pet's own words, shown to everyone. To send
// personal notes to someone, use "Write notes for a friend" in the app: it
// makes a link that carries your notes, so they never live in this code.

export const NOTES = [
  { id: "hatch",   need: { sessions: 1 },  hint: "Hatch the egg",
    text: "You hatched me! I'll keep you company while you study." },
  { id: "five",    need: { sessions: 5 },  hint: "Finish 5 sessions",
    text: "Five sessions together. That's real progress, and I noticed every one." },
  { id: "streak3", need: { streak: 3 },    hint: "Study 3 days in a row",
    text: "Three days in a row! Showing up is the hardest part, and you keep doing it." },
  { id: "hours5",  need: { minutes: 300 }, hint: "Study 5 hours in total",
    text: "Five hours of focus. Take a real break today. You earned it." },
  { id: "streak7", need: { streak: 7 },    hint: "Study 7 days in a row",
    text: "A whole week straight. I'm seriously impressed." },
  { id: "grown",   need: { sessions: 20 }, hint: "Help your pet fully grow",
    text: "I'm all grown up, and so is your study habit. Thanks for taking care of me." }
];

export const LENGTHS = [15, 25, 45, 60];

// A little surprise: a pet given one of these names (any capitalization) hatches as a puppy.
export const DOG_NAMES = ["lila", "daisy"];
