"use client";

import { Canvas, ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { isFutureDate, isPastDate, isTodayKey, monthGrid, parseDateKey } from "@/lib/dates";
import type {
  Category,
  DailyPlant,
  GardenViewMode,
  TomatoFruit,
} from "@/types/dayseed";

type Vec3 = [number, number, number];

type GardenCanvasProps = {
  viewMode: GardenViewMode;
  selectedDate: string;
  categories: Category[];
  plants: DailyPlant[];
  fruits: TomatoFruit[];
  highlightedCategoryId?: string;
  onSelectDate: (date: string, viewMode?: GardenViewMode) => void;
};

const MONTH_SPACING_X = 5.8;
const MONTH_SPACING_Y = 5;
const DAY_CELL_X = 0.62;
const DAY_CELL_Y = 0.55;
const DAY_GRID_TOP = 1.54;

function monthPositionForDate(date: string): Vec3 {
  const parsed = parseDateKey(date);
  const monthIndex = parsed.getMonth();
  const monthRow = Math.floor(monthIndex / 4);
  const monthCol = monthIndex % 4;

  return [
    (monthCol - 1.5) * MONTH_SPACING_X,
    (1 - monthRow) * MONTH_SPACING_Y,
    0,
  ];
}

function dayPositionInMonth(date: string): Vec3 {
  const parsed = parseDateKey(date);
  const firstDay = new Date(parsed.getFullYear(), parsed.getMonth(), 1).getDay();
  const col = parsed.getDay();
  const row = Math.floor((parsed.getDate() + firstDay - 1) / 7);

  return [
    (col - 3) * DAY_CELL_X,
    DAY_GRID_TOP - row * DAY_CELL_Y,
    0,
  ];
}

function cameraTargetForView(viewMode: GardenViewMode, selectedDate: string) {
  const [monthX, monthY] = monthPositionForDate(selectedDate);
  const [dayX, dayY] = dayPositionInMonth(selectedDate);

  if (viewMode === "week") {
    return {
      center: new THREE.Vector3(monthX, monthY + dayY, 40),
      height: 1.75,
      width: 5.7,
    };
  }

  if (viewMode === "month") {
    return {
      center: new THREE.Vector3(monthX, monthY, 40),
      height: 5.15,
      width: 6.15,
    };
  }

  if (viewMode === "today") {
    return {
      center: new THREE.Vector3(monthX + dayX, monthY + dayY, 40),
      height: 1.7,
      width: 1.9,
    };
  }

  return {
    center: new THREE.Vector3(0, 0, 40),
    height: 17,
    width: 25,
  };
}

function CameraFit({ selectedDate, viewMode }: { selectedDate: string; viewMode: GardenViewMode }) {
  const { camera, size } = useThree();
  const target = useRef({
    position: new THREE.Vector3(0, 0, 40),
    zoom: 80,
  });

  useEffect(() => {
    if (!("isOrthographicCamera" in camera)) {
      return;
    }

    const next = cameraTargetForView(viewMode, selectedDate);
    target.current.zoom = Math.min(size.width / next.width, size.height / next.height) * 0.92;
    target.current.position.copy(next.center);
  }, [camera, selectedDate, size.height, size.width, viewMode]);

  useFrame(() => {
    if (!("isOrthographicCamera" in camera)) {
      return;
    }

    camera.position.lerp(target.current.position, 0.08);
    camera.zoom += (target.current.zoom - camera.zoom) * 0.08;
    camera.updateProjectionMatrix();
  });

  return null;
}

function PlotBase({
  position,
  size,
  opacity = 1,
  selected = false,
  onClick,
}: {
  position: Vec3;
  size: number;
  opacity?: number;
  selected?: boolean;
  onClick?: (event: ThreeEvent<PointerEvent>) => void;
}) {
  return (
    <group position={position}>
      <mesh onClick={onClick}>
        <planeGeometry args={[size, size]} />
        <meshBasicMaterial color="#765a3f" opacity={opacity} transparent />
      </mesh>
      <mesh position={[0, 0, 0.012]}>
        <planeGeometry args={[size * 0.86, size * 0.86]} />
        <meshBasicMaterial color="#93714e" opacity={opacity * 0.74} transparent />
      </mesh>
      {selected ? (
        <mesh position={[0, 0, 0.04]}>
          <ringGeometry args={[size * 0.55, size * 0.63, 36]} />
          <meshBasicMaterial color="#f2cf6f" opacity={0.95} transparent />
        </mesh>
      ) : null}
    </group>
  );
}

function FruitDot({
  color,
  position,
  radius,
  opacity = 1,
  striped = false,
}: {
  color: string;
  position: Vec3;
  radius: number;
  opacity?: number;
  striped?: boolean;
}) {
  return (
    <group position={position}>
      <mesh>
        <circleGeometry args={[radius, 28]} />
        <meshBasicMaterial color={color} opacity={opacity} transparent />
      </mesh>
      {striped ? (
        <mesh position={[0, 0, 0.01]}>
          <ringGeometry args={[radius * 0.52, radius * 0.62, 24]} />
          <meshBasicMaterial color="#f4d36a" opacity={opacity * 0.8} transparent />
        </mesh>
      ) : null}
    </group>
  );
}

function categoryById(categories: Category[]) {
  return new Map(categories.map((category) => [category.id, category]));
}

function fruitsForPlant(fruits: TomatoFruit[], plant?: DailyPlant) {
  if (!plant) {
    return [];
  }

  const fruitIds = new Set(plant.fruitIds);
  return fruits.filter((fruit) => fruitIds.has(fruit.id));
}

function YearGarden({
  categories,
  selectedDate,
  plantsByDate,
  fruits,
  highlightedCategoryId,
  onSelectDate,
}: {
  categories: Category[];
  selectedDate: string;
  plantsByDate: Map<string, DailyPlant>;
  fruits: TomatoFruit[];
  highlightedCategoryId?: string;
  onSelectDate: GardenCanvasProps["onSelectDate"];
}) {
  const categoryMap = useMemo(() => categoryById(categories), [categories]);
  const selectedYear = parseDateKey(selectedDate).getFullYear();
  const monthKeys = Array.from({ length: 12 }, (_, month) =>
    `${selectedYear}-${String(month + 1).padStart(2, "0")}-01`,
  );

  return (
    <group position={[0, 0, 0]}>
      {monthKeys.map((monthKey, monthIndex) => {
        const monthRow = Math.floor(monthIndex / 4);
        const monthCol = monthIndex % 4;
        const monthX = (monthCol - 1.5) * MONTH_SPACING_X;
        const monthY = (1 - monthRow) * MONTH_SPACING_Y;
        const days = monthGrid(monthKey);

        return (
          <group key={monthKey} position={[monthX, monthY, 0]}>
            <mesh position={[0, 0, -0.08]}>
              <planeGeometry args={[5.15, 4.35]} />
              <meshBasicMaterial color="#5f7047" opacity={0.28} transparent />
            </mesh>
            {days.map((day, dayIndex) => {
              const row = Math.floor(dayIndex / 7);
              const col = dayIndex % 7;
              const x = (col - 3) * DAY_CELL_X;
              const y = DAY_GRID_TOP - row * DAY_CELL_Y;
              const plant = plantsByDate.get(day.key);
              const plantFruits = fruitsForPlant(fruits, plant);
              const matching =
                !highlightedCategoryId ||
                plantFruits.some((fruit) => fruit.categoryId === highlightedCategoryId);
              const future = isFutureDate(day.key);
              const emptyPast = !plant && (isPastDate(day.key) || isTodayKey(day.key));

              return (
                <group key={day.key} position={[x, y, 0]}>
                  <PlotBase
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectDate(day.key, "today");
                    }}
                    opacity={day.inCurrentMonth ? (future ? 0.16 : 0.48) : 0.1}
                    position={[0, 0, 0]}
                    selected={day.inCurrentMonth && day.key === selectedDate}
                    size={0.42}
                  />
                  {day.inCurrentMonth && plant ? (
                    <group position={[0, 0, 0.09]}>
                      <mesh>
                        <circleGeometry args={[0.12 + Math.min(plant.fruitIds.length, 6) * 0.01, 18]} />
                        <meshBasicMaterial
                          color={matching ? "#558348" : "#66705f"}
                          opacity={matching ? 0.74 : 0.16}
                          transparent
                        />
                      </mesh>
                      {plantFruits.slice(0, 4).map((fruit, fruitIndex) => {
                        const category = categoryMap.get(fruit.categoryId);
                        const offsetX = (fruitIndex % 2) * 0.12 - 0.06;
                        const offsetY = Math.floor(fruitIndex / 2) * -0.12 + 0.06;

                        return (
                          <FruitDot
                            color={category?.color ?? "#d84d32"}
                            key={fruit.id}
                            opacity={matching ? 0.96 : 0.08}
                            position={[offsetX, offsetY, 0.04 + fruitIndex * 0.002]}
                            radius={0.038}
                            striped={fruit.variant === "striped"}
                          />
                        );
                      })}
                    </group>
                  ) : day.inCurrentMonth && emptyPast ? (
                    <mesh position={[0, 0, 0.05]} rotation={[0, 0, 0.8]}>
                      <planeGeometry args={[0.08, 0.28]} />
                      <meshBasicMaterial color="#8aa46f" opacity={0.7} transparent />
                    </mesh>
                  ) : null}
                </group>
              );
            })}
          </group>
        );
      })}
    </group>
  );
}

function SceneContent(props: GardenCanvasProps) {
  const plantsByDate = useMemo(
    () => new Map(props.plants.map((plant) => [plant.date, plant])),
    [props.plants],
  );

  return (
    <>
      <CameraFit selectedDate={props.selectedDate} viewMode={props.viewMode} />
      <ambientLight intensity={2} />
      <YearGarden
        categories={props.categories}
        fruits={props.fruits}
        highlightedCategoryId={props.highlightedCategoryId}
        onSelectDate={props.onSelectDate}
        plantsByDate={plantsByDate}
        selectedDate={props.selectedDate}
      />
    </>
  );
}

export function GardenCanvas(props: GardenCanvasProps) {
  return (
    <Canvas
      className="garden-canvas"
      gl={{ alpha: true, antialias: true }}
      orthographic
      camera={{ position: [0, 0, 40], zoom: 80, near: 0.1, far: 100 }}
    >
      <color args={["#d9dfbf"]} attach="background" />
      <SceneContent {...props} />
    </Canvas>
  );
}
