// Skyharbor Run — shared tuning: world size, flight model numbers, colours and the fixed
// simulation step the screenshot scenes rely on. Everything the other modules need to agree on
// lives here so the game plays the same in the browser and in the staged screenshot scenes.

/** Fixed simulation step (seconds). The game and the shot scenes both advance in these. */
export const STEP = 1 / 60;

/** The world is a square of ocean WORLD.size metres across, centred on the origin. */
export const WORLD = {
  size: 4800,
  seaLevel: 0,
  /** Terrain mesh resolution: GRID_N x GRID_N vertices, GRID_STEP metres apart. */
  gridN: 65,
  gridStep: 75,
};

/** The island the harbour, town and airfield sit on. */
export const ISLAND = {
  centreX: 200,
  centreZ: 300,
  radius: 1750,
  domeHeight: 55,
};

/** Runway 36: a north-south strip on the flattened west plateau. Heading 0 (north) to land. */
export const RUNWAY = {
  centreX: -650,
  centreZ: 350,
  length: 1000,
  width: 46,
  plateauHeight: 26,
  heading: 0,
};

/** Flight model limits and feel. Speeds in m/s, angles in radians. */
export const PLANE = {
  stallSpeed: 24,
  rotateSpeed: 30,
  maxSpeed: 118,
  maxThrottleAccel: 14,
  pitchRate: 1.15,
  rollRate: 1.9,
  maxPitch: 0.55,
  minPitch: -0.5,
  maxRoll: 1.15,
  wheelHeight: 1.7,
  bellyHeight: 0.9,
  fuelCapacity: 100,
  fuelBurnPerSecond: 0.42,
};

/** The ring course: pass them in order, then land. Ring radius in metres. */
export const COURSE = { ringRadius: 26, ringCount: 8 };

/** Score values: a sortie is rings, centre bonuses, a landing grade and a time bonus. */
export const SCORE = {
  ring: 150,
  ringCentreBonus: 100,
  landingPerfect: 500,
  landingSmooth: 350,
  landingHard: 150,
  timeBonusPerSecond: 2,
  timeBonusPar: 300,
};

/** Sky and light: one late-afternoon sun for the whole sortie. */
export const SKY = {
  top: '#2f6fb4',
  mid: '#7db3e0',
  horizon: '#f6c98a',
  fog: '#cfdde8',
  sunDirection: { x: -0.45, y: 0.62, z: -0.64 },
};
