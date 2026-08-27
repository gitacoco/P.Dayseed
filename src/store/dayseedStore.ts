import { create } from "zustand";
import { dateKey } from "@/lib/dates";
import { createId, seededNumber } from "@/lib/id";
import { loadDayseedSnapshot, saveDayseedSnapshot } from "@/lib/indexedDb";
import { remainingSeconds } from "@/lib/timer";
import type {
  ActiveTimer,
  Category,
  DailyPlant,
  DayseedSnapshot,
  GardenViewMode,
  PomodoroSession,
  Task,
  TomatoFruit,
  TomatoVariant,
  UserProfile,
} from "@/types/dayseed";

const DEFAULT_DURATION_SEC = 25 * 60;
const TOMATO_ANCHOR_SLOT_COUNT = 15;
const TOMATO_ANCHOR_DEFAULT_ORDER = [0, 5, 10, 1, 6, 11, 2, 7, 12, 3, 8, 13, 4, 9, 14];
const DEFAULT_DAILY_GOAL = 15;
const DEFAULT_USER_PROFILE: UserProfile = {
  avatarColor: "#003c33",
  displayName: "Nora",
};

export type TaskInput = {
  title: string;
  categoryIds?: string[];
  estimatedPomodoros?: number;
  scheduledDate?: string;
  notes?: string;
};

export const TOMATO_VARIANT_OPTIONS: { variant: TomatoVariant; label: string; color: string }[] = [
  { variant: "red", label: "Red", color: "#d84d32" },
  { variant: "yellow", label: "Gold", color: "#e0b33a" },
  { variant: "green", label: "Green", color: "#71974b" },
  { variant: "purple", label: "Purple", color: "#7a4b77" },
  { variant: "striped", label: "Striped", color: "#c96f3f" },
];

const VARIANT_COLORS: Record<TomatoVariant, string> = Object.fromEntries(
  TOMATO_VARIANT_OPTIONS.map((option) => [option.variant, option.color]),
) as Record<TomatoVariant, string>;

const VARIANT_IDS = new Set<TomatoVariant>(TOMATO_VARIANT_OPTIONS.map((option) => option.variant));

const FALLBACK_VARIANT: TomatoVariant = "red";

const FALLBACK_COLOR = VARIANT_COLORS[FALLBACK_VARIANT];

export const DEFAULT_CATEGORIES: Category[] = [
  {
    id: "cat_writing",
    name: "Writing",
    tomatoVariant: "red",
    color: VARIANT_COLORS.red,
  },
  {
    id: "cat_research",
    name: "Research",
    tomatoVariant: "yellow",
    color: VARIANT_COLORS.yellow,
  },
  {
    id: "cat_design",
    name: "Design",
    tomatoVariant: "purple",
    color: VARIANT_COLORS.purple,
  },
  {
    id: "cat_admin",
    name: "Admin",
    tomatoVariant: "green",
    color: VARIANT_COLORS.green,
  },
];

function localIsoForDate(date: string, hour: number, minute = 0) {
  return new Date(`${date}T${hour.toString().padStart(2, "0")}:${minute
    .toString()
    .padStart(2, "0")}:00`).toISOString();
}

function createSampleTodayEntries(today: string) {
  const category = DEFAULT_CATEGORIES[0];
  const taskId = `task_sample_${today}`;
  const plantId = `plant_sample_${today}`;
  const completedTimes = [
    {
      completedAt: localIsoForDate(today, 9, 25),
      expectedEndAt: localIsoForDate(today, 9, 25),
      id: `session_sample_${today}_1`,
      startedAt: localIsoForDate(today, 9),
    },
    {
      completedAt: localIsoForDate(today, 9, 55),
      expectedEndAt: localIsoForDate(today, 9, 55),
      id: `session_sample_${today}_2`,
      startedAt: localIsoForDate(today, 9, 30),
    },
  ];
  const sessions: PomodoroSession[] = completedTimes.map((session) => ({
    ...session,
    categoryIds: [category.id],
    plannedDurationSec: DEFAULT_DURATION_SEC,
    status: "completed",
    taskId,
  }));
  const fruits: TomatoFruit[] = sessions.map((session, index) => ({
    id: `fruit_sample_${today}_${index + 1}`,
    dailyPlantId: plantId,
    pomodoroSessionId: session.id,
    categoryId: category.id,
    variant: category.tomatoVariant,
    anchorIndex: TOMATO_ANCHOR_DEFAULT_ORDER[index] ?? index,
    createdAt: session.completedAt ?? session.expectedEndAt,
  }));
  const task: Task = {
    id: taskId,
    title: "sample task",
    categoryIds: [category.id],
    estimatedPomodoros: 2,
    scheduledDate: today,
    status: "active",
    createdAt: localIsoForDate(today, 8, 45),
  };
  const dailyPlant: DailyPlant = {
    id: plantId,
    date: today,
    growthStage: growthStageForCount(fruits.length),
    fruitIds: fruits.map((fruit) => fruit.id),
    plantedAt: fruits[0]?.createdAt,
    seed: seededNumber(today),
  };

  return { dailyPlant, fruits, sessions, task };
}

