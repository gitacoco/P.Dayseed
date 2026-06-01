"use client";

import {
  Canvas,
  type ThreeEvent,
  useFrame,
  useThree,
} from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Category, TomatoFruit } from "@/types/dayseed";

type Vec3 = [number, number, number];

type VineSlot = {
  fruit: Vec3;
  hanger: Vec3;
  index: number;
  root: Vec3;
  side: number;
  vine: Vec3;
};

type DragState = {
  fruitId: string;
  snapAnchorIndex: number;
} | null;

type TomatoTree3DProps = {
  active?: boolean;
  categories: Category[];
  fruits: TomatoFruit[];
  highlightedCategoryId?: string;
  onMoveFruitAnchor?: (fruitId: string, anchorIndex: number) => void;
  progress?: number;
  seed?: number;
};

const VINE_SLOT_COUNT = 15;

function categoryById(categories: Category[]) {
  return new Map(categories.map((category) => [category.id, category]));
}

function normalizeAnchorIndex(anchorIndex: number) {
  return Math.max(0, Math.min(VINE_SLOT_COUNT - 1, Math.round(anchorIndex)));
}

function branchRotation(from: Vec3, to: Vec3) {
  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);
  const direction = end.clone().sub(start);
  const midpoint = start.clone().add(end).multiplyScalar(0.5);
  const length = Math.max(direction.length(), 0.001);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.clone().normalize(),
  );

  return { length, midpoint, quaternion };
}

function vinePoint(t: number, seed: number): Vec3 {
  return [
    Math.sin(t * 4.8 + seed * 0.011) * 0.1,
    -0.3 + t * 2.25,
    Math.cos(t * 3.7 + seed * 0.017) * 0.052,
  ];
}

function createVineSlots(seed: number): VineSlot[] {
  return Array.from({ length: VINE_SLOT_COUNT }, (_, index) => {
    const cluster = Math.floor(index / 5);
    const item = index % 5;
    const side = cluster % 2 === 0 ? -1 : 1;
    const baseT = Math.max(0.24, 0.88 - cluster * 0.25 - (item % 2) * 0.012);
    const vine = vinePoint(baseT, seed);
    const root: Vec3 = [
      vine[0] + side * (0.11 + cluster * 0.015),
      vine[1] - 0.035,
      vine[2] + side * 0.025,
    ];
    const hanger: Vec3 = [
      root[0] + side * (0.12 + item * 0.012),
      root[1] - 0.09 - item * 0.035,
      root[2] + (item - 2) * 0.018,
    ];
    const fruit: Vec3 = [
      hanger[0] + side * (0.08 + Math.sin(seed * 0.003 + index * 1.7) * 0.014),
      hanger[1] - 0.12 - item * 0.115,
      hanger[2] + (item - 2) * 0.032,
    ];

    return { fruit, hanger, index, root, side, vine };
  });
}

function slotForFruit(fruit: TomatoFruit, slots: VineSlot[], dragging: DragState) {
  const anchorIndex =
    dragging?.fruitId === fruit.id
      ? dragging.snapAnchorIndex
      : normalizeAnchorIndex(fruit.anchorIndex);

  return slots[anchorIndex] ?? slots[0];
}

function Branch({
  from,
  opacity = 1,
  radius,
  to,
  color = "#4f7d44",
}: {
  color?: string;
  from: Vec3;
  opacity?: number;
  radius: number;
  to: Vec3;
}) {
  const transform = useMemo(() => branchRotation(from, to), [from, to]);

  return (
    <mesh position={transform.midpoint} quaternion={transform.quaternion}>
      <cylinderGeometry args={[radius * 0.58, radius, transform.length, 10]} />
      <meshStandardMaterial
        color={color}
        opacity={opacity}
        roughness={0.72}
        transparent={opacity < 1}
      />
    </mesh>
  );
}

function VineTube({
  color = "#4f7d44",
  opacity = 1,
  points,
  radius = 0.026,
}: {
  color?: string;
  opacity?: number;
  points: Vec3[];
  radius?: number;
}) {
  const geometry = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
    return new THREE.TubeGeometry(curve, 42, radius, 9, false);
  }, [points, radius]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color={color}
        opacity={opacity}
        roughness={0.76}
        transparent={opacity < 1}
      />
    </mesh>
  );
}

