import { Point } from '../types';

/**
 * Solves Gaussian elimination for an 8x8 system of equations.
 */
function solveGaussian(M: number[][], B: number[]): number[] {
  const n = 8;
  const A: number[][] = [];
  for (let i = 0; i < n; i++) {
    A.push([...M[i], B[i]]);
  }

  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) {
        maxRow = k;
      }
    }

    const temp = A[i];
    A[i] = A[maxRow];
    A[maxRow] = temp;

    if (Math.abs(A[i][i]) < 1e-9) {
      throw new Error('Matrix is singular and cannot be solved.');
    }

    for (let k = i + 1; k < n; k++) {
      const c = -A[k][i] / A[i][i];
      for (let j = i; j <= n; j++) {
        if (i === j) {
          A[k][j] = 0;
        } else {
          A[k][j] += c * A[i][j];
        }
      }
    }
  }

  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = 0;
    for (let j = i + 1; j < n; j++) {
      sum += A[i][j] * x[j];
    }
    x[i] = (A[i][n] - sum) / A[i][i];
  }
  return x;
}

/**
 * Computes the 3x3 homography matrix coefficients [h0..h7] mapping srcPoints to dstPoints.
 * The matrix maps (x, y) in src to (u, v) in dst.
 */
export function solveHomography(src: Point[], dst: Point[]): number[] {
  const M: number[][] = [];
  const B: number[] = [];

  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];

    M.push([x, y, 1, 0, 0, 0, -x * u, -y * u]);
    B.push(u);

    M.push([0, 0, 0, x, y, 1, -x * v, -y * v]);
    B.push(v);
  }

  return solveGaussian(M, B);
}

/**
 * Checks if a point P is inside a convex quadrilateral ABCD.
 */
