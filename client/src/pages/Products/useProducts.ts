import { useState, useMemo, useRef } from 'react';
import { useToast } from '../../components/common/Toast';
import { products as initialProducts, Product } from './mockData';

export function useProducts() {
  const { showToast } = useToast();

  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState<Partial<Product>>({});

  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const [productImages, setProductImages] = useState({
    thumbnail: '',
    gallery: [] as string[],
  });

  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => {
    const active = products.filter(p => p.status === 'active').length;
    const lowStock = products.filter(p => p.stock.quantity <= p.stock.lowStockThreshold).length;
    const outOfStock = products.filter(p => !p.stock.inStock || p.stock.quantity === 0).length;
    return { total: products.length, active, lowStock, outOfStock };
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      const matchesSearch =
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'All' || product.category === selectedCategory;
      const matchesStatus = selectedStatus === 'All' || product.status === selectedStatus;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [products, searchQuery, selectedCategory, selectedStatus]);

  return {
    products,
    setProducts,

    stats,
    filteredProducts,

    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    selectedStatus,
    setSelectedStatus,

    selectedProduct,
    setSelectedProduct,
    editForm,
    setEditForm,

    isViewModalOpen,
    setIsViewModalOpen,
    isEditModalOpen,
    setIsEditModalOpen,
    isCreateModalOpen,
    setIsCreateModalOpen,
    isDeleteModalOpen,
    setIsDeleteModalOpen,

    productImages,
    setProductImages,
    thumbnailInputRef,
    galleryInputRef,

    showToast,
  };
}
