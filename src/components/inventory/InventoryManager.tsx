import React, { useState, useEffect } from 'react';
import { Product, Category } from '../../types';
import { api } from '../../lib/api';
import { formatCurrency } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import {
  calculatePackagingStock,
  PackagingConfig,
  CalculatedPackagingStock,
} from '../../shared/calculations';
import {
  Boxes,
  Plus,
  SlidersHorizontal,
  Search,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Edit2,
  RefreshCw,
  Trash2,
  Tag,
  Sparkles,
  Lock,
  Package,
  Layers,
  Scale,
} from 'lucide-react';
import { RawInventoryBOMManager } from './RawInventoryBOMManager';

export const InventoryManager: React.FC = () => {
  const { isAdmin } = useAuth();
  const [inventorySection, setInventorySection] = useState<'catalog' | 'raw_bom'>('catalog');
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [rawInventoryItems, setRawInventoryItems] = useState<any[]>([]);
  const [modifierGroupsList, setModifierGroupsList] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');
  const [gstFilter, setGstFilter] = useState<string>('all');

  // Modals state
  const [adjustModalProduct, setAdjustModalProduct] = useState<Product | null>(null);
  const [productEditModal, setProductEditModal] = useState<Product | null | 'new'>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);

  // Recipe ingredients & modifier groups for the product being added or edited
  const [recipeIngredients, setRecipeIngredients] = useState<Array<{ inventoryItemId: string; quantityPerServingBase: number }>>([]);
  const [selectedModifierGroupIds, setSelectedModifierGroupIds] = useState<string[]>([]);

  // Form states for modals
  const [adjustQty, setAdjustQty] = useState<string>('-1');
  const [adjustReason, setAdjustReason] = useState<string>('');
  const [adjustType, setAdjustType] = useState<'ADJUSTMENT' | 'DAMAGE'>('DAMAGE');

  const [modalSubmitting, setModalSubmitting] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Category management modal states
  const [showCategoryModal, setShowCategoryModal] = useState<boolean>(false);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [newCatName, setNewCatName] = useState<string>('');
  const [newCatDesc, setNewCatDesc] = useState<string>('');
  const [catModalLoading, setCatModalLoading] = useState<boolean>(false);
  const [isSeedingDefaults, setIsSeedingDefaults] = useState<boolean>(false);

  // Inline custom category creation in Product modal
  const [showInlineAddCategory, setShowInlineAddCategory] = useState<boolean>(false);
  const [inlineCatName, setInlineCatName] = useState<string>('');
  const [inlineCatDesc, setInlineCatDesc] = useState<string>('');
  const [inlineCatLoading, setInlineCatLoading] = useState<boolean>(false);

  // Packaging hierarchy config state for Add/Edit Product
  const [usePackagingCalc, setUsePackagingCalc] = useState<boolean>(false);
  const [packagingConfig, setPackagingConfig] = useState<PackagingConfig>({
    packageType: 'box',
    packsCount: 5,
    piecesPerPack: 20,
    pieceWeightValue: 50,
    pieceWeightUnit: 'g',
  });

  // Product Form State (Add / Edit)
  const [productForm, setProductForm] = useState<{
    name: string;
    sku: string;
    barcode: string;
    hsnCode: string;
    categoryId: string;
    description: string;
    purchasePrice: number | string;
    purchaseTaxType: 'EXCLUSIVE' | 'INCLUSIVE';
    sellingPrice: number | string;
    taxRate: number | string;
    taxType: 'EXCLUSIVE' | 'INCLUSIVE';
    currentStock: number | string;
    minimumStock: number | string;
    unit: string;
  }>({
    name: '',
    sku: '',
    barcode: '',
    hsnCode: '',
    categoryId: '',
    description: '',
    purchasePrice: '',
    purchaseTaxType: 'EXCLUSIVE',
    sellingPrice: '',
    taxRate: 5,
    taxType: 'EXCLUSIVE',
    currentStock: '',
    minimumStock: 5,
    unit: 'piece',
  });

  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const loadData = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      else setIsRefreshing(true);
      const [pRes, cRes, rawRes, modRes] = await Promise.all([
        api.getProducts({ activeOnly: false }),
        api.getCategories(),
        api.getInventoryRawItems().catch(() => []),
        api.getModifierGroups().catch(() => []),
      ]);
      setProducts(pRes);
      setCategories(cRes);
      setRawInventoryItems(rawRes || []);
      setModifierGroupsList(modRes || []);
    } catch (err: any) {
      if (!silent) setFeedbackMsg({ type: 'error', text: err.message || 'Failed to load catalog' });
    } finally {
      if (!silent) setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData(false);
    const interval = setInterval(() => {
      if (!productEditModal && !adjustModalProduct && !showCategoryModal && !productToDelete) {
        loadData(true);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [productEditModal, adjustModalProduct, showCategoryModal, productToDelete]);

  const filteredProducts = products.filter((p) => {
    if (selectedCategory === '__uncategorized__') {
      if (p.category_id) return false;
    } else if (selectedCategory !== 'all' && p.category_id !== selectedCategory) {
      return false;
    }
    if (stockFilter === 'low' && (p.current_stock > p.minimum_stock || p.current_stock <= 0)) return false;
    if (stockFilter === 'out' && p.current_stock > 0) return false;
    if (gstFilter !== 'all' && Number(p.tax_rate) !== Number(gstFilter)) return false;

    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.barcode.toLowerCase().includes(q) ||
      (p.hsn_code && p.hsn_code.toLowerCase().includes(q))
    );
  });

  // Action: Adjust Stock
  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustModalProduct) return;
    const q = parseFloat(adjustQty);
    if (isNaN(q) || q === 0) {
      setFeedbackMsg({ type: 'error', text: 'Adjustment difference cannot be zero' });
      return;
    }
    if (!adjustReason.trim()) {
      setFeedbackMsg({ type: 'error', text: 'Adjustment reason is mandatory for audit records' });
      return;
    }

    try {
      setModalSubmitting(true);
      await api.adjustStock({
        productId: adjustModalProduct.id,
        quantityDifference: q,
        reason: adjustReason.trim(),
        type: adjustType,
      });
      setFeedbackMsg({ type: 'success', text: `Adjusted ${q} units for ${adjustModalProduct.name}` });
      setAdjustModalProduct(null);
      await loadData();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Failed to adjust stock' });
    } finally {
      setModalSubmitting(false);
    }
  };

  // Action: Save Product (Create or Edit with Recipes and Modifiers)
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setModalSubmitting(true);
      const computedRawCostMinor = recipeIngredients.reduce((sum, ing) => {
        const item = rawInventoryItems.find(r => r.id === ing.inventoryItemId);
        return sum + Math.round((item?.weighted_average_unit_cost_minor || 0) * (ing.quantityPerServingBase || 0));
      }, 0);
      const computedPurchasePrice = computedRawCostMinor > 0 ? (computedRawCostMinor / 100) : (Number(productForm.purchasePrice) || 0);

      let effectiveStock = Number(productForm.currentStock) || 100;
      let effectiveUnit = productForm.unit;
      let packageInfoJson = '';

      if (usePackagingCalc) {
        const calc = calculatePackagingStock(packagingConfig);
        effectiveStock = calc.totalBaseQuantity;
        effectiveUnit = calc.baseUnit;
        packageInfoJson = JSON.stringify({
          ...packagingConfig,
          calculatedDisplay: calc.displayString,
        });
      }

      const payload = {
        ...productForm,
        unit: effectiveUnit,
        currentStock: effectiveStock,
        packageInfo: packageInfoJson,
        purchasePrice: computedPurchasePrice,
        sellingPrice: Number(productForm.sellingPrice) || 0,
        taxRate: Number(productForm.taxRate) || 0,
        minimumStock: Number(productForm.minimumStock) || 5,
        recipeIngredients: recipeIngredients.filter(r => r.inventoryItemId && r.quantityPerServingBase > 0),
        modifierGroupIds: selectedModifierGroupIds,
      };
      if (productEditModal === 'new') {
        await api.createProduct(payload);
        setFeedbackMsg({ type: 'success', text: `Menu item "${productForm.name}" created with BOM recipe!` });
      } else if (productEditModal) {
        await api.updateProduct(productEditModal.id, payload);
        setFeedbackMsg({ type: 'success', text: `Menu item "${productForm.name}" updated with BOM recipe!` });
      }
      setProductEditModal(null);
      await loadData();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Failed to save product' });
    } finally {
      setModalSubmitting(false);
    }
  };

  // Action: Toggle Active
  const handleToggleActive = async (product: Product) => {
    try {
      const willActivate = !product.active;
      await api.toggleProductActive(product.id, willActivate);
      setFeedbackMsg({
        type: 'success',
        text: `Product ${product.name} ${willActivate ? 'activated' : 'deactivated'}`,
      });
      await loadData();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Operation failed' });
    }
  };

  // Action: Delete Product (Admin Only)
  const handleDeleteProduct = async () => {
    if (!productToDelete) return;
    try {
      setModalSubmitting(true);
      await api.deleteProduct(productToDelete.id);
      setFeedbackMsg({
        type: 'success',
        text: `Product "${productToDelete.name}" permanently removed from inventory`,
      });
      setProductToDelete(null);
      await loadData();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Failed to remove product' });
    } finally {
      setModalSubmitting(false);
    }
  };

  // Action: Create inline category from product modal
  const handleCreateInlineCategory = async () => {
    const clean = inlineCatName.trim();
    if (!clean) return;
    try {
      setInlineCatLoading(true);
      const newCat = await api.createCategory({
        name: clean,
        description: inlineCatDesc.trim() || undefined,
      });
      setCategories((prev) => {
        if (prev.some((c) => c.id === newCat.id)) return prev;
        return [...prev, newCat];
      });
      setProductForm((prev) => ({ ...prev, categoryId: newCat.id }));
      setShowInlineAddCategory(false);
      setInlineCatName('');
      setInlineCatDesc('');
      setFeedbackMsg({ type: 'success', text: `Category "${newCat.name}" created and selected!` });
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Failed to create category' });
    } finally {
      setInlineCatLoading(false);
    }
  };

  // Action: Create category from category modal
  const handleCreateCategoryInModal = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newCatName.trim();
    if (!clean) return;
    try {
      setCatModalLoading(true);
      const newCat = await api.createCategory({
        name: clean,
        description: newCatDesc.trim() || undefined,
      });
      setCategories((prev) => {
        if (prev.some((c) => c.id === newCat.id)) return prev;
        return [...prev, newCat];
      });
      setNewCatName('');
      setNewCatDesc('');
      setFeedbackMsg({ type: 'success', text: `Category "${newCat.name}" added successfully` });
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Failed to add category' });
    } finally {
      setCatModalLoading(false);
    }
  };

  // Action: Admin delete category
  const handleDeleteCategory = async () => {
    if (!categoryToDelete) return;
    if (!isAdmin) {
      setFeedbackMsg({ type: 'error', text: 'Admin privileges required to remove categories' });
      return;
    }
    try {
      setCatModalLoading(true);
      const res = await api.deleteCategory(categoryToDelete.id);
      setCategories((prev) => prev.filter((c) => c.id !== categoryToDelete.id));
      setProducts((prev) =>
        prev.map((p) =>
          p.category_id === categoryToDelete.id ? { ...p, category_id: undefined } : p
        )
      );
      if (selectedCategory === categoryToDelete.id) {
        setSelectedCategory('all');
      }
      if (productForm.categoryId === categoryToDelete.id) {
        setProductForm((prev) => ({ ...prev, categoryId: '' }));
      }
      setFeedbackMsg({
        type: 'success',
        text: res.message || `Category "${categoryToDelete.name}" removed successfully`,
      });
      setCategoryToDelete(null);
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Failed to delete category' });
    } finally {
      setCatModalLoading(false);
    }
  };

  // Action: Admin seed standard categories
  const handleSeedDefaults = async () => {
    if (!isAdmin) return;
    try {
      setIsSeedingDefaults(true);
      const seeded = await api.seedDefaultCategories();
      setCategories(seeded);
      setFeedbackMsg({
        type: 'success',
        text: 'Standard store categories loaded successfully!',
      });
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Failed to seed categories' });
    } finally {
      setIsSeedingDefaults(false);
    }
  };

  const openNewProductModal = () => {
    setShowInlineAddCategory(false);
    setInlineCatName('');
    setInlineCatDesc('');
    setProductForm({
      name: '',
      sku: '',
      barcode: '',
      hsnCode: '2105',
      categoryId: categories[0]?.id || '',
      description: '',
      purchasePrice: '',
      purchaseTaxType: 'EXCLUSIVE',
      sellingPrice: '',
      taxRate: 5,
      taxType: 'EXCLUSIVE',
      currentStock: '100',
      minimumStock: 10,
      unit: 'scoop',
    });
    const defaultRaw = rawInventoryItems.find(r => r.name.toLowerCase().includes('base')) || rawInventoryItems[0];
    setRecipeIngredients(defaultRaw ? [{ inventoryItemId: defaultRaw.id, quantityPerServingBase: 100 }] : []);
    setSelectedModifierGroupIds(modifierGroupsList.map(g => g.id));
    setUsePackagingCalc(false);
    setPackagingConfig({
      packageType: 'box',
      packsCount: 5,
      piecesPerPack: 20,
      pieceWeightValue: 50,
      pieceWeightUnit: 'g',
    });
    setProductEditModal('new');
  };

  const openEditModal = (p: Product) => {
    setShowInlineAddCategory(false);
    setInlineCatName('');
    setInlineCatDesc('');

    let parsedPkg: any = null;
    if (p.package_info) {
      try {
        parsedPkg = JSON.parse(p.package_info);
      } catch (_) {}
    }

    if (parsedPkg && parsedPkg.packageType) {
      setUsePackagingCalc(true);
      setPackagingConfig({
        packageType: parsedPkg.packageType || 'box',
        packsCount: Number(parsedPkg.packsCount) || 1,
        piecesPerPack: Number(parsedPkg.piecesPerPack) || 20,
        pieceWeightValue: Number(parsedPkg.pieceWeightValue) || 50,
        pieceWeightUnit: parsedPkg.pieceWeightUnit || 'g',
      });
    } else {
      setUsePackagingCalc(false);
      setPackagingConfig({
        packageType: 'box',
        packsCount: 5,
        piecesPerPack: 20,
        pieceWeightValue: 50,
        pieceWeightUnit: 'g',
      });
    }
    setProductForm({
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
      hsnCode: p.hsn_code || '',
      categoryId: p.category_id || '',
      description: p.description || '',
      purchasePrice: p.purchase_price > 0 ? p.purchase_price : '',
      purchaseTaxType: p.purchase_tax_type || 'EXCLUSIVE',
      sellingPrice: p.selling_price > 0 ? p.selling_price : '',
      taxRate: p.tax_rate,
      taxType: p.tax_type || 'EXCLUSIVE',
      currentStock: p.current_stock,
      minimumStock: p.minimum_stock,
      unit: p.unit,
    });
    if (p.recipe?.ingredients && p.recipe.ingredients.length > 0) {
      setRecipeIngredients(p.recipe.ingredients.map((ing: any) => ({
        inventoryItemId: ing.inventoryItemId,
        quantityPerServingBase: ing.quantityPerServingBase,
      })));
    } else {
      setRecipeIngredients([]);
    }
    if (p.modifierGroups) {
      setSelectedModifierGroupIds(p.modifierGroups.map((g: any) => g.id));
    } else {
      setSelectedModifierGroupIds([]);
    }
    setProductEditModal(p);
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-neutral-50 overflow-y-auto md:overflow-hidden">
      {/* Top Header & Actions */}
      <div className="p-4 bg-white border-b border-neutral-200 space-y-3 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h1 className="text-base font-semibold text-neutral-900 leading-none">
              Inventory & Catalog
            </h1>
            <p className="text-xs text-neutral-500 mt-1">
              Track on-hand stock, receive deliveries, and log damage adjustments.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-[10px] text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded font-medium shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>

            <button
              onClick={() => loadData(false)}
              className="p-1.5 text-neutral-500 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 rounded transition-colors cursor-pointer"
              title="Auto-refreshing live every 4s. Click to refresh catalog now."
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing || loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              type="button"
              onClick={() => setShowCategoryModal(true)}
              className="px-3 py-1.5 border border-neutral-300 text-neutral-700 bg-white hover:bg-neutral-50 text-xs font-semibold rounded transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
              title="View and manage inventory categories"
            >
              <Tag className="w-3.5 h-3.5 text-neutral-500" />
              <span>Categories ({categories.length})</span>
            </button>

            <button
              onClick={openNewProductModal}
              className="px-3 py-1.5 bg-neutral-900 text-white text-xs font-semibold rounded hover:bg-neutral-800 transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Product
            </button>
          </div>
        </div>

        {/* Section Navigation Tabs */}
        <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-lg border border-neutral-200 w-fit">
          <button
            onClick={() => setInventorySection('catalog')}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
              inventorySection === 'catalog'
                ? 'bg-white text-neutral-900 shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Menu Products Catalog
          </button>
          <button
            onClick={() => setInventorySection('raw_bom')}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
              inventorySection === 'raw_bom'
                ? 'bg-white text-neutral-900 shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Bulk Raw Materials & BOM Ledger
          </button>
        </div>

        {inventorySection === 'catalog' && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search ice cream scoops, sundaes, shakes, or SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded text-xs focus:bg-white focus:outline-none focus:border-neutral-900"
            />
          </div>

          {/* Stock filter pills */}
          <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded border border-neutral-200">
            <span className="text-neutral-500 text-[10px] uppercase font-mono px-1">Alerts:</span>
            {[
              { id: 'all', label: 'All Items' },
              { id: 'low', label: 'Low Stock' },
              { id: 'out', label: 'Out of Stock' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setStockFilter(f.id as any)}
                className={`px-2 py-0.5 rounded transition-colors text-xs font-medium ${
                  stockFilter === f.id
                    ? 'bg-white text-neutral-900 shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* GST Slab Filter Dropdown */}
          <select
            value={gstFilter}
            onChange={(e) => setGstFilter(e.target.value)}
            className="px-2 py-1 bg-white border border-neutral-200 rounded text-xs text-neutral-700 focus:outline-none"
            title="Filter by GST Slab"
          >
            <option value="all">All GST Slabs</option>
            <option value="0">0% Exempt</option>
            <option value="3">3% GST</option>
            <option value="5">5% GST</option>
            <option value="12">12% GST</option>
            <option value="18">18% GST</option>
            <option value="28">28% GST</option>
          </select>

          {/* Category Dropdown */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-2 py-1 bg-white border border-neutral-200 rounded text-xs text-neutral-700 focus:outline-none"
            title="Filter by Category"
          >
            <option value="all">All Categories ({products.length})</option>
            {categories.map((c) => {
              const count = products.filter((p) => p.category_id === c.id).length;
              return (
                <option key={c.id} value={c.id}>
                  {c.name} ({count})
                </option>
              );
            })}
            <option value="__uncategorized__">
              Uncategorized ({products.filter((p) => !p.category_id).length})
            </option>
          </select>
        </div>
        )}
      </div>

      {inventorySection === 'raw_bom' ? (
        <div className="p-4 flex-1 overflow-y-auto">
          <RawInventoryBOMManager />
        </div>
      ) : (
        <>
      {/* Notification Toast Banner */}
      {feedbackMsg && (
        <div
          className={`mx-4 mt-3 p-2.5 rounded text-xs flex justify-between items-center ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          <span>{feedbackMsg.text}</span>
          <button onClick={() => setFeedbackMsg(null)} className="font-bold ml-2">✕</button>
        </div>
      )}

      {/* Product List Table */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="p-8 text-center text-xs text-neutral-400">Loading catalog data...</div>
        ) : filteredProducts.length === 0 ? (
          <div className="bg-white rounded border border-neutral-200 p-8 text-center text-xs text-neutral-500">
            No products found matching current criteria.
          </div>
        ) : (
          <div className="bg-white rounded border border-neutral-200 shadow-xs overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs border-collapse">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 font-semibold">
                  <th className="py-2.5 px-3">Product Name</th>
                  <th className="py-2.5 px-3">SKU / Barcode</th>
                  <th className="py-2.5 px-3 text-right">Cost Price</th>
                  <th className="py-2.5 px-3 text-right">Selling Price</th>
                  <th className="py-2.5 px-3 text-center">GST Slab / HSN</th>
                  <th className="py-2.5 px-3 text-right">Stock</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filteredProducts.map((p) => {
                  const isOutOfStock = p.current_stock <= 0;
                  const isLowStock = p.current_stock <= p.minimum_stock && !isOutOfStock;

                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-neutral-50 transition-colors ${
                        !p.active ? 'opacity-50 bg-neutral-50' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-neutral-900">{p.name}</div>
                        <div className="text-[10px] text-neutral-400">{p.unit}</div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-neutral-600">
                        <div>{p.sku}</div>
                        <div className="text-[10px] text-neutral-400">{p.barcode}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-neutral-500">
                        <div>{formatCurrency(p.purchase_price)}</div>
                        <div className="text-[9px] text-neutral-400">
                          {p.purchase_tax_type === 'INCLUSIVE' ? 'Incl. GST' : 'Excl. GST'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="font-mono font-bold tabular-nums text-neutral-900">
                          {formatCurrency(p.selling_price)}
                        </div>
                        <div className="text-[10px] text-neutral-400 font-mono">
                          {p.tax_type === 'INCLUSIVE' ? 'Incl. GST' : 'Excl. GST'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`inline-block font-mono text-[11px] font-semibold px-2 py-0.5 rounded ${
                          p.tax_rate === 0
                            ? 'bg-neutral-100 text-neutral-600'
                            : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        }`}>
                          {p.tax_rate === 0 ? '0% Exempt' : `${p.tax_rate}% GST`}
                        </span>
                        <div className="text-[10px] text-neutral-500 font-mono mt-0.5">
                          {p.hsn_code ? `HSN: ${p.hsn_code}` : 'No HSN'}
                        </div>
                        {p.tax_rate > 0 && (
                          <div className="text-[9px] text-neutral-400 font-mono">
                            Tax: {formatCurrency(
                              p.tax_type === 'INCLUSIVE'
                                ? p.selling_price - p.selling_price / (1 + p.tax_rate / 100)
                                : p.selling_price * (p.tax_rate / 100)
                            )}/unit
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="font-mono font-bold text-sm text-neutral-900 tabular-nums">
                          {p.current_stock.toLocaleString('en-IN')} {p.unit}
                        </div>
                        {p.package_info && (() => {
                          try {
                            const pkg = JSON.parse(p.package_info);
                            if (pkg.packageType && pkg.piecesPerPack) {
                              const boxes = Math.floor(p.current_stock / (pkg.piecesPerPack * (pkg.pieceWeightUnit === 'g' || pkg.pieceWeightUnit === 'ml' ? (pkg.pieceWeightValue || 1) : 1)));
                              return (
                                <div className="text-[10px] text-emerald-700 font-medium">
                                  📦 {pkg.packageType}s ({pkg.piecesPerPack} pcs/pack)
                                </div>
                              );
                            }
                          } catch (_) {}
                          return null;
                        })()}
                        <div className="text-[10px] text-neutral-400 font-mono">
                          Min: {p.minimum_stock}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {!p.active ? (
                          <span className="text-[10px] text-neutral-400 font-medium">Inactive</span>
                        ) : isOutOfStock ? (
                          <span className="text-[10px] text-red-600 font-semibold px-1.5 py-0.5 rounded bg-red-50 border border-red-200">
                            Out of Stock
                          </span>
                        ) : isLowStock ? (
                          <span className="text-[10px] text-amber-700 font-medium px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200">
                            Low Stock
                          </span>
                        ) : (
                          <span className="text-[10px] text-emerald-700 font-medium px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200">
                            In Stock
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right space-x-1.5">
                        {/* Adjust Stock */}
                        <button
                          onClick={() => {
                            setAdjustModalProduct(p);
                            setAdjustQty('-1');
                            setAdjustReason('');
                            setAdjustType('DAMAGE');
                          }}
                          className="px-2 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded text-[11px] font-medium transition-colors inline-flex items-center gap-1"
                          title="Record damage or stock adjustment with reason"
                        >
                          <SlidersHorizontal className="w-3 h-3" />
                          Adjust
                        </button>

                        {/* Admin Actions */}
                        {isAdmin && (
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => openEditModal(p)}
                              className="p-1 text-neutral-400 hover:text-neutral-900 rounded hover:bg-neutral-100 transition-colors inline-flex cursor-pointer"
                              title="Edit product info"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setProductToDelete(p)}
                              className="p-1 text-neutral-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors inline-flex cursor-pointer"
                              title="Remove product from inventory (Admin only)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal 1: Adjust Stock */}
      {adjustModalProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <form onSubmit={handleAdjustStock} className="bg-white rounded-lg border border-neutral-200 shadow-xl max-w-sm w-full p-5 space-y-4 max-h-[85dvh] overflow-y-auto">
            <div>
              <h3 className="font-semibold text-sm text-neutral-900">Adjust Stock (Audit Trail)</h3>
              <p className="text-xs text-neutral-500 mt-0.5 font-medium">{adjustModalProduct.name}</p>
              <p className="text-[11px] text-neutral-400 font-mono mt-0.5">Current Stock: {adjustModalProduct.current_stock} {adjustModalProduct.unit}</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-neutral-700 block mb-1">
                  Adjustment Type:
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setAdjustType('DAMAGE');
                      setAdjustQty('-1');
                    }}
                    className={`p-2 rounded border text-left font-medium ${
                      adjustType === 'DAMAGE' ? 'border-neutral-900 bg-neutral-50 font-bold' : 'border-neutral-200'
                    }`}
                  >
                    Damage / Spoilage
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAdjustType('ADJUSTMENT');
                      setAdjustQty('1');
                    }}
                    className={`p-2 rounded border text-left font-medium ${
                      adjustType === 'ADJUSTMENT' ? 'border-neutral-900 bg-neutral-50 font-bold' : 'border-neutral-200'
                    }`}
                  >
                    Inventory Count Correction
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-neutral-700 block mb-1">
                  Quantity Difference (use negative for deduction, positive for addition):
                </label>
                <input
                  type="number"
                  step="1"
                  placeholder="0"
                  value={adjustQty}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => {
                    if (['e', 'E', '+'].includes(e.key)) e.preventDefault();
                  }}
                  onChange={(e) => setAdjustQty(e.target.value.replace(/^0+(?=\d)/, ''))}
                  required
                  className="w-full px-2.5 py-1.5 text-xs border border-neutral-300 rounded font-mono focus:border-neutral-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-neutral-700 block mb-1">
                  Reason <span className="text-red-500">*</span>:
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Broken bottle during restocking, audit variance count..."
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  required
                  className="w-full p-2 text-xs border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setAdjustModalProduct(null)}
                className="px-3 py-1.5 text-xs text-neutral-600 hover:text-neutral-900 font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={modalSubmitting || !adjustReason.trim()}
                className="px-4 py-1.5 text-xs font-semibold bg-neutral-900 text-white rounded hover:bg-neutral-800 transition-colors disabled:opacity-50"
              >
                {modalSubmitting ? 'Recording...' : 'Record Adjustment'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal 3: Add / Edit Product with Ice Cream BOM Recipe & Modifiers */}
      {productEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <form onSubmit={handleSaveProduct} className="bg-white rounded-xl border border-neutral-200 shadow-2xl max-w-2xl w-full p-6 space-y-4 my-8 max-h-[88dvh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div>
                <h3 className="font-bold text-sm text-neutral-900 flex items-center gap-1.5">
                  <span>🍨</span>
                  <span>{productEditModal === 'new' ? 'Create Ice Cream / Menu Item' : 'Edit Menu Product & Recipe'}</span>
                </h3>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  Configure menu item details, bulk ingredient portion recipe (BOM), and checkout modifiers.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setProductEditModal(null)}
                className="text-neutral-400 hover:text-neutral-700 text-sm font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Product Name */}
              <div>
                <label className="font-medium text-neutral-700 block mb-1">Product / Menu Item Name *</label>
                <input
                  type="text"
                  required
                  value={productForm.name}
                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                  placeholder="e.g. Belgian Dark Chocolate Scoop, Oreo Shake, Berry Sundae"
                  className="w-full px-2.5 py-1.5 border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none"
                />
              </div>

              {/* SKU & Barcode (Optional) */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-medium text-neutral-700 block mb-1">
                    Item Code / SKU <span className="text-[10px] text-neutral-400 font-normal">(auto-generated if empty)</span>
                  </label>
                  <input
                    type="text"
                    value={productForm.sku}
                    placeholder="e.g. SCOOP-BELGIAN-01"
                    onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })}
                    className="w-full px-2.5 py-1.5 font-mono border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-medium text-neutral-700 block mb-1">
                    Barcode / EAN <span className="text-[10px] text-neutral-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={productForm.barcode}
                    onChange={(e) => setProductForm({ ...productForm, barcode: e.target.value })}
                    className="w-full px-2.5 py-1.5 font-mono border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none"
                    placeholder="Optional barcode"
                  />
                </div>
              </div>

              {/* Category & Unit */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-medium text-neutral-700 block text-xs">
                      Category <span className="text-neutral-400 font-normal">({categories.length} available)</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setShowInlineAddCategory(!showInlineAddCategory);
                        setInlineCatName('');
                        setInlineCatDesc('');
                      }}
                      className="text-[11px] text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1 cursor-pointer"
                      title="Create a new custom category right now"
                    >
                      <Plus className="w-3 h-3" />
                      <span>+ Custom Category</span>
                    </button>
                  </div>
                  <select
                    value={productForm.categoryId}
                    onChange={(e) => {
                      if (e.target.value === '__NEW__') {
                        setShowInlineAddCategory(true);
                      } else {
                        setProductForm({ ...productForm, categoryId: e.target.value });
                      }
                    }}
                    className="w-full px-2.5 py-1.5 border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none text-xs bg-white"
                  >
                    <option value="">None / Uncategorized</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                    <option value="__NEW__" className="text-emerald-700 font-semibold bg-emerald-50">
                      + Add New Category...
                    </option>
                  </select>

                  {/* Inline Custom Category Creator box */}
                  {showInlineAddCategory && (
                    <div className="mt-2 p-2.5 bg-emerald-50/90 border border-emerald-300 rounded text-xs space-y-2 animate-in fade-in">
                      <div className="flex items-center justify-between font-semibold text-emerald-950 text-[11px]">
                        <span className="flex items-center gap-1">
                          <Tag className="w-3 h-3 text-emerald-700" />
                          New Custom Category
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowInlineAddCategory(false)}
                          className="text-neutral-400 hover:text-neutral-700 font-bold px-1"
                        >
                          ✕
                        </button>
                      </div>
                      <input
                        type="text"
                        value={inlineCatName}
                        onChange={(e) => setInlineCatName(e.target.value)}
                        placeholder="Category name (e.g. Gourmet Gelato, Thickshakes)"
                        className="w-full px-2 py-1 bg-white border border-emerald-300 rounded text-xs focus:outline-none focus:border-emerald-600"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleCreateInlineCategory();
                          }
                        }}
                      />
                      <input
                        type="text"
                        value={inlineCatDesc}
                        onChange={(e) => setInlineCatDesc(e.target.value)}
                        placeholder="Description (optional)"
                        className="w-full px-2 py-1 bg-white border border-emerald-300 rounded text-xs focus:outline-none focus:border-emerald-600"
                      />
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] text-emerald-800">Immediately selectable</span>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => setShowInlineAddCategory(false)}
                            className="px-2 py-1 border border-neutral-300 bg-white rounded text-neutral-600 hover:bg-neutral-50 text-[11px]"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={inlineCatLoading || !inlineCatName.trim()}
                            onClick={handleCreateInlineCategory}
                            className="px-3 py-1 bg-emerald-700 text-white rounded font-medium text-[11px] hover:bg-emerald-800 disabled:opacity-50 cursor-pointer flex items-center gap-1"
                          >
                            {inlineCatLoading ? 'Adding...' : 'Save & Select'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <label className="font-medium text-neutral-700 block mb-1">Serving Unit</label>
                  <input
                    type="text"
                    value={productForm.unit}
                    onChange={(e) => setProductForm({ ...productForm, unit: e.target.value })}
                    placeholder="scoop, cup, glass, portion, piece"
                    className="w-full px-2.5 py-1.5 border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none"
                  />
                  <div className="flex gap-1 mt-1 text-[10px]">
                    {['scoop', 'cup', 'glass', 'portion', 'piece'].map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setProductForm({ ...productForm, unit: u })}
                        className={`px-1.5 py-0.5 rounded border ${
                          productForm.unit === u
                            ? 'bg-neutral-900 text-white border-neutral-900'
                            : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400'
                        }`}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* SECTION: Bill of Materials (BOM) & Recipe Ingredients */}
              <div className="p-3.5 bg-neutral-50 rounded-lg border border-neutral-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Boxes className="w-4 h-4 text-emerald-700" />
                    <div>
                      <span className="font-semibold text-neutral-900 text-xs block">
                        Recipe & Bill of Materials (BOM) Depletion
                      </span>
                      <span className="text-[10px] text-neutral-500">
                        Portions deducted from bulk raw warehouse inventory (g, ml, piece) at checkout.
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const firstItem = rawInventoryItems[0];
                      if (firstItem) {
                        setRecipeIngredients([
                          ...recipeIngredients,
                          { inventoryItemId: firstItem.id, quantityPerServingBase: 100 },
                        ]);
                      }
                    }}
                    className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 px-2 py-1 rounded border border-emerald-200 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>+ Add Ingredient</span>
                  </button>
                </div>

                {recipeIngredients.length === 0 ? (
                  <div className="p-3 text-center text-[11px] text-neutral-400 bg-white rounded border border-dashed border-neutral-200">
                    No recipe ingredients added yet. Click "+ Add Ingredient" to link bulk raw materials.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recipeIngredients.map((ing, idx) => {
                      const selectedRaw = rawInventoryItems.find((r) => r.id === ing.inventoryItemId);
                      const unitCostMinor = selectedRaw?.weighted_average_unit_cost_minor || 0;
                      const lineCostMinor = Math.round(unitCostMinor * (ing.quantityPerServingBase || 0));
                      const baseUnit = selectedRaw?.base_unit_code || 'g';

                      return (
                        <div
                          key={idx}
                          className="flex flex-wrap sm:flex-nowrap items-center gap-2 p-2 bg-white rounded border border-neutral-200 text-xs"
                        >
                          <div className="flex-1 min-w-[180px]">
                            <select
                              value={ing.inventoryItemId}
                              onChange={(e) => {
                                const newId = e.target.value;
                                setRecipeIngredients(
                                  recipeIngredients.map((item, i) =>
                                    i === idx ? { ...item, inventoryItemId: newId } : item
                                  )
                                );
                              }}
                              className="w-full px-2 py-1 text-xs border border-neutral-300 rounded focus:outline-none focus:border-neutral-900 bg-white"
                            >
                              {rawInventoryItems.map((raw) => (
                                <option key={raw.id} value={raw.id}>
                                  {raw.name} ({raw.base_unit_code}) - Stock: {raw.current_stock_base?.toLocaleString()} {raw.base_unit_code}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="w-28 flex items-center gap-1">
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={ing.quantityPerServingBase || ''}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                setRecipeIngredients(
                                  recipeIngredients.map((item, i) =>
                                    i === idx ? { ...item, quantityPerServingBase: val } : item
                                  )
                                );
                              }}
                              className="w-16 px-1.5 py-1 text-xs font-mono border border-neutral-300 rounded text-right focus:outline-none focus:border-neutral-900"
                              placeholder="100"
                            />
                            <span className="text-[11px] text-neutral-500 font-mono">{baseUnit}</span>
                          </div>

                          <div className="w-24 text-right font-mono text-[11px] text-neutral-700">
                            ₹{(lineCostMinor / 100).toFixed(2)}
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setRecipeIngredients(recipeIngredients.filter((_, i) => i !== idx));
                            }}
                            className="p-1 text-neutral-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                            title="Remove ingredient"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Recipe Raw Cost & Margin Summary */}
                {(() => {
                  const totalRawCostMinor = recipeIngredients.reduce((sum, ing) => {
                    const item = rawInventoryItems.find((r) => r.id === ing.inventoryItemId);
                    return sum + Math.round((item?.weighted_average_unit_cost_minor || 0) * (ing.quantityPerServingBase || 0));
                  }, 0);
                  const totalRawCostRupees = totalRawCostMinor / 100;
                  const sp = Number(productForm.sellingPrice) || 0;
                  const marginAmt = sp - totalRawCostRupees;
                  const marginPct = sp > 0 ? Math.round((marginAmt / sp) * 100) : 0;

                  return (
                    <div className="flex flex-wrap items-center justify-between p-2 bg-emerald-50/70 border border-emerald-200 rounded text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <span className="text-emerald-900 font-medium">Portion Raw Cost:</span>
                        <span className="font-mono font-bold text-emerald-950">
                          {formatCurrency(totalRawCostRupees)}
                        </span>
                      </div>
                      {sp > 0 && (
                        <div className="text-emerald-900 font-mono">
                          Gross Margin: <strong className="text-emerald-950">{formatCurrency(marginAmt)}</strong> ({marginPct}%)
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* SECTION: Serving Style & Modifiers Checkbox Groups */}
              {modifierGroupsList.length > 0 && (
                <div className="p-3.5 bg-neutral-50 rounded-lg border border-neutral-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-neutral-900 text-xs block">
                        Serving Style & Checkout Modifiers
                      </span>
                      <span className="text-[10px] text-neutral-500">
                        Enable option prompts for cashier (e.g. Waffle Cone, Gourmet Toppings).
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {modifierGroupsList.map((group) => {
                      const isChecked = selectedModifierGroupIds.includes(group.id);
                      return (
                        <label
                          key={group.id}
                          className={`flex items-start gap-2.5 p-2.5 rounded border transition-colors cursor-pointer ${
                            isChecked
                              ? 'bg-white border-neutral-900 shadow-xs'
                              : 'bg-neutral-100/60 border-neutral-200 text-neutral-600'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedModifierGroupIds([...selectedModifierGroupIds, group.id]);
                              } else {
                                setSelectedModifierGroupIds(selectedModifierGroupIds.filter((id) => id !== group.id));
                              }
                            }}
                            className="mt-0.5 rounded text-neutral-900 focus:ring-0 cursor-pointer"
                          />
                          <div className="min-w-0">
                            <span className="font-semibold text-neutral-900 text-xs block truncate">
                              {group.name}
                            </span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {group.options?.slice(0, 3).map((opt: any) => (
                                <span
                                  key={opt.id}
                                  className="text-[10px] bg-neutral-100 text-neutral-600 px-1 py-0.2 rounded"
                                >
                                  {opt.name} {opt.extra_price_minor > 0 ? `(+₹${(opt.extra_price_minor / 100).toFixed(0)})` : ''}
                                </span>
                              ))}
                              {(group.options?.length || 0) > 3 && (
                                <span className="text-[10px] text-neutral-400">+{group.options.length - 3} more</span>
                              )}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Menu Selling Price & Tax Mode */}
              <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-neutral-800 text-xs">
                    Menu Selling Price (₹) *
                  </label>
                  <span className="text-[10px] text-neutral-500 font-mono">
                    Portion raw cost is calculated automatically from BOM recipe
                  </span>
                </div>
                <div className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
                  <div className="relative flex-1 min-w-[150px]">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      placeholder="0.00"
                      value={productForm.sellingPrice}
                      onFocus={(e) => e.target.select()}
                      onKeyDown={(e) => {
                        if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
                      }}
                      onChange={(e) => setProductForm({ ...productForm, sellingPrice: e.target.value.replace(/^0+(?=\d)/, '') })}
                      className="w-full px-3 py-2 font-mono text-sm font-semibold bg-white border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] shrink-0">
                    <button
                      type="button"
                      onClick={() => setProductForm({ ...productForm, taxType: 'INCLUSIVE' })}
                      className={`px-3 py-2 rounded text-xs font-medium border transition-colors cursor-pointer ${
                        productForm.taxType === 'INCLUSIVE'
                          ? 'bg-neutral-900 text-white border-neutral-900 shadow-xs'
                          : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400'
                      }`}
                      title="Selling price already includes tax"
                    >
                      With Tax (MRP)
                    </button>
                    <button
                      type="button"
                      onClick={() => setProductForm({ ...productForm, taxType: 'EXCLUSIVE' })}
                      className={`px-3 py-2 rounded text-xs font-medium border transition-colors cursor-pointer ${
                        productForm.taxType === 'EXCLUSIVE'
                          ? 'bg-neutral-900 text-white border-neutral-900 shadow-xs'
                          : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400'
                      }`}
                      title="Tax is added on top of selling price"
                    >
                      Without Tax (+GST)
                    </button>
                  </div>
                </div>
              </div>

              {/* GST Tax and Pricing Options */}
              <div className="p-3 bg-neutral-50 rounded border border-neutral-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-neutral-800 text-xs">GST Slab & HSN Classification</span>
                  <span className="text-[10px] text-neutral-500 font-mono">
                    Mode: {productForm.taxType === 'INCLUSIVE' ? 'Tax Inclusive (MRP)' : 'Tax Exclusive (+GST)'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-medium text-neutral-700 block mb-1">GST Tax Slab *</label>
                    <select
                      value={productForm.taxRate}
                      onChange={(e) => setProductForm({ ...productForm, taxRate: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2.5 py-1.5 border border-neutral-300 rounded font-medium focus:border-neutral-900 focus:outline-none"
                    >
                      <option value="0">0% - Nil / Exempt</option>
                      <option value="5">5% GST (2.5% CGST + 2.5% SGST)</option>
                      <option value="12">12% GST (6% CGST + 6% SGST)</option>
                      <option value="18">18% GST (9% CGST + 9% SGST)</option>
                      <option value="28">28% GST (14% CGST + 14% SGST)</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-medium text-neutral-700 block mb-1">HSN / SAC Code</label>
                    <input
                      type="text"
                      value={productForm.hsnCode}
                      onChange={(e) => setProductForm({ ...productForm, hsnCode: e.target.value })}
                      placeholder="e.g. 2105, 1905, 2202"
                      className="w-full px-2.5 py-1.5 font-mono border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Ice cream & dessert industry standard HSN quick presets */}
                <div className="flex flex-wrap items-center gap-1 text-[10px]">
                  <span className="text-neutral-500">Quick Presets:</span>
                  {[
                    { code: '2105', label: '2105 (Ice Cream & Gelato)' },
                    { code: '1905', label: '1905 (Waffles & Cones)' },
                    { code: '2202', label: '2202 (Milkshakes & Floats)' },
                    { code: '2106', label: '2106 (Sundaes & Syrups)' },
                  ].map((preset) => (
                    <button
                      key={preset.code}
                      type="button"
                      onClick={() => setProductForm({ ...productForm, hsnCode: preset.code })}
                      className="px-1.5 py-0.5 bg-white border border-neutral-200 rounded text-neutral-600 hover:text-neutral-900 hover:border-neutral-400 font-mono cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {/* Live GST Calculation Preview Card */}
                {(() => {
                  const sp = Number(productForm.sellingPrice) || 0;
                  const tr = Number(productForm.taxRate) || 0;
                  let baseTaxable = sp;
                  let taxAmt = 0;
                  let finalCustPrice = sp;

                  if (productForm.taxType === 'INCLUSIVE' && tr > 0) {
                    finalCustPrice = sp;
                    baseTaxable = Math.round((sp / (1 + tr / 100)) * 100) / 100;
                    taxAmt = Math.round((sp - baseTaxable) * 100) / 100;
                  } else {
                    baseTaxable = sp;
                    taxAmt = Math.round((sp * (tr / 100)) * 100) / 100;
                    finalCustPrice = Math.round((sp + taxAmt) * 100) / 100;
                  }

                  const cgstAmt = Math.round((taxAmt / 2) * 100) / 100;
                  const sgstAmt = Math.round((taxAmt - cgstAmt) * 100) / 100;

                  return (
                    <div className="bg-white p-2.5 rounded border border-neutral-200 text-[11px] space-y-1">
                      <div className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                        Live GST Calculation Preview
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-neutral-600 font-mono">
                        <div>Taxable Base: <span className="font-semibold text-neutral-900">{formatCurrency(baseTaxable)}</span></div>
                        <div>CGST ({(tr / 2).toFixed(1)}%): <span className="font-semibold text-neutral-900">{formatCurrency(cgstAmt)}</span></div>
                        <div>SGST ({(tr / 2).toFixed(1)}%): <span className="font-semibold text-neutral-900">{formatCurrency(sgstAmt)}</span></div>
                        <div>Output GST: <span className="font-bold text-emerald-800">{formatCurrency(taxAmt)}</span></div>
                      </div>
                      <div className="flex justify-between items-baseline pt-1 border-t border-neutral-100 font-medium">
                        <span className="text-neutral-700">Customer Final Bill Price:</span>
                        <span className="font-mono font-bold text-xs text-neutral-900">
                          {formatCurrency(finalCustPrice)}
                          <span className="text-[10px] font-normal text-neutral-500 ml-1">
                            ({productForm.taxType === 'INCLUSIVE' ? 'With Tax' : 'Without Tax + GST'})
                          </span>
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Packaging Breakdown & Hierarchy Calculator */}
              <div className="p-3.5 bg-neutral-50 rounded-lg border border-neutral-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-emerald-700" />
                    <div>
                      <span className="font-semibold text-neutral-900 text-xs block">
                        Bulk Packaging & Stock Calculator
                      </span>
                      <span className="text-[10px] text-neutral-500">
                        Specify outer packaging (e.g. Boxes, Cartons, Tubs) and piece weights to compute overall stock.
                      </span>
                    </div>
                  </div>
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={usePackagingCalc}
                      onChange={(e) => setUsePackagingCalc(e.target.checked)}
                      className="rounded text-neutral-900 focus:ring-0 cursor-pointer"
                    />
                    <span className="font-medium text-neutral-700 text-[11px]">Calculate from Packaging</span>
                  </label>
                </div>

                {usePackagingCalc && (
                  <div className="space-y-3 pt-2 border-t border-neutral-200 animate-in fade-in">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {/* Package Type */}
                      <div>
                        <label className="text-[10px] font-medium text-neutral-600 block mb-1">
                          Outer Package
                        </label>
                        <select
                          value={packagingConfig.packageType}
                          onChange={(e) => setPackagingConfig({ ...packagingConfig, packageType: e.target.value })}
                          className="w-full px-2 py-1.5 text-xs bg-white border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none"
                        >
                          <option value="box">Box</option>
                          <option value="carton">Carton</option>
                          <option value="tub">Tub</option>
                          <option value="crate">Crate</option>
                          <option value="tin">Tin</option>
                          <option value="bag">Bag</option>
                          <option value="pack">Pack</option>
                        </select>
                      </div>

                      {/* Number of Packs */}
                      <div>
                        <label className="text-[10px] font-medium text-neutral-600 block mb-1">
                          Packs / Boxes
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={packagingConfig.packsCount}
                          onChange={(e) => setPackagingConfig({ ...packagingConfig, packsCount: Math.max(0, parseInt(e.target.value) || 0) })}
                          className="w-full px-2 py-1.5 text-xs font-mono font-bold bg-white border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none"
                          placeholder="5"
                        />
                      </div>

                      {/* Pieces per Pack */}
                      <div>
                        <label className="text-[10px] font-medium text-neutral-600 block mb-1">
                          Pieces / Box
                        </label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={packagingConfig.piecesPerPack}
                          onChange={(e) => setPackagingConfig({ ...packagingConfig, piecesPerPack: Math.max(1, parseInt(e.target.value) || 1) })}
                          className="w-full px-2 py-1.5 text-xs font-mono bg-white border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none"
                          placeholder="20"
                        />
                      </div>

                      {/* Weight/Volume per Piece */}
                      <div>
                        <label className="text-[10px] font-medium text-neutral-600 block mb-1">
                          Weight / Piece
                        </label>
                        <div className="flex gap-1">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={packagingConfig.pieceWeightValue}
                            onChange={(e) => setPackagingConfig({ ...packagingConfig, pieceWeightValue: Math.max(0, parseFloat(e.target.value) || 0) })}
                            className="w-full px-2 py-1.5 text-xs font-mono bg-white border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none"
                            placeholder="50"
                          />
                          <select
                            value={packagingConfig.pieceWeightUnit}
                            onChange={(e) => setPackagingConfig({ ...packagingConfig, pieceWeightUnit: e.target.value as any })}
                            className="text-[11px] bg-white border border-neutral-300 rounded px-1"
                          >
                            <option value="g">g</option>
                            <option value="kg">kg</option>
                            <option value="ml">ml</option>
                            <option value="L">L</option>
                            <option value="piece">pcs</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Calculated Packaging Stock Card */}
                    {(() => {
                      const calc = calculatePackagingStock(packagingConfig);
                      return (
                        <div className="p-3 bg-white rounded-lg border border-emerald-300 shadow-xs space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-emerald-950 flex items-center gap-1">
                              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                              Auto-Calculated Inventory Stock:
                            </span>
                            <span className="font-mono text-emerald-800 text-[11px]">
                              {calc.displayString}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-neutral-100 text-xs">
                            <div className="bg-emerald-50/70 p-2 rounded">
                              <span className="text-[10px] text-emerald-800 block">Total Pieces:</span>
                              <span className="font-mono font-bold text-sm text-emerald-950">
                                {calc.totalPieces.toLocaleString('en-IN')} pcs
                              </span>
                            </div>
                            <div className="bg-emerald-50/70 p-2 rounded">
                              <span className="text-[10px] text-emerald-800 block">Base Inventory Stock:</span>
                              <span className="font-mono font-bold text-sm text-emerald-950">
                                {calc.totalBaseQuantity.toLocaleString('en-IN')} {calc.baseUnit}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Servings Stock & Alert Levels */}
              <div className="grid grid-cols-2 gap-2">
                {productEditModal === 'new' && (
                  <div>
                    <label className="font-medium text-neutral-700 block mb-1">
                      Estimated Portions / Stock Buffer
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="100"
                      value={productForm.currentStock}
                      onFocus={(e) => e.target.select()}
                      onKeyDown={(e) => {
                        if (['e', 'E', '+', '-', '.'].includes(e.key)) e.preventDefault();
                      }}
                      onChange={(e) => setProductForm({ ...productForm, currentStock: e.target.value.replace(/^0+(?=\d)/, '') })}
                      className="w-full px-2.5 py-1.5 font-mono border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none"
                    />
                  </div>
                )}
                <div>
                  <label className="font-medium text-neutral-700 block mb-1">Low Stock Alert Level</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="10"
                    value={productForm.minimumStock}
                    onFocus={(e) => e.target.select()}
                    onKeyDown={(e) => {
                      if (['e', 'E', '+', '-', '.'].includes(e.key)) e.preventDefault();
                    }}
                    onChange={(e) => setProductForm({ ...productForm, minimumStock: e.target.value.replace(/^0+(?=\d)/, '') })}
                    className="w-full px-2.5 py-1.5 font-mono border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-neutral-100">
              {productEditModal !== 'new' ? (
                <button
                  type="button"
                  onClick={() => handleToggleActive(productEditModal)}
                  className={`text-xs font-medium px-2.5 py-1 rounded cursor-pointer ${
                    productEditModal.active
                      ? 'text-red-700 hover:bg-red-50'
                      : 'text-emerald-700 hover:bg-emerald-50'
                  }`}
                >
                  {productEditModal.active ? 'Deactivate Product' : 'Activate Product'}
                </button>
              ) : <div />}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setProductEditModal(null)}
                  className="px-3 py-1.5 text-xs text-neutral-600 hover:text-neutral-900 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="px-4 py-1.5 text-xs font-semibold bg-neutral-900 text-white rounded hover:bg-neutral-800 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {modalSubmitting ? 'Saving Menu Item...' : 'Save Menu Item'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}



      {/* Modal: Admin Product Deletion Confirmation */}
      {productToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-lg border border-neutral-200 shadow-xl max-w-sm w-full p-5 space-y-3.5">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="font-semibold text-sm">Remove Item from Inventory</h3>
            </div>
            <p className="text-xs text-neutral-600 leading-relaxed">
              Are you sure you want to permanently remove <strong className="text-neutral-900">"{productToDelete.name}"</strong> (SKU: {productToDelete.sku}) from your inventory?
            </p>
            <div className="text-[11px] text-red-700 bg-red-50 p-2.5 rounded border border-red-200">
              ⚠️ <strong>Admin Permission Required:</strong> This action permanently deletes this product record from both the catalog and POS register.
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
              <button
                type="button"
                disabled={modalSubmitting}
                onClick={() => setProductToDelete(null)}
                className="px-3 py-1.5 text-xs text-neutral-600 hover:text-neutral-900 font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={modalSubmitting}
                onClick={handleDeleteProduct}
                className="px-4 py-1.5 text-xs font-semibold bg-red-600 text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1 shadow-xs"
              >
                {modalSubmitting ? 'Removing...' : 'Confirm Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Category Management */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-lg border border-neutral-200 shadow-xl max-w-lg w-full p-5 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
              <div className="flex items-center gap-2 text-neutral-900">
                <Tag className="w-5 h-5 text-emerald-600" />
                <h3 className="font-semibold text-sm">Product Categories</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCategoryModal(false)}
                className="text-neutral-400 hover:text-neutral-700 font-bold px-1"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-neutral-500">
              Organize inventory by product categories. Custom categories can be added anytime. Only Admins can delete categories.
            </p>

            {/* Quick Add Custom Category Form */}
            <form onSubmit={handleCreateCategoryInModal} className="bg-neutral-50 p-3 rounded-lg border border-neutral-200 space-y-2.5">
              <span className="text-[11px] font-semibold text-neutral-800 uppercase tracking-wider block">
                + Add Custom Category
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  placeholder="Category Name *"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="px-2.5 py-1.5 bg-white border border-neutral-300 rounded text-xs focus:outline-none focus:border-neutral-900"
                />
                <input
                  type="text"
                  placeholder="Description (optional)"
                  value={newCatDesc}
                  onChange={(e) => setNewCatDesc(e.target.value)}
                  className="px-2.5 py-1.5 bg-white border border-neutral-300 rounded text-xs focus:outline-none focus:border-neutral-900"
                />
              </div>
              <div className="flex justify-between items-center pt-1">
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={handleSeedDefaults}
                    disabled={isSeedingDefaults}
                    className="text-[11px] text-emerald-700 hover:text-emerald-800 font-medium flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    title="Load standard supermarket & retail categories"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>{isSeedingDefaults ? 'Loading...' : 'Load Standard Categories'}</span>
                  </button>
                ) : <div />}
                <button
                  type="submit"
                  disabled={catModalLoading || !newCatName.trim()}
                  className="px-3 py-1.5 text-xs font-semibold bg-neutral-900 text-white rounded hover:bg-neutral-800 disabled:opacity-50 cursor-pointer flex items-center gap-1 shadow-xs ml-auto"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{catModalLoading ? 'Adding...' : 'Add Category'}</span>
                </button>
              </div>
            </form>

            {/* Category List */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 max-h-64">
              <span className="text-[11px] font-semibold text-neutral-700 block mb-1">
                Existing Categories ({categories.length})
              </span>
              {categories.length === 0 ? (
                <div className="p-6 text-center text-xs text-neutral-400 bg-neutral-50 rounded border border-neutral-100">
                  No categories created yet. Click "Load Standard Categories" or add one above!
                </div>
              ) : (
                categories.map((cat) => {
                  const productCount = products.filter((p) => p.category_id === cat.id).length;
                  return (
                    <div
                      key={cat.id}
                      className="flex items-center justify-between p-2.5 bg-white hover:bg-neutral-50 border border-neutral-200 rounded text-xs transition-colors"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-neutral-900 truncate">{cat.name}</span>
                          <span className="text-[10px] bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded font-mono">
                            {productCount} item{productCount !== 1 ? 's' : ''}
                          </span>
                        </div>
                        {cat.description && (
                          <p className="text-[11px] text-neutral-500 truncate mt-0.5">{cat.description}</p>
                        )}
                      </div>

                      <div className="shrink-0 flex items-center gap-1">
                        {isAdmin ? (
                          <button
                            type="button"
                            onClick={() => setCategoryToDelete(cat)}
                            className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                            title={`Remove category "${cat.name}" (Admin Only)`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <span
                            className="text-[10px] text-neutral-400 flex items-center gap-0.5 px-1.5 py-0.5 bg-neutral-50 rounded border border-neutral-200"
                            title="Only Admins can remove categories"
                          >
                            <Lock className="w-2.5 h-2.5" /> Admin only
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setShowCategoryModal(false)}
                className="px-4 py-1.5 text-xs font-semibold bg-neutral-100 text-neutral-700 rounded hover:bg-neutral-200 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Admin Category Deletion Confirmation */}
      {categoryToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-lg border border-neutral-200 shadow-xl max-w-sm w-full p-5 space-y-3.5">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="font-semibold text-sm">Remove Category</h3>
            </div>
            <p className="text-xs text-neutral-600 leading-relaxed">
              Are you sure you want to remove the category <strong className="text-neutral-900">"{categoryToDelete.name}"</strong>?
            </p>
            {products.filter((p) => p.category_id === categoryToDelete.id).length > 0 && (
              <div className="text-[11px] text-amber-800 bg-amber-50 p-2.5 rounded border border-amber-200">
                Notice: <strong>{products.filter((p) => p.category_id === categoryToDelete.id).length} product(s)</strong> currently tagged with this category will safely become <strong>Uncategorized</strong>. No products or stock will be lost.
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
              <button
                type="button"
                disabled={catModalLoading}
                onClick={() => setCategoryToDelete(null)}
                className="px-3 py-1.5 text-xs text-neutral-600 hover:text-neutral-900 font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={catModalLoading}
                onClick={handleDeleteCategory}
                className="px-4 py-1.5 text-xs font-semibold bg-red-600 text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1 shadow-xs"
              >
                {catModalLoading ? 'Removing...' : 'Confirm Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
};
