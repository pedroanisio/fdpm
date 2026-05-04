import { FDPMException } from "../errors/fdpm-exception.js";
import type { Position } from "./types.js";

const SEGMENT_BASE = 10_000;
const SEGMENT_WIDTH = 4;
const POSITION_PATTERN = /^\d{4}(?:\.\d{4})*$/;

export function isValidPosition(position: string): position is Position {
  return POSITION_PATTERN.test(position);
}

export function comparePositions(left: Position, right: Position): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function positionBetween(
  left: Position | null,
  right: Position | null,
): Position {
  if (left !== null && !isValidPosition(left)) {
    throw new FDPMException("verification", `invalid left position: ${left}`);
  }
  if (right !== null && !isValidPosition(right)) {
    throw new FDPMException("verification", `invalid right position: ${right}`);
  }
  if (left !== null && right !== null && comparePositions(left, right) >= 0) {
    throw new FDPMException(
      "conflict",
      `left position must sort before right position: ${left} !< ${right}`,
    );
  }
  const next = generateBetween(
    left === null ? [] : parsePosition(left),
    right === null ? [] : parsePosition(right),
    0,
    [],
  );
  return formatPosition(next);
}

function generateBetween(
  left: number[],
  right: number[],
  depth: number,
  prefix: number[],
): number[] {
  const lower = depth < left.length ? left[depth]! : 0;
  const upper = depth < right.length ? right[depth]! : SEGMENT_BASE;

  if (lower === upper) {
    return generateBetween(left, right, depth + 1, [...prefix, lower]);
  }
  if (upper - lower > 1) {
    return [...prefix, Math.floor((lower + upper) / 2)];
  }
  if (depth < left.length) {
    return generateBetween(left, [], depth + 1, [...prefix, lower]);
  }
  return [...prefix, lower, Math.floor(SEGMENT_BASE / 2)];
}

function parsePosition(position: Position): number[] {
  return position.split(".").map((segment) => {
    const value = Number.parseInt(segment, 10);
    if (!Number.isInteger(value) || value < 0 || value >= SEGMENT_BASE) {
      throw new FDPMException("verification", `invalid position segment: ${segment}`);
    }
    return value;
  });
}

function formatPosition(segments: number[]): Position {
  return segments
    .map((segment) => segment.toString().padStart(SEGMENT_WIDTH, "0"))
    .join(".") as Position;
}
