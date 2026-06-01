# Dayseed Current App PRD

Last updated: 2026-06-01

## 1. Product Overview

**Product name:** Dayseed

**Product type:** Local-first focus timer, task manager, and visual garden journal.

**One-line description:** Dayseed turns completed focus sessions into tomatoes on a daily vine, and turns days of effort into a browsable yard.

**Current product thesis:** Most productivity tools represent work as lists, streaks, and charts. Dayseed keeps the practical parts of a task timer, but makes the feedback loop feel quieter and more physical: a completed focus session becomes a visible fruit.

**Current MVP status:** Implemented as a single-page Next.js web app with local persistence, task management, a 25-minute focus mode, a daily 3D tomato vine, and a Yard review surface.

## 2. Target User

**Primary user:** Individuals who use focus timers and lightweight task lists, but want a calmer and more emotionally resonant way to see their work accumulate.

**User mindset:**

- Wants to focus without opening a heavy productivity suite.
- Wants evidence of effort without aggressive streak mechanics.
- Likes tactile, botanical, quiet interfaces.
- May use the app repeatedly during a workday for writing, research, design, admin, and other category-based work.

**Primary need:** "I want to pick what to work on, focus, and see the effort become something I can tend."

## 3. Product Goals

1. Let users capture tasks quickly.
2. Let users start and complete 25-minute focus sessions with minimal friction.
3. Convert each completed focus session into a tomato fruit on the current day.
4. Make today's progress visible as an interactive 3D tomato vine.
5. Let users review effort by day, week, month, and year through a garden/yard metaphor.
6. Keep the UI compact and useful, not toy-like or marketing-like.

## 4. Current Information Architecture

The app has two top-level sections:

- **Tasks:** primary daily work surface.
- **Yard:** review surface for week/month/year garden history.

When an active timer exists, the app enters **Focus Mode** and replaces the normal task/yard layout with a focused timer layout.

## 5. Core Screens

### 5.1 App Header

The global header contains:

- Dayseed wordmark.
- Segmented navigation: `Tasks` / `Yard`.
- Profile chip with current user label `Nora`.

Requirements:

- Header spacing must align with the workbench spacing.
- Header should stay visually compact.
- Top navigation should not rely on heavy divider lines.

### 5.2 Tasks Screen

The Tasks screen is the primary working interface. It uses a three-column desktop layout:

- Left task filter rail.
- Center task list panel.
- Right next-task and garden preview panel.

On narrower screens, these panels stack vertically.

#### Task Filters

The left rail contains:

- `Inbox`
- `Today`
- `This Week`
- `This Month`
- `All`

Current filter logic:

- `Inbox`: active tasks with zero completed sessions.
- `Today`: all active tasks.
- `This Week`: active tasks created within the current week.
- `This Month`: active tasks created within the current month.
- `All`: all active tasks.

Each filter displays a count.

#### Task List Header

The task list panel shows:

- Current filter title.
- Current local date formatted as `MMMM d, yyyy`.
- View options icon button. Current implementation displays the button but does not expose a full options menu.

#### Task Creation

Users can add a new task from the composer.

Behavior:

- Composer placeholder: `New task`.
- Submit via add button or form submit.
- Empty/whitespace-only titles are ignored.
- New task is inserted at the top of the active task list.
- New task is automatically selected.
- New task receives the currently selected category, or the default category if none is selected.
- New task starts with `estimatedPomodoros: 1`.

#### Task Row

Each task row contains:

- Archive/complete-dot button.
- Task title.
- Tomato trail showing actual and estimated pomodoro progress.
- Category chip.
- Overflow menu.

Current interaction rules:

- Single-click row: select task.
- Double-click row or title: enter title edit mode.
- Editing title updates as the user types.
- Blur exits edit mode.
- `Enter` blurs the title input.
- `Escape` exits edit mode.
- Clicking the complete-dot archives the task.
- Category chip cycles the task's primary category through existing categories.
- Overflow menu supports estimate decrement, estimate increment, and archive.

Task row selected state:

- Selection is a task targeting state, not edit state.
- Selected task is used by the next-task preview and timer start action.

#### Tomato Trail

The tomato trail visualizes each task's work state.

Rules:

- Actual completed sessions are shown as grown tomato dots.
- Estimated pomodoros are shown as estimated/empty dots.
- If the task has more completed fruit than visible slots, the row shows a `+N` overflow indicator.
- Dot color comes from the task/session category.

### 5.3 Next Task Preview

The right panel contains:

