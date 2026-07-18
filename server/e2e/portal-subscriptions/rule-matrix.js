"use strict";

/**
 * Executable transcription of the 54 populated rows in
 * docs/Subscription Rules.xlsx, sheet "Rules Matrix".
 *
 * The source workbook is the product specification. This module deliberately
 * preserves source wording where it conflicts with another workbook cell and
 * supplies a normalized E2E expectation separately.
 */

const WORKBOOK_PATH = "docs/Subscription Rules.xlsx";
const WORKBOOK_SHEET = "Rules Matrix";

const CADENCES = Object.freeze({
  WEEKLY_SINGLE_DAY: "weekly-single-day",
  WEEKLY_MULTI_DAY: "weekly-multi-day",
  FORTNIGHTLY: "fortnightly",
});

const CADENCE_LABELS = Object.freeze({
  [CADENCES.WEEKLY_SINGLE_DAY]: "Weekly (Single Day)",
  [CADENCES.WEEKLY_MULTI_DAY]: "Weekly (Multi-Day)",
  [CADENCES.FORTNIGHTLY]: "Fortnightly",
});

const ACTIONS = Object.freeze({
  ADD_ITEM: "add-item",
  INCREASE_QUANTITY: "increase-existing-item-quantity",
  REMOVE_ITEM: "remove-item",
  DECREASE_QUANTITY: "decrease-quantity",
  CANCEL: "cancel-subscription",
  PAUSE: "pause-subscription",
  RESUME: "resume-subscription",
});

const ACTION_LABELS = Object.freeze({
  [ACTIONS.ADD_ITEM]: "Add Item",
  [ACTIONS.INCREASE_QUANTITY]: "Increase existing item quantity",
  [ACTIONS.REMOVE_ITEM]: "Remove Item",
  [ACTIONS.DECREASE_QUANTITY]: "Decrease Quantity",
  [ACTIONS.CANCEL]: "Cancel subscription",
  [ACTIONS.PAUSE]: "Pause subscription",
  [ACTIONS.RESUME]: "Resume subscription",
});

const TIMINGS = Object.freeze({
  BEFORE_CUTOFF: "before-cutoff",
  AFTER_CUTOFF: "after-cutoff",
  RESUME_OPEN: "resume-date-next-delivery-open",
  RESUME_LOCKED: "resume-date-next-delivery-locked",
});

const FUNDS = Object.freeze({
  SUFFICIENT: "sufficient",
  INSUFFICIENT: "insufficient",
  NOT_APPLICABLE: "not-applicable",
  CONDITIONAL: "conditional-if-extra-payment-required",
});

const TEST_FAMILIES = Object.freeze({
  ADD_BEFORE_FUNDED: "add-before-funded",
  ADD_BEFORE_DECLINED: "add-before-declined",
  REMOVE_BEFORE: "remove-before",
  ADD_AFTER_FUNDED: "add-after-funded",
  ADD_AFTER_DECLINED: "add-after-declined",
  REMOVE_AFTER: "remove-after",
  CANCEL_BEFORE: "cancel-before",
  CANCEL_AFTER: "cancel-after",
  PAUSE_BEFORE: "pause-before",
  PAUSE_AFTER: "pause-after",
  RESUME_OPEN: "resume-open",
  RESUME_LOCKED: "resume-locked",
});

const SPEC_CONFLICTS = Object.freeze({
  AFTER_CUTOFF_CHARGE_TIMING: "after-cutoff-charge-timing",
  MISSING_ROW_32_OUTCOME: "missing-row-32-outcome",
  REFUND_VS_CREDIT_POLICY: "refund-vs-credit-policy",
  PAUSE_RESUME_DATE_INCLUSIVITY: "pause-resume-date-inclusivity",
});

