"use client";

import { Canvas, ThreeEvent, useFrame, useLoader, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { isFutureDate, isPastDate, isTodayKey, monthGrid, parseDateKey, weekGrid } from "@/lib/dates";
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

const SPRITE_SHEET = "/assets/dayseed-plant-sheet.png";
const SPRITE_COLS = 3;
const SPRITE_ROWS = 2;

const SPRITES = {
  seedling: { col: 0, row: 0 },
  young: { col: 1, row: 0 },
  fruiting: { col: 2, row: 0 },
  mature: { col: 0, row: 1 },
  weeds: { col: 2, row: 1 },
} as const;

const FRUIT_ANCHORS = [
  { x: -0.18, y: 0.48, scale: 0.95 },
  { x: 0.24, y: 0.62, scale: 1.05 },
  { x: -0.35, y: 0.16, scale: 0.88 },
  { x: 0.1, y: 0.22, scale: 0.92 },
  { x: 0.36, y: 0.34, scale: 0.82 },
  { x: -0.04, y: 0.78, scale: 0.7 },
  { x: -0.3, y: 0.68, scale: 0.72 },
  { x: 0.32, y: 0.08, scale: 0.66 },
  { x: 0.02, y: 0.02, scale: 0.62 },
  { x: -0.44, y: 0.34, scale: 0.58 },
];

function CameraFit({ viewMode }: { viewMode: GardenViewMode }) {
  const { camera, size } = useThree();

  useEffect(() => {
    if (!("isOrthographicCamera" in camera)) {
      return;
    }

    const targets: Record<GardenViewMode, { width: number; height: number }> = {
      today: { width: 9, height: 8 },
      week: { width: 12.8, height: 5.4 },
      month: { width: 13.5, height: 11 },
      year: { width: 25, height: 17 },
    };
    const target = targets[viewMode];
    const zoom = Math.min(size.width / target.width, size.height / target.height) * 0.92;
    camera.zoom = zoom;
    camera.position.set(0, 0, 40);
    camera.updateProjectionMatrix();
  }, [camera, size.height, size.width, viewMode]);

  return null;
}

function useSpriteTexture() {
  const texture = useLoader(THREE.TextureLoader, SPRITE_SHEET);

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
  }, [texture]);

  return texture;
}

function SpritePlane({
  cell,
  position,
  width,
  height,
  opacity = 1,
}: {
  cell: { col: number; row: number };
  position: Vec3;
  width: number;
  height: number;
  opacity?: number;
}) {
  const baseTexture = useSpriteTexture();
  const map = useMemo(() => {
    const clone = baseTexture.clone();
    clone.colorSpace = THREE.SRGBColorSpace;
    clone.repeat.set(1 / SPRITE_COLS, 1 / SPRITE_ROWS);
    clone.offset.set(cell.col / SPRITE_COLS, (SPRITE_ROWS - 1 - cell.row) / SPRITE_ROWS);
    clone.needsUpdate = true;
    return clone;
  }, [baseTexture, cell.col, cell.row]);

  useEffect(() => () => map.dispose(), [map]);

  return (
    <mesh position={position}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial
        alphaTest={0.04}
        depthWrite={false}
        map={map}
        opacity={opacity}
        transparent
      />
    </mesh>
  );
}

function Sway({
  children,
  seed = 0,
}: {
  children: React.ReactNode;
  seed?: number;
}) {
  const ref = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!ref.current) {
      return;
    }

    ref.current.rotation.z = Math.sin(clock.elapsedTime * 0.8 + seed) * 0.018;
  });

  return <group ref={ref}>{children}</group>;
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

function plantOpacity(plantFruits: TomatoFruit[], highlightedCategoryId?: string) {
  if (!highlightedCategoryId) {
    return 1;
  }

  return plantFruits.some((fruit) => fruit.categoryId === highlightedCategoryId) ? 1 : 0.24;
}

function spriteForPlant(plant?: DailyPlant) {
  if (!plant || plant.fruitIds.length === 0) {
    return SPRITES.weeds;
  }

  if (plant.growthStage === "mature") {
    return SPRITES.mature;
  }

  if (plant.growthStage === "fruiting") {
    return SPRITES.fruiting;
  }

  if (plant.growthStage === "young") {
    return SPRITES.young;
  }

  return SPRITES.seedling;
}