export function isPointInQuad(P: Point, corners: Point[]): boolean {
  const [A, B, C, D] = corners;

  const crossProduct = (p1: Point, p2: Point, p3: Point) => {
    return (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
  };

  const cp1 = crossProduct(A, B, P);
  const cp2 = crossProduct(B, C, P);
  const cp3 = crossProduct(C, D, P);
  const cp4 = crossProduct(D, A, P);

  // Since corners are clockwise or counter-clockwise, all cross products must have the same sign
  const allPositive = cp1 >= 0 && cp2 >= 0 && cp3 >= 0 && cp4 >= 0;
  const allNegative = cp1 <= 0 && cp2 <= 0 && cp3 <= 0 && cp4 <= 0;

  return allPositive || allNegative;
}

/**
 * Verifies if the 4 points form a valid convex quadrilateral.
 */
export function isConvex(p: Point[]): boolean {
  if (p.length !== 4) return false;

  const crossProduct = (a: Point, b: Point, c: Point) => {
    return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
  };

  const cp0 = crossProduct(p[3], p[0], p[1]);
  const cp1 = crossProduct(p[0], p[1], p[2]);
  const cp2 = crossProduct(p[1], p[2], p[3]);
  const cp3 = crossProduct(p[2], p[3], p[0]);

  const allPositive = cp0 > 0 && cp1 > 0 && cp2 > 0 && cp3 > 0;
  const allNegative = cp0 < 0 && cp1 < 0 && cp2 < 0 && cp3 < 0;

  return allPositive || allNegative;
}

/**
 * Warps a flat canvas image onto a target quadrilateral using inverse homography and bilinear interpolation.
 */
export function warpCanvasPerspective(
  sourceCanvas: HTMLCanvasElement,
  corners: Point[]
): HTMLCanvasElement {
  // 1. Verify exactly four corners
  if (!corners || corners.length !== 4) {
    throw new Error('Perspective homography requires exactly four corner points.');
  }

  // 2. Verify all coordinates are finite numbers
  const isFinitePoint = (pt: Point) => Number.isFinite(pt.x) && Number.isFinite(pt.y);
  if (!corners.every(isFinitePoint)) {
    throw new Error('Perspective homography contains non-finite corner coordinates.');
  }

  const srcW = sourceCanvas.width;
  const srcH = sourceCanvas.height;

  // 3. Verify source canvas is valid
  if (srcW <= 0 || srcH <= 0) {
    throw new Error(`Invalid source canvas dimensions: ${srcW}x${srcH}`);
  }

  // 4. Verify quadrilateral is convex
  if (!isConvex(corners)) {
    throw new Error('Perspective homography corners do not form a convex quadrilateral.');
  }

  // Bounding box of destination quadrilateral
  const minX = Math.min(...corners.map((p) => p.x));
  const maxX = Math.max(...corners.map((p) => p.x));
  const minY = Math.min(...corners.map((p) => p.y));
  const maxY = Math.max(...corners.map((p) => p.y));

  const bboxW = Math.max(1, Math.ceil(maxX - minX));
  const bboxH = Math.max(1, Math.ceil(maxY - minY));

  // 5. Cap size to prevent memory allocation failures
  const MAX_BBOX_DIM = 8000;
  if (bboxW > MAX_BBOX_DIM || bboxH > MAX_BBOX_DIM) {
    throw new Error(`Perspective bounding box dimensions exceed safety cap: ${bboxW}x${bboxH}`);
  }

  // Destination canvas
  const destCanvas = document.createElement('canvas');
  destCanvas.width = bboxW;
  destCanvas.height = bboxH;
  const destCtx = destCanvas.getContext('2d');
  if (!destCtx) {
    throw new Error('Could not create destination canvas 2d context.');
  }

  const destImageData = destCtx.createImageData(bboxW, bboxH);
  const destData = destImageData.data;

  // Get source image data
  const srcCtx = sourceCanvas.getContext('2d');
  if (!srcCtx) {
    throw new Error('Could not create source canvas 2d context.');
  }
  const srcImageData = srcCtx.getImageData(0, 0, srcW, srcH);
  const srcData = srcImageData.data;

  // Target flat corners mapping to the 4 input corners
  const flatCorners: Point[] = [
    { x: 0, y: 0 },
    { x: srcW, y: 0 },
    { x: srcW, y: srcH },
    { x: 0, y: srcH },
  ];

  // We want the inverse mapping: from destination (corners) to source (flatCorners)
  // Solve homography: dstPoints -> srcPoints
  let h: number[];
  try {
    h = solveHomography(corners, flatCorners);
  } catch (error) {
    throw new Error(
      `Perspective homography failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  // Iterate over destination bounding box
  for (let y = 0; y < bboxH; y++) {
    for (let x = 0; x < bboxW; x++) {
      const destX = x + minX;
      const destY = y + minY;

      const P = { x: destX, y: destY };
      if (!isPointInQuad(P, corners)) {
        continue; // Transparent pixel outside quadrilateral
      }

      // Map back to source coordinates using homography
      const den = h[6] * destX + h[7] * destY + 1;
      if (Math.abs(den) < 1e-9) continue;

      const srcX = (h[0] * destX + h[1] * destY + h[2]) / den;
      const srcY = (h[3] * destX + h[4] * destY + h[5]) / den;

      // Sample color using Bilinear Interpolation
      if (srcX >= 0 && srcX < srcW && srcY >= 0 && srcY < srcH) {
        const x0 = Math.floor(srcX);
        const y0 = Math.floor(srcY);
        const x1 = Math.min(srcW - 1, x0 + 1);
        const y1 = Math.min(srcH - 1, y0 + 1);

        const dx = srcX - x0;
        const dy = srcY - y0;

        const idx00 = (y0 * srcW + x0) * 4;
        const idx10 = (y0 * srcW + x1) * 4;
        const idx01 = (y1 * srcW + x0) * 4;
        const idx11 = (y1 * srcW + x1) * 4;

        const destIdx = (y * bboxW + x) * 4;

        // Perform interpolation for each channel (R, G, B, A)
        for (let c = 0; c < 4; c++) {
          const c00 = srcData[idx00 + c];
          const c10 = srcData[idx10 + c];
          const c01 = srcData[idx01 + c];
          const c11 = srcData[idx11 + c];

          const val =
            (1 - dx) * (1 - dy) * c00 +
            dx * (1 - dy) * c10 +
            (1 - dx) * dy * c01 +
            dx * dy * c11;

          destData[destIdx + c] = Math.round(val);
        }
      }
    }
  }

  destCtx.putImageData(destImageData, 0, 0);
  return destCanvas;
}