function Leaflet({
  position,
  rotation,
  scale = 1,
}: {
  position: Vec3;
  rotation: Vec3;
  scale?: number;
}) {
  return (
    <mesh position={position} rotation={rotation} scale={[0.042 * scale, 0.095 * scale, 1]}>
      <circleGeometry args={[1, 14]} />
      <meshStandardMaterial
        color="#5d8a4f"
        opacity={0.74}
        roughness={0.86}
        side={THREE.DoubleSide}
        transparent
      />
    </mesh>
  );
}

function CompoundLeaf({
  anchor,
  side,
  seed,
}: {
  anchor: Vec3;
  side: number;
  seed: number;
}) {
  const tip: Vec3 = [
    anchor[0] + side * 0.28,
    anchor[1] + 0.065 + Math.sin(seed) * 0.018,
    anchor[2] + side * 0.035,
  ];

  return (
    <group>
      <Branch color="#47743d" from={anchor} opacity={0.82} radius={0.0055} to={tip} />
      {Array.from({ length: 5 }, (_, index) => {
        const along = (index + 1) / 6;
        const leafletSide = index % 2 === 0 ? 1 : -1;
        const position: Vec3 = [
          anchor[0] + (tip[0] - anchor[0]) * along + side * 0.025 * leafletSide,
          anchor[1] + (tip[1] - anchor[1]) * along,
          anchor[2] + (tip[2] - anchor[2]) * along + leafletSide * 0.026,
        ];

        return (
          <Leaflet
            key={index}
            position={position}
            rotation={[0.48, side * 0.42, side * 0.34 + leafletSide * 0.52]}
            scale={0.58 + index * 0.055}
          />
        );
      })}
    </group>
  );
}

function SlotMarker({
  active,
  dragging,
  occupied,
  slot,
}: {
  active: boolean;
  dragging: boolean;
  occupied: boolean;
  slot: VineSlot;
}) {
  if (!dragging || (occupied && !active)) {
    return null;
  }

  const opacity = active ? 0.82 : 0.3;

  return (
    <group position={slot.fruit} scale={active ? 1.22 : 1}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.16, active ? 0.008 : 0.004, 8, 34]} />
        <meshBasicMaterial
          color={active ? "#003c33" : "#6f8c62"}
          depthWrite={false}
          opacity={opacity}
          transparent
        />
      </mesh>
      <mesh scale={active ? 1.15 : 1}>
        <sphereGeometry args={[0.018, 10, 8]} />
        <meshBasicMaterial
          color={active ? "#003c33" : "#8da581"}
          depthWrite={false}
          opacity={active ? 0.78 : 0.28}
          transparent
        />
      </mesh>
    </group>
  );
}

function Tomato({
  categories,
  fruit,
  highlightedCategoryId,
  isDragging,
  onDragStart,
  slot,
}: {
  categories: Map<string, Category>;
  fruit: TomatoFruit;
  highlightedCategoryId?: string;
  isDragging: boolean;
  onDragStart: (fruitId: string, anchorIndex: number, event: ThreeEvent<PointerEvent>) => void;
  slot: VineSlot;
}) {
  const [hovered, setHovered] = useState(false);
  const category = categories.get(fruit.categoryId);
  const visible = !highlightedCategoryId || highlightedCategoryId === fruit.categoryId;
  const opacity = visible ? 1 : 0.2;

  return (
    <group>
      <VineTube color="#46733d" opacity={0.86} points={[slot.vine, slot.root, slot.hanger, slot.fruit]} radius={0.0065} />
      <group position={slot.fruit} scale={isDragging || hovered ? 1.16 : 1}>
        <mesh
          onPointerDown={(event) => onDragStart(fruit.id, slot.index, event)}
          onPointerEnter={(event) => {
            event.stopPropagation();
            setHovered(true);
          }}
          onPointerLeave={(event) => {
            event.stopPropagation();
            setHovered(false);
          }}
        >
          <sphereGeometry args={[0.136, 30, 20]} />
          <meshStandardMaterial
            color={category?.color ?? "#d84d32"}
            metalness={0.02}
            opacity={opacity}
            roughness={0.42}
            transparent={opacity < 1}
          />
        </mesh>
        <mesh position={[0, 0.128, 0]} rotation={[0.15, 0, 0]} scale={[0.065, 0.012, 0.065]}>
          <sphereGeometry args={[1, 10, 6]} />
          <meshStandardMaterial color="#315f2b" opacity={opacity} roughness={0.72} transparent={opacity < 1} />
        </mesh>
        {fruit.variant === "striped" ? (
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.092, 0.007, 8, 30]} />
            <meshStandardMaterial color="#f4d36a" opacity={visible ? 0.9 : 0.14} roughness={0.5} transparent />
          </mesh>
        ) : null}
      </group>
    </group>
  );
}