function TodayGarden({
  selectedDate,
  plant,
  fruits,
  categories,
  highlightedCategoryId,
}: {
  selectedDate: string;
  plant?: DailyPlant;
  fruits: TomatoFruit[];
  categories: Category[];
  highlightedCategoryId?: string;
}) {
  const categoryMap = useMemo(() => categoryById(categories), [categories]);
  const plantFruits = fruitsForPlant(fruits, plant);
  const opacity = plantOpacity(plantFruits, highlightedCategoryId);
  const showWeeds = !plant || plant.fruitIds.length === 0;
  const future = isFutureDate(selectedDate);
  const plantSeed = plant?.seed ?? parseDateKey(selectedDate).getTime();

  return (
    <group>
      <mesh position={[0, -1.55, -0.2]} scale={[1.45, 0.52, 1]}>
        <circleGeometry args={[2.45, 72]} />
        <meshBasicMaterial color="#7d5e40" opacity={0.9} transparent />
      </mesh>
      <mesh position={[0, -1.45, -0.1]} scale={[1.18, 0.42, 1]}>
        <circleGeometry args={[2.24, 72]} />
        <meshBasicMaterial color="#a7815a" opacity={0.86} transparent />
      </mesh>
      {showWeeds && !future ? (
        <Sway seed={plantSeed}>
          <SpritePlane cell={SPRITES.weeds} height={3.15} opacity={0.88} position={[0, -0.2, 0]} width={4.6} />
        </Sway>
      ) : null}
      {!showWeeds ? (
        <Sway seed={plantSeed}>
          <SpritePlane
            cell={spriteForPlant(plant)}
            height={4.15}
            opacity={opacity}
            position={[0, 0.35, 0.1]}
            width={4.15}
          />
        </Sway>
      ) : null}
      {plantFruits.slice(0, 16).map((fruit, index) => {
        const anchor = FRUIT_ANCHORS[index % FRUIT_ANCHORS.length];
        const category = categoryMap.get(fruit.categoryId);
        const matching = !highlightedCategoryId || fruit.categoryId === highlightedCategoryId;

        return (
          <FruitDot
            color={category?.color ?? "#d84d32"}
            key={fruit.id}
            opacity={matching ? 1 : 0.16}
            position={[anchor.x * 3.1, anchor.y * 3.1 - 1.28, 0.4 + index * 0.002]}
            radius={0.16 * anchor.scale}
            striped={fruit.variant === "striped"}
          />
        );
      })}
    </group>
  );
}

function MonthGarden({
  selectedDate,
  plantsByDate,
  fruits,
  categories,
  highlightedCategoryId,
  onSelectDate,
}: {
  selectedDate: string;
  plantsByDate: Map<string, DailyPlant>;
  fruits: TomatoFruit[];
  categories: Category[];
  highlightedCategoryId?: string;
  onSelectDate: GardenCanvasProps["onSelectDate"];
}) {
  const categoryMap = useMemo(() => categoryById(categories), [categories]);
  const days = monthGrid(selectedDate);
  const cell = 1.12;
  const gap = 0.15;
  const stride = cell + gap;

  return (
    <group position={[0, -0.15, 0]}>
      {days.map((day, index) => {
        const row = Math.floor(index / 7);
        const col = index % 7;
        const x = (col - 3) * stride;
        const y = (2.5 - row) * stride;
        const plant = plantsByDate.get(day.key);
        const plantFruits = fruitsForPlant(fruits, plant);
        const opacity = plantOpacity(plantFruits, highlightedCategoryId);
        const future = isFutureDate(day.key);
        const dim = day.inCurrentMonth ? 1 : 0.24;

        return (
          <group key={day.key} position={[x, y, 0]}>
            <PlotBase
              onClick={(event) => {
                event.stopPropagation();
                onSelectDate(day.key, "today");
              }}
              opacity={future ? 0.35 * dim : 0.82 * dim}
              position={[0, 0, 0]}
              selected={day.key === selectedDate || day.isToday}
              size={cell}
            />
            {plant && plant.fruitIds.length > 0 ? (
              <Sway seed={plant.seed}>
                <SpritePlane
                  cell={spriteForPlant(plant)}
                  height={1.16}
                  opacity={opacity * dim}
                  position={[0, 0.08, 0.12]}
                  width={1.12}
                />
              </Sway>
            ) : !future ? (
              <SpritePlane
                cell={SPRITES.weeds}
                height={0.82}
                opacity={0.62 * dim}
                position={[0, -0.02, 0.1]}
                width={0.96}
              />
            ) : null}
            {plantFruits.slice(0, 4).map((fruit, fruitIndex) => {
              const category = categoryMap.get(fruit.categoryId);
              const matching = !highlightedCategoryId || fruit.categoryId === highlightedCategoryId;
              const offsetX = (fruitIndex % 2) * 0.18 - 0.09;
              const offsetY = Math.floor(fruitIndex / 2) * -0.18 + 0.18;

              return (
                <FruitDot
                  color={category?.color ?? "#d84d32"}
                  key={fruit.id}
                  opacity={matching ? 0.95 : 0.08}
                  position={[offsetX, offsetY, 0.32]}
                  radius={0.055}
                  striped={fruit.variant === "striped"}
                />
              );
            })}
          </group>
        );
      })}
    </group>
  );
}

