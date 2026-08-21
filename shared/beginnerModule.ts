export type BeginnerBuildMission = {
  id: string;
  title: string;
  concept: string;
  whyItMatters: string;
  instruction: string;
  starterCode: string;
  requiredFragments: string[];
  rewardXp: number;
};

export const BEGINNER_BUILD_MISSIONS: BeginnerBuildMission[] = [
  { id: "welcome", title: "Make a page say hello", concept: "A page needs a main purpose.", whyItMatters: "The main landmark tells every visitor where the important content begins.", instruction: "Create a main section with a clear heading that introduces your page.", starterCode: "<main>\n  <h1>Hello, web</h1>\n</main>", requiredFragments: ["<main", "<h1"], rewardXp: 15 },
  { id: "voice", title: "Give it a human voice", concept: "Pages become useful when they explain themselves.", whyItMatters: "A short paragraph gives the heading meaning and makes the page welcoming.", instruction: "Add a paragraph under the heading that describes what you want to build.", starterCode: "<main>\n  <h1>Hello, web</h1>\n  <p>I am building my first page.</p>\n</main>", requiredFragments: ["<main", "<h1", "<p"], rewardXp: 15 },
  { id: "action", title: "Invite an action", concept: "Interactive ideas start with a clear action.", whyItMatters: "Buttons give people a next step and prepare your page for future JavaScript behavior.", instruction: "Add a button that invites a visitor to start building with you.", starterCode: "<main>\n  <h1>Hello, web</h1>\n  <p>I am building my first page.</p>\n  <button>Start building</button>\n</main>", requiredFragments: ["<main", "<h1", "<p", "<button"], rewardXp: 20 },
];

export function checkBeginnerBuildMission(mission: BeginnerBuildMission, code: string) {
  const missing = mission.requiredFragments.filter(fragment => !code.includes(fragment));
  return { passed: missing.length === 0, missing, score: Math.round(((mission.requiredFragments.length - missing.length) / mission.requiredFragments.length) * 100) };
}