type DayseedActions = {
  hydrate: () => Promise<void>;
  addTask: (input: TaskInput) => void;
  editTask: (
    taskId: string,
    patch: Partial<Pick<Task, "title" | "categoryIds" | "estimatedPomodoros" | "scheduledDate" | "notes">>,
  ) => void;
  archiveTask: (taskId: string) => void;
  selectTask: (taskId: string) => void;
  toggleTaskCategory: (taskId: string, categoryId: string) => void;
  addCategory: (name: string, variant: TomatoVariant) => string | undefined;
  editCategory: (categoryId: string, patch: Partial<Pick<Category, "name" | "tomatoVariant">>) => void;
  setSelectedCategory: (categoryId: string) => void;
  setHighlightedCategory: (categoryId?: string) => void;
  setViewMode: (viewMode: GardenViewMode) => void;
  setSelectedDate: (date: string, viewMode?: GardenViewMode) => void;
  startTimer: (durationSec?: number) => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  abandonTimer: () => void;
  completeActiveTimer: () => void;
  moveFruitAnchor: (fruitId: string, anchorIndex: number) => void;
  setDailyGoal: (date: string, goal: number, scope: "today" | "future") => void;
  setWhiteNoisePlaying: (playing: boolean) => void;
  updateUserProfile: (patch: Partial<UserProfile>) => void;
};

export type DayseedStore = DayseedSnapshot & {
  hydrated: boolean;
  whiteNoisePlaying: boolean;
} & DayseedActions;

function createSnapshot(): DayseedSnapshot {
  const today = dateKey();
  const sampleToday = createSampleTodayEntries(today);

  return {
    tasks: [sampleToday.task],
    categories: DEFAULT_CATEGORIES,
    sessions: sampleToday.sessions,
    dailyPlants: [sampleToday.dailyPlant],
    fruits: sampleToday.fruits,
    dailyGoals: {
      defaultGoal: DEFAULT_DAILY_GOAL,
      overrides: {},
    },
    selectedTaskId: sampleToday.task.id,
    selectedCategoryId: DEFAULT_CATEGORIES[0].id,
    selectedDate: today,
    userProfile: DEFAULT_USER_PROFILE,
    viewMode: "today",
  };
}

function snapshotFromState(state: DayseedStore): DayseedSnapshot {
  return {
    tasks: state.tasks,
    categories: state.categories,
    sessions: state.sessions,
    dailyPlants: state.dailyPlants,
    fruits: state.fruits,
    dailyGoals: state.dailyGoals,
    activeTimer: state.activeTimer,
    selectedTaskId: state.selectedTaskId,
    selectedCategoryId: state.selectedCategoryId,
    selectedDate: state.selectedDate,
    userProfile: state.userProfile,
    viewMode: state.viewMode,
    highlightedCategoryId: state.highlightedCategoryId,
  };
}

function persist(state: DayseedStore) {
  if (!state.hydrated) {
    return;
  }

  void saveDayseedSnapshot(snapshotFromState(state));
}

function normalizeCategory(category: Category): Category {
  const variant = VARIANT_IDS.has(category.tomatoVariant) ? category.tomatoVariant : FALLBACK_VARIANT;

  return {
    ...category,
    name: category.name?.trim() || "Category",
    tomatoVariant: variant,
    color: VARIANT_COLORS[variant] ?? category.color ?? FALLBACK_COLOR,
  };
}