- Timer card.
- Daily 3D tomato vine.
- Garden summary.
- In Focus Mode, task category pills and focus controls.

#### Timer Card

Idle state:

- Shows `25 min`.
- Shows `Next up`.
- Shows selected/next task title.
- Shows task category.
- Shows Start button.

Running state:

- Shows remaining time in `mm:ss`.
- Shows `left`.
- Shows Pause button.

Paused state:

- Shows remaining time.
- Shows Resume button.

Timer progress ring:

- Uses active timer elapsed progress when a timer exists.
- Uses a static decorative value in idle state.

#### Daily Garden Preview

The garden preview renders the selected date's daily plant as a 3D tomato vine.

Current source of truth:

- `dailyPlant` is found by `selectedDate`.
- `dailyFruits` are all fruit ids referenced by that plant.
- The displayed tomato count and summary count both derive from `dailyFruits.length`.

Summary:

- Label: `Today's garden`.
- Count format: `{todayEffort} / 15 effort`.
- Current capacity model: 15 vine anchor slots.

### 5.4 Focus Mode

Focus Mode appears when an active timer exists.

Layout:

- Vertical progress rail on desktop.
- Expanded next-task preview.
- Full focus controls.

Controls:

- `Pause` / `Continue`
- `Stop`
- `Plant`
- `Noise`

Current behavior:

- `Pause` pauses timer and stores remaining seconds.
- `Continue` resumes timer using remaining seconds.
- `Stop` abandons the session and records an abandoned pomodoro session.
- `Plant` completes the active timer immediately, creates a completed session, and adds one tomato fruit to today's plant.
- `Noise` is present as a button but does not currently perform an action.
- If a running timer reaches zero, it auto-completes and plants a tomato.

### 5.5 Yard Screen

The Yard screen is the historical review surface.

Layout:

- Left scale nav.
- Main yard stage.
- Category swatch filter.
- WebGL garden canvas.
- Ambient stats.

Scale nav:

- `This year`
- `This month`
- `This week`

Title behavior:

- Year view: selected year.
- Month view: selected month and year.
- Week view: `This week`.

Category filter:

- Each category appears as a color swatch.
- Clicking a swatch toggles highlight for that category.
- Matching plants/fruit stay prominent.
- Non-matching plants/fruit fade.

Ambient stats:

- Today's completed pomodoro count.
- This week's completed pomodoro count.
- Number of planted days in selected month.
- Number of planted days in selected year.

## 6. 3D Daily Tomato Vine Requirements

The current daily preview is implemented with React Three Fiber and Three.js.

### 6.1 Botanical Direction

The tomato plant should read as an herbaceous vine, not a woody tree.

Visual requirements:

- Thin green main vine.
- Subtle support strings.
- Small compound leaves that do not dominate the fruit.
- Tomatoes hanging from branch/truss points.
- Soft soil base and shadow.
- No visible slot markers while idle.

### 6.2 Fruit Count

Rules:

- Number of visible tomatoes must exactly match `dailyFruits.length`.
- The summary count must use the same source of truth.
- The 3D component exposes an accessible label: `3D tomato vine with N tomatoes`.

### 6.3 Fruit Placement

The vine has 15 predefined anchor slots.

Default placement:

- New tomatoes are assigned to a distributed default anchor order.
- Early tomatoes should not visually overlap.
- If a preferred anchor is occupied, the next available anchor is used.

Manual placement:

- User can drag tomatoes to reposition them.
- Anchor slots appear only while pressing/dragging a tomato.
- The currently targeted slot is visually emphasized.
- Occupied slots are not available unless they belong to the dragged fruit.
- On release, the fruit snaps to the selected slot.
- The result is persisted to `TomatoFruit.anchorIndex`.

### 6.4 3D Interaction

Current interactions:

- Dragging a tomato repositions the tomato.
- Dragging the empty garden plane rotates the vine.
- Hovering/dragging tomato slightly scales it.
- The vine has subtle idle movement.

## 7. Yard Garden Rendering Requirements

The Yard garden uses a WebGL canvas with an orthographic camera.

### 7.1 Today View

Today view renders:

- Soil base.
- Weed sprite if no plant exists and date is not future.
- Plant sprite if plant exists.
- Fruit dots on top of plant for completed sessions.

### 7.2 Week View

Week view renders seven plots.

Rules:

- Each plot represents one date in the selected week.
- Clicking a plot selects that date and switches to today view.
- Future plots are dimmed.
- Empty past plots show weeds.
- Planted days show plant sprite and up to five fruit dots.

