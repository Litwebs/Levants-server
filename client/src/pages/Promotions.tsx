import React, { useState, useMemo, useCallback } from 'react';
import { 
  Search, Filter, Download, Plus, X, Tag, Gift, Truck, 
  Percent, Image, Eye, Edit, Archive, ArchiveRestore, Trash2,
  ToggleLeft, ToggleRight, ChevronUp, ChevronDown, RefreshCw,
  Link as LinkIcon, Calendar, Hash
} from 'lucide-react';
import { 
  Card, Button, Badge, Input, Select, Modal, ModalFooter 
} from '../components/common';
import { 
  promotions as mockPromotions, 
  Promotion, 
  PromotionType, 
  PromotionPlacement,
  DiscountKind,
  AppliesTo,
  PromotionStatus,
  products as mockProducts
} from '../data/mockData';
import { useToast } from '../components/common/Toast';
import styles from './Promotions.module.css';

const typeLabels: Record<PromotionType, string> = {
  banner: 'Banner',
  sitewide_discount: 'Sitewide Discount',
  product_discount: 'Product Discount',
  free_shipping: 'Free Shipping',
  promo_code: 'Promo Code'
};

const placementLabels: Record<PromotionPlacement, string> = {
  homepage: 'Homepage',
  navbar: 'Navbar',
  checkout: 'Checkout',
  product_page: 'Product Page',
  all: 'All Pages'
};

const discountKindLabels: Record<DiscountKind, string> = {
  percent: 'Percentage',
  fixed: 'Fixed Amount',
  free_shipping: 'Free Shipping',
  none: 'None'
};

const appliesToLabels: Record<AppliesTo, string> = {
  all_products: 'All Products',
  collections: 'Specific Collections',
  products: 'Specific Products'
};

const typeIcons: Record<PromotionType, React.ReactNode> = {
  banner: <Image size={16} />,
  sitewide_discount: <Percent size={16} />,
  product_discount: <Tag size={16} />,
  free_shipping: <Truck size={16} />,
  promo_code: <Gift size={16} />
};

const generateSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
};

const isValidUrl = (url: string): boolean => {
  if (!url) return true;
  try {
    new URL(url.startsWith('/') ? `https://example.com${url}` : url);
    return true;
  } catch {
    return false;
  }
};

const createEmptyPromotion = (): Omit<Promotion, 'id' | 'createdAt' | 'updatedAt'> => ({
  name: '',
  slug: '',
  type: 'promo_code',
  placement: 'checkout',
  headline: '',
  message: '',
  imageUrl: '',
  videoUrl: '',
  ctaText: '',
  ctaUrl: '',
  discountKind: 'percent',
  discountValue: undefined,
  currency: 'GBP',
  minOrderValue: undefined,
  maxDiscountValue: undefined,
  appliesTo: 'all_products',
  productIds: [],
  productSkus: [],
  collectionIds: [],
  excludeProductIds: [],
  code: '',
  usageLimit: undefined,
  usageCount: 0,
  perCustomerLimit: undefined,
  isEnabled: true,
  status: 'active',
  startAt: '',
  endAt: '',
  priority: 10
});

