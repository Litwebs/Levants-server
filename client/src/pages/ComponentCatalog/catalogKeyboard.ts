export type KeyboardCheck = {
  keys: string[];
  expected: string;
};

export type KeyboardProfile = {
  title: string;
  checks: KeyboardCheck[];
  observations: string[];
};

const profiles: Record<string, KeyboardProfile> = {
  Button: {
    title: "Native button keyboard behaviour",
    checks: [
      { keys: ["Tab"], expected: "Moves focus to the button when it is enabled." },
      { keys: ["Enter"], expected: "Activates the focused button." },
      { keys: ["Space"], expected: "Activates the focused button using native button semantics." },
      { keys: ["Shift", "Tab"], expected: "Moves focus to the previous focusable control." },
    ],
    observations: [
      "The shared Button renders a native <button>, so activation semantics come from the browser.",
      "Loading and disabled states set the native disabled attribute and should remove the button from normal tab order.",
    ],
  },
  Input: {
    title: "Native text-field keyboard behaviour",
    checks: [
      { keys: ["Tab"], expected: "Moves focus into the input." },
      { keys: ["Type"], expected: "Edits the value using the native input behaviour for the selected type." },
      { keys: ["Shift", "Tab"], expected: "Moves focus back to the previous control." },
    ],
    observations: [
      "The label is connected with htmlFor/id when a label is provided.",
      "Keyboard behaviour otherwise follows the native <input> element.",
    ],
  },
  Select: {
    title: "Native select keyboard behaviour",
    checks: [
      { keys: ["Tab"], expected: "Moves focus to the select." },
      { keys: ["ArrowUp", "ArrowDown"], expected: "Moves through native options using browser/platform behaviour." },
      { keys: ["Home", "End"], expected: "Moves toward the first or last option where supported by the platform." },
      { keys: ["Enter", "Space"], expected: "Opens or confirms the native select according to browser/platform behaviour." },
    ],
    observations: [
      "The component uses a native <select>, so detailed key behaviour can vary slightly by browser and operating system.",
    ],
  },
  CreateSearch: {
    title: "Search and suggestion keyboard behaviour",
    checks: [
      { keys: ["Tab"], expected: "Moves from the search input to the clear button and visible suggestion buttons." },
      { keys: ["Enter", "Space"], expected: "Activates the currently focused clear or suggestion button." },
    ],
    observations: [
      "Suggestions are rendered as regular buttons, so they are reachable with Tab.",
      "ArrowDown/ArrowUp listbox-style suggestion navigation is not implemented in the current component source.",
    ],
  },
  Badge: {
    title: "Non-interactive display component",
    checks: [],
    observations: [
      "Badge renders a non-focusable <span> and is not intended to receive keyboard interaction.",
    ],
  },
  Skeleton: {
    title: "Non-interactive loading placeholder",
    checks: [],
    observations: [
      "Skeleton and SkeletonText do not expose interactive keyboard controls.",
    ],
  },
  Card: {
    title: "Surface keyboard behaviour",
    checks: [
      { keys: ["Tab"], expected: "Moves through any focusable controls composed inside the Card." },
    ],
    observations: [
      "Card itself renders a <div>.",
      "When onClick is supplied, the current Card source does not add tabIndex, role, Enter handling, or Space handling. A clickable Card therefore needs accessibility review.",
    ],
  },
  Modal: {
    title: "Dialog keyboard behaviour",
    checks: [
      { keys: ["Escape"], expected: "Closes the open Modal." },
      { keys: ["Tab"], expected: "Moves among focusable controls currently rendered in the Modal." },
      { keys: ["Shift", "Tab"], expected: "Moves backward among focusable controls." },
    ],
    observations: [
      "Escape-to-close is implemented by a window keydown listener.",
      "The current Modal source does not implement an initial-focus strategy or a focus trap.",
      "The modal container does not currently declare role=dialog or aria-modal.",
    ],
  },
  Tabs: {
    title: "Tab-switcher keyboard behaviour",
    checks: [
      { keys: ["Tab"], expected: "Moves focus between the trigger buttons using normal document tab order." },
      { keys: ["Enter", "Space"], expected: "Activates the focused trigger because each trigger is a native button." },
    ],
    observations: [
      "TabsTrigger renders native buttons.",
      "ArrowLeft/ArrowRight/Home/End navigation expected from the ARIA tabs pattern is not implemented in the current source.",
      "The current Tabs primitives do not declare tablist/tab/tabpanel ARIA roles.",
    ],
  },
  PageToolbar: {
    title: "Composed toolbar keyboard behaviour",
    checks: [
      { keys: ["Tab"], expected: "Moves through the toolbar's composed inputs, tag buttons, and actions." },
      { keys: ["Enter", "Space"], expected: "Activates focused TagFilters and Button controls." },
    ],
    observations: [
      "PageToolbar is a layout primitive; keyboard semantics primarily come from its child controls.",
      "TagFilters render native buttons.",
    ],
  },
  Toast: {
    title: "Notification keyboard behaviour",
    checks: [
      { keys: ["Tab"], expected: "Can reach a toast dismiss button when it enters normal document tab order." },
      { keys: ["Enter", "Space"], expected: "Dismisses the toast when its dismiss button is focused." },
    ],
    observations: [
      "Each toast has a native dismiss button with an aria-label.",
      "The current toast container does not move focus to newly created notifications.",
    ],
  },
  LoadingScreen: {
    title: "Blocking status keyboard behaviour",
    checks: [],
    observations: [
      "LoadingScreen has role=status and aria-live=polite.",
      "It does not expose interactive keyboard controls.",
    ],
  },
  Table: {
    title: "Data-table keyboard behaviour",
    checks: [
      { keys: ["Tab"], expected: "Moves through native interactive controls placed inside table cells." },
    ],
    observations: [
      "Sortable TableHead currently places onClick directly on <th> without keyboard focus or Enter/Space handling.",
      "Clickable TableRow currently places onClick directly on <tr> without keyboard focus or Enter/Space handling.",
      "Those interactive table states should be treated as keyboard-accessibility gaps until semantics are added.",
    ],
  },
  DataTableCard: {
    title: "Paginated table keyboard behaviour",
    checks: [
      { keys: ["Tab"], expected: "Moves through page-size Select and pagination Buttons." },
      { keys: ["ArrowUp", "ArrowDown"], expected: "Changes the focused native page-size select according to platform behaviour." },
      { keys: ["Enter", "Space"], expected: "Activates focused Prev/Next buttons." },
    ],
    observations: [
      "Pagination controls reuse the shared native Button and Select primitives.",
      "Keyboard behaviour inside the supplied table content depends on the table/content composition.",
    ],
  },
  FormGrid: {
    title: "Form-layout keyboard behaviour",
    checks: [
      { keys: ["Tab"], expected: "Moves through interactive form controls composed inside FormRows." },
      { keys: ["Shift", "Tab"], expected: "Moves backward through the composed controls." },
    ],
    observations: [
      "FormGrid is a layout primitive; it does not create interactive controls itself.",
      "FormRow can associate a label with a child control through htmlFor when supplied.",
    ],
  },
  FiltersCardLayout: {
    title: "Filter-layout keyboard behaviour",
    checks: [
      { keys: ["Tab"], expected: "Moves through controls supplied in the top row and expanded content." },
    ],
    observations: [
      "FiltersCardLayout is a layout primitive; keyboard behaviour is defined by the controls supplied by each feature.",
    ],
  },
};

const fallbackProfile: KeyboardProfile = {
  title: "Keyboard behaviour",
  checks: [
    { keys: ["Tab"], expected: "Move through focusable descendants and verify the visible focus order." },
    { keys: ["Shift", "Tab"], expected: "Move backward through focusable descendants." },
  ],
  observations: [
    "No component-specific keyboard profile is registered yet. Use the event log and focus-order scanner to inspect the rendered component.",
  ],
};

export function getKeyboardProfile(moduleName: string): KeyboardProfile {
  return profiles[moduleName] ?? fallbackProfile;
}