### 7.3 Month View

Month view renders a 42-cell calendar grid.

Rules:

- Days outside the current month are dimmed.
- Clicking a date selects that date and switches to today view.
- Future dates are dimmed.
- Empty past dates show weeds.
- Planted dates show plant sprite and up to four fruit dots.

### 7.4 Year View

Year view renders 12 month blocks.

Rules:

- Each month block contains day cells for the selected year.
- Clicking a day selects that date and switches to today view.
- Planted days show green circular marks sized by fruit count.
- Empty past/today cells show small wild growth marks.
- Future cells are low-emphasis.
- Selected date shows a ring highlight.

## 8. Timer Requirements

Default timer duration:

- 25 minutes.

Timer state is timestamp-based:

- `startedAt`
- `expectedEndAt`
- `plannedDurationSec`
- `remainingAtPauseSec` when paused

Timer states:

- `running`
- `paused`
- no active timer

Session outcomes:

- `completed`
- `abandoned`
- `paused` exists in the session type, but completed/abandoned are the currently recorded terminal outcomes.

Completion behavior:

1. Create a `PomodoroSession` with `status: "completed"`.
2. Create today's `DailyPlant` if none exists.
3. Create a `TomatoFruit`.
4. Add fruit id to the daily plant.
5. Update growth stage based on fruit count.
6. Clear active timer.
7. Set selected date to completion date.
8. Set view mode to `today`.

Abandon behavior:

1. Create a `PomodoroSession` with `status: "abandoned"`.
2. Clear active timer.
3. Do not create a tomato fruit.

Date attribution:

- Completed sessions are counted toward the local date of completion.

## 9. Categories

Default categories:

- Writing: red tomato
- Research: yellow tomato
- Design: purple tomato
- Admin: green tomato

Category model supports:

- id
- name
- tomato variant
- color

Current UI support:

- New tasks inherit selected/default category.
- Task category chip cycles through existing categories.
- Focus Mode displays the selected task's category pills, but category controls are disabled while a timer is active.
- Yard lets user highlight a category by color.

Current store support not fully exposed in UI:

- Add category.
- Toggle task category membership.

## 10. Data Model

### Task

```ts
type Task = {
  id: string;
  title: string;
  categoryIds: string[];
  estimatedPomodoros?: number;
  status: "active" | "archived";
  createdAt: string;
  archivedAt?: string;
};
```

### Category

```ts
type Category = {
  id: string;
  name: string;
  tomatoVariant: "red" | "yellow" | "green" | "purple" | "striped";
  color: string;
};
```

### PomodoroSession

```ts
type PomodoroSession = {
  id: string;
  taskId: string;
  categoryIds: string[];
  startedAt: string;
  expectedEndAt: string;
  completedAt?: string;
  plannedDurationSec: number;
  status: "completed" | "abandoned" | "paused";
};
```

### DailyPlant

```ts
type DailyPlant = {
  id: string;
  date: string;
  growthStage: "none" | "seedling" | "young" | "fruiting" | "mature";
  fruitIds: string[];
  plantedAt?: string;
  seed: number;
};
```

Growth stage mapping:

- 0 fruit: `none`
- 1 fruit: `young`
- 2-4 fruit: `fruiting`
- 5+ fruit: `mature`

### TomatoFruit

```ts
type TomatoFruit = {
  id: string;
  dailyPlantId: string;
  pomodoroSessionId: string;
  categoryId: string;
  variant: "red" | "yellow" | "green" | "purple" | "striped";
  anchorIndex: number;
  createdAt: string;
};
```

### ActiveTimer

```ts
type ActiveTimer = {
  id: string;
  taskId: string;
  categoryIds: string[];
  selectedCategoryId: string;
  startedAt: string;
  expectedEndAt: string;
  plannedDurationSec: number;
  status: "running" | "paused";
  remainingAtPauseSec?: number;
};
```

### DayseedSnapshot

```ts
type DayseedSnapshot = {
  tasks: Task[];
  categories: Category[];
  sessions: PomodoroSession[];
  dailyPlants: DailyPlant[];
  fruits: TomatoFruit[];
  activeTimer?: ActiveTimer;
  selectedTaskId?: string;
  selectedCategoryId?: string;
  selectedDate: string;
  viewMode: "today" | "week" | "month" | "year";
  highlightedCategoryId?: string;
};
```

## 11. Persistence

Current persistence strategy:

- Primary: IndexedDB.
- Database name: `dayseed-mvp`.
- Object store: `snapshots`.
- Snapshot key: `main`.
- Fallback: `localStorage` key `dayseed-mvp`.