const Promotions: React.FC = () => {
  const { showToast } = useToast();
  const [promotions, setPromotions] = useState<Promotion[]>(mockPromotions);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | PromotionStatus>('all');
  const [enabledFilter, setEnabledFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | PromotionType>('all');
  const [showFilters, setShowFilters] = useState(false);
  
  // Modal state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null);
  const [deletingPromotion, setDeletingPromotion] = useState<Promotion | null>(null);
  const [formData, setFormData] = useState<Omit<Promotion, 'id' | 'createdAt' | 'updatedAt'>>(createEmptyPromotion());
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Filter and sort promotions
  const filteredPromotions = useMemo(() => {
    let result = [...promotions];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(promo => 
        promo.name.toLowerCase().includes(query) ||
        promo.code?.toLowerCase().includes(query) ||
        promo.headline?.toLowerCase().includes(query) ||
        promo.message?.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(promo => promo.status === statusFilter);
    }

    // Enabled filter
    if (enabledFilter !== 'all') {
      result = result.filter(promo => 
        enabledFilter === 'enabled' ? promo.isEnabled : !promo.isEnabled
      );
    }

    // Type filter
    if (typeFilter !== 'all') {
      result = result.filter(promo => promo.type === typeFilter);
    }

    // Sort by priority (higher first), then updatedAt
    result.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    return result;
  }, [promotions, searchQuery, statusFilter, enabledFilter, typeFilter]);

  // Count by status
  const statusCounts = useMemo(() => ({
    all: promotions.length,
    active: promotions.filter(p => p.status === 'active').length,
    archived: promotions.filter(p => p.status === 'archived').length
  }), [promotions]);

  // Validate form
  const validateForm = useCallback((): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = 'Name is required';
    }

    if (formData.ctaUrl && !isValidUrl(formData.ctaUrl)) {
      errors.ctaUrl = 'Invalid URL format';
    }

    if (formData.type === 'promo_code' && !formData.code?.trim()) {
      errors.code = 'Promo code is required for this type';
    }

    if (formData.type === 'promo_code' && formData.code) {
      const existingCode = promotions.find(
        p => p.code?.toUpperCase() === formData.code?.toUpperCase() && p.id !== editingPromotion?.id
      );
      if (existingCode) {
        errors.code = 'This promo code already exists';
      }
    }

    if (formData.discountKind === 'percent') {
      if (!formData.discountValue || formData.discountValue < 1 || formData.discountValue > 100) {
        errors.discountValue = 'Percentage must be between 1 and 100';
      }
    }

    if (formData.discountKind === 'fixed') {
      if (!formData.discountValue || formData.discountValue <= 0) {
        errors.discountValue = 'Amount must be greater than 0';
      }
    }

    if (formData.startAt && formData.endAt) {
      if (new Date(formData.endAt) <= new Date(formData.startAt)) {
        errors.endAt = 'End date must be after start date';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData, editingPromotion, promotions]);

  // Handle form field change
  const handleFieldChange = (field: keyof typeof formData, value: unknown) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      
      // Auto-generate slug from name
      if (field === 'name' && typeof value === 'string') {
        if (!editingPromotion || prev.slug === generateSlug(prev.name)) {
          updated.slug = generateSlug(value);
        }
      }

      // Normalize promo code to uppercase
      if (field === 'code' && typeof value === 'string') {
        updated.code = value.toUpperCase();
      }

      return updated;
    });

    // Clear error for this field
    if (formErrors[field]) {
      setFormErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  // Open add modal
  const handleAddNew = () => {
    setEditingPromotion(null);
    setFormData(createEmptyPromotion());
    setFormErrors({});
    setIsFormModalOpen(true);
  };

  // Open edit modal
  const handleEdit = (promo: Promotion) => {
    setEditingPromotion(promo);
    setFormData({
      name: promo.name,
      slug: promo.slug,
      type: promo.type,
      placement: promo.placement,
      headline: promo.headline || '',
      message: promo.message || '',
      imageUrl: promo.imageUrl || '',
      videoUrl: promo.videoUrl || '',
      ctaText: promo.ctaText || '',
      ctaUrl: promo.ctaUrl || '',
      discountKind: promo.discountKind,
      discountValue: promo.discountValue,
      currency: promo.currency,
      minOrderValue: promo.minOrderValue,
      maxDiscountValue: promo.maxDiscountValue,
      appliesTo: promo.appliesTo,
      productIds: promo.productIds || [],
      productSkus: promo.productSkus || [],
      collectionIds: promo.collectionIds || [],
      excludeProductIds: promo.excludeProductIds || [],
      code: promo.code || '',
      usageLimit: promo.usageLimit,
      usageCount: promo.usageCount,
      perCustomerLimit: promo.perCustomerLimit,
      isEnabled: promo.isEnabled,
      status: promo.status,
      startAt: promo.startAt?.slice(0, 16) || '',
      endAt: promo.endAt?.slice(0, 16) || '',
      priority: promo.priority
    });
    setFormErrors({});
    setIsFormModalOpen(true);
  };

  // Save promotion
  const handleSave = async () => {
    if (!validateForm()) return;

    setIsSaving(true);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 300));

    const now = new Date().toISOString();
    
    if (editingPromotion) {
      // Update existing
      setPromotions(prev => prev.map(p => 
        p.id === editingPromotion.id 
          ? { 
              ...p, 
              ...formData,
              startAt: formData.startAt ? new Date(formData.startAt).toISOString() : undefined,
              endAt: formData.endAt ? new Date(formData.endAt).toISOString() : undefined,
              updatedAt: now 
            } 
          : p
      ));
      showToast({ title: 'Promotion updated successfully', type: 'success' });
    } else {
      // Create new
      const newPromo: Promotion = {
        ...formData as Promotion,
        id: `promo_${Date.now()}`,
        startAt: formData.startAt ? new Date(formData.startAt).toISOString() : undefined,
        endAt: formData.endAt ? new Date(formData.endAt).toISOString() : undefined,
        createdAt: now,
        updatedAt: now
      };
      setPromotions(prev => [newPromo, ...prev]);
      showToast({ title: 'Promotion created successfully', type: 'success' });
    }

    setIsSaving(false);
    setIsFormModalOpen(false);
  };

  // Toggle enabled
  const handleToggleEnabled = (promo: Promotion) => {
    setPromotions(prev => prev.map(p => 
      p.id === promo.id 
        ? { ...p, isEnabled: !p.isEnabled, updatedAt: new Date().toISOString() } 
        : p
    ));
    showToast({ 
      title: `Promotion ${promo.isEnabled ? 'disabled' : 'enabled'}`, 
      type: 'success' 
    });
  };

  // Toggle archive
  const handleToggleArchive = (promo: Promotion) => {
    const newStatus: PromotionStatus = promo.status === 'active' ? 'archived' : 'active';
    setPromotions(prev => prev.map(p => 
      p.id === promo.id 
        ? { ...p, status: newStatus, updatedAt: new Date().toISOString() } 
        : p
    ));
    showToast({ 
      title: `Promotion ${newStatus === 'archived' ? 'archived' : 'unarchived'}`, 
      type: 'success' 
    });
  };

  // Delete promotion
  const handleDelete = () => {
    if (!deletingPromotion) return;
    setPromotions(prev => prev.filter(p => p.id !== deletingPromotion.id));
    showToast({ title: 'Promotion deleted permanently', type: 'success' });
    setIsDeleteModalOpen(false);
    setDeletingPromotion(null);
  };

  // Reorder priority
  const handleReorder = (promo: Promotion, direction: 'up' | 'down') => {
    const sortedByPriority = [...promotions].sort((a, b) => b.priority - a.priority);
    const currentIndex = sortedByPriority.findIndex(p => p.id === promo.id);
    const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    
    if (swapIndex < 0 || swapIndex >= sortedByPriority.length) return;

    const swapPromo = sortedByPriority[swapIndex];
    const tempPriority = promo.priority;
    
    setPromotions(prev => prev.map(p => {
      if (p.id === promo.id) return { ...p, priority: swapPromo.priority, updatedAt: new Date().toISOString() };
      if (p.id === swapPromo.id) return { ...p, priority: tempPriority, updatedAt: new Date().toISOString() };
      return p;
    }));
  };

  // Export to CSV
  const exportToCSV = () => {
    const headers = ['Name', 'Type', 'Code', 'Discount', 'Status', 'Enabled', 'Priority', 'Start', 'End', 'Usage'];
    const rows = filteredPromotions.map(p => [
      p.name,
      typeLabels[p.type],
      p.code || '-',
      p.discountKind === 'percent' ? `${p.discountValue}%` : 
        p.discountKind === 'fixed' ? `£${p.discountValue}` : 
        p.discountKind === 'free_shipping' ? 'Free Shipping' : '-',
      p.status,
      p.isEnabled ? 'Yes' : 'No',
      p.priority,
      p.startAt ? new Date(p.startAt).toLocaleDateString() : 'Always',
      p.endAt ? new Date(p.endAt).toLocaleDateString() : 'Never',
      p.usageLimit ? `${p.usageCount}/${p.usageLimit}` : p.usageCount.toString()
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `promotions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    showToast({ title: 'Promotions exported successfully', type: 'success' });
  };

  // Format schedule display
  const formatSchedule = (promo: Promotion): string => {
    if (!promo.startAt && !promo.endAt) return 'Always on';
    const start = promo.startAt ? new Date(promo.startAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Now';
    const end = promo.endAt ? new Date(promo.endAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Forever';
    return `${start} – ${end}`;
  };

  // Format discount display
  const formatDiscount = (promo: Promotion): string => {
    if (promo.discountKind === 'percent') return `${promo.discountValue}% off`;
    if (promo.discountKind === 'fixed') return `£${promo.discountValue} off`;
    if (promo.discountKind === 'free_shipping') return 'Free shipping';
    return '-';
  };

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Promotions</h1>
          <p className={styles.subtitle}>{filteredPromotions.length} promotions found</p>
        </div>
        <div className={styles.headerActions}>
          <Button variant="outline" leftIcon={<Download size={16} />} onClick={exportToCSV}>
            Export
          </Button>
          <Button variant="outline" leftIcon={<RefreshCw size={16} />} onClick={() => setPromotions(mockPromotions)}>
            Refresh
          </Button>
          <Button leftIcon={<Plus size={16} />} onClick={handleAddNew}>
            Add Promotion
          </Button>
        </div>
      </div>

      {/* Status Tabs */}
      <div className={styles.statusTabs}>
        <button 
          className={`${styles.statusTab} ${statusFilter === 'all' ? styles.active : ''}`}
          onClick={() => setStatusFilter('all')}
        >
          All <span className={styles.tabCount}>{statusCounts.all}</span>
        </button>
        <button 
          className={`${styles.statusTab} ${statusFilter === 'active' ? styles.active : ''}`}
          onClick={() => setStatusFilter('active')}
        >
          Active <span className={styles.tabCount}>{statusCounts.active}</span>
        </button>
        <button 
          className={`${styles.statusTab} ${statusFilter === 'archived' ? styles.active : ''}`}
          onClick={() => setStatusFilter('archived')}
        >
          Archived <span className={styles.tabCount}>{statusCounts.archived}</span>
        </button>
      </div>

      {/* Search and Filters */}
      <Card className={styles.filtersCard}>
        <div className={styles.searchRow}>
          <div className={styles.searchInput}>
            <Search size={18} className={styles.searchIcon} />
            <input
              type="text"
              placeholder="Search by name, code, or content..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.search}
            />
            {searchQuery && (
              <button className={styles.clearSearch} onClick={() => setSearchQuery('')}>
                <X size={16} />
              </button>
            )}
          </div>
          <Button 
            variant="outline" 
            leftIcon={<Filter size={16} />}
            onClick={() => setShowFilters(!showFilters)}
          >
            Filters
            {(enabledFilter !== 'all' || typeFilter !== 'all') && (
              <span className={styles.filterBadge}>
                {[enabledFilter, typeFilter].filter(f => f !== 'all').length}
              </span>
            )}
          </Button>
        </div>

        {showFilters && (
          <div className={styles.filtersRow}>
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Enabled</label>
              <Select
                value={enabledFilter}
                onChange={(value) => setEnabledFilter(value as typeof enabledFilter)}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'enabled', label: 'Enabled' },
                  { value: 'disabled', label: 'Disabled' },
                ]}
              />
            </div>
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Type</label>
              <Select
                value={typeFilter}
                onChange={(value) => setTypeFilter(value as typeof typeFilter)}
                options={[
                  { value: 'all', label: 'All Types' },
                  { value: 'banner', label: 'Banner' },
                  { value: 'promo_code', label: 'Promo Code' },
                  { value: 'sitewide_discount', label: 'Sitewide Discount' },
                  { value: 'product_discount', label: 'Product Discount' },
                  { value: 'free_shipping', label: 'Free Shipping' },
                ]}
              />
            </div>
            <Button
              variant="ghost" 
              size="sm"
              onClick={() => {
                setStatusFilter('all');
                setEnabledFilter('all');
                setTypeFilter('all');
                setSearchQuery('');
              }}
            >
              Clear Filters
            </Button>
          </div>
        )}
      </Card>

      {/* Promotions List */}
      <div className={styles.promotionsList}>
        {filteredPromotions.length === 0 ? (
          <Card className={styles.emptyState}>
            <div className={styles.emptyContent}>
              <Tag size={48} className={styles.emptyIcon} />
              <h3>No promotions found</h3>
              <p>Try adjusting your search or filter criteria</p>
              <Button leftIcon={<Plus size={16} />} onClick={handleAddNew}>
                Create Your First Promotion
              </Button>
            </div>
          </Card>
        ) : (
          filteredPromotions.map((promo, index) => (
            <Card key={promo.id} className={`${styles.promoCard} ${!promo.isEnabled ? styles.disabled : ''}`}>
              <div className={styles.promoHeader}>
                <div className={styles.promoTypeIcon}>
                  {typeIcons[promo.type]}
                </div>
                <div className={styles.promoInfo}>
                  <div className={styles.promoNameRow}>
                    <h3 className={styles.promoName}>{promo.name}</h3>
                    <div className={styles.promoBadges}>
                      <Badge variant="default" size="sm">{typeLabels[promo.type]}</Badge>
                      {promo.isEnabled ? (
                        <Badge variant="success" size="sm">Enabled</Badge>
                      ) : (
                        <Badge variant="warning" size="sm">Disabled</Badge>
                      )}
                      {promo.status === 'archived' && (
                        <Badge variant="default" size="sm">Archived</Badge>
                      )}
                    </div>
                  </div>
                  <div className={styles.promoMeta}>
                    {promo.code && (
                      <span className={styles.promoCode}>
                        <Hash size={12} /> {promo.code}
                      </span>
                    )}
                    {promo.discountKind !== 'none' && (
                      <span className={styles.promoDiscount}>{formatDiscount(promo)}</span>
                    )}
                    <span className={styles.promoSchedule}>
                      <Calendar size={12} /> {formatSchedule(promo)}
                    </span>
                    <span className={styles.promoPriority}>Priority: {promo.priority}</span>
                  </div>
                  {(promo.headline || promo.message) && (
                    <p className={styles.promoSummary}>
                      {promo.headline || promo.message?.slice(0, 100)}
                      {promo.message && promo.message.length > 100 ? '...' : ''}
                    </p>
                  )}
                </div>
                <div className={styles.promoActions}>
                  <div className={styles.reorderButtons}>
                    <button 
                      className={styles.reorderBtn}
                      onClick={() => handleReorder(promo, 'up')}
                      disabled={index === 0}
                      title="Move up (higher priority)"
                    >
                      <ChevronUp size={16} />
                    </button>
                    <button 
                      className={styles.reorderBtn}
                      onClick={() => handleReorder(promo, 'down')}
                      disabled={index === filteredPromotions.length - 1}
                      title="Move down (lower priority)"
                    >
                      <ChevronDown size={16} />
                    </button>
                  </div>
                  <button 
                    className={styles.actionBtn}
                    onClick={() => handleToggleEnabled(promo)}
                    title={promo.isEnabled ? 'Disable' : 'Enable'}
                  >
                    {promo.isEnabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                  </button>
                  <button 
                    className={styles.actionBtn}
                    onClick={() => handleEdit(promo)}
                    title="Edit"
                  >
                    <Edit size={18} />
                  </button>
                  <button 
                    className={styles.actionBtn}
                    onClick={() => handleToggleArchive(promo)}
                    title={promo.status === 'active' ? 'Archive' : 'Unarchive'}
                  >
                    {promo.status === 'active' ? <Archive size={18} /> : <ArchiveRestore size={18} />}
                  </button>
                  <button 
                    className={`${styles.actionBtn} ${styles.deleteBtn}`}
                    onClick={() => {
                      setDeletingPromotion(promo);
                      setIsDeleteModalOpen(true);
                    }}
                    title="Delete"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
              <div className={styles.promoFooter}>
                <span className={styles.promoUsage}>
                  {promo.usageLimit 
                    ? `${promo.usageCount} / ${promo.usageLimit} uses`
                    : `${promo.usageCount} uses`
                  }
                </span>
                <span className={styles.promoUpdated}>
                  Updated {new Date(promo.updatedAt).toLocaleDateString('en-GB', { 
                    day: 'numeric', 
                    month: 'short', 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </span>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        title={editingPromotion ? 'Edit Promotion' : 'Add Promotion'}
        size="lg"
      >
        <div className={styles.formSections}>
          {/* Basics Section */}
          <div className={styles.formSection}>
            <h4 className={styles.sectionTitle}>Basics</h4>
            <div className={styles.formGrid}>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Name *</label>
                <Input
                  value={formData.name}
                  onChange={(e) => handleFieldChange('name', e.target.value)}
                  placeholder="e.g., Summer Sale 20% Off"
                  error={formErrors.name}
                />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Slug</label>
                <div className={styles.slugField}>
                  <Input
                    value={formData.slug}
                    onChange={(e) => handleFieldChange('slug', e.target.value)}
                    placeholder="auto-generated-slug"
                  />
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleFieldChange('slug', generateSlug(formData.name))}
                  >
                    Regenerate
                  </Button>
                </div>
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Type</label>
                <Select
                  value={formData.type}
                  onChange={(value) => handleFieldChange('type', value)}
                  options={Object.entries(typeLabels).map(([value, label]) => ({ value, label }))}
                />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Placement</label>
                <Select
                  value={formData.placement}
                  onChange={(value) => handleFieldChange('placement', value)}
                  options={Object.entries(placementLabels).map(([value, label]) => ({ value, label }))}
                />
              </div>
            </div>
          </div>

          {/* Content Section */}
          <div className={styles.formSection}>
            <h4 className={styles.sectionTitle}>Content</h4>
            <div className={styles.formGrid}>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Headline</label>
                <Input
                  value={formData.headline}
                  onChange={(e) => handleFieldChange('headline', e.target.value)}
                  placeholder="Short attention-grabbing headline"
                />
              </div>
              <div className={`${styles.formField} ${styles.fullWidth}`}>
                <label className={styles.formLabel}>Message / Description</label>
                <textarea
                  className={styles.textarea}
                  value={formData.message}
                  onChange={(e) => handleFieldChange('message', e.target.value)}
                  placeholder="Detailed description of the promotion..."
                  rows={3}
                />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Image URL</label>
                <Input
                  value={formData.imageUrl}
                  onChange={(e) => handleFieldChange('imageUrl', e.target.value)}
                  placeholder="https://..."
                />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Video URL</label>
                <Input
                  value={formData.videoUrl}
                  onChange={(e) => handleFieldChange('videoUrl', e.target.value)}
                  placeholder="https://..."
                />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>CTA Text</label>
                <Input
                  value={formData.ctaText}
                  onChange={(e) => handleFieldChange('ctaText', e.target.value)}
                  placeholder="e.g., Shop Now"
                />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>CTA URL</label>
                <Input
                  value={formData.ctaUrl}
                  onChange={(e) => handleFieldChange('ctaUrl', e.target.value)}
                  placeholder="/products or https://..."
                  error={formErrors.ctaUrl}
                />
              </div>
            </div>
          </div>

          {/* Discount Section */}
          <div className={styles.formSection}>
            <h4 className={styles.sectionTitle}>Discount Configuration</h4>
            <div className={styles.formGrid}>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Discount Type</label>
                <Select
                  value={formData.discountKind}
                  onChange={(value) => handleFieldChange('discountKind', value)}
                  options={Object.entries(discountKindLabels).map(([value, label]) => ({ value, label }))}
                />
              </div>
              {(formData.discountKind === 'percent' || formData.discountKind === 'fixed') && (
                <div className={styles.formField}>
                  <label className={styles.formLabel}>
                    {formData.discountKind === 'percent' ? 'Percentage (%)' : 'Amount (£)'}
                  </label>
                  <Input
                    type="number"
                    value={formData.discountValue ?? ''}
                    onChange={(e) => handleFieldChange('discountValue', e.target.value ? Number(e.target.value) : undefined)}
                    placeholder={formData.discountKind === 'percent' ? '10' : '5.00'}
                    error={formErrors.discountValue}
                  />
                </div>
              )}
              <div className={styles.formField}>
                <label className={styles.formLabel}>Min Order Value (£)</label>
                <Input
                  type="number"
                  value={formData.minOrderValue ?? ''}
                  onChange={(e) => handleFieldChange('minOrderValue', e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="Optional"
                />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Max Discount Value (£)</label>
                <Input
                  type="number"
                  value={formData.maxDiscountValue ?? ''}
                  onChange={(e) => handleFieldChange('maxDiscountValue', e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="Optional"
                />
              </div>
            </div>
          </div>

          {/* Targeting Section */}
          <div className={styles.formSection}>
            <h4 className={styles.sectionTitle}>Targeting</h4>
            <div className={styles.formGrid}>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Applies To</label>
                <Select
                  value={formData.appliesTo}
                  onChange={(value) => handleFieldChange('appliesTo', value)}
                  options={Object.entries(appliesToLabels).map(([value, label]) => ({ value, label }))}
                />
              </div>
              {formData.appliesTo === 'products' && (
                <div className={`${styles.formField} ${styles.fullWidth}`}>
                  <label className={styles.formLabel}>Product IDs/SKUs (comma-separated)</label>
                  <Input
                    value={formData.productSkus?.join(', ') || ''}
                    onChange={(e) => handleFieldChange('productSkus', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                    placeholder="SKU-001, SKU-002, ..."
                  />
                </div>
              )}
              {formData.appliesTo === 'collections' && (
                <div className={`${styles.formField} ${styles.fullWidth}`}>
                  <label className={styles.formLabel}>Collection IDs (comma-separated)</label>
                  <Input
                    value={formData.collectionIds?.join(', ') || ''}
                    onChange={(e) => handleFieldChange('collectionIds', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                    placeholder="cheese, milk, ..."
                  />
                </div>
              )}
            </div>
          </div>

          {/* Promo Code Section */}
          {formData.type === 'promo_code' && (
            <div className={styles.formSection}>
              <h4 className={styles.sectionTitle}>Promo Code Settings</h4>
              <div className={styles.formGrid}>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Code *</label>
                  <Input
                    value={formData.code}
                    onChange={(e) => handleFieldChange('code', e.target.value)}
                    placeholder="e.g., SUMMER20"
                    error={formErrors.code}
                  />
                </div>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Usage Limit</label>
                  <Input
                    type="number"
                    value={formData.usageLimit ?? ''}
                    onChange={(e) => handleFieldChange('usageLimit', e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="Unlimited"
                  />
                </div>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Per Customer Limit</label>
                  <Input
                    type="number"
                    value={formData.perCustomerLimit ?? ''}
                    onChange={(e) => handleFieldChange('perCustomerLimit', e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="Unlimited"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Schedule Section */}
          <div className={styles.formSection}>
            <h4 className={styles.sectionTitle}>Schedule & Priority</h4>
            <div className={styles.formGrid}>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Start Date/Time</label>
                <Input
                  type="datetime-local"
                  value={formData.startAt}
                  onChange={(e) => handleFieldChange('startAt', e.target.value)}
                />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>End Date/Time</label>
                <Input
                  type="datetime-local"
                  value={formData.endAt}
                  onChange={(e) => handleFieldChange('endAt', e.target.value)}
                  error={formErrors.endAt}
                />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Priority</label>
                <Input
                  type="number"
                  value={formData.priority}
                  onChange={(e) => handleFieldChange('priority', Number(e.target.value) || 0)}
                  placeholder="10"
                />
                <span className={styles.fieldHint}>Higher priority = shown first</span>
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Status</label>
                <div className={styles.toggleRow}>
                  <button
                    type="button"
                    className={`${styles.toggleButton} ${formData.isEnabled ? styles.toggleActive : ''}`}
                    onClick={() => handleFieldChange('isEnabled', !formData.isEnabled)}
                  >
                    {formData.isEnabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                    {formData.isEnabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <ModalFooter>
          <Button variant="outline" onClick={() => setIsFormModalOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : editingPromotion ? 'Update Promotion' : 'Create Promotion'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Delete Promotion"
        size="sm"
      >
        <div className={styles.deleteConfirm}>
          <p>Are you sure you want to permanently delete <strong>{deletingPromotion?.name}</strong>?</p>
          <p className={styles.deleteWarning}>This action cannot be undone.</p>
        </div>
        <ModalFooter>
          <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete}>
            Delete Permanently
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
};

export default Promotions;
