import React, { useState, useMemo, useRef } from 'react';
import { Package, Plus, Search, Edit2, Trash2, Eye, AlertTriangle, Save, Upload, X, Image } from 'lucide-react';
import { 
  Button, Card, Badge, Input, Modal, ModalFooter, 
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  FormGrid, FormRow, FormValue, FormSection
} from '../components/common';
import { Select } from '../components/common/Select/Select';
import { useToast } from '../components/common/Toast';
import { products as initialProducts, Product } from '../data/mockData';
import styles from './Products.module.css';

interface ProductImages {
  thumbnail: string;
  gallery: string[];
}

const categories = ['All', 'Milk', 'Milkshakes', 'Cream', 'Honey', 'Butter', 'Cheese'] as const;
const statuses = ['All', 'active', 'draft', 'archived'] as const;

const getStatusBadge = (status: Product['status']) => {
  const variants: Record<Product['status'], 'success' | 'warning' | 'default'> = {
    active: 'success',
    draft: 'warning',
    archived: 'default'
  };
  return <Badge variant={variants[status]}>{status}</Badge>;
};

const Products: React.FC = () => {
  const { showToast } = useToast();
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Product>>({});
  const [productImages, setProductImages] = useState<ProductImages>({ thumbnail: '', gallery: [] });
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Calculate stats
  const stats = useMemo(() => {
    const active = products.filter(p => p.status === 'active').length;
    const lowStock = products.filter(p => p.stock.quantity <= p.stock.lowStockThreshold).length;
    const outOfStock = products.filter(p => !p.stock.inStock || p.stock.quantity === 0).length;
    return { total: products.length, active, lowStock, outOfStock };
  }, [products]);

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.sku?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'All' || product.category === selectedCategory;
      const matchesStatus = selectedStatus === 'All' || product.status === selectedStatus;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [products, searchQuery, selectedCategory, selectedStatus]);

  const handleViewProduct = (product: Product) => {
    setSelectedProduct(product);
    setIsViewModalOpen(true);
  };

  const handleEditProduct = (product: Product) => {
    setSelectedProduct(product);
    setEditForm({
      name: product.name,
      category: product.category,
      description: product.description,
      price: product.price,
      status: product.status,
      stock: { ...product.stock },
      allergens: [...product.allergens],
      storageNotes: product.storageNotes
    });
    setProductImages({
      thumbnail: product.images[0] || '',
      gallery: product.images.slice(1) || []
    });
    setIsEditModalOpen(true);
  };

  const handleDeleteProduct = (product: Product) => {
    setSelectedProduct(product);
    setIsDeleteModalOpen(true);
  };

  const handleCreateProduct = () => {
    setEditForm({
      name: '',
      category: 'Milk',
      description: '',
      longDescription: '',
      price: 0,
      status: 'draft',
      stock: { inStock: true, quantity: 0, lowStockThreshold: 10 },
      badges: [],
      allergens: [],
      ingredients: [],
      storageNotes: '',
      images: ['/placeholder.svg']
    });
    setProductImages({ thumbnail: '', gallery: [] });
    setIsCreateModalOpen(true);
  };

  const handleSaveEdit = () => {
    if (!selectedProduct) return;
    const allImages = [productImages.thumbnail || '/placeholder.svg', ...productImages.gallery].filter(Boolean);
    setProducts(prev => prev.map(p => 
      p.id === selectedProduct.id 
        ? { ...p, ...editForm, images: allImages, updatedAt: new Date().toISOString() }
        : p
    ));
    showToast({ type: 'success', title: 'Product updated successfully' });
    setIsEditModalOpen(false);
    setSelectedProduct(null);
    setProductImages({ thumbnail: '', gallery: [] });
  };

  const handleSaveCreate = () => {
    const allImages = [productImages.thumbnail || '/placeholder.svg', ...productImages.gallery].filter(Boolean);
    const newProduct: Product = {
      id: `prod_${Date.now()}`,
      name: editForm.name || '',
      category: (editForm.category as Product['category']) || 'Milk',
      description: editForm.description || '',
      longDescription: editForm.longDescription || '',
      price: editForm.price || 0,
      images: allImages.length > 0 ? allImages : ['/placeholder.svg'],
      stock: editForm.stock || { inStock: true, quantity: 0, lowStockThreshold: 10 },
      status: (editForm.status as Product['status']) || 'draft',
      badges: [],
      allergens: editForm.allergens || [],
      ingredients: editForm.ingredients || [],
      storageNotes: editForm.storageNotes || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setProducts(prev => [...prev, newProduct]);
    showToast({ type: 'success', title: 'Product created successfully' });
    setIsCreateModalOpen(false);
    setProductImages({ thumbnail: '', gallery: [] });
  };

  // Image upload handlers
  const handleThumbnailUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProductImages(prev => ({ ...prev, thumbnail: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGalleryUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const remainingSlots = 10 - productImages.gallery.length;
    const filesToProcess = files.slice(0, remainingSlots);
    
    filesToProcess.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProductImages(prev => ({
          ...prev,
          gallery: [...prev.gallery, reader.result as string].slice(0, 10)
        }));
      };
      reader.readAsDataURL(file);
    });
    
    if (files.length > remainingSlots) {
      showToast({ type: 'warning', title: `Only ${remainingSlots} more images allowed (max 10)` });
    }
  };

  const handleRemoveThumbnail = () => {
    setProductImages(prev => ({ ...prev, thumbnail: '' }));
    if (thumbnailInputRef.current) thumbnailInputRef.current.value = '';
  };

  const handleRemoveGalleryImage = (index: number) => {
    setProductImages(prev => ({
      ...prev,
      gallery: prev.gallery.filter((_, i) => i !== index)
    }));
  };

  const handleConfirmDelete = () => {
    if (!selectedProduct) return;
    setProducts(prev => prev.map(p => 
      p.id === selectedProduct.id 
        ? { ...p, status: 'archived' as const, updatedAt: new Date().toISOString() }
        : p
    ));
    showToast({ type: 'success', title: 'Product archived successfully' });
    setIsDeleteModalOpen(false);
    setSelectedProduct(null);
  };

  const handleQuickStatusToggle = (product: Product) => {
    const newStatus: Product['status'] = product.status === 'active' ? 'draft' : 'active';
    setProducts(prev => prev.map(p => 
      p.id === product.id 
        ? { ...p, status: newStatus, updatedAt: new Date().toISOString() }
        : p
    ));
    showToast({ type: 'success', title: `Product ${newStatus === 'active' ? 'activated' : 'deactivated'}` });
  };

  const handleQuickStockUpdate = (product: Product, newQuantity: number) => {
    setProducts(prev => prev.map(p => 
      p.id === product.id 
        ? { 
            ...p, 
            stock: { ...p.stock, quantity: newQuantity, inStock: newQuantity > 0 },
            updatedAt: new Date().toISOString() 
          }
        : p
    ));
  };

  const categoryOptions = categories.map(cat => ({ value: cat, label: cat }));
  const statusOptions = statuses.map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }));

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleSection}>
          <Package size={28} />
          <div>
            <h1 className={styles.title}>Products</h1>
            <p className={styles.subtitle}>Manage your product catalog and inventory</p>
          </div>
        </div>
        <Button onClick={handleCreateProduct}>
          <Plus size={18} />
          Add Product
        </Button>
      </div>

      {/* Stats Cards */}
      <div className={styles.statsGrid}>
        <Card className={styles.statCard}>
          <span className={styles.statLabel}>Total Products</span>
          <span className={styles.statValue}>{stats.total}</span>
        </Card>
        <Card className={styles.statCard}>
          <span className={styles.statLabel}>Active</span>
          <span className={`${styles.statValue} ${styles.success}`}>{stats.active}</span>
        </Card>
        <Card className={styles.statCard}>
          <span className={styles.statLabel}>Low Stock</span>
          <span className={`${styles.statValue} ${styles.warning}`}>{stats.lowStock}</span>
        </Card>
        <Card className={styles.statCard}>
          <span className={styles.statLabel}>Out of Stock</span>
          <span className={`${styles.statValue} ${styles.danger}`}>{stats.outOfStock}</span>
        </Card>
      </div>

      {/* Filters */}
      <Card className={styles.filtersCard}>
        <div className={styles.filters}>
          <Input
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search size={18} />}
            className={styles.searchInput}
          />
          <Select
            options={categoryOptions}
            value={selectedCategory}
            onChange={setSelectedCategory}
            className={styles.filterSelect}
          />
          <Select
            options={statusOptions}
            value={selectedStatus}
            onChange={setSelectedStatus}
            className={styles.filterSelect}
          />
        </div>
      </Card>

      {/* Products Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Badges</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredProducts.map(product => {
              const isLow = product.stock.quantity <= product.stock.lowStockThreshold;
              const isOut = product.stock.quantity === 0;
              return (
                <TableRow key={product.id}>
                  <TableCell>
                    <div className={styles.productCell}>
                      <img src={product.images[0]} alt={product.name} className={styles.productImage} />
                      <div className={styles.productInfo}>
                        <span className={styles.productName}>{product.name}</span>
                        <span className={styles.productSku}>{product.sku}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="default">{product.category}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className={styles.price}>£{product.price.toFixed(2)}</span>
                  </TableCell>
                  <TableCell>
                    <div className={styles.stockCell}>
                      <input
                        type="number"
                        value={product.stock.quantity}
                        onChange={(e) => handleQuickStockUpdate(product, parseInt(e.target.value) || 0)}
                        className={`${styles.stockInput} ${isLow ? styles.lowStock : ''} ${isOut ? styles.outOfStock : ''}`}
                        min="0"
                      />
                      {isLow && !isOut && <AlertTriangle size={14} className={styles.stockWarning} />}
                    </div>
                  </TableCell>
                  <TableCell>
                    <button 
                      className={styles.statusToggle}
                      onClick={() => handleQuickStatusToggle(product)}
                    >
                      {getStatusBadge(product.status)}
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className={styles.badgesCell}>
                      {product.badges.map((badge, i) => (
                        <Badge key={i} variant={badge === 'Bestseller' ? 'success' : badge === 'Limited' ? 'warning' : 'info'} size="sm">
                          {badge}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className={styles.actions}>
                      <Button variant="ghost" size="sm" onClick={() => handleViewProduct(product)}>
                        <Eye size={16} />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleEditProduct(product)}>
                        <Edit2 size={16} />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteProduct(product)}>
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {filteredProducts.length === 0 && (
          <div className={styles.emptyState}>
            <Package size={48} />
            <p>No products found</p>
          </div>
        )}
      </Card>

      {/* View Product Modal - Using FormGrid for consistent layout */}
      <Modal
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        title="Product Details"
        size="lg"
      >
        {selectedProduct && (
          <div className={styles.productDetail}>
            <div className={styles.detailHeader}>
              <img src={selectedProduct.images[0]} alt={selectedProduct.name} className={styles.detailImage} />
              <div className={styles.detailInfo}>
                <h2>{selectedProduct.name}</h2>
                <div className={styles.detailMeta}>
                  {getStatusBadge(selectedProduct.status)}
                  <Badge variant="default">{selectedProduct.category}</Badge>
                  {selectedProduct.badges.map((badge, i) => (
                    <Badge key={i} variant="info">{badge}</Badge>
                  ))}
                </div>
                <p className={styles.detailPrice}>£{selectedProduct.price.toFixed(2)}</p>
              </div>
            </div>
            
            <FormSection title="Description">
              <p className={styles.detailDescription}>{selectedProduct.longDescription || selectedProduct.description}</p>
            </FormSection>

            {selectedProduct.variants && selectedProduct.variants.length > 0 && (
              <FormSection title="Variants">
                <div className={styles.variantsList}>
                  {selectedProduct.variants.map(v => (
                    <div key={v.id} className={styles.variantItem}>
                      <span>{v.name}</span>
                      <span>£{v.price.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </FormSection>
            )}

            <FormSection title="Stock & Product Info">
              <FormGrid>
                <FormValue label="Stock Quantity" value={selectedProduct.stock.quantity} />
                <FormValue label="Low Stock Threshold" value={selectedProduct.stock.lowStockThreshold} />
                <FormValue label="Stock Status" value={selectedProduct.stock.inStock ? 'In Stock' : 'Out of Stock'} />
                <FormValue label="SKU" value={selectedProduct.sku} muted={!selectedProduct.sku} />
                <FormValue label="Allergens" value={selectedProduct.allergens.join(', ') || 'None'} />
                <FormValue label="Storage Notes" value={selectedProduct.storageNotes} />
              </FormGrid>
            </FormSection>
          </div>
        )}
        <ModalFooter>
          <Button variant="outline" onClick={() => setIsViewModalOpen(false)}>Close</Button>
          <Button onClick={() => { setIsViewModalOpen(false); handleEditProduct(selectedProduct!); }}>
            <Edit2 size={16} /> Edit Product
          </Button>
        </ModalFooter>
      </Modal>

      {/* Edit Product Modal - Using FormGrid */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Product"
        size="lg"
      >
        <FormGrid>
          <FormRow label="Product Name" htmlFor="edit-name">
            <input
              id="edit-name"
              type="text"
              value={editForm.name || ''}
              onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
            />
          </FormRow>
          <FormRow label="Category" htmlFor="edit-category">
            <select
              id="edit-category"
              value={editForm.category || 'Milk'}
              onChange={(e) => setEditForm(prev => ({ ...prev, category: e.target.value as Product['category'] }))}
            >
              {categories.slice(1).map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </FormRow>
          <FormRow label="Description" htmlFor="edit-description">
            <textarea
              id="edit-description"
              value={editForm.description || ''}
              onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
              rows={2}
            />
          </FormRow>
          <FormRow label="Price (£)" htmlFor="edit-price">
            <input
              id="edit-price"
              type="number"
              step="0.01"
              min="0"
              value={editForm.price?.toString() || ''}
              onChange={(e) => setEditForm(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
            />
          </FormRow>
          <FormRow label="Status" htmlFor="edit-status">
            <select
              id="edit-status"
              value={editForm.status || 'draft'}
              onChange={(e) => setEditForm(prev => ({ ...prev, status: e.target.value as Product['status'] }))}
            >
              {statuses.slice(1).map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </FormRow>
          <FormRow label="Stock Quantity" htmlFor="edit-stock">
            <input
              id="edit-stock"
              type="number"
              min="0"
              value={editForm.stock?.quantity?.toString() || '0'}
              onChange={(e) => setEditForm(prev => ({ 
                ...prev, 
                stock: { ...prev.stock!, quantity: parseInt(e.target.value) || 0 }
              }))}
            />
          </FormRow>
          <FormRow label="Low Stock Alert" htmlFor="edit-threshold">
            <input
              id="edit-threshold"
              type="number"
              min="0"
              value={editForm.stock?.lowStockThreshold?.toString() || '10'}
              onChange={(e) => setEditForm(prev => ({ 
                ...prev, 
                stock: { ...prev.stock!, lowStockThreshold: parseInt(e.target.value) || 10 }
              }))}
            />
          </FormRow>
          <FormRow label="Allergens" htmlFor="edit-allergens">
            <input
              id="edit-allergens"
              type="text"
              placeholder="Comma-separated (e.g., Milk, Nuts)"
              value={editForm.allergens?.join(', ') || ''}
              onChange={(e) => setEditForm(prev => ({ 
                ...prev, 
                allergens: e.target.value.split(',').map(a => a.trim()).filter(Boolean)
              }))}
            />
          </FormRow>
          <FormRow label="Storage Notes" htmlFor="edit-storage">
            <input
              id="edit-storage"
              type="text"
              value={editForm.storageNotes || ''}
              onChange={(e) => setEditForm(prev => ({ ...prev, storageNotes: e.target.value }))}
            />
          </FormRow>
          
          {/* Image Upload Section */}
          <FormSection title="Product Images">
            <div className={styles.thumbnailUpload}>
              <label className={styles.uploadLabel}>Thumbnail Image</label>
              <div className={styles.thumbnailPreviewArea}>
                {productImages.thumbnail ? (
                  <div className={styles.thumbnailPreview}>
                    <img src={productImages.thumbnail} alt="Thumbnail" />
                    <button 
                      type="button" 
                      className={styles.removeImageBtn}
                      onClick={handleRemoveThumbnail}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div 
                    className={styles.uploadPlaceholder}
                    onClick={() => thumbnailInputRef.current?.click()}
                  >
                    <Image size={32} />
                    <span>Click to upload thumbnail</span>
                  </div>
                )}
                <input
                  ref={thumbnailInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleThumbnailUpload}
                  className={styles.hiddenInput}
                />
              </div>
            </div>
            
            <div className={styles.galleryUpload}>
              <label className={styles.uploadLabel}>Gallery Images ({productImages.gallery.length}/10)</label>
              <div className={styles.galleryGrid}>
                {productImages.gallery.map((img, index) => (
                  <div key={index} className={styles.galleryItem}>
                    <img src={img} alt={`Gallery ${index + 1}`} />
                    <button 
                      type="button" 
                      className={styles.removeImageBtn}
                      onClick={() => handleRemoveGalleryImage(index)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                {productImages.gallery.length < 10 && (
                  <div 
                    className={styles.addGalleryImage}
                    onClick={() => galleryInputRef.current?.click()}
                  >
                    <Upload size={24} />
                    <span>Add</span>
                  </div>
                )}
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleGalleryUpload}
                  className={styles.hiddenInput}
                />
              </div>
            </div>
          </FormSection>
        </FormGrid>
        <ModalFooter>
          <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveEdit}>
            <Save size={16} /> Save Changes
          </Button>
        </ModalFooter>
      </Modal>

      {/* Create Product Modal - Using FormGrid */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create New Product"
        size="lg"
      >
        <FormGrid>
          <FormRow label="Product Name" htmlFor="create-name">
            <input
              id="create-name"
              type="text"
              value={editForm.name || ''}
              onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
            />
          </FormRow>
          <FormRow label="Category" htmlFor="create-category">
            <select
              id="create-category"
              value={editForm.category || 'Milk'}
              onChange={(e) => setEditForm(prev => ({ ...prev, category: e.target.value as Product['category'] }))}
            >
              {categories.slice(1).map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </FormRow>
          <FormRow label="Short Description" htmlFor="create-description">
            <textarea
              id="create-description"
              value={editForm.description || ''}
              onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
              rows={2}
            />
          </FormRow>
          <FormRow label="Long Description" htmlFor="create-long-description">
            <textarea
              id="create-long-description"
              value={editForm.longDescription || ''}
              onChange={(e) => setEditForm(prev => ({ ...prev, longDescription: e.target.value }))}
              rows={3}
            />
          </FormRow>
          <FormRow label="Price (£)" htmlFor="create-price">
            <input
              id="create-price"
              type="number"
              step="0.01"
              min="0"
              value={editForm.price?.toString() || ''}
              onChange={(e) => setEditForm(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
            />
          </FormRow>
          <FormRow label="Status" htmlFor="create-status">
            <select
              id="create-status"
              value={editForm.status || 'draft'}
              onChange={(e) => setEditForm(prev => ({ ...prev, status: e.target.value as Product['status'] }))}
            >
              {statuses.slice(1).map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </FormRow>
          <FormRow label="Initial Stock" htmlFor="create-stock">
            <input
              id="create-stock"
              type="number"
              min="0"
              value={editForm.stock?.quantity?.toString() || '0'}
              onChange={(e) => setEditForm(prev => ({ 
                ...prev, 
                stock: { ...prev.stock!, quantity: parseInt(e.target.value) || 0, inStock: true, lowStockThreshold: prev.stock?.lowStockThreshold || 10 }
              }))}
            />
          </FormRow>
          <FormRow label="Low Stock Alert" htmlFor="create-threshold">
            <input
              id="create-threshold"
              type="number"
              min="0"
              value={editForm.stock?.lowStockThreshold?.toString() || '10'}
              onChange={(e) => setEditForm(prev => ({ 
                ...prev, 
                stock: { ...prev.stock!, lowStockThreshold: parseInt(e.target.value) || 10, quantity: prev.stock?.quantity || 0, inStock: true }
              }))}
            />
          </FormRow>
          <FormRow label="Allergens" htmlFor="create-allergens">
            <input
              id="create-allergens"
              type="text"
              placeholder="Comma-separated (e.g., Milk, Nuts)"
              value={editForm.allergens?.join(', ') || ''}
              onChange={(e) => setEditForm(prev => ({ 
                ...prev, 
                allergens: e.target.value.split(',').map(a => a.trim()).filter(Boolean)
              }))}
            />
          </FormRow>
          <FormRow label="Storage Notes" htmlFor="create-storage">
            <input
              id="create-storage"
              type="text"
              value={editForm.storageNotes || ''}
              onChange={(e) => setEditForm(prev => ({ ...prev, storageNotes: e.target.value }))}
            />
          </FormRow>
          
          {/* Image Upload Section */}
          <FormSection title="Product Images">
            <div className={styles.thumbnailUpload}>
              <label className={styles.uploadLabel}>Thumbnail Image</label>
              <div className={styles.thumbnailPreviewArea}>
                {productImages.thumbnail ? (
                  <div className={styles.thumbnailPreview}>
                    <img src={productImages.thumbnail} alt="Thumbnail" />
                    <button 
                      type="button" 
                      className={styles.removeImageBtn}
                      onClick={handleRemoveThumbnail}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div 
                    className={styles.uploadPlaceholder}
                    onClick={() => thumbnailInputRef.current?.click()}
                  >
                    <Image size={32} />
                    <span>Click to upload thumbnail</span>
                  </div>
                )}
                <input
                  ref={thumbnailInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleThumbnailUpload}
                  className={styles.hiddenInput}
                />
              </div>
            </div>
            
            <div className={styles.galleryUpload}>
              <label className={styles.uploadLabel}>Gallery Images ({productImages.gallery.length}/10)</label>
              <div className={styles.galleryGrid}>
                {productImages.gallery.map((img, index) => (
                  <div key={index} className={styles.galleryItem}>
                    <img src={img} alt={`Gallery ${index + 1}`} />
                    <button 
                      type="button" 
                      className={styles.removeImageBtn}
                      onClick={() => handleRemoveGalleryImage(index)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                {productImages.gallery.length < 10 && (
                  <div 
                    className={styles.addGalleryImage}
                    onClick={() => galleryInputRef.current?.click()}
                  >
                    <Upload size={24} />
                    <span>Add</span>
                  </div>
                )}
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleGalleryUpload}
                  className={styles.hiddenInput}
                />
              </div>
            </div>
          </FormSection>
        </FormGrid>
        <ModalFooter>
          <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveCreate} disabled={!editForm.name}>
            <Plus size={16} /> Create Product
          </Button>
        </ModalFooter>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Archive Product"
        size="sm"
      >
        <div className={styles.deleteConfirm}>
          <AlertTriangle size={48} className={styles.deleteIcon} />
          <p>Are you sure you want to archive <strong>{selectedProduct?.name}</strong>?</p>
          <p className={styles.deleteNote}>This product will be marked as archived and hidden from the storefront.</p>
        </div>
        <ModalFooter>
          <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleConfirmDelete}>
            <Trash2 size={16} /> Archive Product
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
};

export default Products;