const FAMILY_DEFINITIONS = Object.freeze({
  [TEST_FAMILIES.ADD_BEFORE_FUNDED]: Object.freeze({
    eventGroup: "Adding BEFORE CUT-OFF",
    eventType: "Edit Subscription",
    timing: TIMINGS.BEFORE_CUTOFF,
    timingCondition: "Before cut-off for the affected delivery",
    funds: FUNDS.SUFFICIENT,
    sufficientFunds: "YES",
    resumeOrEndCondition: "—",
    effectiveScope:
      "All upcoming deliveries whose cut-off has not passed",
    workbookPaymentAction: "Immediate charge for affected deliveries",
    paymentExpectation: "immediate-incremental-charge-before-mutation",
    expectedOutcome:
      "Apply to all upcoming eligible deliveries immediately; charge customer card immediately for the incremental value.",
    implementationNote:
      "For multi-day subscriptions, apply per delivery day, not by a single billing boundary.",
    tested: true,
    conflicts: Object.freeze([]),
  }),
  [TEST_FAMILIES.ADD_BEFORE_DECLINED]: Object.freeze({
    eventGroup: "Adding BEFORE CUT-OFF",
    eventType: "Edit Subscription",
    timing: TIMINGS.BEFORE_CUTOFF,
    timingCondition: "Before cut-off for the affected delivery",
    funds: FUNDS.INSUFFICIENT,
    sufficientFunds: "NO",
    resumeOrEndCondition: "—",
    effectiveScope:
      "All upcoming deliveries whose cut-off has not passed",
    workbookPaymentAction:
      "No charge; no subscription change until payment succeeds",
    paymentExpectation: "no-mutation-until-successful-payment",
    expectedOutcome:
      "Do not apply the change; show insufficient funds and let customer retry.",
    implementationNote: "Avoid adding unpaid items to any future order.",
    tested: true,
    conflicts: Object.freeze([]),
  }),
  [TEST_FAMILIES.REMOVE_BEFORE]: Object.freeze({
    eventGroup: "Removing BEFORE CUT-OFF",
    eventType: "Edit Subscription",
    timing: TIMINGS.BEFORE_CUTOFF,
    timingCondition: "Before cut-off for the affected delivery",
    funds: FUNDS.NOT_APPLICABLE,
    sufficientFunds: "—",
    resumeOrEndCondition: "—",
    effectiveScope:
      "All upcoming deliveries whose cut-off has not passed",
    workbookPaymentAction:
      "Immediate refund or account credit for affected paid deliveries",
    paymentExpectation: "immediate-refund-or-credit-for-changed-paid-deliveries",
    expectedOutcome:
      "Remove/decrease from eligible upcoming deliveries and refund/credit the customer immediately.",
    implementationNote:
      "Locked deliveries are excluded only if their cut-off has already passed.",
    tested: true,
    conflicts: Object.freeze([SPEC_CONFLICTS.REFUND_VS_CREDIT_POLICY]),
  }),
  [TEST_FAMILIES.ADD_AFTER_FUNDED]: Object.freeze({
    eventGroup: "Adding AFTER CUT-OFF",
    eventType: "Edit Subscription",
    timing: TIMINGS.AFTER_CUTOFF,
    timingCondition: "After cut-off for at least one delivery",
    funds: FUNDS.SUFFICIENT,
    sufficientFunds: "YES",
    resumeOrEndCondition: "—",
    effectiveScope:
      "Next eligible delivery whose cut-off has not passed, plus future deliveries",
    workbookPaymentAction:
      "Next invoice charge for affected future deliveries only",
    paymentExpectation:
      "per-day-cutoff: charge open delivery days now; stage locked delivery days for the next invoice",
    expectedOutcome:
      "For multi-day subscriptions, apply and charge open days while staging locked days; otherwise stage the change and update the next invoice without charging immediately.",
    implementationNote:
      "A multi-day edit uses one settlement for the combined delta of its open affected days and keeps one recurring subscription bill.",
    tested: true,
    conflicts: Object.freeze([]),
  }),
  [TEST_FAMILIES.ADD_AFTER_DECLINED]: Object.freeze({
    eventGroup: "Adding AFTER CUT-OFF",
    eventType: "Edit Subscription",
    timing: TIMINGS.AFTER_CUTOFF,
    timingCondition: "After cut-off for at least one delivery",
    funds: FUNDS.INSUFFICIENT,
    sufficientFunds: "NO",
    resumeOrEndCondition: "—",
    effectiveScope:
      "Next eligible delivery whose cut-off has not passed, plus future deliveries",
    workbookPaymentAction:
      "Next invoice charge for affected future deliveries only",
    paymentExpectation:
      "per-day-cutoff: decline the atomic edit when an open-day settlement fails; otherwise stage without immediate payment",
    expectedOutcome:
      "For multi-day subscriptions, reject the atomic edit if payment for an open affected day fails; otherwise stage the change for the next invoice.",
    implementationNote:
      "Locked and open delivery days remain independently cut off, but the customer has one subscription transaction rather than a separate bill per day.",
    tested: true,
    conflicts: Object.freeze([]),
  }),
  [TEST_FAMILIES.REMOVE_AFTER]: Object.freeze({
    eventGroup: "Removing AFTER CUT-OFF",
    eventType: "Edit Subscription",
    timing: TIMINGS.AFTER_CUTOFF,
    timingCondition: "After cut-off for at least one delivery",
    funds: FUNDS.NOT_APPLICABLE,
    sufficientFunds: "—",
    resumeOrEndCondition: "—",
    effectiveScope:
      "Skip locked deliveries; apply to next eligible delivery whose cut-off has not passed, plus future deliveries",
    workbookPaymentAction:
      "Refund or account credit only for affected paid deliveries not locked by cut-off",
    paymentExpectation:
      "refund-or-credit-only-for-changed-paid-unlocked-deliveries",
    expectedOutcome:
      "Current locked delivery remains unchanged; remove/decrease from the next eligible delivery onward.",
    implementationNote:
      "Do not refund a delivery that is already locked unless you allow support exceptions.",
    tested: true,
    conflicts: Object.freeze([SPEC_CONFLICTS.REFUND_VS_CREDIT_POLICY]),
  }),
  [TEST_FAMILIES.CANCEL_BEFORE]: Object.freeze({
    eventGroup: "Cancellation BEFORE CUT-OFF",
    eventType: "Cancel Subscription",
    timing: TIMINGS.BEFORE_CUTOFF,
    timingCondition: "Before cut-off for affected upcoming deliveries",
    funds: FUNDS.NOT_APPLICABLE,
    sufficientFunds: "—",
    resumeOrEndCondition: "Cancel immediately / no resume date",
    effectiveScope:
      "All upcoming deliveries whose cut-off has not passed",
    workbookPaymentAction:
      "Immediate refund or account credit for paid eligible deliveries",
    paymentExpectation: "immediate-refund-or-credit-for-paid-eligible-deliveries",
    expectedOutcome:
      "Cancel from the current eligible delivery onward; no further deliveries after cancellation takes effect.",
    implementationNote:
      "If multiple delivery days exist, only deliveries before cut-off are cancellable.",
    tested: true,
    conflicts: Object.freeze([SPEC_CONFLICTS.REFUND_VS_CREDIT_POLICY]),
  }),
  [TEST_FAMILIES.CANCEL_AFTER]: Object.freeze({
    eventGroup: "Cancellation AFTER CUT-OFF",
    eventType: "Cancel Subscription",
    timing: TIMINGS.AFTER_CUTOFF,
    timingCondition: "After cut-off for at least one upcoming delivery",
    funds: FUNDS.NOT_APPLICABLE,
    sufficientFunds: "—",
    resumeOrEndCondition: "Cancel immediately / no resume date",
    effectiveScope:
      "Locked delivery still proceeds; cancellation applies from next eligible delivery",
    workbookPaymentAction:
      "Refund or account credit only for paid deliveries not locked",
    paymentExpectation: "refund-or-credit-only-for-paid-unlocked-deliveries",
    expectedOutcome:
      "Customer may still receive the locked delivery; no further deliveries after the next eligible cancellation point.",
    implementationNote:
      "Clearly message that the next delivery cannot be cancelled because cut-off has passed.",
    tested: true,
    conflicts: Object.freeze([SPEC_CONFLICTS.REFUND_VS_CREDIT_POLICY]),
  }),
  [TEST_FAMILIES.PAUSE_BEFORE]: Object.freeze({
    eventGroup: "Pause BEFORE CUT-OFF",
    eventType: "Pause Subscription",
    timing: TIMINGS.BEFORE_CUTOFF,
    timingCondition: "Before cut-off for affected upcoming deliveries",
    funds: FUNDS.NOT_APPLICABLE,
    sufficientFunds: "—",
    resumeOrEndCondition: "Customer selects resume date",
    effectiveScope: "Pause all eligible deliveries from now until resume date",
    workbookPaymentAction:
      "Immediate refund or account credit for paid eligible paused deliveries",
    paymentExpectation:
      "immediate-refund-or-credit-for-paid-eligible-paused-deliveries",
    expectedOutcome:
      "Skip eligible deliveries during pause period; resume on the first scheduled delivery on/after the selected resume date whose cut-off has not passed.",
    implementationNote:
      "If resume date falls between delivery days, resume at the next scheduled delivery day.",
    tested: null,
    conflicts: Object.freeze([
      SPEC_CONFLICTS.REFUND_VS_CREDIT_POLICY,
      SPEC_CONFLICTS.PAUSE_RESUME_DATE_INCLUSIVITY,
    ]),
  }),
  [TEST_FAMILIES.PAUSE_AFTER]: Object.freeze({
    eventGroup: "Pause AFTER CUT-OFF",
    eventType: "Pause Subscription",
    timing: TIMINGS.AFTER_CUTOFF,
    timingCondition: "After cut-off for at least one upcoming delivery",
    funds: FUNDS.NOT_APPLICABLE,
    sufficientFunds: "—",
    resumeOrEndCondition: "Customer selects resume date",
    effectiveScope:
      "Locked delivery still proceeds; pause applies to next eligible delivery through resume date",
    workbookPaymentAction:
      "Refund or account credit only for paid paused deliveries not locked",
    paymentExpectation:
      "refund-or-credit-only-for-paid-paused-unlocked-deliveries",
    expectedOutcome:
      "Do not pause the locked delivery; pause begins at the next eligible delivery and resumes based on selected date.",
    implementationNote:
      "Message the customer which delivery is locked and which deliveries will be skipped.",
    tested: null,
    conflicts: Object.freeze([
      SPEC_CONFLICTS.REFUND_VS_CREDIT_POLICY,
      SPEC_CONFLICTS.PAUSE_RESUME_DATE_INCLUSIVITY,
    ]),
  }),
  [TEST_FAMILIES.RESUME_OPEN]: Object.freeze({
    eventGroup: "Resume FROM PAUSE",
    eventType: "Resume Subscription",
    timing: TIMINGS.RESUME_OPEN,
    timingCondition: "Resume date selected by customer",
    funds: FUNDS.CONDITIONAL,
    sufficientFunds: "YES if extra payment required",
    resumeOrEndCondition:
      "Resume date is before or on an eligible delivery cut-off",
    effectiveScope:
      "First scheduled delivery on/after resume date whose cut-off has not passed",
    workbookPaymentAction:
      "Charge immediately only if resuming creates additional payable deliveries not already paid",
    paymentExpectation:
      "charge-immediately-only-for-additional-unpaid-deliveries-before-resume",
    expectedOutcome:
      "Subscription resumes on the first eligible scheduled delivery; future deliveries continue normally.",
    implementationNote:
      "Usually no charge if customer already paid before pause and received credit; otherwise collect balance before resuming.",
    tested: null,
    conflicts: Object.freeze([SPEC_CONFLICTS.REFUND_VS_CREDIT_POLICY]),
  }),
  [TEST_FAMILIES.RESUME_LOCKED]: Object.freeze({
    eventGroup: "Resume FROM PAUSE",
    eventType: "Resume Subscription",
    timing: TIMINGS.RESUME_LOCKED,
    timingCondition:
      "Resume date selected by customer but next delivery cut-off has passed",
    funds: FUNDS.NOT_APPLICABLE,
    sufficientFunds: "—",
    resumeOrEndCondition:
      "Resume date falls after cut-off for the next scheduled delivery",
    effectiveScope:
      "Skip locked/closed delivery; resume on following eligible scheduled delivery",
    workbookPaymentAction:
      "Charge/refund adjustment based on actual affected deliveries",
    paymentExpectation: "adjust-payment-only-for-actually-affected-deliveries",
    expectedOutcome:
      "Do not alter a delivery whose cut-off has passed; resume at the next open delivery.",
    implementationNote:
      "This prevents operational changes after fulfilment planning has locked.",
    tested: null,
    conflicts: Object.freeze([]),
  }),
});

