import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Link2,
  Minus,
  Package,
  Plus,
} from "lucide-react";
import { Button } from "../../components/common";
import { useToast } from "../../components/common/Toast";
import api from "../../context/api";
import styles from "./Subscriptions.module.css";

type VariantOption = {
  _id: string;
  name: string;
  price: number;
  status: string;
  sku?: string;
  thumbnailImage?: string | { url?: string } | null;
  description?: string | null;
  ingredients?: string | null;
  allergens?: string[];
  nutritionalInformation?: string | null;
  stockQuantity?: number;
  reservedQuantity?: number;
};

type ProductOption = {
  _id: string;
  name: string;
  description?: string;
  category?: string;
  allergens?: string[];
  storageNotes?: string | null;
  status: string;
  isSubscriptionEligible?: boolean;
  thumbnailImage?: string | { url?: string };
  variants?: VariantOption[];
};

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const initialForm = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  postcode: "",
  country: "United Kingdom",
  frequency: "weekly",
  preferredDeliveryDay: 2,
  notes: "",
};

const STEPS = ["Customer", "Schedule", "Products", "Review"];
const PRODUCTS_PER_PAGE = 8;

const CATEGORY_PRIORITY = [
  ["milk unhomogenised", "unhomogenised milk", "unhomogenized milk", "whole milk", "milk"],
  ["milk semi skimmed", "semi skimmed milk", "semi-skimmed milk"],
  ["eggs", "egg"],
  ["cream"],
  ["butter"],
  ["milkshakes", "milkshake"],
  ["honey"],
  ["ghee"],
  ["cheese"],
  ["bakery", "bakary", "bread"],
  ["juices", "juice"],
] as const;

const categoryPriority = (value?: string) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const index = CATEGORY_PRIORITY.findIndex((aliases) =>
    aliases.some((alias) => alias === normalized),
  );
  return index === -1 ? CATEGORY_PRIORITY.length : index;
};

const getImageUrl = (image?: string | { url?: string } | null) =>
  typeof image === "string" ? image : image?.url || "";