function withSnapshotDefaults(snapshot: Partial<DayseedSnapshot>): DayseedSnapshot {
  const categories = (snapshot.categories ?? DEFAULT_CATEGORIES).map(normalizeCategory);
  const categoryIds = new Set(categories.map((category) => category.id));
  const missingDefaults = DEFAULT_CATEGORIES.filter((category) => !categoryIds.has(category.id));
  const mergedCategories = [...categories, ...missingDefaults];
  const selectedCategoryId =
    snapshot.selectedCategoryId && mergedCategories.some((item) => item.id === snapshot.selectedCategoryId)
      ? snapshot.selectedCategoryId
      : mergedCategories[0]?.id;

  return {
    tasks: snapshot.tasks ?? [],
    categories: mergedCategories,
    sessions: snapshot.sessions ?? [],
    dailyPlants: snapshot.dailyPlants ?? [],
    fruits: snapshot.fruits ?? [],
    activeTimer: snapshot.activeTimer,
    selectedTaskId: snapshot.selectedTaskId,
    selectedCategoryId,
    highlightedCategoryId: snapshot.highlightedCategoryId,
    dailyGoals: {
      defaultGoal: Math.max(1, Math.round(snapshot.dailyGoals?.defaultGoal ?? DEFAULT_DAILY_GOAL)),
      overrides: snapshot.dailyGoals?.overrides ?? {},
    },
    selectedDate: snapshot.selectedDate || dateKey(),
    userProfile: {
      ...DEFAULT_USER_PROFILE,
      ...snapshot.userProfile,
    },
    viewMode: snapshot.viewMode || "today",
  };
}

function growthStageForCount(count: number): DailyPlant["growthStage"] {
  if (count <= 0) {
    return "none";
  }

  if (count === 1) {
    return "young";
  }

  if (count < 5) {
    return "fruiting";
  }

  return "mature";
}

function categoryForFruit(categories: Category[], categoryId: string) {
  return categories.find((category) => category.id === categoryId) ?? categories[0];
}