const SOURCE_ROWS = Object.freeze([
  // Adding/increasing before cut-off: rows 2-13.
  [2, TEST_FAMILIES.ADD_BEFORE_FUNDED, CADENCES.WEEKLY_SINGLE_DAY, ACTIONS.ADD_ITEM],
  [3, TEST_FAMILIES.ADD_BEFORE_DECLINED, CADENCES.WEEKLY_SINGLE_DAY, ACTIONS.ADD_ITEM],
  [4, TEST_FAMILIES.ADD_BEFORE_FUNDED, CADENCES.WEEKLY_SINGLE_DAY, ACTIONS.INCREASE_QUANTITY],
  [5, TEST_FAMILIES.ADD_BEFORE_DECLINED, CADENCES.WEEKLY_SINGLE_DAY, ACTIONS.INCREASE_QUANTITY],
  [6, TEST_FAMILIES.ADD_BEFORE_FUNDED, CADENCES.WEEKLY_MULTI_DAY, ACTIONS.ADD_ITEM],
  [7, TEST_FAMILIES.ADD_BEFORE_DECLINED, CADENCES.WEEKLY_MULTI_DAY, ACTIONS.ADD_ITEM],
  [8, TEST_FAMILIES.ADD_BEFORE_FUNDED, CADENCES.WEEKLY_MULTI_DAY, ACTIONS.INCREASE_QUANTITY],
  [9, TEST_FAMILIES.ADD_BEFORE_DECLINED, CADENCES.WEEKLY_MULTI_DAY, ACTIONS.INCREASE_QUANTITY],
  [10, TEST_FAMILIES.ADD_BEFORE_FUNDED, CADENCES.FORTNIGHTLY, ACTIONS.ADD_ITEM],
  [11, TEST_FAMILIES.ADD_BEFORE_DECLINED, CADENCES.FORTNIGHTLY, ACTIONS.ADD_ITEM],
  [12, TEST_FAMILIES.ADD_BEFORE_FUNDED, CADENCES.FORTNIGHTLY, ACTIONS.INCREASE_QUANTITY],
  [13, TEST_FAMILIES.ADD_BEFORE_DECLINED, CADENCES.FORTNIGHTLY, ACTIONS.INCREASE_QUANTITY],

  // Removing/decreasing before cut-off: rows 22-27.
  [22, TEST_FAMILIES.REMOVE_BEFORE, CADENCES.WEEKLY_SINGLE_DAY, ACTIONS.REMOVE_ITEM],
  [23, TEST_FAMILIES.REMOVE_BEFORE, CADENCES.WEEKLY_SINGLE_DAY, ACTIONS.DECREASE_QUANTITY],
  [24, TEST_FAMILIES.REMOVE_BEFORE, CADENCES.WEEKLY_MULTI_DAY, ACTIONS.REMOVE_ITEM],
  [25, TEST_FAMILIES.REMOVE_BEFORE, CADENCES.WEEKLY_MULTI_DAY, ACTIONS.DECREASE_QUANTITY],
  [26, TEST_FAMILIES.REMOVE_BEFORE, CADENCES.FORTNIGHTLY, ACTIONS.REMOVE_ITEM],
  [27, TEST_FAMILIES.REMOVE_BEFORE, CADENCES.FORTNIGHTLY, ACTIONS.DECREASE_QUANTITY],

  // Adding/increasing after cut-off: rows 32-43.
  [32, TEST_FAMILIES.ADD_AFTER_FUNDED, CADENCES.WEEKLY_SINGLE_DAY, ACTIONS.ADD_ITEM],
  [33, TEST_FAMILIES.ADD_AFTER_DECLINED, CADENCES.WEEKLY_SINGLE_DAY, ACTIONS.ADD_ITEM],
  [34, TEST_FAMILIES.ADD_AFTER_FUNDED, CADENCES.WEEKLY_SINGLE_DAY, ACTIONS.INCREASE_QUANTITY],
  [35, TEST_FAMILIES.ADD_AFTER_DECLINED, CADENCES.WEEKLY_SINGLE_DAY, ACTIONS.INCREASE_QUANTITY],
  [36, TEST_FAMILIES.ADD_AFTER_FUNDED, CADENCES.WEEKLY_MULTI_DAY, ACTIONS.ADD_ITEM],
  [37, TEST_FAMILIES.ADD_AFTER_DECLINED, CADENCES.WEEKLY_MULTI_DAY, ACTIONS.ADD_ITEM],
  [38, TEST_FAMILIES.ADD_AFTER_FUNDED, CADENCES.WEEKLY_MULTI_DAY, ACTIONS.INCREASE_QUANTITY],
  [39, TEST_FAMILIES.ADD_AFTER_DECLINED, CADENCES.WEEKLY_MULTI_DAY, ACTIONS.INCREASE_QUANTITY],
  [40, TEST_FAMILIES.ADD_AFTER_FUNDED, CADENCES.FORTNIGHTLY, ACTIONS.ADD_ITEM],
  [41, TEST_FAMILIES.ADD_AFTER_DECLINED, CADENCES.FORTNIGHTLY, ACTIONS.ADD_ITEM],
  [42, TEST_FAMILIES.ADD_AFTER_FUNDED, CADENCES.FORTNIGHTLY, ACTIONS.INCREASE_QUANTITY],
  [43, TEST_FAMILIES.ADD_AFTER_DECLINED, CADENCES.FORTNIGHTLY, ACTIONS.INCREASE_QUANTITY],

  // Removing/decreasing after cut-off: rows 52-57.
  [52, TEST_FAMILIES.REMOVE_AFTER, CADENCES.WEEKLY_SINGLE_DAY, ACTIONS.REMOVE_ITEM],
  [53, TEST_FAMILIES.REMOVE_AFTER, CADENCES.WEEKLY_SINGLE_DAY, ACTIONS.DECREASE_QUANTITY],
  [54, TEST_FAMILIES.REMOVE_AFTER, CADENCES.WEEKLY_MULTI_DAY, ACTIONS.REMOVE_ITEM],
  [55, TEST_FAMILIES.REMOVE_AFTER, CADENCES.WEEKLY_MULTI_DAY, ACTIONS.DECREASE_QUANTITY],
  [56, TEST_FAMILIES.REMOVE_AFTER, CADENCES.FORTNIGHTLY, ACTIONS.REMOVE_ITEM],
  [57, TEST_FAMILIES.REMOVE_AFTER, CADENCES.FORTNIGHTLY, ACTIONS.DECREASE_QUANTITY],

  // Cancellation before/after cut-off: rows 62-67.
  [62, TEST_FAMILIES.CANCEL_BEFORE, CADENCES.WEEKLY_SINGLE_DAY, ACTIONS.CANCEL],
  [63, TEST_FAMILIES.CANCEL_AFTER, CADENCES.WEEKLY_SINGLE_DAY, ACTIONS.CANCEL],
  [64, TEST_FAMILIES.CANCEL_BEFORE, CADENCES.WEEKLY_MULTI_DAY, ACTIONS.CANCEL],
  [65, TEST_FAMILIES.CANCEL_AFTER, CADENCES.WEEKLY_MULTI_DAY, ACTIONS.CANCEL],
  [66, TEST_FAMILIES.CANCEL_BEFORE, CADENCES.FORTNIGHTLY, ACTIONS.CANCEL],
  [67, TEST_FAMILIES.CANCEL_AFTER, CADENCES.FORTNIGHTLY, ACTIONS.CANCEL],

  // Pause/resume before/after cut-off: rows 72-83.
  [72, TEST_FAMILIES.PAUSE_BEFORE, CADENCES.WEEKLY_SINGLE_DAY, ACTIONS.PAUSE],
  [73, TEST_FAMILIES.PAUSE_AFTER, CADENCES.WEEKLY_SINGLE_DAY, ACTIONS.PAUSE],
  [74, TEST_FAMILIES.RESUME_OPEN, CADENCES.WEEKLY_SINGLE_DAY, ACTIONS.RESUME],
  [75, TEST_FAMILIES.RESUME_LOCKED, CADENCES.WEEKLY_SINGLE_DAY, ACTIONS.RESUME],
  [76, TEST_FAMILIES.PAUSE_BEFORE, CADENCES.WEEKLY_MULTI_DAY, ACTIONS.PAUSE],
  [77, TEST_FAMILIES.PAUSE_AFTER, CADENCES.WEEKLY_MULTI_DAY, ACTIONS.PAUSE],
  [78, TEST_FAMILIES.RESUME_OPEN, CADENCES.WEEKLY_MULTI_DAY, ACTIONS.RESUME],
  [79, TEST_FAMILIES.RESUME_LOCKED, CADENCES.WEEKLY_MULTI_DAY, ACTIONS.RESUME],
  [80, TEST_FAMILIES.PAUSE_BEFORE, CADENCES.FORTNIGHTLY, ACTIONS.PAUSE],
  [81, TEST_FAMILIES.PAUSE_AFTER, CADENCES.FORTNIGHTLY, ACTIONS.PAUSE],
  [82, TEST_FAMILIES.RESUME_OPEN, CADENCES.FORTNIGHTLY, ACTIONS.RESUME],
  [83, TEST_FAMILIES.RESUME_LOCKED, CADENCES.FORTNIGHTLY, ACTIONS.RESUME],
]);