export default function CreateSubscriptionInviteModal() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(initialForm);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [deliveryDays, setDeliveryDays] = useState<number[]>([2]);
  const [selectedDeliveryDays, setSelectedDeliveryDays] = useState<number[]>([
    2,
  ]);
  const [dayQuantities, setDayQuantities] = useState<
    Record<number, Record<string, number>>
  >({});
  const [activeProductDay, setActiveProductDay] = useState<number>(2);
  const [productPage, setProductPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [onboardingLink, setOnboardingLink] = useState("");

  useEffect(() => {
    setLoadingOptions(true);
    void Promise.all([
      api.get("/admin/products", { params: { page: 1, pageSize: 100 } }),
      api.get("/admin/subscription-settings"),
    ])
      .then(([productsResponse, settingsResponse]) => {
        setProducts(productsResponse.data?.data?.products || []);
        const days =
          settingsResponse.data?.data?.settings?.deliveryDays ||
          settingsResponse.data?.data?.deliveryDays;
        if (Array.isArray(days) && days.length) {
          setDeliveryDays(days);
          setSelectedDeliveryDays([days[0]]);
          setActiveProductDay(days[0]);
          setDayQuantities({ [days[0]]: {} });
          setForm((current) => ({
            ...current,
            preferredDeliveryDay: days[0],
          }));
        }
      })
      .catch(() => {
        showToast({
          type: "error",
          title: "Could not load subscription options",
        });
      })
      .finally(() => setLoadingOptions(false));
  }, [showToast]);

  const variants = useMemo(
    () =>
      products
        .map((product, originalIndex) => ({ product, originalIndex }))
        .sort(
          (a, b) =>
            categoryPriority(a.product.category) -
              categoryPriority(b.product.category) ||
            a.originalIndex - b.originalIndex,
        )
        .map(({ product }) => product)
        .filter(
          (product) =>
            product.status === "active" &&
            product.isSubscriptionEligible !== false,
        )
        .flatMap((product) =>
          (product.variants || [])
            .filter((variant) => variant.status === "active")
            .map((variant) => ({
              ...variant,
              productName: product.name,
              productDescription: product.description || "",
              category: product.category || "",
              productAllergens: product.allergens || [],
              storageNotes: product.storageNotes || "",
              imageUrl:
                getImageUrl(variant.thumbnailImage) ||
                getImageUrl(product.thumbnailImage),
            })),
        ),
    [products],
  );

  const activeQuantities = dayQuantities[activeProductDay] || {};
  const selectedVariantIds = useMemo(
    () =>
      new Set(
        Object.values(dayQuantities).flatMap((plan) =>
          Object.entries(plan)
            .filter(([, quantity]) => quantity > 0)
            .map(([variantId]) => variantId),
        ),
      ),
    [dayQuantities],
  );
  const selectedCount = selectedVariantIds.size;
  const productPageCount = Math.max(
    1,
    Math.ceil(variants.length / PRODUCTS_PER_PAGE),
  );
  const visibleVariants = variants.slice(
    (productPage - 1) * PRODUCTS_PER_PAGE,
    productPage * PRODUCTS_PER_PAGE,
  );
  const dayTotals = useMemo(
    () =>
      Object.fromEntries(
        selectedDeliveryDays.map((day) => [
          day,
          variants.reduce(
            (total, variant) =>
              total +
              Number(variant.price) *
                Number(dayQuantities[day]?.[variant._id] || 0),
            0,
          ),
        ]),
      ) as Record<number, number>,
    [dayQuantities, selectedDeliveryDays, variants],
  );
  const estimatedTotal = selectedDeliveryDays.reduce(
    (total, day) => total + Number(dayTotals[day] || 0),
    0,
  );

  const updateQuantity = (variantId: string, delta: number) => {
    setDayQuantities((current) => {
      const currentDay = current[activeProductDay] || {};
      const nextQuantity = Math.max(0, (currentDay[variantId] || 0) + delta);
      const nextDay = { ...currentDay };
      if (nextQuantity) nextDay[variantId] = nextQuantity;
      else delete nextDay[variantId];
      return { ...current, [activeProductDay]: nextDay };
    });
  };

  const createLink = async () => {
    if (
      !form.firstName.trim() ||
      !form.lastName.trim() ||
      !form.email.trim() ||
      !form.line1.trim() ||
      !form.city.trim() ||
      !form.postcode.trim()
    ) {
      showToast({
        type: "error",
        title: "Complete the customer and delivery details",
      });
      return;
    }
    const missingProductDay = selectedDeliveryDays.find(
      (day) =>
        !Object.values(dayQuantities[day] || {}).some(
          (quantity) => quantity > 0,
        ),
    );
    if (missingProductDay !== undefined) {
      showToast({
        type: "error",
        title: `Add at least one product for ${DAY_LABELS[missingProductDay]}`,
      });
      return;
    }

    setLoading(true);
    try {
      const response = await api.post("/admin/subscriptions/setup-link", {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || undefined,
        address: {
          line1: form.line1.trim(),
          line2: form.line2.trim() || undefined,
          city: form.city.trim(),
          postcode: form.postcode.trim(),
          country: form.country.trim(),
          isDefault: true,
        },
        subscription: {
          frequency: form.frequency,
          preferredDeliveryDay: selectedDeliveryDays[0],
          preferredDeliveryDays: selectedDeliveryDays,
          items: Array.from(selectedVariantIds).map((variantId) => ({
            variantId,
            quantity: Math.max(
              ...selectedDeliveryDays.map(
                (day) => dayQuantities[day]?.[variantId] || 0,
              ),
            ),
          })),
          ...(form.frequency === "weekly" && selectedDeliveryDays.length > 1
            ? {
                deliveryDayPlans: selectedDeliveryDays.map((day) => ({
                  day,
                  items: Object.entries(dayQuantities[day] || {})
                    .filter(([, quantity]) => quantity > 0)
                    .map(([variantId, quantity]) => ({
                      variantId,
                      quantity,
                    })),
                })),
              }
            : {}),
          notes: form.notes.trim() || undefined,
        },
      });
      const link = response.data?.data?.onboardingLink;
      if (!link) throw new Error("The server did not return a setup link");
      setOnboardingLink(link);
      showToast({
        type: "success",
        title: "Subscription setup link created",
        message: "The customer can now verify their email and add payment.",
      });
    } catch (error: any) {
      showToast({
        type: "error",
        title: "Could not create setup link",
        message:
          error?.response?.data?.message ||
          error?.message ||
          "Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(onboardingLink);
    showToast({ type: "success", title: "Link copied" });
  };

  const selectFrequency = (frequency: string) => {
    setForm((current) => ({ ...current, frequency }));
    if (frequency !== "weekly") {
      const day = selectedDeliveryDays[0] ?? deliveryDays[0];
      setSelectedDeliveryDays([day]);
      setActiveProductDay(day);
      setDayQuantities((plans) => ({ [day]: plans[day] || {} }));
    }
  };

  const toggleDeliveryDay = (day: number) => {
    if (form.frequency !== "weekly") {
      setSelectedDeliveryDays([day]);
      setActiveProductDay(day);
      setDayQuantities((plans) => ({ [day]: plans[day] || {} }));
      return;
    }

    if (selectedDeliveryDays.includes(day)) {
      if (selectedDeliveryDays.length === 1) return;
      const next = selectedDeliveryDays.filter((selected) => selected !== day);
      setSelectedDeliveryDays(next);
      setDayQuantities((plans) =>
        Object.fromEntries(
          Object.entries(plans).filter(([key]) => Number(key) !== day),
        ),
      );
      if (activeProductDay === day) setActiveProductDay(next[0]);
      return;
    }

    setSelectedDeliveryDays(
      [...selectedDeliveryDays, day].sort((a, b) => a - b),
    );
    setDayQuantities((plans) => ({ ...plans, [day]: plans[day] || {} }));
    setActiveProductDay(day);
  };

  const canContinue =
    step === 0
      ? Boolean(
          form.firstName.trim() &&
            form.lastName.trim() &&
            form.email.trim() &&
            form.line1.trim() &&
            form.city.trim() &&
            form.postcode.trim(),
        )
      : step === 2
        ? selectedDeliveryDays.every((day) =>
            Object.values(dayQuantities[day] || {}).some(
              (quantity) => quantity > 0,
            ),
          )
        : true;

  return (
    <div className={styles.createPage}>
      <div className={styles.createHeader}>
        <button
          type="button"
          onClick={() => navigate("/subscriptions")}
          aria-label="Back to subscriptions"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1>Prepare customer subscription</h1>
          <p>
            Configure everything now, then send the customer a secure payment
            setup link.
          </p>
        </div>
      </div>

      {!onboardingLink && (
        <ol className={styles.stepper}>
          {STEPS.map((label, index) => (
            <li
              key={label}
              className={
                index === step
                  ? styles.stepActive
                  : index < step
                    ? styles.stepComplete
                    : ""
              }
            >
              <span>{index < step ? <Check size={14} /> : index + 1}</span>
              <div>
                <strong>{label}</strong>
                <small>Step {index + 1}</small>
              </div>
            </li>
          ))}
        </ol>
      )}

      {onboardingLink ? (
        <div className={styles.completionCard}>
          <div className={styles.inviteSuccessIcon}>
            <Check size={24} />
          </div>
          <h2>Subscription setup is ready</h2>
          <p>
            The customer details, products and delivery schedule are safely
            stored. Send this link so they can verify their email and add
            payment.
          </p>
          <div className={styles.linkField}>
            <Link2 size={16} />
            <input
              value={onboardingLink}
              readOnly
              aria-label="Customer setup link"
            />
            <Button size="sm" onClick={copyLink} leftIcon={<Copy size={15} />}>
              Copy link
            </Button>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate("/subscriptions")}
          >
            Return to subscriptions
          </Button>
        </div>
      ) : (
        <div className={styles.wizardCard}>
          {step === 0 && (
            <div className={styles.stepContent}>
              <div className={styles.stepIntro}>
                <h2>Customer and delivery details</h2>
                <p>
                  These details are prefilled for the customer and used for
                  their deliveries.
                </p>
              </div>
              <section>
                <h3>Customer</h3>
                <div className={styles.formGrid}>
                  {[
                    ["First name", "firstName", "Sarah"],
                    ["Last name", "lastName", "Jones"],
                    ["Email address", "email", "sarah@example.com"],
                    ["Phone number", "phone", "Optional"],
                  ].map(([label, key, placeholder]) => (
                    <label key={key}>
                      <span>{label}</span>
                      <input
                        type={key === "email" ? "email" : "text"}
                        value={(form as any)[key]}
                        placeholder={placeholder}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>
              </section>
              <section>
                <h3>Delivery address</h3>
                <div className={styles.formGrid}>
                  {[
                    ["Address line 1", "line1"],
                    ["Address line 2", "line2"],
                    ["Town or city", "city"],
                    ["Postcode", "postcode"],
                    ["Country", "country"],
                  ].map(([label, key]) => (
                    <label
                      key={key}
                      className={
                        key === "line1" ? styles.fullField : undefined
                      }
                    >
                      <span>{label}</span>
                      <input
                        value={(form as any)[key]}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>
              </section>
            </div>
          )}

          {step === 1 && (
            <div className={styles.stepContent}>
              <div className={styles.stepIntro}>
                <h2>Delivery frequency</h2>
                <p>
                  Choose how often the subscription renews and the preferred
                  delivery day.
                </p>
              </div>
              <div className={styles.frequencyCards}>
                {[
                  ["weekly", "Weekly", "Delivered every week"],
                  [
                    "every_two_weeks",
                    "Every 2 weeks",
                    "Delivered once per fortnight",
                  ],
                  ["monthly", "Monthly", "Delivered once per month"],
                ].map(([value, title, description]) => (
                  <button
                    key={value}
                    type="button"
                    className={
                      form.frequency === value ? styles.frequencySelected : ""
                    }
                    onClick={() =>
                      selectFrequency(value)
                    }
                  >
                    <span className={styles.radioMark}>
                      {form.frequency === value && <Check size={13} />}
                    </span>
                    <strong>{title}</strong>
                    <small>{description}</small>
                  </button>
                ))}
              </div>
              <div className={styles.dayField}>
                <span>
                  {form.frequency === "weekly"
                    ? "Delivery days"
                    : "Preferred delivery day"}
                </span>
                <div className={styles.deliveryDayGrid}>
                  {deliveryDays.map((day) => {
                    const selected = selectedDeliveryDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        className={selected ? styles.deliveryDaySelected : ""}
                        onClick={() => toggleDeliveryDay(day)}
                      >
                        <span>{DAY_LABELS[day].slice(0, 3)}</span>
                        {selected && <Check size={14} />}
                      </button>
                    );
                  })}
                </div>
                <small>
                  {form.frequency === "weekly"
                    ? "Select one or more enabled delivery days."
                    : "Select one enabled delivery day."}
                </small>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className={styles.stepContent}>
              <div className={styles.stepIntro}>
                <h2>Choose products for each delivery day</h2>
                <p>
                  Each selected delivery day has its own basket. Choose a day,
                  then set the products and quantities for that delivery.
                </p>
              </div>
              {selectedDeliveryDays.length > 1 && (
                <div className={styles.deliveryDayGrid}>
                  {selectedDeliveryDays.map((day) => (
                    <button
                      key={day}
                      type="button"
                      className={
                        activeProductDay === day
                          ? styles.deliveryDaySelected
                          : ""
                      }
                      onClick={() => {
                        setActiveProductDay(day);
                        setProductPage(1);
                      }}
                    >
                      <span>{DAY_LABELS[day]}</span>
                      <strong>£{Number(dayTotals[day] || 0).toFixed(2)}</strong>
                    </button>
                  ))}
                </div>
              )}
              <div className={styles.productSummaryBar}>
                <span>
                  {selectedCount} variants selected · Editing{" "}
                  {DAY_LABELS[activeProductDay]}
                </span>
                <strong>
                  {DAY_LABELS[activeProductDay]} £
                  {Number(dayTotals[activeProductDay] || 0).toFixed(2)}
                </strong>
              </div>
              <div className={styles.productGrid}>
                {loadingOptions ? (
                  <p>Loading products…</p>
                ) : variants.length ? (
                  visibleVariants.map((variant) => {
                    const quantity = activeQuantities[variant._id] || 0;
                    const available = Math.max(
                      0,
                      Number(variant.stockQuantity || 0) -
                        Number(variant.reservedQuantity || 0),
                    );
                    return (
                      <article
                        key={variant._id}
                        className={`${styles.productCard} ${
                          quantity ? styles.productCardSelected : ""
                        }`}
                      >
                        <div className={styles.productImage}>
                          {variant.imageUrl ? (
                            <img
                              src={variant.imageUrl}
                              alt={variant.name}
                            />
                          ) : (
                            <Package size={26} />
                          )}
                        </div>
                        <div className={styles.productInfo}>
                          <div className={styles.productTitleRow}>
                            <div>
                              <span>{variant.category || "Product"}</span>
                              <h3>{variant.productName}</h3>
                            </div>
                            <strong>
                              £{Number(variant.price).toFixed(2)}
                            </strong>
                          </div>
                          <p>
                            {variant.description ||
                              variant.productDescription ||
                              "No product description provided."}
                          </p>
                          <div className={styles.variantMeta}>
                            <span>Variant: {variant.name}</span>
                            {variant.sku && <span>SKU: {variant.sku}</span>}
                            <span>{available} available</span>
                          </div>
                          {(variant.allergens?.length ||
                            variant.productAllergens.length) > 0 && (
                            <div className={styles.productAllergens}>
                              <strong>Allergens</strong>
                              <span>
                                {(
                                  variant.allergens ||
                                  variant.productAllergens
                                ).join(", ")}
                              </span>
                            </div>
                          )}
                          {variant.storageNotes && (
                            <div className={styles.productAllergens}>
                              <strong>Storage</strong>
                              <span>{variant.storageNotes}</span>
                            </div>
                          )}
                          <div className={styles.productActions}>
                            <span>Quantity</span>
                            <div className={styles.quantityControl}>
                              <button
                                type="button"
                                aria-label={`Remove ${variant.name}`}
                                disabled={!quantity}
                                onClick={() =>
                                  updateQuantity(variant._id, -1)
                                }
                              >
                                <Minus size={14} />
                              </button>
                              <span>{quantity}</span>
                              <button
                                type="button"
                                aria-label={`Add ${variant.name}`}
                                disabled={quantity >= available}
                                onClick={() =>
                                  updateQuantity(variant._id, 1)
                                }
                              >
                                <Plus size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <p>No subscription products are available.</p>
                )}
              </div>
              {variants.length > PRODUCTS_PER_PAGE && (
                <div className={styles.productPagination}>
                  <span>
                    Showing {(productPage - 1) * PRODUCTS_PER_PAGE + 1}–
                    {Math.min(
                      productPage * PRODUCTS_PER_PAGE,
                      variants.length,
                    )}{" "}
                    of {variants.length}
                  </span>
                  <div>
                    <button
                      type="button"
                      disabled={productPage === 1}
                      onClick={() =>
                        setProductPage((current) => Math.max(1, current - 1))
                      }
                      aria-label="Previous product page"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    {Array.from({ length: productPageCount }, (_, index) => (
                      <button
                        key={index + 1}
                        type="button"
                        className={
                          productPage === index + 1
                            ? styles.paginationActive
                            : ""
                        }
                        onClick={() => setProductPage(index + 1)}
                      >
                        {index + 1}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={productPage === productPageCount}
                      onClick={() =>
                        setProductPage((current) =>
                          Math.min(productPageCount, current + 1),
                        )
                      }
                      aria-label="Next product page"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className={styles.stepContent}>
              <div className={styles.stepIntro}>
                <h2>Review subscription</h2>
                <p>
                  Confirm all details before generating the secure customer
                  link.
                </p>
              </div>
              <div className={styles.reviewGrid}>
                <section>
                  <h3>Customer</h3>
                  <strong>
                    {form.firstName} {form.lastName}
                  </strong>
                  <span>{form.email}</span>
                  {form.phone && <span>{form.phone}</span>}
                </section>
                <section>
                  <h3>Delivery address</h3>
                  <strong>{form.line1}</strong>
                  {form.line2 && <span>{form.line2}</span>}
                  <span>
                    {form.city}, {form.postcode}
                  </span>
                  <span>{form.country}</span>
                </section>
                <section>
                  <h3>Schedule</h3>
                  <strong>
                    {form.frequency === "weekly"
                      ? "Weekly"
                      : form.frequency === "every_two_weeks"
                        ? "Every 2 weeks"
                        : "Monthly"}
                  </strong>
                  <span>
                    Delivered on{" "}
                    {selectedDeliveryDays
                      .map((day) => DAY_LABELS[day])
                      .join(", ")}
                  </span>
                </section>
              </div>
              <section className={styles.reviewProducts}>
                <div className={styles.sectionHeading}>
                  <h3>Orders by delivery day</h3>
                  <strong>£{estimatedTotal.toFixed(2)} per cycle</strong>
                </div>
                {selectedDeliveryDays.map((day) => (
                  <div key={day} className={styles.reviewDayPlan}>
                    <strong>
                      {DAY_LABELS[day]} · £
                      {Number(dayTotals[day] || 0).toFixed(2)}
                    </strong>
                    {variants
                      .filter(
                        (variant) =>
                          (dayQuantities[day]?.[variant._id] || 0) > 0,
                      )
                      .map((variant) => (
                        <span key={variant._id}>
                          {variant.productName} · {variant.name} —{" "}
                          {dayQuantities[day][variant._id]} × £
                          {Number(variant.price).toFixed(2)}
                        </span>
                      ))}
                  </div>
                ))}
              </section>
              <div className={styles.customerNextStep}>
                <Link2 size={18} />
                <div>
                  <strong>What happens next?</strong>
                  <p>
                    We create an expiring link for the customer. Their
                    subscription activates only after email verification and
                    successful payment setup.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className={styles.wizardFooter}>
            <Button
              variant="outline"
              onClick={() =>
                step === 0
                  ? navigate("/subscriptions")
                  : setStep((current) => current - 1)
              }
              leftIcon={<ArrowLeft size={16} />}
            >
              {step === 0 ? "Cancel" : "Back"}
            </Button>
            {step < STEPS.length - 1 ? (
              <Button
                disabled={!canContinue || loadingOptions}
                onClick={() => setStep((current) => current + 1)}
              >
                Continue
                <ArrowRight size={16} />
              </Button>
            ) : (
              <Button
                onClick={createLink}
                disabled={loading}
                isLoading={loading}
                leftIcon={<Link2 size={16} />}
              >
                Create setup link
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
