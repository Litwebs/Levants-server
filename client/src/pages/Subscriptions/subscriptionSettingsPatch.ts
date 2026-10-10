type Settings = {
  frequency: string;
  preferredDeliveryDay: number | string;
  notes?: string | null;
};

export type SubscriptionSettingsPatch = {
  frequency?: string;
  preferredDeliveryDay?: number;
  notes?: string | null;
};

// An unchanged singular day is not harmless: the API interprets it as an
// explicit replacement of a weekly multi-day schedule with that one day.
export function buildSubscriptionSettingsPatch(
  current: Settings,
  draft: Settings,
): SubscriptionSettingsPatch {
  const patch: SubscriptionSettingsPatch = {};
  if (draft.frequency !== current.frequency) patch.frequency = draft.frequency;
  if (Number(draft.preferredDeliveryDay) !== Number(current.preferredDeliveryDay)) {
    patch.preferredDeliveryDay = Number(draft.preferredDeliveryDay);
  }
  const notes = String(draft.notes || "").trim();
  if (notes !== String(current.notes || "").trim()) patch.notes = notes || null;
  return patch;
}
