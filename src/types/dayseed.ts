export type TomatoVariant = "red" | "yellow" | "green" | "purple" | "striped";

export type Task = {
  id: string;
  title: string;
  categoryIds: string[];
  estimatedPomodoros?: number;
  status: "active" | "archived";
  createdAt: string;
  archivedAt?: string;
};

export type Category = {
  id: string;
  name: string;
  tomatoVariant: TomatoVariant;
  color: string;
};

export type PomodoroSession = {
  id: string;
  taskId: string;
  categoryIds: string[];
  startedAt: string;
  expectedEndAt: string;
  completedAt?: string;
  plannedDurationSec: number;
  status: "completed" | "abandoned" | "paused";
};

export type DailyPlant = {
  id: string;
  date: string;
  growthStage: "none" | "seedling" | "young" | "fruiting" | "mature";
  fruitIds: string[];
  plantedAt?: string;
  seed: number;
};

export type TomatoFruit = {
  id: string;
  dailyPlantId: string;
  pomodoroSessionId: string;
  categoryId: string;
  variant: TomatoVariant;
  anchorIndex: number;
  createdAt: string;
};

export type ActiveTimer = {
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

export type GardenViewMode = "today" | "week" | "month" | "year";

export type DayseedSnapshot = {
  tasks: Task[];
  categories: Category[];
  sessions: PomodoroSession[];
  dailyPlants: DailyPlant[];
  fruits: TomatoFruit[];
  activeTimer?: ActiveTimer;
  selectedTaskId?: string;
  selectedCategoryId?: string;
  selectedDate: string;
  viewMode: GardenViewMode;
  highlightedCategoryId?: string;
};
