# 13: The Beginner Quest calls Lessons "missions"

**What to build:** A Learner sees the word "mission" only where it means a Beginner Build Lab
step, and a developer reading the Beginner Quest components finds Lessons called Lessons.

`CONTEXT.md` reserves **Mission** for the three Beginner Build Lab steps: "a Mission is never a
Lesson, Challenge, Daily Task, or Project. Learner-facing copy must not use 'mission' for
anything else."

Ticket 03 corrected the award catalog and the Dashboard, Daily and Profile pages. It did not
touch a deeper violation found while doing so: the Beginner Quest feature is *built* on the
wrong word, not merely worded with it. Its components collect Lessons into `allMissions`, hold
Lesson slugs in `beginnerMissionIds`, count `completedMissionCount`, and label them "Mission 01",
"Mission 02" in the interface. The lesson workspace congratulates a Learner with "Mission
cleared". The landing page describes the whole curriculum as "short, interactive missions".

This is structural rather than cosmetic, which is why it was left out of ticket 03 rather than
smuggled into it. It also overlaps ticket 05, which gives real Missions their own Completion
records — so the two words will be live in the same area at the same time, and the confusion gets
more expensive, not less.

Decide first whether the Beginner Quest is presenting Lessons (rename throughout) or is a genuine
second entry point that should be folded into the Beginner Build Lab (a product question, not a
rename). The answer changes the work.

**Decided (2026-09-22).**

- **The Beginner Quest presents Lessons. Rename throughout.** It is built entirely on Lesson
  Completions: `BeginnerQuest.tsx` tracks the first three Lessons (`html-foundations`,
  `html-semantic-layout`, `css-visual-language`) by Lesson Completion. Folding it into the Beginner
  Build Lab would be a redesign, not a vocabulary change.
- **"Beginner Quest" stays as UI copy only, and never goes into `CONTEXT.md`.** The glossary opens
  "Glossary only: no implementation detail", which rules out a UI grouping as a domain term. The
  guard test must therefore allow the word "quest".
- **In scope:** the toast in `LessonWorkspace.tsx` says "Mission cleared" after *every* Lesson that
  awards XP, not only these three.
- **Not in scope:** the product now has two "first experiences" (the Beginner Quest and the
  Beginner Build Lab, which `CONTEXT.md` calls "a Learner's first experience"). This ticket adds
  that to `todo.md` as an open product question and does nothing else about it.

**Blocked by:** 03 (Recognition vocabulary and corrected award text).

**Status:** done (2026-09-23).

- [x] It is decided and recorded whether the Beginner Quest presents Lessons or Missions.
      (Lessons; recorded above, 2026-09-22.)
- [x] No component, variable, prop or type calls a Lesson a Mission. `allMissions` →
      `questLessons`, its item `mission` → `entry` (so `entry.lesson` is plainly a Lesson),
      `completedMissionCount` → `completedCount`, `currentMissionIndex` → `currentIndex`,
      `MissionIcon` → `LessonIcon`; in `LessonWorkspace.tsx`, `beginnerMissionIds` →
      `questLessonIds`, `isBeginnerMission` → `isQuestLesson`, `completedMissionCount` →
      `completedQuestCount`.
- [x] No learner-facing copy uses "mission" for a Lesson, Challenge, Daily Task or Project.
      Covers the in-scope toast: `LessonWorkspace.tsx` now says "Lesson cleared" after every
      Lesson that awards XP, not only the three.
- [x] "Mission 01"-style labels either name Beginner Build Lab steps or are renamed. The Quest
      card and the Home mock workspace now read "Lesson 01"; the Build Lab keeps "Step 01".
- [x] The Beginner Build Lab, which does present real Missions, still says Mission throughout.
      Guarded in both directions: the test fails if an over-eager rename strips the word from
      `BeginnerLab.tsx`.
- [x] A test guards the rule the way the award catalog tests now do.
      `server/beginner-quest-vocabulary.test.ts` scans all of `client/src` rather than a fixed
      list, so a new file cannot reintroduce the word unnoticed.
- [x] The full test suite passes and the production build succeeds. 162 passed, 2 skipped, 0
      failed across 29 files; `npx tsc --noEmit` clean; `npm run build` succeeds.

**One exception kept, not renamed.** Home's hero call to action, "Start your first mission",
links to `/beginner-lab`, where a Learner's first act really is a Mission, so the word is
correct there. It is recorded phrase-by-phrase in `REAL_MISSION_COPY` rather than by exempting
`Home.tsx`, which would have stopped guarding the five Lesson-as-mission strings in the same
file — all of which were renamed, including the mock workspace beside that very button. A third
test fails if an entry in that list stops appearing, so the exception cannot quietly rot.

**On the guard's regex.** `/mission/i` matches `permission` (`shared/const.ts` carries a
permission error message), and `\bmission\b` excludes that but also misses `beginnerMissionIds`,
because a camelCase hump is not a word boundary. The guard therefore matches the word at a
non-letter boundary, or a capital M opening a hump.

**NOT VERIFIED in a browser.** There is no `.env` and no Supabase project — no key survived
Manus — so the dev server does not boot and the renamed copy could not be seen rendered. The
rename is verified against the source by the guard test, by the typecheck, and by a successful
production build. A browser check becomes possible once ticket 20's wizard has been run.
