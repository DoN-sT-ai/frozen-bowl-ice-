import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Product, CartItem, Sale, SelectedModifier } from '../../types';
import { api } from '../../lib/api';
import { formatCurrency, formatBillNumber } from '../../lib/utils';
import { ModifierModal } from './ModifierModal';
import { playScannerBeep } from '../../lib/barcodeUtils';
import { useAuth } from '../../context/AuthContext';
import { ThermalReceiptContent } from './ThermalReceiptContent';
import { ReceiptModal } from './ReceiptModal';
import { printReceipt } from '../../lib/printerService';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  Check,
  CreditCard,
  Banknote,
  QrCode,
  AlertCircle,
  Sparkles,
  ShoppingBag,
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  CheckCircle,
  Receipt,
  Printer,
  Eye,
  X,
  Loader2,
} from 'lucide-react';

interface POSWorkspaceProps {
  onNavigateToSales?: () => void;
}

export const POSWorkspace: React.FC<POSWorkspaceProps> = ({ onNavigateToSales }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [customizingProduct, setCustomizingProduct] = useState<Product | null>(null);

  // Mobile navigation between Catalog and Cart
  const [mobileTab, setMobileTab] = useState<'catalog' | 'cart'>('catalog');

  // Employee Selling Tax Mode: With Tax (Inclusive) vs Without Tax (Exclusive) vs AUTO
  const [sellingTaxMode, setSellingTaxMode] = useState<'INCLUSIVE' | 'EXCLUSIVE' | 'AUTO'>('INCLUSIVE');

  // Cart State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'UPI' | 'CARD' | 'OTHER'>('UPI');
  const [customerNotes, setCustomerNotes] = useState<string>('');
  const [cashTendered, setCashTendered] = useState<string>('');

  const { store } = useAuth();

  // GST & Customer Details
  const [gstType, setGstType] = useState<'INTRA_STATE' | 'INTER_STATE' | 'EXEMPT'>('INTRA_STATE');
  const [showCustomerDetails, setShowCustomerDetails] = useState<boolean>(false);
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [customerGstin, setCustomerGstin] = useState<string>('');

  // Submission, Auto-Print & Feedback
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [completedSaleForPrint, setCompletedSaleForPrint] = useState<Sale | null>(null);
  const [activeModalSale, setActiveModalSale] = useState<Sale | null>(null);
  const [autoPrintQr, setAutoPrintQr] = useState<string>('');
  const [lastCompletedBill, setLastCompletedBill] = useState<{
    billNumber: string;
    total: number;
    paymentMethod: string;
  } | null>(null);

  // Auto-Print Toggle (persisted in localStorage)
  const [autoPrintEnabled, setAutoPrintEnabled] = useState<boolean>(() => {
    return localStorage.getItem('pos_auto_print') === 'true';
  });
  const [showAllCatalog, setShowAllCatalog] = useState<boolean>(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDropdownRef = useRef<HTMLDivElement>(null);
  const activeSearchItemRef = useRef<HTMLDivElement>(null);
  const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);
  const [selectedSearchIndex, setSelectedSearchIndex] = useState<number>(0);
  const selectedSearchIndexRef = useRef<number>(0);
  selectedSearchIndexRef.current = selectedSearchIndex;

  const discountInputRef = useRef<HTMLInputElement>(null);
  const cashInputRef = useRef<HTMLInputElement>(null);

  // Keyboard Double-Enter Quick Print State
  const [confirmPrintPrompt, setConfirmPrintPrompt] = useState<boolean>(false);
  const confirmPrintPromptRef = useRef<boolean>(false);
  confirmPrintPromptRef.current = confirmPrintPrompt;
  const confirmPrintTimerRef = useRef<NodeJS.Timeout | null>(null);

  const isSubmittingRef = useRef<boolean>(false);
  isSubmittingRef.current = isSubmitting;
  const productsRef = useRef<Product[]>([]);
  productsRef.current = products;
  const cartRef = useRef<CartItem[]>([]);
  cartRef.current = cart;
  const discountRef = useRef<number>(0);
  discountRef.current = discount;
  const paymentMethodRef = useRef(paymentMethod);
  paymentMethodRef.current = paymentMethod;
  const customerNotesRef = useRef(customerNotes);
  customerNotesRef.current = customerNotes;
  const customerNameRef = useRef(customerName);
  customerNameRef.current = customerName;
  const customerPhoneRef = useRef(customerPhone);
  customerPhoneRef.current = customerPhone;
  const customerGstinRef = useRef(customerGstin);
  customerGstinRef.current = customerGstin;
  const gstTypeRef = useRef(gstType);
  gstTypeRef.current = gstType;
  const sellingTaxModeRef = useRef(sellingTaxMode);
  sellingTaxModeRef.current = sellingTaxMode;
  const autoPrintEnabledRef = useRef(autoPrintEnabled);
  autoPrintEnabledRef.current = autoPrintEnabled;
  const storeRef = useRef(store);
  storeRef.current = store;
  const autoPrintQrRef = useRef(autoPrintQr);
  autoPrintQrRef.current = autoPrintQr;

  // Callable ref bridges to avoid stale closures in event listeners
  const handleCompleteBillRef = useRef<(forcePrint?: boolean) => Promise<void>>(() => Promise.resolve());
  const triggerQuickPrintStepRef = useRef<() => void>(() => {});
  const addToCartRef = useRef<(product: Product, quantity?: number, selectedModifiers?: SelectedModifier[]) => void>(() => {});
  const filteredProductsRef = useRef<Product[]>([]);
  const searchResultsRef = useRef<Product[]>([]);
  const selectSearchProductRef = useRef<(product: Product) => void>(() => {});

  const toggleAutoPrint = () => {
    setAutoPrintEnabled((prev) => {
      const next = !prev;
      localStorage.setItem('pos_auto_print', String(next));
      return next;
    });
  };

  const loadCatalog = async () => {
    try {
      setLoading(true);
      const [prodRes, catRes] = await Promise.all([
        api.getProducts({ activeOnly: true }),
        api.getCategories(),
      ]);
      setProducts(prodRes);
      setCategories(catRes);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load product catalog');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCatalog();
  }, []);

  // O(1) Cart product lookup map
  const cartMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of cart) {
      map.set(item.product.id, item.quantity);
    }
    return map;
  }, [cart]);

  // Precomputed category product counts (O(N) once rather than O(C * N) per render)
  const categoryCountMap = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products) {
      if (p.category_id) {
        counts.set(p.category_id, (counts.get(p.category_id) || 0) + 1);
      }
    }
    return counts;
  }, [products]);

  // Memoized Filtered Products
  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p) => {
      if (selectedCategory !== 'all' && !q && p.category_id !== selectedCategory) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q)
      );
    });
  }, [products, selectedCategory, searchQuery]);

  // Autocomplete search matches (up to 10 items)
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return filteredProducts.slice(0, 10);
  }, [searchQuery, filteredProducts]);
  searchResultsRef.current = searchResults;

  // Reset highlighted item when search query changes
  useEffect(() => {
    setSelectedSearchIndex(0);
  }, [searchQuery]);

  // Keep highlighted search item scrolled into view
  useEffect(() => {
    if (activeSearchItemRef.current) {
      activeSearchItemRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedSearchIndex]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        searchInputRef.current &&
        !searchInputRef.current.contains(target) &&
        searchDropdownRef.current &&
        !searchDropdownRef.current.contains(target)
      ) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Visible products in DOM — capped to 60 for initial load for instantaneous rendering
  const visibleProducts = useMemo(() => {
    if (searchQuery || selectedCategory !== 'all' || showAllCatalog) {
      return filteredProducts;
    }
    return filteredProducts.slice(0, 60);
  }, [filteredProducts, searchQuery, selectedCategory, showAllCatalog]);

  // Add product to cart with optional toppings / modifiers
  const addToCart = (
    product: Product,
    quantityToAdd: number = 1,
    selectedModifiers?: SelectedModifier[]
  ) => {
    if (product.current_stock <= 0) {
      setErrorMessage(`"${product.name}" is currently out of stock.`);
      return;
    }

    setErrorMessage(null);
    setCart((prev) => {
      const existing = prev.find(
        (item) =>
          item.product.id === product.id &&
          JSON.stringify(item.selectedModifiers || []) === JSON.stringify(selectedModifiers || [])
      );
      if (existing) {
        const newQty = existing.quantity + quantityToAdd;
        if (newQty > product.current_stock) {
          setErrorMessage(`Only ${product.current_stock} items available in stock for "${product.name}".`);
          return prev;
        }
        return prev.map((item) =>
          item === existing ? { ...item, quantity: newQty } : item
        );
      } else {
        if (quantityToAdd > product.current_stock) {
          setErrorMessage(`Only ${product.current_stock} items available in stock for "${product.name}".`);
          return prev;
        }
        return [...prev, { product, quantity: quantityToAdd, selectedModifiers }];
      }
    });
  };

  const handleProductClick = (product: Product) => {
    if (product.modifierGroups && product.modifierGroups.length > 0) {
      setCustomizingProduct(product);
    } else {
      addToCart(product, 1);
    }
  };

  const selectSearchProduct = (product: Product) => {
    if (product.current_stock <= 0) {
      setErrorMessage(`"${product.name}" is currently out of stock.`);
      return;
    }
    handleProductClick(product);
    setSearchQuery('');
    setIsSearchFocused(false);
    playScannerBeep('success');
    searchInputRef.current?.focus();
  };
  selectSearchProductRef.current = selectSearchProduct;

  // Modify quantity
  const updateQuantity = (productId: string, newQty: number) => {
    setErrorMessage(null);
    if (newQty <= 0) {
      removeFromCart(productId);
      return;
    }

    setCart((prev) =>
      prev.map((item) => {
        if (item.product.id === productId) {
          if (newQty > item.product.current_stock) {
            setErrorMessage(`Stock limit reached! Only ${item.product.current_stock} available.`);
            return { ...item, quantity: item.product.current_stock };
          }
          return { ...item, quantity: newQty };
        }
        return item;
      })
    );
  };

  const updateQuantityByIndex = (index: number, newQty: number) => {
    setErrorMessage(null);
    if (newQty <= 0) {
      removeFromCartByIndex(index);
      return;
    }
    setCart((prev) =>
      prev.map((item, i) => (i === index ? { ...item, quantity: newQty } : item))
    );
  };

  const removeFromCartByIndex = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setDiscount(0);
    setCustomerNotes('');
    setCashTendered('');
    setCustomerName('');
    setCustomerPhone('');
    setCustomerGstin('');
    setGstType('INTRA_STATE');
    setShowCustomerDetails(false);
    setErrorMessage(null);
    setMobileTab('catalog');
  };

  const toggleItemTaxMode = (productId: string) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.product.id === productId) {
          const currentMode =
            item.taxTypeOverride ||
            (sellingTaxMode !== 'AUTO' ? sellingTaxMode : item.product.tax_type) ||
            'EXCLUSIVE';
          const nextMode: 'INCLUSIVE' | 'EXCLUSIVE' =
            currentMode === 'INCLUSIVE' ? 'EXCLUSIVE' : 'INCLUSIVE';
          return { ...item, taxTypeOverride: nextMode };
        }
        return item;
      })
    );
  };

  // Client calculations for real-time display taking into account sellingTaxMode and gstType
  let calculatedSubtotal = 0;
  let calculatedTax = 0;

  cart.forEach((item) => {
    const qty = item.quantity;
    const modExtra = (item.selectedModifiers || []).reduce(
      (acc, m) => acc + (m.additionalPriceMinor / 100) * (m.quantity || 1),
      0
    );
    const sp = item.product.selling_price + modExtra;
    const tr = gstType === 'EXEMPT' ? 0 : (item.product.tax_rate || 0);

    const effectiveTaxMode =
      item.taxTypeOverride ||
      (sellingTaxMode !== 'AUTO' ? sellingTaxMode : item.product.tax_type) ||
      'EXCLUSIVE';

    if (effectiveTaxMode === 'INCLUSIVE' && tr > 0) {
      // Selling price already includes tax (With Tax / MRP)
      const lineTotal = qty * sp;
      const base = lineTotal / (1 + tr / 100);
      const tax = lineTotal - base;
      calculatedSubtotal += base;
      calculatedTax += tax;
    } else {
      // Selling price is without tax (tax added on top)
      const base = qty * sp;
      const tax = base * (tr / 100);
      calculatedSubtotal += base;
      calculatedTax += tax;
    }
  });

  const subtotal = Math.round(calculatedSubtotal * 100) / 100;
  const estimatedTax = Math.round(calculatedTax * 100) / 100;

  const cgst = gstType === 'INTRA_STATE' ? Math.round((estimatedTax / 2) * 100) / 100 : 0;
  const sgst = gstType === 'INTRA_STATE' ? Math.round((estimatedTax - cgst) * 100) / 100 : 0;
  const igst = gstType === 'INTER_STATE' ? estimatedTax : 0;

  const rawPayable = subtotal + estimatedTax - discount;
  const totalPayable = Math.max(0, Math.round(rawPayable));
  const roundOff = Math.round((totalPayable - rawPayable) * 100) / 100;

  // Cash change calculation
  const cashNum = parseFloat(cashTendered) || 0;
  const changeDue = cashNum >= totalPayable ? cashNum - totalPayable : 0;

  addToCartRef.current = addToCart;
  filteredProductsRef.current = filteredProducts;

  // Direct Silent Print to connected hardware printer (no preview tabs, no dialogs)
  const triggerAutoPrint = (saleToPrint: Sale) => {
    printReceipt({
      sale: saleToPrint,
      store: storeRef.current,
      format: (localStorage.getItem('pos_paper_size') as any) || '80mm',
      docType: 'BILL',
      qrCodeDataUrl: autoPrintQrRef.current || undefined,
      silent: localStorage.getItem('pos_direct_print') !== 'false',
      deviceName: localStorage.getItem('pos_printer_name') || '',
    });
  };

  // Complete Bill Action — optimized for sub-second checkout
  const handleCompleteBill = async (forcePrint = false) => {
    const currentCart = [...cartRef.current];
    if (currentCart.length === 0) {
      setErrorMessage('Please add at least one item to the cart.');
      return;
    }

    try {
      setIsSubmitting(true);
      isSubmittingRef.current = true;
      setErrorMessage(null);
      if (confirmPrintTimerRef.current) {
        clearTimeout(confirmPrintTimerRef.current);
        confirmPrintTimerRef.current = null;
      }
      setConfirmPrintPrompt(false);
      confirmPrintPromptRef.current = false;

      const payload = {
        items: currentCart.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
          selectedModifiers: item.selectedModifiers
            ? item.selectedModifiers.map((m) => ({
                modifierId: m.modifierId,
                quantity: m.quantity,
              }))
            : undefined,
          taxType:
            item.taxTypeOverride ||
            (sellingTaxModeRef.current !== 'AUTO' ? sellingTaxModeRef.current : item.product.tax_type) ||
            'EXCLUSIVE',
        })),
        discount: Number(discountRef.current) || 0,
        paymentMethod: paymentMethodRef.current,
        notes: customerNotesRef.current || undefined,
        gstType: gstTypeRef.current,
        taxMode: sellingTaxModeRef.current,
        customerName: customerNameRef.current.trim() || undefined,
        customerPhone: customerPhoneRef.current.trim() || undefined,
        customerGstin: customerGstinRef.current.trim() ? customerGstinRef.current.trim().toUpperCase() : undefined,
      };

      const sale = await api.createSale(payload);

      // Instant UI update: deduct stock locally in memory (0ms network delay)
      setProducts((prev) =>
        prev.map((p) => {
          const match = currentCart.find((i) => i.product.id === p.id);
          if (match) {
            return { ...p, current_stock: Math.max(0, p.current_stock - match.quantity) };
          }
          return p;
        })
      );

      // Save sale for direct printing & top banner (no popup preview modal)
      setCompletedSaleForPrint(sale);
      // DO NOT call setActiveModalSale(sale) to ensure no popup or printing tab opens
      setLastCompletedBill({
        billNumber: sale.bill_number,
        total: sale.total,
        paymentMethod: sale.payment_method,
      });

      // Reset checkout form immediately
      clearCart();
      setCustomerName('');
      setCustomerPhone('');
      setCustomerGstin('');
      setCustomerNotes('');
      setCashTendered('');
      setDiscount(0);
      setMobileTab('catalog');

      // Generate verification QR code non-blockingly
      const publicVerificationUrl = `${window.location.origin}/?verify=${sale.verification_token}`;
      api.getQRCode(publicVerificationUrl)
        .then(res => {
          setAutoPrintQr(res.dataUrl);
          autoPrintQrRef.current = res.dataUrl;
        })
        .catch(() => {});

      // Direct silent print immediately to the connected printer!
      setTimeout(() => triggerAutoPrint(sale), 40);

      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } catch (err: any) {
      setErrorMessage(err.message || 'Bill creation failed');
    } finally {
      setIsSubmitting(false);
      isSubmittingRef.current = false;
    }
  };
  handleCompleteBillRef.current = handleCompleteBill;

  // Step handler for keyboard double-Enter quick checkout & print
  const triggerQuickPrintStep = () => {
    if (cartRef.current.length === 0 || isSubmittingRef.current) {
      if (cartRef.current.length === 0) {
        setErrorMessage('Cart is empty. Scan or add an item first.');
      }
      return;
    }

    if (confirmPrintPromptRef.current) {
      // 2nd Enter received within timeout! Complete & Print immediately
      if (confirmPrintTimerRef.current) {
        clearTimeout(confirmPrintTimerRef.current);
        confirmPrintTimerRef.current = null;
      }
      setConfirmPrintPrompt(false);
      confirmPrintPromptRef.current = false;
      handleCompleteBillRef.current(true); // forcePrint = true
    } else {
      // 1st Enter received! Activate confirmation stage
      setConfirmPrintPrompt(true);
      confirmPrintPromptRef.current = true;
      if (confirmPrintTimerRef.current) clearTimeout(confirmPrintTimerRef.current);
      confirmPrintTimerRef.current = setTimeout(() => {
        setConfirmPrintPrompt(false);
        confirmPrintPromptRef.current = false;
      }, 4000);
    }
  };
  triggerQuickPrintStepRef.current = triggerQuickPrintStep;

  // Focus search input on initial mount for instant menu item search readiness
  useEffect(() => {
    const timer = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  // Global POS Keyboard Navigation Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Enter or Cmd+Enter or F4: Instant complete bill & print
      if (((e.ctrlKey || e.metaKey) && e.key === 'Enter') || e.key === 'F4') {
        e.preventDefault();
        if (cartRef.current.length > 0) {
          if (confirmPrintTimerRef.current) clearTimeout(confirmPrintTimerRef.current);
          setConfirmPrintPrompt(false);
          confirmPrintPromptRef.current = false;
          handleCompleteBillRef.current(true);
        }
        return;
      }

      // F2: Focus Search Bar
      if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      // F6: Cycle Payment Method
      if (e.key === 'F6') {
        e.preventDefault();
        setPaymentMethod((prev) => {
          if (prev === 'UPI') return 'CASH';
          if (prev === 'CASH') return 'CARD';
          if (prev === 'CARD') return 'OTHER';
          return 'UPI';
        });
        return;
      }

      // F7 or Alt+C: Select Cash
      if (e.key === 'F7' || (e.altKey && (e.key === 'c' || e.key === 'C'))) {
        e.preventDefault();
        setPaymentMethod('CASH');
        return;
      }

      // F8 or Alt+U: Select UPI
      if (e.key === 'F8' || (e.altKey && (e.key === 'u' || e.key === 'U'))) {
        e.preventDefault();
        setPaymentMethod('UPI');
        return;
      }

      // F9: Focus Cash Received
      if (e.key === 'F9') {
        e.preventDefault();
        setPaymentMethod('CASH');
        setTimeout(() => cashInputRef.current?.focus(), 50);
        return;
      }

      // F10 or Alt+D: Focus Discount
      if (e.key === 'F10' || (e.altKey && (e.key === 'd' || e.key === 'D'))) {
        e.preventDefault();
        discountInputRef.current?.focus();
        discountInputRef.current?.select();
        return;
      }

      // Escape: Cancel double-Enter prompt, close modal, or refocus search
      if (e.key === 'Escape') {
        if (confirmPrintPromptRef.current) {
          e.preventDefault();
          if (confirmPrintTimerRef.current) clearTimeout(confirmPrintTimerRef.current);
          setConfirmPrintPrompt(false);
          confirmPrintPromptRef.current = false;
          searchInputRef.current?.focus();
          return;
        }
        if (activeModalSale) {
          setActiveModalSale(null);
          return;
        }
        searchInputRef.current?.focus();
        return;
      }

      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const target = e.target as HTMLElement;
      const isSearchInput = target === searchInputRef.current;

      if (e.key === 'Enter') {
        // Priority 1: If double-Enter confirmation stage is already active:
        // This is the 2nd Enter! Complete and print immediately regardless of where focus is!
        if (confirmPrintPromptRef.current) {
          e.preventDefault();
          e.stopPropagation();
          triggerQuickPrintStepRef.current();
          return;
        }

        // Priority 2: In Search input
        if (isSearchInput) {
          const searchVal = searchInputRef.current?.value?.trim() || '';
          if (searchVal) {
            const list = searchResultsRef.current;
            const chosen = list[selectedSearchIndexRef.current] || list[0] || filteredProductsRef.current[0];
            if (chosen) {
              e.preventDefault();
              selectSearchProductRef.current(chosen);
              return;
            }
          }
          // Empty search input + Enter -> Trigger quick print confirmation (1st Enter)
          e.preventDefault();
          triggerQuickPrintStepRef.current();
          return;
        }

        // Priority 3: If inside customer details textarea, allow regular Enter newline
        const isNoteOrDetails = target && (target.tagName === 'TEXTAREA' || target.getAttribute('name') === 'customerNotes');
        if (isNoteOrDetails && (target as HTMLInputElement).value?.trim()) {
          return;
        }

        // Priority 4: Anywhere else on the page (button clicked, table, discount, cash received, body):
        // Trigger quick print step!
        e.preventDefault();
        e.stopPropagation();
        triggerQuickPrintStepRef.current();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-neutral-100 overflow-hidden">
      {/* Instant Confirmation Banner on Billing Completion (With Auto-Print Feedback) */}
      {lastCompletedBill && (
        <div className="bg-emerald-600 text-white px-4 py-2.5 flex flex-wrap items-center justify-between text-xs shadow-sm shrink-0 gap-2 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-200" />
            <span>
              <strong>Bill #{formatBillNumber(lastCompletedBill.billNumber, 'BILL')}</strong> completed & sent to printer! Total:{' '}
              <span className="font-bold font-mono">{formatCurrency(lastCompletedBill.total)}</span> ({lastCompletedBill.paymentMethod})
            </span>
          </div>
          <div className="flex items-center gap-2">
            {completedSaleForPrint && (
              <button
                type="button"
                onClick={() => triggerAutoPrint(completedSaleForPrint)}
                className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded font-semibold text-[11px] transition cursor-pointer flex items-center gap-1 border border-emerald-500 shadow-xs"
                title="Print 3-inch thermal bill again"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Again (3")</span>
              </button>
            )}
            {completedSaleForPrint && (
              <button
                type="button"
                onClick={() => setActiveModalSale(completedSaleForPrint)}
                className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded font-semibold text-[11px] transition cursor-pointer flex items-center gap-1 border border-emerald-500 shadow-xs"
                title="View bill, download full-page PDF, or share WhatsApp"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>View / PDF</span>
              </button>
            )}
            {onNavigateToSales && (
              <button
                type="button"
                onClick={onNavigateToSales}
                className="px-2.5 py-1 bg-white text-emerald-800 rounded font-semibold text-[11px] hover:bg-emerald-50 transition cursor-pointer flex items-center gap-1 shadow-xs"
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>Past Records</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setLastCompletedBill(null)}
              className="p-1 hover:bg-emerald-700 rounded text-emerald-200 hover:text-white transition cursor-pointer"
              title="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Split Layout: Catalog & Cart */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-y-auto lg:overflow-hidden">
      {/* LEFT SECTION: Product Catalog & Search */}
      <div className={`${mobileTab === 'cart' ? 'hidden lg:flex' : 'flex'} flex-1 flex flex-col min-w-0 border-r border-neutral-200 bg-white h-full min-h-0`}>
        {/* Top Control Bar: Search & Ice Cream Menu Filter */}
        <div className="p-3 border-b border-neutral-200 bg-white space-y-2">
          <div className="flex items-center gap-2">
            {/* Search Input & Keyboard-Navigable Autocomplete Dropdown */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search ice cream scoops, sundaes, shakes, savory bites... (F2)"
                value={searchQuery}
                onFocus={() => setIsSearchFocused(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsSearchFocused(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    if (searchResults.length > 0) {
                      e.preventDefault();
                      setSelectedSearchIndex((prev) => (prev + 1) % searchResults.length);
                      setIsSearchFocused(true);
                    }
                    return;
                  }
                  if (e.key === 'ArrowUp') {
                    if (searchResults.length > 0) {
                      e.preventDefault();
                      setSelectedSearchIndex((prev) => (prev - 1 + searchResults.length) % searchResults.length);
                      setIsSearchFocused(true);
                    }
                    return;
                  }
                  if (e.key === 'Escape') {
                    if (searchQuery) {
                      e.preventDefault();
                      setSearchQuery('');
                      setIsSearchFocused(false);
                      return;
                    }
                  }
                  if (e.key === 'Enter') {
                    if (confirmPrintPromptRef.current) {
                      e.preventDefault();
                      triggerQuickPrintStepRef.current();
                      return;
                    }
                    if (searchResults.length > 0) {
                      e.preventDefault();
                      const chosen = searchResults[selectedSearchIndex] || searchResults[0];
                      if (chosen) {
                        selectSearchProduct(chosen);
                        return;
                      }
                    } else if (!searchQuery.trim()) {
                      e.preventDefault();
                      triggerQuickPrintStepRef.current();
                    }
                  }
                }}
                className="w-full pl-9 pr-8 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:bg-white focus:border-neutral-900 focus:outline-none transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setIsSearchFocused(false);
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-2.5 top-2.5 text-xs text-neutral-400 hover:text-neutral-700 cursor-pointer"
                  title="Clear search"
                >
                  ✕
                </button>
              )}

              {/* Autocomplete Menu Dropdown (Keyboard Navigable) */}
              {isSearchFocused && searchQuery.trim().length > 0 && (
                <div
                  ref={searchDropdownRef}
                  className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white rounded-xl border border-neutral-300 shadow-2xl overflow-hidden max-h-80 overflow-y-auto divide-y divide-neutral-100 animate-in fade-in duration-100"
                >
                  <div className="px-3.5 py-1.5 bg-neutral-100 text-[10px] font-semibold text-neutral-600 uppercase tracking-wider flex items-center justify-between border-b border-neutral-200">
                    <span className="flex items-center gap-1.5">
                      <span>🍨</span>
                      <span>Matching Menu Items ({filteredProducts.length})</span>
                    </span>
                    <span className="text-neutral-500 font-normal normal-case flex items-center gap-1">
                      Navigate <kbd className="px-1 py-0.5 bg-white border border-neutral-300 rounded font-mono text-[9px]">↑</kbd> <kbd className="px-1 py-0.5 bg-white border border-neutral-300 rounded font-mono text-[9px]">↓</kbd> • Press <kbd className="px-1.5 py-0.5 bg-neutral-900 text-white rounded font-mono text-[9px] font-semibold">Enter ↵</kbd> to add
                    </span>
                  </div>

                  {searchResults.length === 0 ? (
                    <div className="p-4 text-center text-xs text-neutral-400 bg-neutral-50/50">
                      No ice cream flavours or menu items match "{searchQuery}"
                    </div>
                  ) : (
                    searchResults.map((p, idx) => {
                      const isSelected = idx === selectedSearchIndex;
                      const isOutOfStock = p.current_stock <= 0;
                      const hasModifiers = p.modifierGroups && p.modifierGroups.length > 0;
                      const catName = categories.find((c) => c.id === p.category_id)?.name;

                      return (
                        <div
                          key={p.id}
                          ref={isSelected ? activeSearchItemRef : undefined}
                          onMouseEnter={() => setSelectedSearchIndex(idx)}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectSearchProduct(p);
                          }}
                          className={`px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs transition-colors cursor-pointer select-none ${
                            isSelected
                              ? 'bg-neutral-900 text-white'
                              : 'bg-white hover:bg-neutral-50 text-neutral-900'
                          } ${isOutOfStock ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold truncate text-[13px]">{p.name}</span>
                              {hasModifiers && (
                                <span
                                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                    isSelected
                                      ? 'bg-amber-400 text-neutral-900 font-bold'
                                      : 'bg-amber-100 text-amber-900 border border-amber-300'
                                  }`}
                                >
                                  + Options
                                </span>
                              )}
                              {isOutOfStock && (
                                <span
                                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                    isSelected
                                      ? 'bg-red-500 text-white'
                                      : 'bg-red-100 text-red-800 border border-red-200'
                                  }`}
                                >
                                  Out of Stock
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-[11px]">
                              {catName && (
                                <span className={isSelected ? 'text-neutral-300 font-medium' : 'text-neutral-500'}>
                                  {catName}
                                </span>
                              )}
                              {p.sku && (
                                <span className={`font-mono text-[10px] ${isSelected ? 'text-neutral-400' : 'text-neutral-400'}`}>
                                  • SKU: {p.sku}
                                </span>
                              )}
                              <span className={`font-mono text-[10px] ${isSelected ? 'text-neutral-400' : 'text-neutral-500'}`}>
                                • Stock: {p.current_stock} {p.unit}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span className={`font-mono font-bold text-sm ${isSelected ? 'text-amber-300' : 'text-neutral-900'}`}>
                              {formatCurrency(p.selling_price)}
                            </span>
                            {isSelected && !isOutOfStock && (
                              <span className="text-[10px] px-2 py-0.5 bg-white/20 text-white rounded font-mono font-semibold">
                                Press Enter ↵
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            <div className="hidden sm:flex items-center gap-1.5 px-3 py-2 bg-neutral-100 rounded-lg text-xs font-medium text-neutral-700 shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>{filteredProducts.length} items</span>
            </div>
          </div>

          {/* POS Quick Hotkey Guide Pill Strip */}
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-neutral-500 overflow-x-auto py-1 px-2 bg-neutral-50 rounded border border-neutral-200/80">
            <span className="font-bold text-neutral-700 uppercase font-mono tracking-wider text-[10px]">Hotkeys:</span>
            <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 rounded px-1.5 py-0.2 font-mono text-[10px] font-bold">
              Enter ↵ x2
            </span>
            <span className="text-neutral-700 font-medium">Print Bill</span>
            <span className="text-neutral-300">·</span>
            <span className="bg-neutral-200 border border-neutral-300 rounded px-1.5 py-0.2 font-mono text-[10px] text-neutral-700 font-semibold">F2</span>
            <span>Search</span>
            <span className="text-neutral-300">·</span>
            <span className="bg-neutral-200 border border-neutral-300 rounded px-1.5 py-0.2 font-mono text-[10px] text-neutral-700 font-semibold">F6</span>
            <span>Pay Mode</span>
            <span className="text-neutral-300">·</span>
            <span className="bg-neutral-200 border border-neutral-300 rounded px-1.5 py-0.2 font-mono text-[10px] text-neutral-700 font-semibold">F7</span>
            <span>Cash</span>
            <span className="text-neutral-300">·</span>
            <span className="bg-neutral-200 border border-neutral-300 rounded px-1.5 py-0.2 font-mono text-[10px] text-neutral-700 font-semibold">F8</span>
            <span>UPI</span>
            <span className="text-neutral-300">·</span>
            <span className="bg-neutral-200 border border-neutral-300 rounded px-1.5 py-0.2 font-mono text-[10px] text-neutral-700 font-semibold">F10</span>
            <span>Discount</span>
            <span className="text-neutral-300">·</span>
            <span className="bg-neutral-200 border border-neutral-300 rounded px-1.5 py-0.2 font-mono text-[10px] text-neutral-700 font-semibold">Esc</span>
            <span>Cancel</span>
          </div>

          {/* Category Tabs (Segmented controls) */}
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 pt-1 text-xs">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-neutral-900 text-white'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              All Items ({products.length})
            </button>
            {categories.map((cat) => {
              const count = categoryCountMap.get(cat.id) || 0;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                    selectedCategory === cat.id
                      ? 'bg-neutral-900 text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  {cat.name} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="p-8 text-center text-xs text-neutral-400">Loading catalog...</div>
          ) : filteredProducts.length === 0 ? (
            <div className="p-8 text-center text-neutral-500 text-xs">
              No products found matching your search.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {visibleProducts.map((p) => {
                const cartQty = cartMap.get(p.id) || 0;
                const inCart = cartQty > 0;
                const isOutOfStock = p.current_stock <= 0;
                const isLowStock = p.current_stock <= p.minimum_stock && !isOutOfStock;

                return (
                  <button
                    key={p.id}
                    onClick={() => handleProductClick(p)}
                    disabled={isOutOfStock}
                    className={`relative text-left p-3 rounded border text-xs flex flex-col justify-between transition-all group ${
                      isOutOfStock
                        ? 'border-neutral-200 bg-neutral-50 opacity-60 cursor-not-allowed'
                        : inCart
                        ? 'border-neutral-900 bg-neutral-50/70 shadow-xs'
                        : 'border-neutral-200 bg-white hover:border-neutral-400 hover:shadow-xs'
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-start gap-1">
                        <span className="font-semibold text-neutral-900 line-clamp-2 leading-snug">
                          {p.name}
                        </span>
                        {inCart && (
                          <span className="shrink-0 bg-neutral-900 text-white text-[10px] font-mono px-1.5 py-0.2 rounded">
                            {cartQty} in cart
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-neutral-400 font-mono mt-0.5 flex items-center gap-1">
                        <span>{p.sku}</span>
                        {p.hsn_code && <span>· HSN: {p.hsn_code}</span>}
                      </div>
                      {p.modifierGroups && p.modifierGroups.length > 0 && (
                        <div className="mt-1">
                          <span className="text-[9px] bg-amber-50 text-amber-800 border border-amber-200 px-1 py-0.5 rounded font-medium">
                            Toppings / Options
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="mt-3 pt-2 border-t border-neutral-100 flex items-end justify-between">
                      <div>
                        <div className="text-sm font-bold text-neutral-900 tabular-nums">
                          {formatCurrency(p.selling_price)}
                        </div>
                        <div className="text-[9px] font-mono text-neutral-500">
                          {p.tax_rate > 0 ? `${p.tax_rate}% GST` : '0% Exempt'}
                        </div>
                      </div>

                      <div className="text-right">
                        {isOutOfStock ? (
                          <span className="text-[10px] font-medium text-red-600">Out of Stock</span>
                        ) : isLowStock ? (
                          <span className="text-[10px] font-medium text-amber-600">
                            {p.current_stock} left
                          </span>
                        ) : (
                          <span className="text-[10px] text-neutral-500">
                            Stock: {p.current_stock}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
              {filteredProducts.length > 60 && !showAllCatalog && !searchQuery && selectedCategory === 'all' && (
                <div className="col-span-full py-3 text-center">
                  <button
                    type="button"
                    onClick={() => setShowAllCatalog(true)}
                    className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-semibold rounded transition cursor-pointer"
                  >
                    Load all remaining products ({filteredProducts.length - 60} more)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mobile View Cart Bar (Sticky at bottom of Catalog on mobile) */}
        {cart.length > 0 && (
          <div className="lg:hidden p-3 bg-white border-t border-neutral-200 flex items-center justify-between shadow-lg shrink-0">
            <div>
              <div className="text-[11px] text-neutral-500 font-medium">
                {cart.reduce((s, i) => s + i.quantity, 0)} items in bill
              </div>
              <div className="text-base font-bold text-neutral-900 font-mono tabular-nums">
                {formatCurrency(totalPayable)}
              </div>
            </div>
            <button
              onClick={() => setMobileTab('cart')}
              className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
            >
              <span>View Bill & Pay</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* RIGHT SECTION: Cart & Checkout Workspace */}
      <div className={`${mobileTab === 'catalog' ? 'hidden lg:flex' : 'flex'} w-full lg:w-[380px] xl:w-[420px] bg-white flex flex-col shrink-0 border-t lg:border-t-0 border-neutral-200 shadow-xs h-full min-h-0 overflow-y-auto`}>
        {/* Cart Header */}
        <div className="p-3 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMobileTab('catalog')}
              className="lg:hidden p-1 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200 rounded transition-colors flex items-center gap-0.5 text-xs font-medium mr-1 cursor-pointer"
              title="Back to Catalog"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Catalog</span>
            </button>
            <ShoppingBag className="w-4 h-4 text-neutral-900" />
            <h2 className="text-xs font-semibold text-neutral-900 uppercase tracking-wide">
              Current Bill ({cart.reduce((sum, i) => sum + i.quantity, 0)} Items)
            </h2>
          </div>
          {cart.length > 0 && (
            <button
              onClick={clearCart}
              className="text-[11px] text-red-600 hover:text-red-800 font-medium transition-colors cursor-pointer"
            >
              Clear Cart
            </button>
          )}
        </div>

        {/* Employee Selling Tax Mode Selector */}
        <div className="p-2.5 bg-neutral-50 border-b border-neutral-200 shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-neutral-800">Selling Price Tax Mode:</span>
            <span className="text-[10px] text-neutral-500 font-mono">
              {sellingTaxMode === 'INCLUSIVE' ? 'MRP (Tax Included)' : sellingTaxMode === 'EXCLUSIVE' ? 'Base + GST Added' : 'Item Default'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1 text-[11px]">
            <button
              type="button"
              onClick={() => setSellingTaxMode('INCLUSIVE')}
              className={`py-1 px-1 rounded text-center border font-medium transition-colors cursor-pointer ${
                sellingTaxMode === 'INCLUSIVE'
                  ? 'bg-neutral-900 text-white border-neutral-900 shadow-xs'
                  : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-100'
              }`}
            >
              With Tax (MRP)
            </button>
            <button
              type="button"
              onClick={() => setSellingTaxMode('EXCLUSIVE')}
              className={`py-1 px-1 rounded text-center border font-medium transition-colors cursor-pointer ${
                sellingTaxMode === 'EXCLUSIVE'
                  ? 'bg-neutral-900 text-white border-neutral-900 shadow-xs'
                  : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-100'
              }`}
            >
              Without Tax (+GST)
            </button>
            <button
              type="button"
              onClick={() => setSellingTaxMode('AUTO')}
              className={`py-1 px-1 rounded text-center border font-medium transition-colors cursor-pointer ${
                sellingTaxMode === 'AUTO'
                  ? 'bg-neutral-900 text-white border-neutral-900 shadow-xs'
                  : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-100'
              }`}
            >
              Item Default
            </button>
          </div>
        </div>

        {/* Error Banner */}
        {errorMessage && (
          <div className="p-2.5 bg-red-50 border-b border-red-200 text-red-800 text-xs flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span className="flex-1">{errorMessage}</span>
            <button onClick={() => setErrorMessage(null)} className="text-xs font-bold text-red-600">✕</button>
          </div>
        )}

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto p-3 divide-y divide-neutral-100 min-h-[200px]">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-neutral-400">
              <ShoppingBag className="w-8 h-8 mb-2 text-neutral-300" />
              <p className="text-xs font-medium text-neutral-600">Cart is currently empty</p>
              <p className="text-[11px] text-neutral-400 mt-1 max-w-[200px]">
                Click any scoop or dessert on the left or search above (F2) to add to this order.
              </p>
            </div>
          ) : (
            cart.map((item, itemIdx) => {
              const itemEffectiveTaxMode = item.taxTypeOverride || (sellingTaxMode !== 'AUTO' ? sellingTaxMode : item.product.purchase_tax_type || 'INCLUSIVE');
              const rate = item.product.tax_rate || 0;
              const modExtra = (item.selectedModifiers || []).reduce(
                (acc, m) => acc + (m.additionalPriceMinor / 100) * (m.quantity || 1),
                0
              );
              const effectiveUnitPrice = item.product.selling_price + modExtra;
              const rawLine = item.quantity * effectiveUnitPrice;
              const itemTotal = itemEffectiveTaxMode === 'INCLUSIVE' ? rawLine : (rawLine * (1 + rate / 100));

              return (
                <div key={`${item.product.id}-${itemIdx}`} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-neutral-900 truncate">
                      {item.product.name}
                    </div>

                    {/* Modifiers / Toppings tags */}
                    {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {item.selectedModifiers.map((m, mIdx) => (
                          <span
                            key={mIdx}
                            className="text-[9px] bg-neutral-100 text-neutral-800 border border-neutral-200 px-1.5 py-0.2 rounded font-medium"
                          >
                            + {m.name} ({formatCurrency(m.additionalPriceMinor / 100)})
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[10px] text-neutral-500 font-mono">
                      <span>{formatCurrency(effectiveUnitPrice)} × {item.quantity} {item.product.unit}</span>
                      <span className="text-neutral-300">·</span>
                      <button
                        type="button"
                        onClick={() => toggleItemTaxMode(item.product.id)}
                        title="Click to toggle selling with tax (inclusive) or without tax (+GST) for this item"
                        className={`px-1.5 py-0.2 rounded border text-[9px] font-semibold cursor-pointer transition-colors ${
                          itemEffectiveTaxMode === 'INCLUSIVE'
                            ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                            : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                        }`}
                      >
                        {itemEffectiveTaxMode === 'INCLUSIVE' ? 'Incl. Tax' : '+ Tax (Excl.)'}
                      </button>
                      <span className="text-neutral-300">·</span>
                      <span className="text-neutral-600 font-semibold">{rate}% GST</span>
                      {item.product.hsn_code && (
                        <>
                          <span className="text-neutral-300">·</span>
                          <span>HSN {item.product.hsn_code}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Quantity adjustment buttons */}
                  <div className="flex items-center gap-1 bg-neutral-100 p-0.5 rounded border border-neutral-200">
                    <button
                      onClick={() => updateQuantityByIndex(itemIdx, item.quantity - 1)}
                      className="w-5 h-5 flex items-center justify-center text-neutral-600 hover:text-neutral-900 hover:bg-white rounded transition-colors cursor-pointer"
                      title="Decrease quantity"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <input
                      type="number"
                      min="1"
                      max={item.product.current_stock}
                      value={item.quantity}
                      onFocus={(e) => e.target.select()}
                      onKeyDown={(e) => {
                        if (['e', 'E', '+', '-', '.'].includes(e.key)) e.preventDefault();
                      }}
                      onChange={(e) => {
                        const val = e.target.value.replace(/^0+/, '');
                        updateQuantityByIndex(itemIdx, val === '' ? 1 : parseInt(val) || 1);
                      }}
                      className="w-8 text-center text-xs font-bold bg-transparent focus:outline-none tabular-nums"
                    />
                    <button
                      onClick={() => updateQuantityByIndex(itemIdx, item.quantity + 1)}
                      className="w-5 h-5 flex items-center justify-center text-neutral-600 hover:text-neutral-900 hover:bg-white rounded transition-colors cursor-pointer"
                      title="Increase quantity"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Item Line Total */}
                  <div className="text-right shrink-0 w-20">
                    <div className="font-semibold text-neutral-900 tabular-nums">
                      {formatCurrency(itemTotal)}
                    </div>
                    <button
                      onClick={() => removeFromCartByIndex(itemIdx)}
                      className="text-[10px] text-neutral-400 hover:text-red-600 transition-colors cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Calculation & Payment Drawer */}
        <div className="p-3 border-t border-neutral-200 bg-neutral-50 space-y-3">
          {/* GST Billing Mode Selector */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-neutral-600">
              <span className="font-medium">GST Billing Mode:</span>
              <button
                type="button"
                onClick={() => setShowCustomerDetails(!showCustomerDetails)}
                className="text-[11px] text-neutral-800 hover:text-neutral-900 underline font-medium"
              >
                {showCustomerDetails ? 'Hide Customer/GSTIN' : '+ Customer / GSTIN (B2B)'}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1 text-[11px]">
              <button
                type="button"
                onClick={() => setGstType('INTRA_STATE')}
                className={`py-1 px-1.5 rounded text-center border font-medium transition-colors ${
                  gstType === 'INTRA_STATE'
                    ? 'bg-neutral-900 text-white border-neutral-900'
                    : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                }`}
              >
                Intra-State (CGST+SGST)
              </button>
              <button
                type="button"
                onClick={() => setGstType('INTER_STATE')}
                className={`py-1 px-1.5 rounded text-center border font-medium transition-colors ${
                  gstType === 'INTER_STATE'
                    ? 'bg-neutral-900 text-white border-neutral-900'
                    : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                }`}
              >
                Inter-State (IGST)
              </button>
              <button
                type="button"
                onClick={() => setGstType('EXEMPT')}
                className={`py-1 px-1.5 rounded text-center border font-medium transition-colors ${
                  gstType === 'EXEMPT'
                    ? 'bg-neutral-900 text-white border-neutral-900'
                    : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                }`}
              >
                Exempt (0% GST)
              </button>
            </div>
          </div>

          {/* Customer / B2B GSTIN Collapsible Section */}
          {showCustomerDetails && (
            <div className="p-2.5 bg-white rounded border border-neutral-200 space-y-2 text-xs">
              <div className="font-semibold text-neutral-800 text-[11px] uppercase tracking-wider font-mono">
                B2B Customer & GSTIN Details
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-neutral-500 font-medium block mb-0.5">Customer Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Rahul Sharma / ABC Traders"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-2 py-1 text-xs border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-neutral-500 font-medium block mb-0.5">Phone Number</label>
                  <input
                    type="tel"
                    placeholder="10-digit mobile"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full px-2 py-1 text-xs font-mono border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-neutral-500 font-medium block mb-0.5">Customer GSTIN (15 Digits)</label>
                <input
                  type="text"
                  maxLength={15}
                  placeholder="e.g. 29ABCDE1234F1Z5"
                  value={customerGstin}
                  onChange={(e) => setCustomerGstin(e.target.value.toUpperCase())}
                  className="w-full px-2 py-1 text-xs font-mono border border-neutral-300 rounded uppercase focus:border-neutral-900 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Subtotals & Taxes */}
          <div className="space-y-1 text-xs">
            <div className="flex justify-between text-neutral-600">
              <span>Taxable Subtotal</span>
              <span className="tabular-nums font-mono">{formatCurrency(subtotal)}</span>
            </div>
            {gstType === 'EXEMPT' ? (
              <div className="flex justify-between text-neutral-500 text-[11px]">
                <span>GST Tax</span>
                <span className="font-mono text-emerald-700">0% (Bill of Supply / Exempt)</span>
              </div>
            ) : gstType === 'INTER_STATE' && igst > 0 ? (
              <>
                <div className="flex justify-between text-neutral-500 text-[11px] pl-2 border-l border-neutral-200">
                  <span>IGST (Integrated Tax 100%)</span>
                  <span className="tabular-nums font-mono">+{formatCurrency(igst)}</span>
                </div>
                <div className="flex justify-between text-neutral-700 font-medium">
                  <span>Total GST</span>
                  <span className="tabular-nums font-mono font-semibold">+{formatCurrency(estimatedTax)}</span>
                </div>
              </>
            ) : estimatedTax > 0 ? (
              <>
                <div className="flex justify-between text-neutral-500 text-[11px] pl-2 border-l border-neutral-200">
                  <span>CGST (Central Tax 50%)</span>
                  <span className="tabular-nums font-mono">+{formatCurrency(cgst)}</span>
                </div>
                <div className="flex justify-between text-neutral-500 text-[11px] pl-2 border-l border-neutral-200">
                  <span>SGST (State Tax 50%)</span>
                  <span className="tabular-nums font-mono">+{formatCurrency(sgst)}</span>
                </div>
                <div className="flex justify-between text-neutral-700 font-medium">
                  <span>Total GST</span>
                  <span className="tabular-nums font-mono font-semibold">+{formatCurrency(estimatedTax)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between text-neutral-500 text-[11px]">
                <span>GST Tax</span>
                <span className="font-mono text-emerald-700">0% (Nil / Exempt)</span>
              </div>
            )}

            {/* Discount field */}
            <div className="flex items-center justify-between text-neutral-600 pt-0.5">
              <span className="flex items-center gap-1">
                <span>Discount</span>
                <span className="text-[10px] text-neutral-400 font-mono">[F10]</span>
              </span>
              <div className="flex items-center gap-1">
                <span className="text-xs text-neutral-400">₹</span>
                <input
                  ref={discountInputRef}
                  type="number"
                  min="0"
                  step="1"
                  placeholder="0"
                  value={discount === 0 ? '' : discount}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => {
                    if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      triggerQuickPrintStep();
                    }
                  }}
                  onChange={(e) => {
                    const val = e.target.value.replace(/^0+(?=\d)/, '');
                    setDiscount(Math.max(0, parseFloat(val) || 0));
                  }}
                  className="w-16 px-1.5 py-0.5 text-right text-xs bg-white border border-neutral-300 rounded font-mono tabular-nums focus:outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
                />
              </div>
            </div>

            {/* Round Off */}
            {roundOff !== 0 && (
              <div className="flex justify-between text-neutral-500 text-[11px]">
                <span>Round Off</span>
                <span className="font-mono tabular-nums">
                  {roundOff > 0 ? `+${formatCurrency(roundOff)}` : formatCurrency(roundOff)}
                </span>
              </div>
            )}

            {/* Grand Total */}
            <div className="flex justify-between items-baseline pt-2 border-t border-neutral-200">
              <span className="font-bold text-neutral-900 text-sm">TOTAL DUE</span>
              <span className="font-bold text-xl text-neutral-900 tabular-nums font-mono">
                {formatCurrency(totalPayable)}
              </span>
            </div>
          </div>

          {/* Payment Method Selector */}
          <div>
            <div className="flex items-center justify-between text-[11px] font-medium text-neutral-600 mb-1.5">
              <span>Payment Method:</span>
              <span className="text-[10px] text-neutral-400 font-mono">F6 cycle</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { id: 'UPI', label: 'UPI / QR', icon: QrCode, badge: 'F8' },
                { id: 'CASH', label: 'Cash', icon: Banknote, badge: 'F7' },
                { id: 'CARD', label: 'Card', icon: CreditCard },
                { id: 'OTHER', label: 'Other', icon: Check },
              ].map((m) => {
                const Icon = m.icon;
                const isSelected = paymentMethod === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setPaymentMethod(m.id as any)}
                    className={`relative py-2 px-1 rounded flex flex-col items-center justify-center text-center transition-colors border ${
                      isSelected
                        ? 'bg-neutral-900 text-white border-neutral-900 font-semibold'
                        : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                    }`}
                  >
                    {m.badge && (
                      <span className={`absolute top-0.5 right-0.5 text-[8px] font-mono px-0.5 rounded leading-none ${
                        isSelected ? 'bg-neutral-700 text-neutral-200' : 'bg-neutral-100 text-neutral-400'
                      }`}>
                        {m.badge}
                      </span>
                    )}
                    <Icon className="w-4 h-4 mb-0.5" />
                    <span className="text-[10px] leading-tight">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cash Tendered Helper (Shows only if CASH selected) */}
          {paymentMethod === 'CASH' && (
            <div className="p-2 bg-neutral-100 rounded border border-neutral-200 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-neutral-600 font-medium flex items-center gap-1">
                  <span>Cash Received:</span>
                  <span className="text-[10px] text-neutral-400 font-mono">[F9]</span>
                </span>
                <input
                  ref={cashInputRef}
                  type="number"
                  placeholder={String(Math.ceil(totalPayable))}
                  value={cashTendered}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => {
                    if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      triggerQuickPrintStep();
                    }
                  }}
                  onChange={(e) => setCashTendered(e.target.value.replace(/^0+(?=\d)/, ''))}
                  className="w-24 px-2 py-0.5 text-right font-mono text-xs bg-white border border-neutral-300 rounded focus:outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
                />
              </div>

              {/* Quick Cash Tender Presets for Ice Cream Parlour */}
              <div className="flex items-center gap-1 pt-1 border-t border-neutral-200/60">
                <span className="text-[10px] text-neutral-500 font-mono mr-0.5">Quick:</span>
                {[50, 100, 200, 500, 2000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setCashTendered(String(amt))}
                    className="flex-1 py-0.5 bg-white hover:bg-neutral-200 border border-neutral-300 rounded text-[10px] font-mono font-semibold text-neutral-800 transition-colors text-center cursor-pointer"
                  >
                    ₹{amt}
                  </button>
                ))}
              </div>
              {cashNum > 0 && (
                <div className="flex justify-between items-center text-neutral-800 pt-1 border-t border-neutral-200">
                  <span className="font-medium">Change to Return:</span>
                  <span className={`font-mono font-bold ${changeDue >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {formatCurrency(changeDue)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Notes field */}
          <div>
            <input
              type="text"
              placeholder="Optional notes or customer details..."
              value={customerNotes}
              onChange={(e) => setCustomerNotes(e.target.value)}
              className="w-full px-2.5 py-1 text-xs bg-white border border-neutral-200 rounded focus:outline-none focus:border-neutral-900"
            />
          </div>

          {/* Direct Hardware Print Indicator */}
          <div className="flex items-center justify-between px-1 text-[11px] text-neutral-600">
            <div className="flex items-center gap-1.5 truncate">
              <Printer className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="truncate font-medium text-neutral-700">
                {localStorage.getItem('pos_printer_name') ? `Direct to: ${localStorage.getItem('pos_printer_name')}` : 'Direct Print (System Default)'}
              </span>
            </div>
            <span className="text-[10px] text-neutral-400 font-mono shrink-0">Enter ↵ x2</span>
          </div>

          {/* Action Button: Complete Bill / Double-Enter Direct Print */}
          <button
            onClick={() => handleCompleteBill(confirmPrintPrompt)}
            disabled={cart.length === 0 || isSubmitting}
            className={`w-full py-3 rounded font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
              cart.length === 0 || isSubmitting
                ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                : confirmPrintPrompt
                ? 'bg-amber-500 hover:bg-amber-600 text-neutral-950 shadow-md ring-4 ring-amber-300/70 animate-pulse cursor-pointer'
                : 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.99] shadow-xs cursor-pointer'
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Printing Direct to Hardware...</span>
              </>
            ) : confirmPrintPrompt ? (
              <div className="flex flex-col items-center leading-tight">
                <div className="flex items-center gap-2 font-bold text-sm tracking-wide">
                  <Printer className="w-4 h-4 animate-bounce" />
                  <span>PRESS ENTER AGAIN TO DIRECT PRINT!</span>
                </div>
                <span className="text-[11px] font-mono opacity-90 mt-0.5">
                  Total: {formatCurrency(totalPayable)} • Direct to Printer [Esc to cancel]
                </span>
              </div>
            ) : (
              <>
                <Printer className="w-4 h-4" />
                <span>Complete & Direct Print</span>
                <span className="font-mono tabular-nums text-emerald-100">({formatCurrency(totalPayable)})</span>
                <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-emerald-800/40 rounded border border-emerald-400/30 text-emerald-100 font-mono">
                  Enter ↵ x2
                </span>
              </>
            )}
          </button>
        </div>
      </div>
      </div>



      {/* Bill Preview Modal when user clicks "View / PDF" */}
      {activeModalSale && (
        <ReceiptModal
          sale={activeModalSale}
          onClose={() => setActiveModalSale(null)}
          onNewBill={() => setActiveModalSale(null)}
          autoPrint={false}
        />
      )}

      {/* Ice Cream Toppings & Serving Modifier Modal */}
      {customizingProduct && (
        <ModifierModal
          product={customizingProduct}
          onAddToCart={(prod, mods, qty) => addToCart(prod, qty, mods)}
          onClose={() => setCustomizingProduct(null)}
        />
      )}
    </div>
  );
};