function SceneCamera() {
  const { camera } = useThree();

  useEffect(() => {
    camera.lookAt(0, -0.04, 0);
    camera.updateProjectionMatrix();
  }, [camera]);

  return null;
}

function WildAir({ active, seed }: { active: boolean; seed: number }) {
  const group = useRef<THREE.Group>(null);
  const motes = useMemo(
    () =>
      Array.from({ length: 34 }, (_, index) => {
        const angle = seed * 0.001 + index * 1.87;
        const radius = 0.55 + (index % 7) * 0.08;

        return {
          position: [
            Math.cos(angle) * radius,
            -0.2 + (index % 11) * 0.18,
            Math.sin(angle) * radius * 0.36,
          ] as Vec3,
          scale: 0.006 + (index % 4) * 0.002,
        };
      }),
    [seed],
  );

  useFrame(({ clock }) => {
    if (!group.current) {
      return;
    }

    group.current.rotation.y = Math.sin(clock.elapsedTime * 0.15 + seed) * 0.28;
    group.current.position.y = Math.sin(clock.elapsedTime * 0.5) * 0.03;
  });

  if (!active) {
    return null;
  }

  return (
    <group ref={group}>
      {motes.map((mote, index) => (
        <mesh key={index} position={mote.position}>
          <sphereGeometry args={[mote.scale, 8, 6]} />
          <meshBasicMaterial color="#f2cf6f" opacity={0.26} transparent />
        </mesh>
      ))}
    </group>
  );
}

function GrowingShoot({ active, progress, seed }: { active: boolean; progress: number; seed: number }) {
  const group = useRef<THREE.Group>(null);
  const tipMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const base = useMemo(() => vinePoint(0.76, seed), [seed]);
  const shootPoints = useMemo<Vec3[]>(
    () => {
      const mid = vinePoint(0.9, seed);
      const tip = vinePoint(1, seed);

      return [
        [0, 0, 0],
        [mid[0] - base[0] + 0.07, mid[1] - base[1] + 0.08, mid[2] - base[2] + 0.012],
        [tip[0] - base[0] + 0.17, tip[1] - base[1] + 0.36, tip[2] - base[2] + 0.018],
      ];
    },
    [base, seed],
  );

  useFrame(({ clock }) => {
    if (!group.current) {
      return;
    }

    const pulse = (Math.sin(clock.elapsedTime * 1.8 + seed) + 1) / 2;
    const visibleGrowth = 0.54 + Math.max(progress, 0.08) * 0.3 + pulse * 0.36;
    group.current.scale.set(0.86 + pulse * 0.08, visibleGrowth, 0.86 + pulse * 0.08);
    group.current.rotation.z = Math.sin(clock.elapsedTime * 0.82 + seed) * 0.075;

    if (tipMaterial.current) {
      tipMaterial.current.opacity = 0.46 + pulse * 0.36;
    }
  });

  if (!active) {
    return null;
  }

  return (
    <group position={base} ref={group}>
      <VineTube color="#7fb96a" opacity={0.96} points={shootPoints} radius={0.014} />
      <Leaflet
        position={[shootPoints[1][0] - 0.08, shootPoints[1][1] + 0.05, shootPoints[1][2] + 0.03]}
        rotation={[0.55, -0.3, -0.8]}
        scale={0.88}
      />
      <Leaflet
        position={[shootPoints[1][0] + 0.09, shootPoints[1][1] + 0.13, shootPoints[1][2] - 0.025]}
        rotation={[0.62, 0.34, 0.82]}
        scale={0.8}
      />
      <Leaflet
        position={[shootPoints[2][0] - 0.04, shootPoints[2][1] - 0.08, shootPoints[2][2] + 0.018]}
        rotation={[0.5, -0.16, -0.42]}
        scale={0.56}
      />
      <mesh position={shootPoints[2]}>
        <sphereGeometry args={[0.058, 16, 12]} />
        <meshBasicMaterial color="#d9f0b9" opacity={0.58} ref={tipMaterial} transparent />
      </mesh>
    </group>
  );
}

