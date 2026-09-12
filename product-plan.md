# Study Lamp Product Plan

## Goal
Turn the app from a collection of learning tools into a focused personal learning system that helps each user stay consistent, make progress, and feel guided by their goals, roadmap, and content choices.

---

## Phase 1 — Core product clarity and onboarding

### Step 1: Define the default taxonomy
- Seed a default category taxonomy for every new user.
- Each category includes a few relevant subtopics or learning areas.
- Default categories should be visible immediately, but editable.
- Users can add their own custom categories/subtopics when needed.

### Step 2: Define the onboarding flow
- Onboarding should ask what the user is interested in.
- Users select main categories first.
- Based on the selected category, show suggested subtopics.
- If a topic is not present, they can type a custom topic.
- Custom interest names should be validated and normalized before saving.

### Step 3: Connect onboarding to the roadmap model
- User-selected interests become the source of roadmap focus.
- Each interest should map to a roadmap level: basic, intermediate, or advanced.
- Interest selection should be stored in the user profile, not only in local UI state.
- Roadmap generation and goal planning should read from this data.

### Step 4: Create the roadmap experience
- Show each selected interest as a roadmap card.
- Let the user switch roadmap level.
- Use AI-generated shared templates as default suggestions.
- Clone a template into a personal roadmap so the user can edit and customize it.

### Step 5: Keep onboarding and roadmap in sync
- If a user changes interests in settings, the roadmap should reflect the latest selection.
- If a user does not have interests yet, the roadmap page should show a helpful empty state instead of a blank page.
- The onboarding flow should be easy to re-enter from settings.

---

## Phase 2 — Learning progress and momentum

### Step 6: Improve the dashboard as the home base
- Dashboard should act like a personal learning command center.
- Show usage stats, progress, focus areas, and active learning goals.
- Highlight what to do next instead of only raw counts.

### Step 7: Add learning recommendations
- Recommend the next topic or roadmap step based on active interests.
- Recommend the next video to resume or complete.
- Recommend actions based on goal pace and due dates.

### Step 8: Add learning coach messaging
- Present small, actionable suggestions such as:
  - "Resume your JavaScript roadmap"
  - "You are behind on this goal by 2 videos"
  - "This topic is 65% complete"
- Messages should be concise, motivating, and easy to act on.

---

## Phase 3 — Goal system and pace tracking

### Step 9: Build richer goal behavior
- Goals should support title, notes, target date, and optional linked playlists/videos.
- Goals should track progress using real content state.
- Users should understand what they need to do per day to reach the goal.

### Step 10: Add pace and streak logic
- Compute videos or minutes needed per day.
- Surface whether a learner is on track, behind, or overdue.
- Show a streak or momentum indicator for consistency.

### Step 11: Tie goals to roadmap actions
- Goals should be suggested from the roadmap step sequence.
- Goal suggestions should be easy to accept and add to the personal plan.
- Roadmap progress and goal progress should reinforce each other.

---

## Phase 4 — Content organization and retrieval

### Step 12: Improve playlist organization
- Let users create and manage playlists by topic and learning objective.
- Support ordering, sorting, and smart queueing.
- Make watch-later, favorites, and priorities easier to access.

### Step 13: Improve search and curation
- Let users find content by category, tag, and keyword.
- Surface personal recommendations from the same roadmap categories.
- Add "continue watching" and "pick up where you left off" flows.

### Step 14: Improve learning resource discovery
- Suggest relevant playlists based on roadmap steps.
- Let users import external playlists and add them directly to their learning flow.
- Reduce friction between curated learning materials and user-owned playlists.

---

## Phase 5 — Study and retention tools

### Step 15: Improve the learning loop
- Video page should support notes, summaries, bookmarks, and quizzes.
- Quizzes should test understanding and reinforce memory.
- Bookmarks should help the user jump to important moments later.

### Step 16: Add summary and reflection workflow
- Users should be able to generate AI-driven summaries from video content.
- Personal notes should remain private and separated from shared content.
- A summary should feel like a study aid, not an extra admin task.

### Step 17: Add review and retention cycles
- Encourage revisiting older videos via spaced review.
- Expose what is due for review soon.
- Connect review ideas back to roadmap goals.

