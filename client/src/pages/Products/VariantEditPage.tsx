import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ImagePlus, Package, Save, Upload, X } from "lucide-react";
import { Button, Card, Input, LoadingScreen, PageContainer, Select } from "../../components/common";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { useToast } from "../../components/common/Toast";
import { usePermissions } from "@/hooks/usePermissions";
import api from "../../context/api";
import type { AdminProduct, AdminProductVariant, VariantStatus } from "./types";
import { getImageUrl } from "./product.utils";
import styles from "./ProductCreatePage.module.css";
import pageStyles from "./VariantEditPage.module.css";
import { useUnsavedChangesDialog } from "./UnsavedChangesDialog";

type Draft = {
  isSubscriptionEligible: boolean;
  name: string; sku: string; price: string; stockQuantity: string;
  lowStockAlert: string; status: VariantStatus; description: string;
  ingredients: string; allergens: string; nutritionalInformation: string;
};

const toDraft = (variant: AdminProductVariant): Draft => ({
  isSubscriptionEligible: variant.isSubscriptionEligible !== false,
  name: variant.name ?? "", sku: variant.sku ?? "", price: String(variant.price ?? ""),
  stockQuantity: String(variant.stockQuantity ?? ""), lowStockAlert: String(variant.lowStockAlert ?? ""),
  status: variant.status, description: variant.description ?? "", ingredients: variant.ingredients ?? "",
  allergens: (variant.allergens ?? []).join(", "), nutritionalInformation: variant.nutritionalInformation ?? "",
});