export const useDayseedStore = create<DayseedStore>()((set, get) => ({
  ...createSnapshot(),
  hydrated: false,
  whiteNoisePlaying: false,

  hydrate: async () => {
    const stored = await loadDayseedSnapshot();
    const snapshot = withSnapshotDefaults(stored ?? createSnapshot());

    set({
      ...snapshot,
      hydrated: true,
    });
  },

  addTask: (input) => {
    const trimmed = input.title.trim();
    if (!trimmed) {
      return;
    }

    const now = new Date().toISOString();
    const fallbackCategoryId = get().selectedCategoryId ?? get().categories[0]?.id;
    const categoryIds = input.categoryIds ?? [];
    const scheduledDate = input.scheduledDate?.trim();
    const notes = input.notes?.trim();
    const nextTask: Task = {
      id: createId("task"),
      title: trimmed,
      categoryIds: categoryIds.length > 0 ? categoryIds : fallbackCategoryId ? [fallbackCategoryId] : [],
      estimatedPomodoros: Math.max(0, Math.round(input.estimatedPomodoros ?? 1)),
      notes: notes || undefined,
      scheduledDate: scheduledDate || undefined,
      status: "active",
      createdAt: now,
    };

    set((state) => ({
      tasks: [nextTask, ...state.tasks],
      selectedTaskId: nextTask.id,
    }));
    persist(get());
  },

  editTask: (taskId, patch) => {
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              title: patch.title ?? task.title,
              categoryIds: patch.categoryIds ?? task.categoryIds,
              estimatedPomodoros: patch.estimatedPomodoros ?? task.estimatedPomodoros,
              notes: patch.notes !== undefined ? patch.notes.trim() || undefined : task.notes,
              scheduledDate:
                patch.scheduledDate !== undefined ? patch.scheduledDate || undefined : task.scheduledDate,
            }
          : task,
      ),
    }));
    persist(get());
  },

  archiveTask: (taskId) => {
    const archivedAt = new Date().toISOString();

    set((state) => {
      const tasks = state.tasks.map((task) =>
        task.id === taskId ? { ...task, status: "archived" as const, archivedAt } : task,
      );
      const selectedTaskId =
        state.selectedTaskId === taskId
          ? tasks.find((task) => task.status === "active")?.id
          : state.selectedTaskId;

      return { tasks, selectedTaskId };
    });
    persist(get());
  },

  selectTask: (taskId) => {
    const task = get().tasks.find((item) => item.id === taskId && item.status === "active");
    if (!task) {
      return;
    }

    set({
      selectedTaskId: task.id,
      selectedCategoryId: task.categoryIds[0] ?? get().selectedCategoryId,
    });
    persist(get());
  },

  toggleTaskCategory: (taskId, categoryId) => {
    set((state) => ({
      tasks: state.tasks.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        const hasCategory = task.categoryIds.includes(categoryId);
        const categoryIds = hasCategory
          ? task.categoryIds.filter((id) => id !== categoryId)
          : [...task.categoryIds, categoryId];

        return {
          ...task,
          categoryIds: categoryIds.length > 0 ? categoryIds : [categoryId],
        };
      }),
    }));
    persist(get());
  },

  addCategory: (name, variant) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return undefined;
    }
    const safeVariant = VARIANT_IDS.has(variant) ? variant : FALLBACK_VARIANT;

    const category: Category = {
      id: createId("cat"),
      name: trimmed,
      tomatoVariant: safeVariant,
      color: VARIANT_COLORS[safeVariant],
    };

    set((state) => ({
      categories: [...state.categories, category],
      selectedCategoryId: category.id,
    }));
    persist(get());
    return category.id;
  },

  editCategory: (categoryId, patch) => {
    set((state) => ({
      categories: state.categories.map((category) => {
        if (category.id !== categoryId) {
          return category;
        }

        const nextName = patch.name !== undefined ? patch.name.trim() : category.name;
        const nextVariant =
          patch.tomatoVariant && VARIANT_IDS.has(patch.tomatoVariant)
            ? patch.tomatoVariant
            : category.tomatoVariant;

        return {
          ...category,
          name: nextName || category.name,
          tomatoVariant: nextVariant,
          color: VARIANT_COLORS[nextVariant] ?? category.color,
        };
      }),
    }));
    persist(get());
  },

  setSelectedCategory: (categoryId) => {
    if (!get().categories.some((category) => category.id === categoryId)) {
      return;
    }

    set({ selectedCategoryId: categoryId });
    persist(get());
  },

  setHighlightedCategory: (categoryId) => {
    set({ highlightedCategoryId: categoryId });
    persist(get());
  },

  setViewMode: (viewMode) => {
    set({ viewMode });
    persist(get());
  },

  setSelectedDate: (selectedDate, viewMode) => {
    set((state) => ({
      selectedDate,
      viewMode: viewMode ?? state.viewMode,
    }));
    persist(get());
  },

  startTimer: (durationSec = DEFAULT_DURATION_SEC) => {
    const state = get();
    if (state.activeTimer) {
      return;
    }

    const task = state.tasks.find(
      (item) => item.id === state.selectedTaskId && item.status === "active",
    );
    if (!task) {
      return;
    }

    const selectedCategoryId =
      state.selectedCategoryId && task.categoryIds.includes(state.selectedCategoryId)
        ? state.selectedCategoryId
        : task.categoryIds[0] ?? state.categories[0]?.id;
    const now = Date.now();
    const activeTimer: ActiveTimer = {
      id: createId("session"),
      taskId: task.id,
      categoryIds: task.categoryIds.length > 0 ? task.categoryIds : selectedCategoryId ? [selectedCategoryId] : [],
      selectedCategoryId: selectedCategoryId ?? "",
      startedAt: new Date(now).toISOString(),
      expectedEndAt: new Date(now + durationSec * 1000).toISOString(),
      plannedDurationSec: durationSec,
      status: "running",
    };

    set({ activeTimer });
    persist(get());
  },

  pauseTimer: () => {
    const timer = get().activeTimer;
    if (!timer || timer.status === "paused") {
      return;
    }

    set({
      activeTimer: {
        ...timer,
        status: "paused",
        remainingAtPauseSec: remainingSeconds(timer),
      },
    });
    persist(get());
  },

  resumeTimer: () => {
    const timer = get().activeTimer;
    if (!timer || timer.status !== "paused") {
      return;
    }

    const remaining = timer.remainingAtPauseSec ?? remainingSeconds(timer);
    const now = Date.now();

    set({
      activeTimer: {
        ...timer,
        status: "running",
        expectedEndAt: new Date(now + remaining * 1000).toISOString(),
        remainingAtPauseSec: undefined,
      },
    });
    persist(get());
  },

  abandonTimer: () => {
    const timer = get().activeTimer;
    if (!timer) {
      return;
    }

    const session: PomodoroSession = {
      id: timer.id,
      taskId: timer.taskId,
      categoryIds: timer.categoryIds,
      startedAt: timer.startedAt,
      expectedEndAt: timer.expectedEndAt,
      plannedDurationSec: timer.plannedDurationSec,
      status: "abandoned",
    };

    set((state) => ({
      sessions: [session, ...state.sessions],
      activeTimer: undefined,
    }));
    persist(get());
  },

  completeActiveTimer: () => {
    const state = get();
    const timer = state.activeTimer;
    if (!timer) {
      return;
    }

    const completedAt = new Date();
    const completedAtIso = completedAt.toISOString();
    const plantDate = dateKey(completedAt);
    const category = categoryForFruit(state.categories, timer.selectedCategoryId);
    const existingPlant = state.dailyPlants.find((plant) => plant.date === plantDate);
    const plantId = existingPlant?.id ?? createId("plant");
    const nextFruitIds = existingPlant ? [...existingPlant.fruitIds] : [];
    const occupiedAnchorIndexes = new Set(
      state.fruits
        .filter((fruit) => nextFruitIds.includes(fruit.id))
        .map((fruit) => fruit.anchorIndex),
    );
    const nextAnchorIndex =
      TOMATO_ANCHOR_DEFAULT_ORDER.find((anchorIndex) => !occupiedAnchorIndexes.has(anchorIndex)) ??
      Math.min(nextFruitIds.length, TOMATO_ANCHOR_SLOT_COUNT - 1);

    const session: PomodoroSession = {
      id: timer.id,
      taskId: timer.taskId,
      categoryIds: timer.categoryIds,
      startedAt: timer.startedAt,
      expectedEndAt: timer.expectedEndAt,
      completedAt: completedAtIso,
      plannedDurationSec: timer.plannedDurationSec,
      status: "completed",
    };
    const fruit: TomatoFruit = {
      id: createId("fruit"),
      dailyPlantId: plantId,
      pomodoroSessionId: session.id,
      categoryId: category.id,
      variant: category.tomatoVariant,
      anchorIndex: nextAnchorIndex,
      createdAt: completedAtIso,
    };

    nextFruitIds.push(fruit.id);

    const plant: DailyPlant = {
      id: plantId,
      date: plantDate,
      growthStage: growthStageForCount(nextFruitIds.length),
      fruitIds: nextFruitIds,
      plantedAt: existingPlant?.plantedAt ?? completedAtIso,
      seed: existingPlant?.seed ?? seededNumber(plantDate),
    };

    set((current) => ({
      sessions: [session, ...current.sessions],
      fruits: [...current.fruits, fruit],
      dailyPlants: existingPlant
        ? current.dailyPlants.map((item) => (item.id === plant.id ? plant : item))
        : [...current.dailyPlants, plant],
      activeTimer: undefined,
      selectedDate: plantDate,
      viewMode: "today",
    }));
    persist(get());
  },

  moveFruitAnchor: (fruitId, anchorIndex) => {
    const requestedAnchorIndex = Math.max(
      0,
      Math.min(TOMATO_ANCHOR_SLOT_COUNT - 1, Math.round(anchorIndex)),
    );

    set((state) => ({
      fruits: state.fruits.map((fruit) => {
        if (fruit.id !== fruitId) {
          return fruit;
        }

        const occupiedAnchorIndexes = new Set(
          state.fruits
            .filter((item) => item.dailyPlantId === fruit.dailyPlantId && item.id !== fruit.id)
            .map((item) => item.anchorIndex),
        );
        let normalizedAnchorIndex = requestedAnchorIndex;
        let attempts = 0;

        while (
          occupiedAnchorIndexes.has(normalizedAnchorIndex) &&
          attempts < TOMATO_ANCHOR_SLOT_COUNT
        ) {
          normalizedAnchorIndex = (normalizedAnchorIndex + 1) % TOMATO_ANCHOR_SLOT_COUNT;
          attempts += 1;
        }

        return { ...fruit, anchorIndex: normalizedAnchorIndex };
      }),
    }));
    persist(get());
  },

  setDailyGoal: (date, goal, scope) => {
    const normalizedGoal = Math.max(1, Math.min(99, Math.round(goal)));

    set((state) => {
      if (scope === "future") {
        const overrides = Object.fromEntries(
          Object.entries(state.dailyGoals.overrides).filter(([key]) => key < date),
        );

        return {
          dailyGoals: {
            defaultGoal: normalizedGoal,
            overrides,
          },
        };
      }

      return {
        dailyGoals: {
          ...state.dailyGoals,
          overrides: {
            ...state.dailyGoals.overrides,
            [date]: normalizedGoal,
          },
        },
      };
    });
    persist(get());
  },

  setWhiteNoisePlaying: (whiteNoisePlaying) => {
    set({ whiteNoisePlaying });
  },

  updateUserProfile: (patch) => {
    set((state) => ({
      userProfile: {
        ...state.userProfile,
        ...patch,
        displayName: patch.displayName !== undefined ? patch.displayName.trim() || "Nora" : state.userProfile.displayName,
      },
    }));
    persist(get());
  },
}));