---

## Phase 6 — AI and personalization

### Step 18: Personalize recommendations with real user data
- Use user interests, roadmap progress, quiz results, and goal pace to build smarter suggestions.
- Recommendations should be based on actual learner behavior, not popularity alone.

### Step 19: Add system-owned AI connections
- Keep a system-level AI connection model separate from user-specific API keys.
- Use it for educational assistance while preserving user privacy and quota controls.

### Step 20: Add AI quota and usage guardrails
- Limit generation requests based on the user’s plan or account status.
- Avoid one user exhausting the platform’s AI budget.
- Clearly show AI usage states in admin and user settings.

---

## Phase 7 — Admin and platform operations

### Step 21: Improve admin visibility
- Admins should be able to view student interests, roadmaps, AI usage, and progress states.
- Admins should see student goals and playlist health.
- The admin experience should support onboarding issue debugging and roadmap tuning.

### Step 22: Maintain clean data and rules
- Keep Firestore security rules aligned with actual data access patterns.
- Protect user-owned documents and shared content appropriately.
- Ensure personal notes, goals, playlists, and summaries remain private.

---

## Phase 8 — Product polish and retention

### Step 23: Reduce friction in daily use
- One-click actions for continue watching, save video, add to goals, and plan next session.
- Better empty states and onboarding recovery flows.
- Clear transitions from onboarding to dashboard to roadmap to content.

### Step 24: Reward consistency
- Show streaks, completion progress, and confidence improvements.
- Reward momentum, not just final completion.
- Make progress feel visible in small, motivating increments.

### Step 25: Prepare for release quality
- Validate the core journey: onboarding → interest selection → roadmap → learning content → goal tracking → review.
- Fix edge cases for empty states, first-time users, and mid-flow state restoration.
- Ensure analytics and basic product telemetry exist for real-world learning behavior.

---

## Recommended execution order

1. Finish onboarding + taxonomy + roadmap syncing
2. Stabilize dashboard and coaching recommendations
3. Improve goals + pace tracking
4. Strengthen playlist and recommendation flows
5. Polish retention tools and AI personalization
6. Add admin and usage insights
7. Harden and release

---

## Practical weekly plan

### Week 1
- Taxonomy and onboarding cleanup
- Default categories and custom validation
- Roadmap selection sync

### Week 2
- Dashboard focus and coach cards
- Continue-watching and next-step recommendation logic
- Simple goal pace + due-soon widget

### Week 3
- Better goal flows
- Roadmap-driven suggestions
- Playlist and content organization improvements

### Week 4
- Retention tools and study reinforcement
- AI recommendation tuning
- Admin visibility and quality assurance

---

## Success metrics
- Users complete onboarding and define interests
- Users return to dashboard and continue learning consistently
- Roadmap adoption is visible and active
- Goal completion rate improves
- Resume rate on previously started videos increases
- Students spend more time in focused learning sessions than in browsing alone

---

## Phase 9 — Launch readiness and trust

### Step 26: Validate the main learning loop end-to-end
- Confirm the user journey works from onboarding to roadmap to video to goal review.
- Make sure empty states, resume flows, and first-time-user paths are intentional.
- Reduce the chance that a new user falls into a broken or confusing state.

### Step 27: Add trust and reliability checks
- Validate AI outputs before they are shown to the user.
- Show graceful fallbacks when summaries, quizzes, or suggestions fail.
- Make model errors feel recoverable instead of alarming.

### Step 28: Strengthen retention and consistency signals
- Highlight streaks, momentum, and recent wins in the dashboard.
- Encourage quick wins: resume, bookmark, complete a quiz, update a goal.
- Keep the design motivating without creating guilt or pressure.

### Step 29: Prepare for launch quality
- Audit the app for first-run clarity, route stability, and mobile usability.
- Confirm analytics hooks exist for onboarding conversion, completion, and retention.
- Review security/privacy boundaries for notes, generated summaries, and roadmap data.

---

## Final product direction
The app should feel like a personal learning operating system for each user:
- learn what they care about
- map that into a path
- show them what to do next
- help them keep momentum
- reward progress without overwhelming them

That is the core product identity to keep building toward.