Requirements:

- App hydrates snapshot before showing the main UI.
- If no snapshot exists, app creates an empty default snapshot.
- Default categories are merged into stored snapshots if missing.
- Persistence occurs after state-changing actions once hydration is complete.

## 12. Technical Architecture

Current stack:

- Next.js 16
- React 19
- TypeScript
- Zustand
- Three.js
- React Three Fiber
- date-fns
- lucide-react

Primary modules:

- `src/components/DayseedApp.tsx`: app shell, tasks, timer, focus mode, yard.
- `src/components/TomatoTree3D.tsx`: interactive 3D daily tomato vine.
- `src/components/GardenCanvas.tsx`: yard/week/month/year WebGL garden.
- `src/store/dayseedStore.ts`: client state and app actions.
- `src/types/dayseed.ts`: product data model.
- `src/lib/indexedDb.ts`: local persistence.
- `src/lib/timer.ts`: timer remaining/format helpers.
- `src/lib/dates.ts`: date keys and calendar grids.

Quality scripts:

- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm run typecheck`
- `npm run verify`

## 13. Design Requirements

Visual direction:

- Compact.
- Botanical.
- Calm.
- Utilitarian enough for repeated daily use.
- Avoid toy-like oversized UI.
- Avoid heavy dashboard styling.

Interaction direction:

- Click selects.
- Double-click edits.
- Drag interactions should reveal affordances only when needed.
- Focus rings should be subtle and integrated with the design system.
- Task flow should be scannable and not card-heavy.

Responsive behavior:

- Desktop uses three-column Tasks layout.
- Tablet/mobile stack panels vertically.
- Filter rail becomes horizontal/grid-like on smaller screens.
- Yard and focus views remain usable at mobile widths.

## 14. Current Non-Goals

The current app does not include:

- Accounts.
- Cloud sync.
- Collaboration.
- Notifications.
- Native mobile apps.
- Due dates.
- Projects.
- Subtasks.
- Recurring tasks.
- Analytics instrumentation.
- Sound/noise playback despite the visible `Noise` button.
- Full category management UI despite store-level category actions.
- Import/export.

## 15. Current Known Gaps

1. **View options button is decorative.** The task view options button exists but has no configured menu.
2. **Noise button is inert.** Focus Mode displays `Noise`, but no sound behavior exists.
3. **Category creation is store-only.** `addCategory` exists, but there is no visible UI to create categories.
4. **Multi-category assignment is underexposed.** Data supports multiple category ids per task, but the primary task UI cycles a single visible category.
5. **Archived task recovery is unavailable.** Tasks can be archived but not restored from UI.
6. **Timer duration is fixed in UI.** Store supports passing a duration, but no visible duration control exists.
7. **Yard today view and task preview use different plant renderers.** The right preview uses 3D vine; Yard today uses sprite-based plant rendering.
8. **No explicit onboarding.** First-time user must infer the loop from the UI.
9. **No analytics events.** Success metrics are not currently instrumented.
10. **No cross-device continuity.** Data remains local to the browser profile.

## 16. Acceptance Criteria For Current MVP

The current MVP should be considered working when:

- User can add a task.
- User can select a task with one click.
- User can edit a task name with double-click.
- User can archive a task.
- User can adjust estimated pomodoro count.
- User can cycle a task category.
- User can start a 25-minute focus session for the selected task.
- User can pause, resume, stop, or plant an active session.
- Completed session creates one tomato fruit.
- Today's 3D vine shows exactly the same tomato count as the summary.
- User can drag a tomato to a visible snap point during interaction.
- Snap points are hidden when not dragging a tomato.
- Dragged fruit position persists after release.
- Yard can switch between year, month, and week views.
- Yard date cells can select a date.
- Category highlighting fades non-matching plants/fruit.
- Data persists after browser refresh.
- App passes lint, typecheck, build, and verification scripts.

## 17. Suggested Next Product Decisions

1. Decide whether the right-side 3D vine should become the canonical renderer for Yard today view too.
2. Decide whether `Noise` should be removed until implemented or become a real ambient sound feature.
3. Design a compact category management flow.
4. Add restore/archive management for tasks.
5. Add a duration selector only if it does not make the timer UI heavier.
6. Add an onboarding hint for the first task-to-tomato loop.
7. Define whether tomato placement is purely playful or should support meaning, such as grouping by category.
8. Decide if local-first remains the product stance or if sync is needed after MVP validation.
