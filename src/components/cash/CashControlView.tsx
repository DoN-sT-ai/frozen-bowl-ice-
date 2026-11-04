import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import type {
  CashDrawerSession,
  CashDrawerTransaction,
  DenominationCounts,
} from '../../types';
import {
  Banknote,
  PlusCircle,
  MinusCircle,
  Lock,
  Unlock,
  Printer,
  History,
  CheckCircle2,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  X,
  RefreshCw,
  Coins,
  ArrowRight,
  Sparkles,
  HelpCircle,
  Plus,
} from 'lucide-react';

const STANDARD_DENOMINATIONS = [
  { label: '₹500', value: 500, key: '500' },
  { label: '₹200', value: 200, key: '200' },
  { label: '₹100', value: 100, key: '100' },
  { label: '₹50', value: 50, key: '50' },
  { label: '₹20', value: 20, key: '20' },
  { label: '₹10', value: 10, key: '10' },
  { label: '₹5', value: 5, key: '5' },
  { label: '₹2', value: 2, key: '2' },
  { label: '₹1', value: 1, key: '1' },
];

export const CashControlView: React.FC = () => {
  const { store } = useAuth();

  // Active session and history
  const [activeSession, setActiveSession] = useState<CashDrawerSession | null>(null);
  const [lastClosedSession, setLastClosedSession] = useState<CashDrawerSession | null>(null);
  const [transactions, setTransactions] = useState<CashDrawerTransaction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');

  // Past sessions
  const [pastSessions, setPastSessions] = useState<CashDrawerSession[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [selectedPastSession, setSelectedPastSession] = useState<{
    session: CashDrawerSession;
    transactions: CashDrawerTransaction[];
  } | null>(null);

  // Modals
  const [showOpenModal, setShowOpenModal] = useState<boolean>(false);
  const [showCashInModal, setShowCashInModal] = useState<boolean>(false);
  const [showCashOutModal, setShowCashOutModal] = useState<boolean>(false);
  const [showCloseModal, setShowCloseModal] = useState<boolean>(false);
  const [showSlipModal, setShowSlipModal] = useState<boolean>(false);
  const [slipData, setSlipData] = useState<any>(null);

  // Form states - Open Shift
  const [openingDenominations, setOpeningDenominations] = useState<DenominationCounts>({});
  const [openingNotes, setOpeningNotes] = useState<string>('');
  const [manualOpeningAmount, setManualOpeningAmount] = useState<string>('');
  const [useDenomForOpen, setUseDenomForOpen] = useState<boolean>(false);

  // Form states - Cash In
  const [cashInAmount, setCashInAmount] = useState<string>('');
  const [cashInReason, setCashInReason] = useState<string>('Float top-up');
  const [cashInNotes, setCashInNotes] = useState<string>('');

  // Form states - Cash Out
  const [cashOutAmount, setCashOutAmount] = useState<string>('');
  const [cashOutCategory, setCashOutCategory] = useState<string>('Milk & Counter Supplies');
  const [cashOutReason, setCashOutReason] = useState<string>('');
  const [cashOutNotes, setCashOutNotes] = useState<string>('');

  // Form states - Close Shift
  const [closingDenominations, setClosingDenominations] = useState<DenominationCounts>({});
  const [manualClosingAmount, setManualClosingAmount] = useState<string>('');
  const [useDenomForClose, setUseDenomForClose] = useState<boolean>(false);
  const [closingNotes, setClosingNotes] = useState<string>('');

  const [actionLoading, setActionLoading] = useState<boolean>(false);

  // Fetch current session & last closed session
  const fetchCurrentSession = async () => {
    try {
      setLoading(true);
      const res = await api.getCurrentCashDrawerSession();
      setActiveSession(res.session);
      setTransactions(res.transactions || []);
      setLastClosedSession(res.lastClosedSession || null);
    } catch (err: any) {
      console.error('Failed to load cash drawer session:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch history
  const fetchHistory = async () => {
    try {
      setLoadingHistory(true);
      const list = await api.getCashDrawerSessions(60);
      setPastSessions(list || []);
    } catch (err: any) {
      console.error('Failed to load past cash drawer sessions:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchCurrentSession();
  }, []);

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab]);

  // Denomination calculations
  const calculateDenomTotal = (denoms: DenominationCounts): number => {
    return STANDARD_DENOMINATIONS.reduce((sum, d) => {
      const count = Number(denoms[d.key]) || 0;
      return sum + count * d.value;
    }, 0);
  };

  const calculatedOpeningTotal = useMemo(() => {
    return calculateDenomTotal(openingDenominations);
  }, [openingDenominations]);

  const effectiveOpeningAmount = useMemo(() => {
    if (useDenomForOpen) {
      return calculatedOpeningTotal;
    }
    return Number(manualOpeningAmount) || 0;
  }, [useDenomForOpen, calculatedOpeningTotal, manualOpeningAmount]);

  const calculatedClosingTotal = useMemo(() => {
    return calculateDenomTotal(closingDenominations);
  }, [closingDenominations]);

  const effectiveClosingAmount = useMemo(() => {
    if (useDenomForClose) {
      return calculatedClosingTotal;
    }
    return Number(manualClosingAmount) || 0;
  }, [useDenomForClose, calculatedClosingTotal, manualClosingAmount]);

  // Compute live expected amount from active session
  const expectedAmount = useMemo(() => {
    if (!activeSession) return 0;
    const opening = Number(activeSession.opening_amount) || 0;
    const sales = Number(activeSession.cash_sales_amount) || 0;
    const cin = Number(activeSession.cash_in_amount) || 0;
    const cout = Number(activeSession.cash_out_amount) || 0;
    return Number((opening + sales + cin - cout).toFixed(2));
  }, [activeSession]);

  const closingVariance = useMemo(() => {
    return Number((effectiveClosingAmount - expectedAmount).toFixed(2));
  }, [effectiveClosingAmount, expectedAmount]);

  // Initialize opening modal with carry-forward from last closed session
  const handleOpenModalClick = () => {
    if (lastClosedSession) {
      const carry = Number(lastClosedSession.closing_amount || 0);
      setManualOpeningAmount(carry.toFixed(2));

      let hasValidDenoms = false;
      try {
        if (lastClosedSession.closing_denominations_json) {
          const parsed = JSON.parse(lastClosedSession.closing_denominations_json);
          const denomSum = calculateDenomTotal(parsed);
          if (denomSum > 0 && Math.abs(denomSum - carry) < 1) {
            setOpeningDenominations(parsed);
            hasValidDenoms = true;
          }
        }
      } catch (_) {}

      setUseDenomForOpen(hasValidDenoms);
      setOpeningNotes(`Carried forward from last session closing balance (₹${carry.toFixed(2)})`);
    } else {
      setOpeningDenominations({});
      setManualOpeningAmount('0.00');
      setOpeningNotes('');
      setUseDenomForOpen(false);
    }
    setShowOpenModal(true);
  };

  // Quick 1-click start using carry-forward balance
  const handleQuickStartWithCarryForward = async () => {
    if (!lastClosedSession) return;
    const carryAmt = Number(lastClosedSession.closing_amount || 0);
    let carryDenoms = {};
    try {
      if (lastClosedSession.closing_denominations_json) {
        carryDenoms = JSON.parse(lastClosedSession.closing_denominations_json);
      }
    } catch (_) {}

    setActionLoading(true);
    try {
      await api.openCashDrawerSession({
        openingAmount: carryAmt,
        denominations: carryDenoms,
        notes: `Carried forward from last shift closing balance (₹${carryAmt.toFixed(2)})`,
      });
      await fetchCurrentSession();
    } catch (err: any) {
      alert(err.message || 'Failed to start shift');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Open Shift submit
  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (effectiveOpeningAmount < 0) {
      alert('Opening amount cannot be negative');
      return;
    }
    setActionLoading(true);
    try {
      await api.openCashDrawerSession({
        openingAmount: effectiveOpeningAmount,
        denominations: useDenomForOpen ? openingDenominations : {},
        notes: openingNotes || (lastClosedSession ? `Carried forward from last session (₹${effectiveOpeningAmount.toFixed(2)})` : ''),
      });
      setShowOpenModal(false);
      setOpeningDenominations({});
      setManualOpeningAmount('');
      setOpeningNotes('');
      await fetchCurrentSession();
    } catch (err: any) {
      alert(err.message || 'Failed to open cash drawer shift');
    } finally {
      setActionLoading(false);
    }
  };

  // Open close-shift modal with pre-filled live expected amount
  const handleOpenCloseModalClick = () => {
    setManualClosingAmount(expectedAmount > 0 ? expectedAmount.toFixed(2) : '0.00');
    setClosingDenominations({});
    setUseDenomForClose(false);
    setClosingNotes('');
    setShowCloseModal(true);
  };

  // Handle Cash In
  const handleCashIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(cashInAmount);
    if (!amt || amt <= 0) {
      alert('Please enter a valid cash amount greater than ₹0');
      return;
    }
    setActionLoading(true);
    try {
      await api.addCashIn({
        amount: amt,
        reason: cashInReason,
        notes: cashInNotes,
      });
      setShowCashInModal(false);
      setCashInAmount('');
      setCashInNotes('');
      await fetchCurrentSession();
    } catch (err: any) {
      alert(err.message || 'Failed to add cash in');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Cash Out (Expense)
  const handleCashOut = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(cashOutAmount);
    if (!amt || amt <= 0) {
      alert('Please enter a valid cash amount greater than ₹0');
      return;
    }
    setActionLoading(true);
    try {
      await api.addCashOut({
        amount: amt,
        category: cashOutCategory,
        reason: cashOutReason || cashOutCategory,
        notes: cashOutNotes,
      });
      setShowCashOutModal(false);
      setCashOutAmount('');
      setCashOutReason('');
      setCashOutNotes('');
      await fetchCurrentSession();
    } catch (err: any) {
      alert(err.message || 'Failed to record cash out');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Close Shift submit
  const handleCloseShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (effectiveClosingAmount < 0) {
      alert('Counted closing cash cannot be negative');
      return;
    }
    setActionLoading(true);
    try {
      const res = await api.closeCashDrawerSession({
        closingAmount: effectiveClosingAmount,
        denominations: useDenomForClose ? closingDenominations : {},
        notes: closingNotes,
      });
      setShowCloseModal(false);
      setClosingDenominations({});
      setManualClosingAmount('');
      setClosingNotes('');

      // Open print slip dialog
      setSlipData({
        session: res.session,
        reconciliation: res.reconciliation,
      });
      setShowSlipModal(true);

      await fetchCurrentSession();
    } catch (err: any) {
      alert(err.message || 'Failed to close cash drawer shift');
    } finally {
      setActionLoading(false);
    }
  };

  // Load past session details
  const handleViewPastSession = async (session: CashDrawerSession) => {
    try {
      const data = await api.getCashDrawerSessionDetails(session.id);
      setSelectedPastSession(data);
    } catch (err: any) {
      alert(err.message || 'Failed to load past session details');
    }
  };

  const handlePrintSlip = () => {
    window.print();
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-neutral-50 overflow-y-auto">
      {/* Top Header - Consistent with SettingsView, ReportsView, ExpenseManager */}
      <div className="p-4 bg-white border-b border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-neutral-900 leading-none">
              Cash Control &amp; Counter Register
            </h1>
            {activeSession ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Shift Open
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-neutral-100 border border-neutral-200 text-neutral-600 text-[10px] font-medium">
                <Lock className="w-3 h-3 text-neutral-500" />
                Drawer Closed
              </span>
            )}
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Physical counter cash drawer management • 1. Opening Amount ➔ 2. Cash Sales ➔ 3. Closing Amount (Carried to next shift)
          </p>
        </div>

        {/* Tab switch & Refresh */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded border border-neutral-200 text-xs">
            <button
              onClick={() => setActiveTab('current')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                activeTab === 'current'
                  ? 'bg-white text-neutral-900 font-semibold shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Current Shift
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1 ${
                activeTab === 'history'
                  ? 'bg-white text-neutral-900 font-semibold shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              Past Shifts Log
            </button>
          </div>

          <button
            onClick={fetchCurrentSession}
            disabled={loading}
            className="p-1.5 text-neutral-600 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 rounded text-xs transition-colors cursor-pointer border border-neutral-200"
            title="Refresh session data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-4 space-y-4 max-w-7xl w-full mx-auto overflow-y-auto">
        {activeTab === 'current' ? (
          <>
            {/* ======================================================== */}
            {/* STATE A: NO ACTIVE SHIFT (DRAWER CLOSED)                 */}
            {/* Displays Last Session Closing Amount -> Next Opening     */}
            {/* ======================================================== */}
            {!activeSession ? (
              <div className="max-w-3xl mx-auto space-y-4 my-2">
                {lastClosedSession ? (
                  /* Shift Handover Card: Last Closed Amount -> Next Opening Balance */
                  <div className="bg-white p-6 rounded-lg border border-neutral-200 shadow-xs space-y-4 text-xs">
                    <div className="border-b border-neutral-100 pb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-emerald-600" />
                        <h2 className="font-bold text-neutral-900 text-sm">
                          Shift Handover &amp; Automatic Carry-Forward
                        </h2>
                      </div>
                      <span className="text-[11px] font-mono text-neutral-500 bg-neutral-50 px-2 py-0.5 rounded border border-neutral-200">
                        Last closed: {new Date(lastClosedSession.closed_at || lastClosedSession.updated_at).toLocaleDateString()} at {new Date(lastClosedSession.closed_at || lastClosedSession.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {/* The Visual Connection Bridge */}
                    <div className="grid grid-cols-1 md:grid-cols-3 items-center gap-3 p-4 bg-neutral-50 rounded-lg border border-neutral-200">
                      {/* Left: Last Session Closed Amount */}
                      <div className="space-y-0.5 text-center md:text-left">
                        <span className="text-[11px] font-medium text-neutral-500 block">
                          Last Session Closing Amount
                        </span>
                        <div className="text-2xl font-bold font-mono text-neutral-900 tabular-nums">
                          ₹{(Number(lastClosedSession.closing_amount) || 0).toFixed(2)}
                        </div>
                        <div className="text-[11px] text-neutral-500">
                          Closed by <span className="font-semibold text-neutral-700">{lastClosedSession.closed_by_name || 'Cashier'}</span>
                          {lastClosedSession.difference !== undefined && (
                            <span className="block mt-0.5 font-mono text-[10px]">
                              Status: <strong className={Number(lastClosedSession.difference) === 0 ? 'text-emerald-700' : 'text-amber-700'}>
                                {Number(lastClosedSession.difference) === 0 ? 'Balanced' : Number(lastClosedSession.difference) > 0 ? `+₹${lastClosedSession.difference} Surplus` : `-₹${Math.abs(Number(lastClosedSession.difference))} Short`}
                              </strong>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Center: Carry Forward Indicator */}
                      <div className="flex flex-col items-center justify-center text-neutral-500 py-1">
                        <span className="text-[10px] font-mono uppercase bg-neutral-200 text-neutral-700 px-2 py-0.5 rounded">
                          Carries Forward
                        </span>
                        <ArrowRight className="w-4 h-4 text-neutral-600 my-1" />
                        <span className="text-[10px] text-neutral-500">
                          Automatic Handover
                        </span>
                      </div>

                      {/* Right: Next Session Opening Balance */}
                      <div className="space-y-0.5 text-center md:text-right">
                        <span className="text-[11px] font-semibold text-emerald-800 block">
                          1. Opening Balance for Next Session
                        </span>
                        <div className="text-2xl font-bold font-mono text-emerald-700 tabular-nums">
                          ₹{(Number(lastClosedSession.closing_amount) || 0).toFixed(2)}
                        </div>
                        <div className="text-[11px] text-neutral-500">
                          Physical cash ready in counter drawer
                        </div>
                      </div>
                    </div>

                    {/* Action buttons to start shift */}
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-1">
                      <button
                        onClick={handleQuickStartWithCarryForward}
                        disabled={actionLoading}
                        className="w-full sm:w-auto px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded text-xs font-semibold shadow-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Unlock className="w-3.5 h-3.5" />
                        {actionLoading
                          ? 'Starting Shift...'
                          : `Start Next Shift with ₹${(Number(lastClosedSession.closing_amount) || 0).toFixed(2)} Opening Balance`}
                      </button>

                      <button
                        onClick={handleOpenModalClick}
                        className="w-full sm:w-auto px-3 py-2 bg-white hover:bg-neutral-50 text-neutral-700 border border-neutral-300 rounded text-xs font-medium transition-colors text-center cursor-pointer"
                      >
                        Recount / Custom Starting Float
                      </button>
                    </div>

                    {/* Last Shift 1-2-3 Audit Trail Summary */}
                    <div className="border-t border-neutral-100 pt-3 space-y-1.5">
                      <span className="text-[11px] font-medium text-neutral-500 block">
                        Last Shift Reconciliation Breakdown:
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div className="p-2.5 bg-neutral-50 rounded border border-neutral-200">
                          <span className="text-[10px] text-neutral-500 block">1. Opening Float</span>
                          <span className="font-mono font-bold text-neutral-800 tabular-nums">
                            ₹{(Number(lastClosedSession.opening_amount) || 0).toFixed(2)}
                          </span>
                        </div>
                        <div className="p-2.5 bg-neutral-50 rounded border border-neutral-200">
                          <span className="text-[10px] text-neutral-500 block">2. Cash Sales (+)</span>
                          <span className="font-mono font-bold text-emerald-700 tabular-nums">
                            +₹{(Number(lastClosedSession.cash_sales_amount) || 0).toFixed(2)}
                          </span>
                        </div>
                        <div className="p-2.5 bg-neutral-50 rounded border border-neutral-200">
                          <span className="text-[10px] text-neutral-500 block">Counter Expenses (-)</span>
                          <span className="font-mono font-bold text-amber-700 tabular-nums">
                            -₹{(Number(lastClosedSession.cash_out_amount) || 0).toFixed(2)}
                          </span>
                        </div>
                        <div className="p-2.5 bg-neutral-50 rounded border border-neutral-200">
                          <span className="text-[10px] text-neutral-500 block">3. Final Closed Amount</span>
                          <span className="font-mono font-bold text-neutral-900 tabular-nums">
                            ₹{(Number(lastClosedSession.closing_amount) || 0).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Initial Setup (First Time) */
                  <div className="bg-white p-8 rounded-lg border border-neutral-200 text-center space-y-3 shadow-xs">
                    <div className="w-10 h-10 bg-neutral-100 text-neutral-600 rounded-lg flex items-center justify-center mx-auto border border-neutral-200">
                      <Banknote className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <h2 className="text-sm font-bold text-neutral-900">
                        Start Initial Cash Register Shift
                      </h2>
                      <p className="text-xs text-neutral-500 max-w-md mx-auto">
                        No previous shift history found. Set your initial drawer opening float to begin tracking physical counter cash.
                      </p>
                    </div>
                    <button
                      onClick={handleOpenModalClick}
                      className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded text-xs font-semibold shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      Set Initial Opening Float &amp; Start
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* ======================================================== */
              /* STATE B: ACTIVE REGISTER SHIFT OPEN                      */
              /* Core Sequence: 1. Opening Amount -> 2. Cash Sales ->     */
              /* Expenses -> 3. Closing Amount (Carried to next shift)    */
              /* ======================================================== */
              <>
                {/* Active Shift Controls & Cashier Info */}
                <div className="bg-white p-3.5 rounded-lg border border-neutral-200 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className="font-semibold text-neutral-900">Shift Cashier:</span>
                    <span className="font-mono text-neutral-800 bg-neutral-100 px-2 py-0.5 rounded font-semibold border border-neutral-200">
                      {activeSession.opened_by_name}
                    </span>
                    <span className="text-neutral-300">•</span>
                    <span className="text-neutral-500 font-mono text-[11px]">
                      Started: {new Date(activeSession.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({new Date(activeSession.opened_at).toLocaleDateString()})
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => setShowCashInModal(true)}
                      className="px-2.5 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded text-xs font-medium border border-neutral-300 flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Float In
                    </button>
                    <button
                      onClick={() => setShowCashOutModal(true)}
                      className="px-2.5 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded text-xs font-medium border border-neutral-300 flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <MinusCircle className="w-3.5 h-3.5 text-amber-600" />
                      Record Expense
                    </button>
                    <button
                      onClick={() => {
                        setSlipData({ session: activeSession });
                        setShowSlipModal(true);
                      }}
                      className="px-2.5 py-1.5 bg-white hover:bg-neutral-50 text-neutral-700 rounded text-xs font-medium border border-neutral-300 flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Print Slip
                    </button>
                    <button
                      onClick={handleOpenCloseModalClick}
                      className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold shadow-xs flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      End Shift &amp; Reconcile
                    </button>
                  </div>
                </div>

                {/* 4 Core Financial Stat Cards (Matching AdminDashboard style exactly) */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {/* CARD 1: 1. Opening Amount */}
                  <div className="bg-white p-3.5 rounded-lg border border-neutral-200 shadow-xs">
                    <div className="flex items-center justify-between text-neutral-500 mb-1">
                      <span className="text-xs font-medium">1. Opening Amount</span>
                      <Coins className="w-4 h-4 text-neutral-400" />
                    </div>
                    <div className="text-xl font-bold font-mono text-neutral-900 tabular-nums">
                      ₹{(Number(activeSession.opening_amount) || 0).toFixed(2)}
                    </div>
                    <div className="text-[11px] text-neutral-500 mt-1 truncate">
                      {activeSession.opening_notes?.includes('Carried forward')
                        ? 'Carried from last shift closing'
                        : 'Starting cash float in drawer'}
                    </div>
                  </div>

                  {/* CARD 2: 2. Cash Sales (+) */}
                  <div className="bg-white p-3.5 rounded-lg border border-neutral-200 shadow-xs">
                    <div className="flex items-center justify-between text-neutral-500 mb-1">
                      <span className="text-xs font-medium">2. Cash Sales (+)</span>
                      <ArrowDownRight className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="text-xl font-bold font-mono text-emerald-700 tabular-nums">
                      +₹{(Number(activeSession.cash_sales_amount) || 0).toFixed(2)}
                    </div>
                    <div className="text-[11px] text-neutral-500 mt-1">
                      Cash bill payments collected
                    </div>
                  </div>

                  {/* CARD 3: Counter Expenses (-) */}
                  <div className="bg-white p-3.5 rounded-lg border border-neutral-200 shadow-xs">
                    <div className="flex items-center justify-between text-neutral-500 mb-1">
                      <span className="text-xs font-medium">Counter Expenses (-)</span>
                      <ArrowUpRight className="w-4 h-4 text-amber-600" />
                    </div>
                    <div className="text-xl font-bold font-mono text-amber-700 tabular-nums">
                      -₹{(Number(activeSession.cash_out_amount) || 0).toFixed(2)}
                    </div>
                    <div className="text-[11px] text-neutral-500 mt-1">
                      Petty cash payouts from drawer
                    </div>
                  </div>

                  {/* CARD 4: 3. Closing Amount (Live in Drawer) */}
                  <div className="bg-white p-3.5 rounded-lg border border-neutral-200 shadow-xs flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between text-neutral-500 mb-1">
                        <span className="text-xs font-semibold text-neutral-900">3. Closing Amount</span>
                        <Banknote className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div className="text-xl font-bold font-mono text-neutral-900 tabular-nums">
                        ₹{expectedAmount.toFixed(2)}
                      </div>
                      <div className="text-[11px] text-emerald-700 font-medium mt-1">
                        ➔ Carried to next shift on closing
                      </div>
                    </div>
                    <button
                      onClick={handleOpenCloseModalClick}
                      className="text-[11px] font-semibold text-neutral-800 hover:text-neutral-950 hover:underline pt-2 text-left cursor-pointer flex items-center gap-1"
                    >
                      <Lock className="w-3 h-3 text-neutral-500" />
                      <span>Reconcile &amp; End Shift ➔</span>
                    </button>
                  </div>
                </div>

                {/* Shift Transaction Ledger Table */}
                <div className="bg-white rounded-lg border border-neutral-200 shadow-xs overflow-hidden text-xs">
                  <div className="p-3.5 border-b border-neutral-100 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-neutral-900 text-xs">
                        Shift Cash Ledger &amp; Movement Audit Trail
                      </h3>
                      <p className="text-[11px] text-neutral-500">
                        Chronological record of all cash entering and leaving the counter drawer
                      </p>
                    </div>
                    <span className="text-xs font-mono bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded border border-neutral-200">
                      {transactions.length} records
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 font-semibold uppercase text-[10px] font-mono">
                        <tr>
                          <th className="py-2.5 px-3">Time</th>
                          <th className="py-2.5 px-3">Type</th>
                          <th className="py-2.5 px-3">Reason / Notes</th>
                          <th className="py-2.5 px-3">Recorded By</th>
                          <th className="py-2.5 px-3 text-right">Cash Movement</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {transactions.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-neutral-400 text-xs font-mono">
                              No transactions recorded in this shift yet.
                            </td>
                          </tr>
                        ) : (
                          transactions.map((t) => {
                            const isPositive = t.amount >= 0 && t.type !== 'CASH_OUT' && t.type !== 'REFUND';
                            return (
                              <tr key={t.id} className="hover:bg-neutral-50 transition-colors">
                                <td className="py-2.5 px-3 font-mono text-neutral-500 whitespace-nowrap">
                                  {new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </td>
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  {t.type === 'OPENING_FLOAT' && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-neutral-100 text-neutral-700 border border-neutral-200">
                                      1. Opening Float
                                    </span>
                                  )}
                                  {t.type === 'SALE' && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      2. Cash Sale
                                    </span>
                                  )}
                                  {t.type === 'CASH_IN' && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                      + Float In
                                    </span>
                                  )}
                                  {t.type === 'CASH_OUT' && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                      - Counter Expense
                                    </span>
                                  )}
                                  {t.type === 'REFUND' && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-700 border border-red-200">
                                      Void / Refund
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3">
                                  <div className="font-medium text-neutral-800">
                                    {t.reason || t.category || '-'}
                                  </div>
                                  {t.notes && (
                                    <div className="text-[11px] text-neutral-500 italic">
                                      {t.notes}
                                    </div>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-neutral-600 whitespace-nowrap font-mono text-[11px]">
                                  {t.performed_by_name || 'Staff'}
                                </td>
                                <td className="py-2.5 px-3 text-right whitespace-nowrap font-mono font-bold">
                                  <span
                                    className={
                                      t.type === 'CASH_OUT' || t.type === 'REFUND'
                                        ? 'text-amber-700'
                                        : isPositive
                                        ? 'text-emerald-700'
                                        : 'text-neutral-800'
                                    }
                                  >
                                    {t.type === 'CASH_OUT' || t.type === 'REFUND' ? '-' : '+'}
                                    ₹{Math.abs(t.amount).toFixed(2)}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </>
        ) : (
          /* ======================================================== */
          /* PAST SHIFTS HISTORY TAB                                  */
          /* Shows 1. Opening -> 2. Sales -> 3. Closing -> Next Open  */
          /* ======================================================== */
          <div className="bg-white rounded-lg border border-neutral-200 shadow-xs overflow-hidden text-xs">
            <div className="p-3.5 border-b border-neutral-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-neutral-900 text-sm">
                  Closed Cash Drawer Shifts Log
                </h3>
                <p className="text-[11px] text-neutral-500">
                  Historical reconciliation records: Opening Float, Cash Sales, Counter Expenses, and Closing Balance carried forward
                </p>
              </div>
              <button
                onClick={fetchHistory}
                disabled={loadingHistory}
                className="px-3 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded text-xs font-medium border border-neutral-300 flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 font-semibold uppercase text-[10px] font-mono">
                  <tr>
                    <th className="py-2.5 px-3">Shift Period</th>
                    <th className="py-2.5 px-3">Cashier</th>
                    <th className="py-2.5 px-3 text-right">1. Opening Amount</th>
                    <th className="py-2.5 px-3 text-right">2. Cash Sales</th>
                    <th className="py-2.5 px-3 text-right">Counter Expenses</th>
                    <th className="py-2.5 px-3 text-right">Expected</th>
                    <th className="py-2.5 px-3 text-right">3. Closing Amount</th>
                    <th className="py-2.5 px-3 text-right">Variance</th>
                    <th className="py-2.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {pastSessions.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-neutral-400 text-xs font-mono">
                        {loadingHistory ? 'Loading shift records...' : 'No past shift sessions found.'}
                      </td>
                    </tr>
                  ) : (
                    pastSessions.map((s) => {
                      const diff = Number(s.difference) || 0;
                      return (
                        <tr key={s.id} className="hover:bg-neutral-50 transition-colors">
                          <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                            <div className="font-semibold text-neutral-800">
                              {new Date(s.opened_at).toLocaleDateString()}
                            </div>
                            <div className="text-[10px] text-neutral-400">
                              {new Date(s.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              {s.closed_at && ` - ${new Date(s.closed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap font-medium text-neutral-700">
                            {s.opened_by_name}
                            {s.closed_by_name && s.closed_by_name !== s.opened_by_name && (
                              <span className="text-[10px] text-neutral-400 block">Closed by: {s.closed_by_name}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-neutral-700 font-semibold">
                            ₹{Number(s.opening_amount || 0).toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-emerald-700 font-semibold">
                            +₹{Number(s.cash_sales_amount || 0).toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-amber-700 font-semibold">
                            -₹{Number(s.cash_out_amount || 0).toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-neutral-800 font-bold">
                            ₹{Number(s.expected_amount || 0).toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-neutral-900 font-bold">
                            {s.closing_amount !== undefined && s.closing_amount !== null
                              ? `₹${Number(s.closing_amount).toFixed(2)}`
                              : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            {s.status === 'OPEN' ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                Open
                              </span>
                            ) : diff === 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3" />
                                Balanced
                              </span>
                            ) : diff > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                +₹{diff.toFixed(2)} Surplus
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-700 border border-red-200">
                                -₹{Math.abs(diff).toFixed(2)} Short
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <button
                              onClick={() => handleViewPastSession(s)}
                              className="px-2.5 py-1 text-xs font-semibold text-neutral-700 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 rounded transition-colors cursor-pointer"
                            >
                              Details
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* MODAL 1: OPEN CASH DRAWER SHIFT                          */}
      {/* ======================================================== */}
      {showOpenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto text-xs">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div className="flex items-center gap-2">
                <Banknote className="w-4 h-4 text-emerald-600" />
                <h3 className="font-bold text-neutral-900 text-sm">
                  Start Shift • 1. Set Opening Amount
                </h3>
              </div>
              <button
                onClick={() => setShowOpenModal(false)}
                className="text-neutral-400 hover:text-neutral-700 p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {lastClosedSession && (
              <div className="p-3 bg-neutral-50 rounded border border-neutral-200 text-xs text-neutral-800 space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-neutral-600">Last Shift Closing Amount:</span>
                  <span className="font-mono font-bold text-sm text-neutral-900">
                    ₹{(Number(lastClosedSession.closing_amount) || 0).toFixed(2)}
                  </span>
                </div>
                <div className="text-[11px] text-neutral-500">
                  Pre-filled automatically as opening balance.
                </div>
              </div>
            )}

            <form onSubmit={handleOpenShift} className="space-y-4">
              <div className="flex items-center justify-between bg-neutral-100 p-1 rounded border border-neutral-200 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setUseDenomForOpen(false)}
                  className={`flex-1 py-1 rounded transition-all cursor-pointer ${
                    !useDenomForOpen ? 'bg-white shadow-xs text-neutral-900 font-semibold' : 'text-neutral-600'
                  }`}
                >
                  Direct Float Total (₹)
                </button>
                <button
                  type="button"
                  onClick={() => setUseDenomForOpen(true)}
                  className={`flex-1 py-1 rounded transition-all cursor-pointer ${
                    useDenomForOpen ? 'bg-white shadow-xs text-neutral-900 font-semibold' : 'text-neutral-600'
                  }`}
                >
                  Count Notes &amp; Coins
                </button>
              </div>

              {!useDenomForOpen ? (
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    1. Opening Float Amount (₹)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 font-mono text-neutral-400">₹</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      placeholder="e.g. 3500.00"
                      value={manualOpeningAmount}
                      onChange={(e) => setManualOpeningAmount(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 border border-neutral-300 rounded font-mono text-base font-bold focus:border-neutral-900 focus:outline-none"
                      autoFocus
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5 border border-neutral-200 rounded p-2.5 bg-neutral-50">
                  <div className="flex items-center justify-between text-xs font-medium text-neutral-600 border-b border-neutral-200 pb-1">
                    <span>Currency</span>
                    <span>Count</span>
                    <span>Subtotal</span>
                  </div>
                  <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                    {STANDARD_DENOMINATIONS.map((d) => {
                      const count = openingDenominations[d.key] || '';
                      const subtotal = (Number(count) || 0) * d.value;
                      return (
                        <div key={d.key} className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-mono font-semibold text-neutral-800 w-12">
                            {d.label}
                          </span>
                          <span className="text-neutral-400">×</span>
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={count}
                            onChange={(e) => {
                              const val = e.target.value === '' ? undefined : Math.max(0, parseInt(e.target.value) || 0);
                              setOpeningDenominations({ ...openingDenominations, [d.key]: val });
                            }}
                            className="w-16 px-2 py-1 border border-neutral-300 rounded font-mono text-center focus:border-neutral-900 focus:outline-none"
                          />
                          <span className="text-neutral-400">=</span>
                          <span className="font-mono font-semibold text-neutral-900 w-16 text-right">
                            ₹{subtotal.toFixed(2)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Total Summary Callout */}
              <div className="p-3 bg-neutral-50 rounded border border-neutral-200 flex items-center justify-between">
                <div>
                  <span className="text-xs text-neutral-700 font-semibold block">
                    Starting Float:
                  </span>
                  <span className="text-[11px] text-neutral-500">
                    Physical cash in drawer
                  </span>
                </div>
                <div className="text-xl font-bold font-mono text-neutral-900">
                  ₹{effectiveOpeningAmount.toFixed(2)}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Opening Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Shift start with verified float"
                  value={openingNotes}
                  onChange={(e) => setOpeningNotes(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-neutral-300 rounded text-xs focus:border-neutral-900 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowOpenModal(false)}
                  className="px-3 py-1.5 border border-neutral-300 rounded text-xs font-medium text-neutral-700 hover:bg-neutral-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  {actionLoading ? 'Starting...' : 'Confirm & Open Shift'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 2: CASH IN (FLOAT TOP-UP)                          */}
      {/* ======================================================== */}
      {showCashInModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div className="flex items-center gap-2">
                <PlusCircle className="w-4 h-4 text-blue-600" />
                <h3 className="font-bold text-neutral-900 text-sm">
                  Add Cash (Float In)
                </h3>
              </div>
              <button
                onClick={() => setShowCashInModal(false)}
                className="text-neutral-400 hover:text-neutral-700 p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCashIn} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Cash Amount to Add (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 font-mono text-neutral-400">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    placeholder="e.g. 1000.00"
                    value={cashInAmount}
                    onChange={(e) => setCashInAmount(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 border border-neutral-300 rounded font-mono text-base font-bold focus:border-neutral-900 focus:outline-none"
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Reason for Cash Addition
                </label>
                <select
                  value={cashInReason}
                  onChange={(e) => setCashInReason(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-neutral-300 rounded text-xs focus:border-neutral-900 focus:outline-none"
                >
                  <option value="Float top-up">Change / Float Top-up</option>
                  <option value="Customer coin exchange">Coin Exchange</option>
                  <option value="Owner cash addition">Owner / Partner Addition</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Added ₹10 and ₹20 change bundles"
                  value={cashInNotes}
                  onChange={(e) => setCashInNotes(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-neutral-300 rounded text-xs focus:border-neutral-900 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCashInModal(false)}
                  className="px-3 py-1.5 border border-neutral-300 rounded text-xs font-medium text-neutral-700 hover:bg-neutral-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  {actionLoading ? 'Recording...' : 'Add Cash to Drawer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 3: CASH OUT (COUNTER EXPENSE)                      */}
      {/* ======================================================== */}
      {showCashOutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div className="flex items-center gap-2">
                <MinusCircle className="w-4 h-4 text-amber-600" />
                <h3 className="font-bold text-neutral-900 text-sm">
                  Take Cash Out • Counter Expense
                </h3>
              </div>
              <button
                onClick={() => setShowCashOutModal(false)}
                className="text-neutral-400 hover:text-neutral-700 p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-neutral-50 rounded border border-neutral-200 text-xs text-neutral-700 space-y-0.5">
              <div className="font-semibold flex items-center gap-1 text-neutral-900">
                <HelpCircle className="w-3.5 h-3.5" />
                Automatic Expense Ledger Sync
              </div>
              <p className="text-[11px] text-neutral-500">
                Cash taken out from the counter drawer is automatically created in your store Expenses ledger and deducted from drawer cash.
              </p>
            </div>

            <form onSubmit={handleCashOut} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Cash Amount Taken Out (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 font-mono text-neutral-400">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    placeholder="e.g. 250.00"
                    value={cashOutAmount}
                    onChange={(e) => setCashOutAmount(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 border border-neutral-300 rounded font-mono text-base font-bold focus:border-neutral-900 focus:outline-none"
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Expense Category
                </label>
                <select
                  value={cashOutCategory}
                  onChange={(e) => setCashOutCategory(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-neutral-300 rounded text-xs focus:border-neutral-900 focus:outline-none"
                >
                  <option value="Milk & Counter Supplies">Milk &amp; Dairy Supplies</option>
                  <option value="Tea & Snacks">Staff Tea &amp; Refreshments</option>
                  <option value="Local Store Supplies">Cleaning &amp; Store Supplies</option>
                  <option value="Vendor Payout">Vendor / Supplier Payout</option>
                  <option value="Petty Cash">Counter Petty Cash</option>
                  <option value="Ice Delivery">Ice &amp; Freezing Supplies</option>
                  <option value="Miscellaneous">Miscellaneous Expense</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Description / Reason
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Bought 2 packets of milk from dairy"
                  value={cashOutReason}
                  onChange={(e) => setCashOutReason(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-neutral-300 rounded text-xs focus:border-neutral-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Receipt / Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Cash receipt #104"
                  value={cashOutNotes}
                  onChange={(e) => setCashOutNotes(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-neutral-300 rounded text-xs focus:border-neutral-900 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCashOutModal(false)}
                  className="px-3 py-1.5 border border-neutral-300 rounded text-xs font-medium text-neutral-700 hover:bg-neutral-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <MinusCircle className="w-3.5 h-3.5" />
                  {actionLoading ? 'Recording...' : 'Record Cash Out'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 4: CLOSE SHIFT & RECONCILE                         */}
      {/* ======================================================== */}
      {showCloseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl space-y-4 max-h-[92vh] overflow-y-auto text-xs">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-red-600" />
                <h3 className="font-bold text-neutral-900 text-sm">
                  End Shift • 3. Record Closing Amount
                </h3>
              </div>
              <button
                onClick={() => setShowCloseModal(false)}
                className="text-neutral-400 hover:text-neutral-700 p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Carry-Forward Automation Highlight */}
            <div className="p-3 bg-neutral-50 rounded border border-neutral-200 text-xs text-neutral-700 space-y-0.5">
              <div className="font-semibold text-neutral-900">
                Carry-Forward to Next Session:
              </div>
              <p className="text-[11px] text-neutral-500">
                The closing amount you submit will automatically become the <strong>1. Opening Balance for your next shift session</strong>.
              </p>
            </div>

            <form onSubmit={handleCloseShift} className="space-y-4">
              <div className="flex items-center justify-between bg-neutral-100 p-1 rounded border border-neutral-200 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setUseDenomForClose(false)}
                  className={`flex-1 py-1 rounded transition-all cursor-pointer ${
                    !useDenomForClose ? 'bg-white shadow-xs text-neutral-900 font-semibold' : 'text-neutral-600'
                  }`}
                >
                  Direct Closing Total (₹)
                </button>
                <button
                  type="button"
                  onClick={() => setUseDenomForClose(true)}
                  className={`flex-1 py-1 rounded transition-all cursor-pointer ${
                    useDenomForClose ? 'bg-white shadow-xs text-neutral-900 font-semibold' : 'text-neutral-600'
                  }`}
                >
                  Count Notes &amp; Coins
                </button>
              </div>

              {!useDenomForClose ? (
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Counted Physical Closing Cash (₹)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 font-mono text-neutral-400">₹</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      placeholder="e.g. 3500.00"
                      value={manualClosingAmount}
                      onChange={(e) => setManualClosingAmount(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 border border-neutral-300 rounded font-mono text-base font-bold focus:border-neutral-900 focus:outline-none"
                      autoFocus
                    />
                  </div>
                </div>
              ) : (
                /* Denomination Counter Grid */
                <div className="space-y-1.5 border border-neutral-200 rounded p-2.5 bg-neutral-50">
                  <div className="flex items-center justify-between text-xs font-medium text-neutral-600 border-b border-neutral-200 pb-1">
                    <span>Denomination</span>
                    <span>Count</span>
                    <span>Total Amount</span>
                  </div>
                  <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                    {STANDARD_DENOMINATIONS.map((d) => {
                      const count = closingDenominations[d.key] || '';
                      const subtotal = (Number(count) || 0) * d.value;
                      return (
                        <div key={d.key} className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-mono font-semibold text-neutral-800 w-12">
                            {d.label}
                          </span>
                          <span className="text-neutral-400">×</span>
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={count}
                            onChange={(e) => {
                              const val = e.target.value === '' ? undefined : Math.max(0, parseInt(e.target.value) || 0);
                              setClosingDenominations({ ...closingDenominations, [d.key]: val });
                            }}
                            className="w-16 px-2 py-1 border border-neutral-300 rounded font-mono text-center focus:border-neutral-900 focus:outline-none"
                          />
                          <span className="text-neutral-400">=</span>
                          <span className="font-mono font-semibold text-neutral-900 w-20 text-right">
                            ₹{subtotal.toFixed(2)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Variance & Live Reconciliation Box */}
              <div className="grid grid-cols-3 gap-2 p-3 bg-neutral-50 rounded border border-neutral-200 text-xs">
                <div>
                  <span className="text-neutral-500 block text-[10px]">Expected Cash:</span>
                  <span className="font-mono font-bold text-neutral-900 text-xs tabular-nums">
                    ₹{expectedAmount.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-500 block text-[10px]">Counted Closing:</span>
                  <span className="font-mono font-bold text-neutral-900 text-xs tabular-nums">
                    ₹{effectiveClosingAmount.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-500 block text-[10px]">Variance:</span>
                  <span
                    className={`font-mono font-bold text-xs tabular-nums ${
                      closingVariance === 0
                        ? 'text-emerald-700'
                        : closingVariance > 0
                        ? 'text-blue-700'
                        : 'text-red-700'
                    }`}
                  >
                    {closingVariance === 0
                      ? '₹0.00'
                      : closingVariance > 0
                      ? `+₹${closingVariance.toFixed(2)}`
                      : `-₹${Math.abs(closingVariance).toFixed(2)}`}
                  </span>
                </div>
              </div>

              {closingVariance < 0 && (
                <div className="p-2 bg-red-50 border border-red-200 rounded text-red-800 text-[11px] flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-600" />
                  <span>
                    Counted cash is short by ₹{Math.abs(closingVariance).toFixed(2)}. Please verify drawer.
                  </span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Closing Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Shift balanced and reconciled by cashier"
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-neutral-300 rounded text-xs focus:border-neutral-900 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCloseModal(false)}
                  className="px-3 py-1.5 border border-neutral-300 rounded text-xs font-medium text-neutral-700 hover:bg-neutral-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5" />
                  {actionLoading ? 'Closing Shift...' : 'Confirm Closing & End Shift'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 5: PRINTABLE SHIFT RECONCILIATION SLIP             */}
      {/* ======================================================== */}
      {showSlipModal && slipData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg max-w-sm w-full p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto text-xs">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider font-mono text-neutral-500">
                Shift Reconciliation Slip
              </span>
              <button
                onClick={() => setShowSlipModal(false)}
                className="text-neutral-400 hover:text-neutral-700 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Thermal Print Slip View */}
            <div id="shift-print-slip" className="border border-neutral-200 rounded p-4 font-mono text-xs space-y-3 bg-neutral-50/50 text-neutral-800">
              <div className="text-center space-y-0.5 border-b border-dashed border-neutral-300 pb-2">
                <div className="font-bold text-sm text-neutral-900">{store?.name || 'Store'}</div>
                <div className="text-[10px] text-neutral-500">REGISTER CASH RECONCILIATION</div>
                <div className="text-[10px] text-neutral-400">Printed: {new Date().toLocaleString()}</div>
              </div>

              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span>Shift ID:</span>
                  <span className="font-bold">{(slipData.session?.id || '').slice(0, 8)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Cashier:</span>
                  <span>{slipData.session?.opened_by_name || 'Staff'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Opened At:</span>
                  <span>{new Date(slipData.session?.opened_at).toLocaleTimeString()}</span>
                </div>
                {slipData.session?.closed_at && (
                  <div className="flex justify-between">
                    <span>Closed At:</span>
                    <span>{new Date(slipData.session?.closed_at).toLocaleTimeString()}</span>
                  </div>
                )}
              </div>

              <div className="border-t border-dashed border-neutral-300 pt-2 space-y-1 text-[11px]">
                <div className="flex justify-between font-semibold">
                  <span>1. Opening Float:</span>
                  <span>₹{Number(slipData.session?.opening_amount || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-emerald-700 font-semibold">
                  <span>2. Cash Sales (+):</span>
                  <span>₹{Number(slipData.session?.cash_sales_amount || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-amber-700 font-semibold">
                  <span>Counter Expenses (-):</span>
                  <span>₹{Number(slipData.session?.cash_out_amount || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold border-t border-neutral-200 pt-1 text-neutral-900">
                  <span>Expected In Drawer:</span>
                  <span>₹{Number(slipData.session?.expected_amount || 0).toFixed(2)}</span>
                </div>
                {slipData.session?.closing_amount !== undefined && (
                  <div className="flex justify-between font-bold text-neutral-900">
                    <span>3. Closing Amount:</span>
                    <span>₹{Number(slipData.session?.closing_amount || 0).toFixed(2)}</span>
                  </div>
                )}
                {slipData.session?.difference !== undefined && (
                  <div className="flex justify-between font-bold text-xs pt-1 border-t border-neutral-200">
                    <span>Variance:</span>
                    <span className={slipData.session.difference === 0 ? 'text-emerald-700' : 'text-red-700'}>
                      {slipData.session.difference >= 0 ? '+' : ''}₹{Number(slipData.session.difference).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>

              <div className="p-2 bg-neutral-100 rounded text-[10px] text-neutral-600 text-center font-mono">
                Next Shift Opening: ₹{Number(slipData.session?.closing_amount || 0).toFixed(2)}
              </div>

              <div className="border-t border-dashed border-neutral-300 pt-5 flex justify-between text-[10px] text-neutral-500">
                <div>
                  <div className="border-t border-neutral-400 w-16 text-center pt-1">Cashier</div>
                </div>
                <div>
                  <div className="border-t border-neutral-400 w-16 text-center pt-1">Manager</div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowSlipModal(false)}
                className="px-3 py-1.5 border border-neutral-300 rounded text-xs font-medium text-neutral-700 hover:bg-neutral-50 cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handlePrintSlip}
                className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Slip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 6: PAST SESSION DETAILS DRILLDOWN                  */}
      {/* ======================================================== */}
      {selectedPastSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg max-w-xl w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto text-xs">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div>
                <h3 className="font-bold text-neutral-900 text-sm">
                  Past Shift Details &amp; Reconciliation
                </h3>
                <p className="text-[11px] text-neutral-500 font-mono">
                  Shift ID: {selectedPastSession.session.id.slice(0, 13)}
                </p>
              </div>
              <button
                onClick={() => setSelectedPastSession(null)}
                className="text-neutral-400 hover:text-neutral-700 p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Metrics Breakdown in 1-2-3 Sequence */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="p-2.5 bg-neutral-50 rounded border border-neutral-200">
                <span className="text-neutral-500 block text-[10px]">1. Opening Amount</span>
                <span className="font-mono font-bold text-neutral-900 text-xs tabular-nums">
                  ₹{Number(selectedPastSession.session.opening_amount || 0).toFixed(2)}
                </span>
              </div>
              <div className="p-2.5 bg-neutral-50 rounded border border-neutral-200">
                <span className="text-neutral-500 block text-[10px]">2. Cash Sales (+)</span>
                <span className="font-mono font-bold text-emerald-700 text-xs tabular-nums">
                  +₹{Number(selectedPastSession.session.cash_sales_amount || 0).toFixed(2)}
                </span>
              </div>
              <div className="p-2.5 bg-neutral-50 rounded border border-neutral-200">
                <span className="text-neutral-500 block text-[10px]">Expenses (-)</span>
                <span className="font-mono font-bold text-amber-700 text-xs tabular-nums">
                  -₹{Number(selectedPastSession.session.cash_out_amount || 0).toFixed(2)}
                </span>
              </div>
              <div className="p-2.5 bg-neutral-50 rounded border border-neutral-200">
                <span className="text-neutral-500 block text-[10px]">3. Closing Amount</span>
                <span className="font-mono font-bold text-neutral-900 text-xs tabular-nums block">
                  ₹{Number(selectedPastSession.session.closing_amount || 0).toFixed(2)}
                </span>
                <span
                  className={`text-[10px] font-semibold ${
                    (selectedPastSession.session.difference || 0) === 0
                      ? 'text-emerald-700'
                      : (selectedPastSession.session.difference || 0) > 0
                      ? 'text-blue-700'
                      : 'text-red-700'
                  }`}
                >
                  {(selectedPastSession.session.difference || 0) === 0
                    ? 'Balanced'
                    : `${(selectedPastSession.session.difference || 0) > 0 ? '+' : ''}₹${Number(selectedPastSession.session.difference).toFixed(2)}`}
                </span>
              </div>
            </div>

            {/* Notes if any */}
            {(selectedPastSession.session.opening_notes || selectedPastSession.session.closing_notes) && (
              <div className="p-2.5 bg-neutral-50 rounded border border-neutral-200 text-xs text-neutral-600 space-y-1">
                {selectedPastSession.session.opening_notes && (
                  <div>
                    <span className="font-semibold text-neutral-800">Opening Notes:</span> {selectedPastSession.session.opening_notes}
                  </div>
                )}
                {selectedPastSession.session.closing_notes && (
                  <div>
                    <span className="font-semibold text-neutral-800">Closing Notes:</span> {selectedPastSession.session.closing_notes}
                  </div>
                )}
              </div>
            )}

            {/* Transaction log */}
            <div>
              <h4 className="font-bold text-xs text-neutral-900 mb-1.5">
                Shift Transactions ({selectedPastSession.transactions.length})
              </h4>
              <div className="border border-neutral-200 rounded overflow-hidden max-h-52 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-neutral-50 text-neutral-600 font-mono text-[10px] border-b border-neutral-200">
                    <tr>
                      <th className="py-2 px-2.5">Time</th>
                      <th className="py-2 px-2.5">Type</th>
                      <th className="py-2 px-2.5">Reason</th>
                      <th className="py-2 px-2.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {selectedPastSession.transactions.map((t) => (
                      <tr key={t.id}>
                        <td className="py-2 px-2.5 font-mono text-neutral-500 text-[11px]">
                          {new Date(t.created_at).toLocaleTimeString()}
                        </td>
                        <td className="py-2 px-2.5">
                          <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-700">
                            {t.type}
                          </span>
                        </td>
                        <td className="py-2 px-2.5 text-neutral-800">{t.reason || t.category || '-'}</td>
                        <td className="py-2 px-2.5 text-right font-mono font-bold">
                          {t.type === 'CASH_OUT' || t.type === 'REFUND' ? '-' : '+'}
                          ₹{Math.abs(t.amount).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => {
                  setSlipData({ session: selectedPastSession.session });
                  setShowSlipModal(true);
                }}
                className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded text-xs font-medium border border-neutral-300 flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Slip
              </button>

              <button
                type="button"
                onClick={() => setSelectedPastSession(null)}
                className="px-3 py-1.5 bg-neutral-900 text-white rounded text-xs font-semibold hover:bg-neutral-800 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