function WeekGarden({
  selectedDate,
  plantsByDate,
  fruits,
  categories,
  highlightedCategoryId,
  onSelectDate,
}: {
  selectedDate: string;
  plantsByDate: Map<string, DailyPlant>;
  fruits: TomatoFruit[];
  categories: Category[];
  highlightedCategoryId?: string;
  onSelectDate: GardenCanvasProps["onSelectDate"];
}) {
  const categoryMap = useMemo(() => categoryById(categories), [categories]);
  const days = weekGrid(selectedDate);

  return (
    <group position={[0, -0.1, 0]}>
      {days.map((day, index) => {
        const x = (index - 3) * 1.62;
        const plant = plantsByDate.get(day.key);
        const plantFruits = fruitsForPlant(fruits, plant);
        const opacity = plantOpacity(plantFruits, highlightedCategoryId);
        const future = isFutureDate(day.key);

        return (
          <group key={day.key} position={[x, 0, 0]}>
            <PlotBase
              onClick={(event) => {
                event.stopPropagation();
                onSelectDate(day.key, "today");
              }}
              opacity={future ? 0.28 : 0.84}
              position={[0, -0.58, 0]}
              selected={day.key === selectedDate || day.isToday}
              size={1.34}
            />
            {plant && plant.fruitIds.length > 0 ? (
              <Sway seed={plant.seed}>
                <SpritePlane
                  cell={spriteForPlant(plant)}
                  height={1.48}
                  opacity={opacity}
                  position={[0, -0.28, 0.12]}
                  width={1.42}
                />
              </Sway>
            ) : !future ? (
              <SpritePlane
                cell={SPRITES.weeds}
                height={0.95}
                opacity={0.66}
                position={[0, -0.46, 0.1]}
                width={1.08}
              />
            ) : null}
            {plantFruits.slice(0, 5).map((fruit, fruitIndex) => {
              const category = categoryMap.get(fruit.categoryId);
              const matching = !highlightedCategoryId || fruit.categoryId === highlightedCategoryId;
              const offsetX = (fruitIndex - 2) * 0.12;

              return (
                <FruitDot
                  color={category?.color ?? "#d84d32"}
                  key={fruit.id}
                  opacity={matching ? 0.95 : 0.08}
                  position={[offsetX, 0.25, 0.34]}
                  radius={0.06}
                  striped={fruit.variant === "striped"}
                />
              );
            })}
          </group>
        );
      })}
    </group>
  );
}