function buildRule([workbookRow, family, cadence, action]) {
  const definition = FAMILY_DEFINITIONS[family];
  const extraConflicts =
    workbookRow === 32 ? [SPEC_CONFLICTS.MISSING_ROW_32_OUTCOME] : [];
  const conflicts = Object.freeze([...definition.conflicts, ...extraConflicts]);

  return Object.freeze({
    workbookRowId: `${WORKBOOK_SHEET}!${workbookRow}`,
    workbookRow,
    workbookCells: `${WORKBOOK_SHEET}!A${workbookRow}:L${workbookRow}`,
    workbookPath: WORKBOOK_PATH,
    family,
    eventGroup: definition.eventGroup,
    eventType: definition.eventType,
    cadence,
    frequency: CADENCE_LABELS[cadence],
    timing: definition.timing,
    timingCondition: definition.timingCondition,
    action,
    actionLabel: ACTION_LABELS[action],
    funds: definition.funds,
    sufficientFunds: definition.sufficientFunds,
    resumeOrEndCondition: definition.resumeOrEndCondition,
    effectiveScope: definition.effectiveScope,
    paymentExpectation: Object.freeze({
      workbook: definition.workbookPaymentAction,
      normalizedForTest: definition.paymentExpectation,
    }),
    workbookExpectedOutcome:
      workbookRow === 32 ? null : definition.expectedOutcome,
    expectedOutcome: definition.expectedOutcome,
    implementationNote: definition.implementationNote,
    workbookTested: definition.tested,
    conflicts,
  });
}

const RULE_MATRIX = Object.freeze(SOURCE_ROWS.map(buildRule));

const EXPECTED_WORKBOOK_ROWS = Object.freeze([
  2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
  22, 23, 24, 25, 26, 27,
  32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43,
  52, 53, 54, 55, 56, 57,
  62, 63, 64, 65, 66, 67,
  72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83,
]);

const actualRows = RULE_MATRIX.map(({ workbookRow }) => workbookRow);
if (
  RULE_MATRIX.length !== 54 ||
  new Set(actualRows).size !== 54 ||
  actualRows.some((row, index) => row !== EXPECTED_WORKBOOK_ROWS[index])
) {
  throw new Error(
    `Subscription rule matrix must contain the 54 workbook rows in source order; got ${RULE_MATRIX.length}`,
  );
}

module.exports = {
  ACTIONS,
  CADENCES,
  EXPECTED_WORKBOOK_ROWS,
  FUNDS,
  RULE_MATRIX,
  SPEC_CONFLICTS,
  TEST_FAMILIES,
  TIMINGS,
  WORKBOOK_PATH,
  WORKBOOK_SHEET,
};
