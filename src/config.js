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

// Stickers: lifetime milestones that count every pet raised (see Stickers in engine.js).
// `icon` names a sticker picture in ui.js.
export const STICKERS = [
  { id: "sessions50",  icon: "book",  need: { sessions: 50 },   label: "50 sessions",
    text: "Fifty sessions! Studying is just part of your day now." },
  { id: "sessions100", icon: "book",  need: { sessions: 100 },  label: "100 sessions",
    text: "One hundred sessions. I've lost count of the snacks. Thank you." },
  { id: "sessions250", icon: "book",  need: { sessions: 250 },  label: "250 sessions",
    text: "Two hundred fifty sessions. Every pet in the album is bragging about you." },
  { id: "hours25",     icon: "clock", need: { minutes: 1500 },  label: "25 hours",
    text: "Twenty-five hours of focus. That's more than a whole day of studying." },
  { id: "hours50",     icon: "clock", need: { minutes: 3000 },  label: "50 hours",
    text: "Fifty hours! Every one of those minutes counted." },
  { id: "hours100",    icon: "clock", need: { minutes: 6000 },  label: "100 hours",
    text: "A hundred hours of focus. This is how people get really good at things." },
  { id: "streak14",    icon: "flame", need: { streak: 14 },     label: "14-day streak",
    text: "Two weeks in a row. That's not luck anymore, that's a habit." },
  { id: "streak30",    icon: "flame", need: { streak: 30 },     label: "30-day streak",
    text: "Thirty days straight! I've never been prouder of anyone." },
  { id: "pets2",       icon: "egg",   need: { pets: 2 },        label: "2 pets grown",
    text: "Two pets all grown up. The album is getting cozy." },
  { id: "pets5",       icon: "egg",   need: { pets: 5 },        label: "5 pets grown",
    text: "Five grown pets. You might be the best pet parent there is." },
  { id: "treats10",    icon: "treat", need: { treats: 10 },     label: "10 treats given",
    text: "Ten treats! I'm a little spoiled, and I love it." }
];
// What each sticker asks for while it's still locked.
export const STICKER_HINTS = { sessions: "Finish {n} sessions in all", minutes: "Focus for {n} hours in all",
  streak: "Study {n} days in a row", pets: "Raise {n} pets to grown-up", treats: "Give {n} treats" };

// Device shells (see Shells in engine.js). The look for each lives in styles.css
// under [data-shell], and the screen colors in render.js. `dark`: the shell is
// always dark, so the light and dark choice doesn't apply.
export const SHELLS = [
  { id: "classic", name: "Classic",    blurb: "The original purple egg" },
  { id: "glacier", name: "Glacier",    blurb: "Clear plastic, circuits and all" },
  { id: "sweet",   name: "Sweet shop", blurb: "A printed shell, pink with dots", need: { streak: 7 } },
  { id: "quest",   name: "Card quest", blurb: "A pocket RPG handheld", need: { pets: 1 }, dark: true }
];
export const SHELL_HINTS = { streak: "Study {n} days in a row", pets: "Raise a pet to grown-up" };

export const LENGTHS = [15, 25, 45, 60];

// A little surprise: a pet given one of these names (any capitalization) hatches as a puppy.
export const DOG_NAMES = ["lila", "daisy"];