function YearGarden({
  selectedDate,
  plantsByDate,
  fruits,
  highlightedCategoryId,
  onSelectDate,
}: {
  selectedDate: string;
  plantsByDate: Map<string, DailyPlant>;
  fruits: TomatoFruit[];
  highlightedCategoryId?: string;
  onSelectDate: GardenCanvasProps["onSelectDate"];
}) {
  const selectedYear = parseDateKey(selectedDate).getFullYear();
  const monthKeys = Array.from({ length: 12 }, (_, month) =>
    `${selectedYear}-${String(month + 1).padStart(2, "0")}-01`,
  );

  return (
    <group position={[0, 0, 0]}>
      {monthKeys.map((monthKey, monthIndex) => {
        const monthRow = Math.floor(monthIndex / 4);
        const monthCol = monthIndex % 4;
        const monthX = (monthCol - 1.5) * 5.8;
        const monthY = (1 - monthRow) * 5.0;
        const days = monthGrid(monthKey).filter((day) => day.inCurrentMonth);

        return (
          <group key={monthKey} position={[monthX, monthY, 0]}>
            <mesh position={[0, 0, -0.08]}>
              <planeGeometry args={[5.15, 4.35]} />
              <meshBasicMaterial color="#5f7047" opacity={0.28} transparent />
            </mesh>
            {days.map((day) => {
              const parsed = parseDateKey(day.key);
              const col = parsed.getDay();
              const row = Math.floor((parsed.getDate() + new Date(parsed.getFullYear(), parsed.getMonth(), 1).getDay() - 1) / 7);
              const x = (col - 3) * 0.62;
              const y = (2.45 - row) * 0.58;
              const plant = plantsByDate.get(day.key);
              const plantFruits = fruitsForPlant(fruits, plant);
              const matching =
                !highlightedCategoryId ||
                plantFruits.some((fruit) => fruit.categoryId === highlightedCategoryId);
              const future = isFutureDate(day.key);
              const emptyPast = !plant && (isPastDate(day.key) || isTodayKey(day.key));

              return (
                <group key={day.key} position={[x, y, 0]}>
                  <mesh
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectDate(day.key, "today");
                    }}
                  >
                    <planeGeometry args={[0.42, 0.42]} />
                    <meshBasicMaterial
                      color={future ? "#7a7d5a" : "#8d6848"}
                      opacity={future ? 0.16 : 0.48}
                      transparent
                    />
                  </mesh>
                  {plant ? (
                    <mesh position={[0, 0, 0.06]}>
                      <circleGeometry args={[0.15 + Math.min(plant.fruitIds.length, 6) * 0.012, 18]} />
                      <meshBasicMaterial
                        color={matching ? "#558348" : "#66705f"}
                        opacity={matching ? 0.95 : 0.16}
                        transparent
                      />
                    </mesh>
                  ) : emptyPast ? (
                    <mesh position={[0, 0, 0.05]} rotation={[0, 0, 0.8]}>
                      <planeGeometry args={[0.08, 0.28]} />
                      <meshBasicMaterial color="#8aa46f" opacity={0.7} transparent />
                    </mesh>
                  ) : null}
                  {day.key === selectedDate ? (
                    <mesh position={[0, 0, 0.09]}>
                      <ringGeometry args={[0.2, 0.25, 22]} />
                      <meshBasicMaterial color="#f2cf6f" opacity={0.92} transparent />
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
  const selectedPlant = plantsByDate.get(props.selectedDate);

  return (
    <>
      <CameraFit viewMode={props.viewMode} />
      <ambientLight intensity={2} />
      {props.viewMode === "today" ? (
        <TodayGarden
          categories={props.categories}
          fruits={props.fruits}
          highlightedCategoryId={props.highlightedCategoryId}
          plant={selectedPlant}
          selectedDate={props.selectedDate}
        />
      ) : null}
      {props.viewMode === "month" ? (
        <MonthGarden
          categories={props.categories}
          fruits={props.fruits}
          highlightedCategoryId={props.highlightedCategoryId}
          onSelectDate={props.onSelectDate}
          plantsByDate={plantsByDate}
          selectedDate={props.selectedDate}
        />
      ) : null}
      {props.viewMode === "week" ? (
        <WeekGarden
          categories={props.categories}
          fruits={props.fruits}
          highlightedCategoryId={props.highlightedCategoryId}
          onSelectDate={props.onSelectDate}
          plantsByDate={plantsByDate}
          selectedDate={props.selectedDate}
        />
      ) : null}
      {props.viewMode === "year" ? (
        <YearGarden
          fruits={props.fruits}
          highlightedCategoryId={props.highlightedCategoryId}
          onSelectDate={props.onSelectDate}
          plantsByDate={plantsByDate}
          selectedDate={props.selectedDate}
        />
      ) : null}
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