export default function VariantEditPage() {
  const { productId, variantId } = useParams<{ productId: string; variantId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { hasPermission } = usePermissions();
  const canUpdateVariant = hasPermission("variants.update");
  const canUpdateStock = hasPermission("stock.update");
  const [product, setProduct] = useState<AdminProduct | null>(null);
  const [variant, setVariant] = useState<AdminProductVariant | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [image, setImage] = useState("");
  const [imageChanged, setImageChanged] = useState(false);
  const [baseline, setBaseline] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const imageInputRef = useRef<HTMLInputElement>(null);
  const hasUnsavedChanges = !loading && Boolean(draft) && JSON.stringify({ draft, image }) !== baseline;
  const { allowNavigationRef, dialog: unsavedChangesDialog } = useUnsavedChangesDialog(hasUnsavedChanges, "variant");

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get(`/admin/products/${productId}`),
      api.get(`/admin/products/variants/${variantId}`),
    ]).then(([productResponse, variantResponse]) => {
      if (!active) return;
      const nextVariant = variantResponse.data?.data?.variant as AdminProductVariant;
      if (!nextVariant || nextVariant.product !== productId) throw new Error("Variant not found for this product");
      setProduct(productResponse.data?.data?.product as AdminProduct);
      setVariant(nextVariant);
      const nextDraft = toDraft(nextVariant);
      const nextImage = getImageUrl(nextVariant.thumbnailImage);
      setDraft(nextDraft);
      setImage(nextImage);
      setBaseline(JSON.stringify({ draft: nextDraft, image: nextImage }));
    }).catch((cause) => {
      if (active) setError(cause?.response?.data?.message || cause?.message || "Could not load this variant.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [productId, variantId]);

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => current ? { ...current, [key]: value } : current);

  const handleImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setImage(String(reader.result)); setImageChanged(true); };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft || !variant || saving) return;
    setSaving(true);
    try {
      const body = {
        ...(canUpdateVariant ? {
          isSubscriptionEligible: draft.isSubscriptionEligible,
          name: draft.name.trim(), sku: draft.sku.trim(), price: Number(draft.price),
          status: draft.status, description: draft.description.trim(),
          ingredients: draft.ingredients.trim(),
          allergens: draft.allergens.split(",").map((value) => value.trim()).filter(Boolean),
          nutritionalInformation: draft.nutritionalInformation.trim(),
          ...(imageChanged ? { thumbnailImage: image } : {}),
        } : {}),
        ...(canUpdateStock ? {
          stockQuantity: Number(draft.stockQuantity), lowStockAlert: Number(draft.lowStockAlert),
        } : {}),
      };
      await api.put(`/admin/products/variants/${variant._id}`, body);
      allowNavigationRef.current = true;
      showToast({ type: "success", title: "Variant updated" });
      navigate(`/products/${productId}`);
    } catch (cause: any) {
      showToast({ type: "error", title: "Failed to update variant", message: cause?.response?.data?.message || cause?.message });
    } finally { setSaving(false); }
  };

  if (loading) return <PageContainer className={pageStyles.loadingArea} width="wide"><LoadingScreen label="Loading variant…" variant="contained" /></PageContainer>;
  if (error || !draft || !variant) return <PageContainer className={styles.page}><p role="alert">{error || "Variant not found."}</p><Link to={`/products/${productId}`}>Back to variants</Link></PageContainer>;

  return (
    <PageContainer className={styles.page} width="wide">
      <Breadcrumb className={styles.breadcrumb}>
        <BreadcrumbList className={styles.breadcrumbList}>
          <BreadcrumbItem><BreadcrumbLink asChild className={styles.breadcrumbLink}><Link to="/products">Products</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator className={styles.breadcrumbSeparator} />
          <BreadcrumbItem><BreadcrumbLink asChild className={styles.breadcrumbLink}><Link to={`/products/${productId}`}>{product?.name || "Product"}</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator className={styles.breadcrumbSeparator} />
          <BreadcrumbItem><BreadcrumbPage className={styles.breadcrumbCurrent}>{variant.name}</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className={styles.header}>
        <div className={styles.heading}><h1>{variant.name}</h1><p>Update pricing, stock, product information and thumbnail.</p></div>
        {(canUpdateVariant || canUpdateStock) && <Button type="submit" form="variant-form" size="sm" leftIcon={<Save size={16} />} isLoading={saving} className={styles.headerSubmit}>Save changes</Button>}
      </header>

      <form id="variant-form" className={styles.form} onSubmit={handleSubmit}>
        <div className={`${styles.contentGrid} ${pageStyles.contentGrid}`}>
          <Card className={styles.sectionCard}>
            <div className={styles.sectionHeader}><span className={styles.sectionIcon} aria-hidden="true"><Package size={20} /></span><div><h2>Variant details</h2><p>Information customers will see for this option.</p></div></div>
            <div className={styles.fieldsGrid}>
              <Select label="Subscription Eligible" value={draft.isSubscriptionEligible ? "eligible" : "ineligible"} onChange={(value) => update("isSubscriptionEligible", value === "eligible")} options={[{ value: "eligible", label: "Eligible for subscriptions" }, { value: "ineligible", label: "One-time purchases only" }]} disabled={!canUpdateVariant} fullWidth />
              <p className={styles.fullField}>Applies to new subscription additions of this variant. Existing subscription items and one-time purchases are unchanged.</p>
              <Input label="Variant name" value={draft.name} onChange={(e) => update("name", e.target.value)} disabled={!canUpdateVariant} required fullWidth size="sm" />
              <Input label="SKU" value={draft.sku} onChange={(e) => update("sku", e.target.value)} disabled={!canUpdateVariant} required fullWidth size="sm" />
              <Input label="Price (£)" type="number" min="0" step="0.01" value={draft.price} onChange={(e) => update("price", e.target.value)} disabled={!canUpdateVariant} required fullWidth size="sm" />
              <Select label="Status" value={draft.status} onChange={(value) => update("status", value as VariantStatus)} options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} disabled={!canUpdateVariant} fullWidth />
              <Input label="Stock quantity" type="number" min="0" value={draft.stockQuantity} onChange={(e) => update("stockQuantity", e.target.value)} disabled={!canUpdateStock} required fullWidth size="sm" />
              <Input label="Low stock alert" type="number" min="0" value={draft.lowStockAlert} onChange={(e) => update("lowStockAlert", e.target.value)} disabled={!canUpdateStock} required fullWidth size="sm" />
              <div className={styles.fullField}><label className={styles.fieldLabel} htmlFor="variant-description">Description</label><textarea id="variant-description" rows={5} value={draft.description} onChange={(e) => update("description", e.target.value)} disabled={!canUpdateVariant} /></div>
              <div className={styles.fullField}><label className={styles.fieldLabel} htmlFor="variant-ingredients">Ingredients</label><textarea id="variant-ingredients" rows={4} value={draft.ingredients} onChange={(e) => update("ingredients", e.target.value)} disabled={!canUpdateVariant} /></div>
              <div className={styles.fullField}><Input label="Allergens" value={draft.allergens} onChange={(e) => update("allergens", e.target.value)} disabled={!canUpdateVariant} hint="Separate allergens with commas" fullWidth size="sm" /></div>
              <div className={styles.fullField}><label className={styles.fieldLabel} htmlFor="variant-nutrition">Nutritional information</label><textarea id="variant-nutrition" rows={5} value={draft.nutritionalInformation} onChange={(e) => update("nutritionalInformation", e.target.value)} disabled={!canUpdateVariant} /></div>
            </div>
          </Card>

          <Card className={`${styles.sectionCard} ${pageStyles.imageCard}`}>
            <div className={styles.sectionHeader}><span className={styles.sectionIcon} aria-hidden="true"><ImagePlus size={20} /></span><div><h2>Variant image</h2><p>The thumbnail shown in the catalogue.</p></div></div>
            <div className={styles.mediaSection}>
              <div className={styles.mediaLabelRow}><label>Thumbnail</label></div>
              {image ? <div className={styles.thumbnailPreview}>
                <img src={image} alt={`${draft.name} thumbnail`} />
                {canUpdateVariant && <><Button type="button" variant="outline" size="sm" leftIcon={<Upload size={15} />} onClick={() => imageInputRef.current?.click()} className={styles.replaceImageButton}>Replace</Button><button type="button" className={styles.removeImageButton} onClick={() => { setImage(""); setImageChanged(true); }} aria-label="Remove thumbnail"><X size={16} /></button></>}
              </div> : <button type="button" className={styles.thumbnailDropzone} onClick={() => imageInputRef.current?.click()} disabled={!canUpdateVariant}><span className={styles.uploadIcon}><Upload size={22} /></span><strong>Choose a thumbnail</strong><span>JPG, PNG or WEBP</span></button>}
              <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={handleImage} />
            </div>
          </Card>
        </div>
        {(canUpdateVariant || canUpdateStock) && <Button type="submit" size="sm" leftIcon={<Save size={16} />} isLoading={saving} className={styles.mobileSubmit}>Save changes</Button>}
      </form>
      {unsavedChangesDialog}
    </PageContainer>
  );
}
