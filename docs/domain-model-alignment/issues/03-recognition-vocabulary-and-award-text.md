# 03: Recognition vocabulary and corrected award text

**What to build:** A Learner reads award text that describes what actually earns it, and a
developer reads one word per concept instead of three.

Today the same concept is called an award, an achievement and a badge — sometimes within a single
API response. Worse, the API field named `achievementId` carries an Award's human-readable slug,
while the database column named `achievement_id` one hop away carries a UUID. Two different values,
nearly the same name.

Two award texts also lie. Pathfinder's criterion says "missions" but its predicate counts completed
Lessons. Daily Rhythm promises a "learning streak" without saying that only Daily Tasks currently
advance one.

Settle the vocabulary per the domain glossary: **Award** for the definition, **Earned Award** for
the record, **Award Mark** for the visual. "Badge" keeps no domain meaning and stays reserved for
the generic interface component.

No schema change in this ticket.

**Blocked by:** 01 (Establish the single test seam), 02 (Introduce learnerId at the framework
boundary).

**Status:** done (81d4d9b)

- [x] The API field carrying an Award's human-readable identifier is named `awardSlug`.
- [x] No response field name can be confused with the database UUID column.
- [x] The Activity Feed entry written when an Award unlocks no longer calls it a badge.
- [x] Pathfinder's criterion text says "lessons", matching what it measures.
- [x] Daily Rhythm's wording describes what actually earns it.
- [x] Dashboard and Profile render Earned Awards and next-goal progress correctly against the
      renamed field.
- [x] "Badge" appears in the codebase only as the generic interface component.
- [x] No database schema changes in this ticket.
- [x] The full test suite passes.