function TreeScene({
  active = false,
  categories,
  commitDrag,
  dragging,
  fruits,
  highlightedCategoryId,
  progress = 0,
  rotationY,
  seed,
  setDragging,
  setRotationY,
}: TomatoTree3DProps & {
  commitDrag: () => void;
  dragging: DragState;
  rotationY: number;
  setDragging: React.Dispatch<React.SetStateAction<DragState>>;
  setRotationY: React.Dispatch<React.SetStateAction<number>>;
}) {
  const group = useRef<THREE.Group>(null);
  const rotate = useRef({ active: false, startRotation: 0, startX: 0 });
  const resolvedSeed = seed ?? 0;
  const categoryMap = useMemo(() => categoryById(categories), [categories]);
  const slots = useMemo(() => createVineSlots(resolvedSeed), [resolvedSeed]);
  const vinePoints = useMemo<Vec3[]>(
    () => Array.from({ length: 10 }, (_, index) => vinePoint(index / 9, resolvedSeed)),
    [resolvedSeed],
  );
  const leafAnchors = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => ({
        point: vinePoint(0.17 + index * 0.105, resolvedSeed),
        side: index % 2 === 0 ? -1 : 1,
      })),
    [resolvedSeed],
  );
  const occupiedAnchorIndexes = useMemo(() => {
    const indexes = new Set<number>();

    fruits.forEach((fruit) => {
      if (dragging?.fruitId !== fruit.id) {
        indexes.add(normalizeAnchorIndex(fruit.anchorIndex));
      }
    });

    return indexes;
  }, [dragging?.fruitId, fruits]);

  const nearestOpenSlot = useCallback(
    (worldPoint: THREE.Vector3) => {
      const localPoint = group.current
        ? group.current.worldToLocal(worldPoint.clone())
        : worldPoint.clone();
      const openSlots = slots.filter((slot) => !occupiedAnchorIndexes.has(slot.index));
      const candidates = openSlots.length > 0 ? openSlots : slots;

      return candidates.reduce((nearest, slot) => {
        const distance = localPoint.distanceToSquared(new THREE.Vector3(...slot.fruit));
        return distance < nearest.distance ? { distance, slot } : nearest;
      }, { distance: Number.POSITIVE_INFINITY, slot: candidates[0] }).slot;
    },
    [occupiedAnchorIndexes, slots],
  );

  const updateSnap = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (!dragging) {
        return;
      }

      const nextSlot = nearestOpenSlot(event.point);
      setDragging((current) =>
        current ? { ...current, snapAnchorIndex: nextSlot.index } : current,
      );
    },
    [dragging, nearestOpenSlot, setDragging],
  );

  useFrame(({ clock }) => {
    if (!group.current) {
      return;
    }

    group.current.rotation.y = rotationY + Math.sin(clock.elapsedTime * 0.4) * 0.035;
    group.current.rotation.z = Math.sin(clock.elapsedTime * 0.7 + resolvedSeed) * 0.01;
    group.current.scale.setScalar(0.72 + (active ? progress * 0.045 + Math.sin(clock.elapsedTime * 0.9) * 0.006 : 0));
  });

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (dragging) {
      event.stopPropagation();
      updateSnap(event);
      return;
    }

    if (!rotate.current.active) {
      return;
    }

    setRotationY(rotate.current.startRotation + (event.nativeEvent.clientX - rotate.current.startX) * 0.026);
  };

  const handlePointerUp = (event: ThreeEvent<PointerEvent>) => {
    if (dragging) {
      event.stopPropagation();
      commitDrag();
    }

    rotate.current.active = false;
  };

  const handlePlanePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (dragging) {
      return;
    }

    event.stopPropagation();
    rotate.current = {
      active: true,
      startRotation: rotationY,
      startX: event.nativeEvent.clientX,
    };
  };

  const handleFruitDragStart = (
    fruitId: string,
    anchorIndex: number,
    event: ThreeEvent<PointerEvent>,
  ) => {
    event.stopPropagation();
    setDragging({ fruitId, snapAnchorIndex: anchorIndex });
  };

  return (
    <>
      <SceneCamera />
      <ambientLight intensity={1.28} />
      <directionalLight intensity={1.45} position={[2.4, 4.8, 3.6]} />
      <directionalLight intensity={0.52} position={[-3.4, 2.4, -2.2]} />
      <WildAir active={active} seed={resolvedSeed} />
      <group
        onPointerCancel={handlePointerUp}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        position={[0, -0.68, 0]}
        ref={group}
        rotation={[0.08, 0, 0]}
      >
        <mesh position={[0, -0.28, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[0.8, 0.5, 1]}>
          <circleGeometry args={[0.42, 34]} />
          <meshStandardMaterial color="#7b6847" roughness={0.92} />
        </mesh>
        <VineTube color="#56884a" points={vinePoints} radius={0.018} />
        <VineTube
          color="#9aa49d"
          opacity={0.62}
          points={[
            [-0.11, -0.34, -0.08],
            [-0.08, 0.58, -0.08],
            [-0.06, 1.96, -0.08],
          ]}
          radius={0.0055}
        />
        <VineTube
          color="#9aa49d"
          opacity={0.46}
          points={[
            [0.14, -0.32, 0.08],
            [0.11, 0.76, 0.08],
            [0.09, 1.84, 0.08],
          ]}
          radius={0.0048}
        />
        {leafAnchors.map((leaf, index) => (
          <CompoundLeaf
            anchor={leaf.point}
            key={index}
            seed={resolvedSeed + index}
            side={leaf.side}
          />
        ))}
        <GrowingShoot active={active} progress={progress} seed={resolvedSeed} />
        {slots.map((slot) => (
          <SlotMarker
            active={dragging?.snapAnchorIndex === slot.index}
            dragging={Boolean(dragging)}
            key={slot.index}
            occupied={occupiedAnchorIndexes.has(slot.index)}
            slot={slot}
          />
        ))}
        {fruits.map((fruit) => {
          const slot = slotForFruit(fruit, slots, dragging);

          return (
            <Tomato
              categories={categoryMap}
              fruit={fruit}
              highlightedCategoryId={highlightedCategoryId}
              isDragging={dragging?.fruitId === fruit.id}
              key={fruit.id}
              onDragStart={handleFruitDragStart}
              slot={slot}
            />
          );
        })}
        <mesh
          onPointerDown={handlePlanePointerDown}
          position={[0, 0.52, -0.52]}
          renderOrder={-1}
        >
          <planeGeometry args={[3.4, 3.8]} />
          <meshBasicMaterial depthWrite={false} opacity={0} transparent />
        </mesh>
      </group>
      <mesh position={[0, -1.11, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.6, 1.08, 1]}>
        <circleGeometry args={[0.48, 44]} />
        <meshBasicMaterial color="#1f1f1f" opacity={0.08} transparent />
      </mesh>
    </>
  );
}

