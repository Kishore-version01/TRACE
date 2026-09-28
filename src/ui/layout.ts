export interface NodeCoord {
  x: number;
  y: number;
}

/**
 * Fixed layout coordinates for SAMPLE_NETWORK in a 1000x600 viewBox.
 * Visualized as three distinct transit lines crossing at J1 (Central Junction)
 * and J2 (West Junction).
 */
export const NETWORK_LAYOUT: Record<string, NodeCoord> = {
  // Red Line loop (crosses at J1)
  R1: { x: 600, y: 100 },
  R2: { x: 760, y: 180 },
  J1: { x: 700, y: 300 },
  R3: { x: 760, y: 420 },
  R4: { x: 600, y: 500 },

  // Blue Line (horizontal, crosses J1 and J2)
  B3: { x: 120, y: 300 },
  J2: { x: 340, y: 300 },
  B2: { x: 520, y: 300 },
  B1: { x: 880, y: 300 },

  // Green Line (diagonal, crosses at J2)
  G1: { x: 200, y: 120 },
  G2: { x: 240, y: 460 },
  G3: { x: 130, y: 520 },
};
