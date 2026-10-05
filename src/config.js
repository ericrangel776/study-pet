// Personal content lives here, separate from the code that uses it.
// Edit these before sharing the app.

export const PERSONAL = { from: "Eric" };

export const NOTES = [
  { id: "hatch",   need: { sessions: 1 },  hint: "Hatch the egg",
    text: "You hatched it! I made this little one to keep you company while you study." },
  { id: "five",    need: { sessions: 5 },  hint: "Finish 5 sessions",
    text: "Five sessions done. That's real progress, and I'm proud of you." },
  { id: "streak3", need: { streak: 3 },    hint: "Study 3 days in a row",
    text: "Three days in a row! Showing up is the hardest part." },
  { id: "hours5",  need: { minutes: 300 }, hint: "Study 5 hours in total",
    text: "Five hours of focus. Take a real break today. You earned it." },
  { id: "streak7", need: { streak: 7 },    hint: "Study 7 days in a row",
    text: "A whole week straight. Seriously impressive." },
  { id: "grown",   need: { sessions: 20 }, hint: "Help your pet fully grow",
    text: "Your pet is all grown up, and so is your study habit. Thanks for letting me be part of it." }
];

export const LENGTHS = [15, 25, 45, 60];