export function TomatoTree3D(props: TomatoTree3DProps) {
  const [rotationY, setRotationY] = useState(0);
  const [dragging, setDragging] = useState<DragState>(null);
  const { onMoveFruitAnchor } = props;

  const commitDrag = useCallback(() => {
    if (!dragging) {
      return;
    }

    onMoveFruitAnchor?.(dragging.fruitId, dragging.snapAnchorIndex);
    setDragging(null);
  }, [dragging, onMoveFruitAnchor]);

  useEffect(() => {
    if (!dragging) {
      return;
    }

    const handleEnd = () => commitDrag();

    window.addEventListener("pointerup", handleEnd);
    window.addEventListener("pointercancel", handleEnd);

    return () => {
      window.removeEventListener("pointerup", handleEnd);
      window.removeEventListener("pointercancel", handleEnd);
    };
  }, [commitDrag, dragging]);

  return (
    <div
      aria-label={`3D tomato vine with ${props.fruits.length} tomatoes`}
      className={`tomato-tree-3d ${props.active ? "is-active-session" : ""}`}
      role="img"
    >
      <Canvas
        camera={{ position: [0, 0.48, 6.2], fov: 34, near: 0.1, far: 100 }}
        className="tomato-tree-canvas"
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true }}
      >
        <TreeScene
          {...props}
          commitDrag={commitDrag}
          dragging={dragging}
          rotationY={rotationY}
          setDragging={setDragging}
          setRotationY={setRotationY}
        />
      </Canvas>
    </div>
  );
}
