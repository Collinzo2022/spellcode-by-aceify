# 10: Clients send their UTC offset

**What to build:** Both clients tell the server what time it is where the Learner is. Nothing uses
it yet.

A Streak is about days the Learner lived, so the server needs to know where their midnight falls.
This is the expand step of that change: the contract widens, both clients start sending, and the
server accepts the value without yet depending on it. Ticket 11 starts using it.

The web application and the Android companion must **both** ship this. If one is updated and the
other is not, the un-updated client silently falls back to UTC and its Learners get subtly
different Streaks from identical behaviour.

Known and accepted: a numeric offset is client-supplied and therefore spoofable, and it does not
survive daylight saving transitions. Both limitations are recorded in the spec. The exit, if either
becomes a problem, is to send a zone identifier instead and resolve the local day server-side — a
contract change, not a redesign.

**Blocked by:** 02 (Introduce learnerId at the framework boundary).

**Status:** done (4a1aca7) for the web and the server. The Android box closes with Android itself
(see below).

- [x] The web application sends its UTC offset in minutes on every request that completes a unit of
      learning or reads a Streak.
- [ ] The Android companion sends the same value on the same requests.
- [x] The server accepts and validates the offset as part of the contract for those requests.
- [x] A request omitting the offset is treated as UTC and still succeeds — a missing offset never
      fails a request.
- [x] The server never infers the offset from the request's IP address or from stored profile
      state.
- [x] Completions continue to be stored as absolute instants; the offset is not baked into a stored
      timestamp.
- [x] No Streak behaviour changes in this ticket.
- [x] The full test suite passes.

**On the one box left unticked.** The Android companion is a separate codebase with no source in
this repo, so it cannot be done from here. Until it ships the header its Learners fall back to UTC,
which `docs/production_architecture.md` records under "Learner local time". This is also why
ticket 11 cannot be called finished from this repo.

**Update (2026-09-22).** Android is now closed rather than pending: nobody with access to its
source or signing account can be reached. What its next release must do, this header included, is
specified in `docs/android_handoff.md` (ticket 19). Ticket 11 now closes when its server side
lands.

**What these ticks do not mean.** The offset is validated at the edge and read by nothing: this
ticket lays the wire, and ticket 11 is what consumes it.
