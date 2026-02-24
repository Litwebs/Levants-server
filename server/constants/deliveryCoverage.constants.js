// Public delivery coverage (outward codes / districts)
// Stored as uppercase strings for fast exact lookup.

const DELIVERABLE_OUTWARD_CODES = new Set([
  // Bradford
  "BD1",
  "BD2",
  "BD3",
  "BD4",
  "BD5",
  "BD6",
  "BD7",
  "BD8",
  "BD9",
  "BD10",
  "BD11",
  "BD12",
  "BD13",
  "BD14",
  "BD15",
  "BD16",
  "BD18",

  // Wakefield
  "WF12",
  "WF13",
  "WF14",
  "WF15",
  "WF16",
  "WF17",

  // Halifax
  "HX1",
  "HX3",

  // Leeds
  "LS28",
]);

module.exports = {
  DELIVERABLE_OUTWARD_CODES,
};
