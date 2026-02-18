import React, { useState, useMemo } from 'react';
import {
  Truck, Calendar, Clock, Users, MapPin, Phone,
  CheckCircle, XCircle, AlertCircle, Play, Pause,
  Plus, Edit, Eye, MoreVertical, Search, Filter,
  Route, Package, ChevronDown, ChevronRight, RefreshCw
} from 'lucide-react';
import {
  Card, CardHeader, CardTitle, CardContent, Button, Badge,
  Input, Select, Modal, ModalFooter
} from '../components/common';
import { FormGrid, FormRow, FormValue, FormSection } from '../components/common/FormGrid/FormGrid';
import { PageToolbar, ToolbarStart, ToolbarEnd, TagFilters } from '../components/common/PageToolbar/PageToolbar';
import {
  deliverySlots as mockSlots,
  deliveryRoutes as mockRoutes,
  orders as mockOrders,
  adminUsers,
  DeliverySlot,
  DeliveryRoute,
  Order
} from '../data/mockData';
import { useToast } from '../components/common/Toast';
import styles from './Deliveries.module.css';

type RouteStatus = DeliveryRoute['status'];
type StopStatus = 'pending' | 'delivered' | 'failed';

const Deliveries: React.FC = () => {
  const { showToast } = useToast();

  // State
  const [slots, setSlots] = useState<DeliverySlot[]>(mockSlots);
  const [routes, setRoutes] = useState<DeliveryRoute[]>(mockRoutes);
  const [activeTab, setActiveTab] = useState<'routes' | 'slots'>('routes');
  const [selectedDate, setSelectedDate] = useState<string>(getDefaultDate());
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isSlotModalOpen, setIsSlotModalOpen] = useState(false);
  const [isRouteModalOpen, setIsRouteModalOpen] = useState(false);
  const [isRouteDetailOpen, setIsRouteDetailOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<DeliverySlot | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<DeliveryRoute | null>(null);
  const [expandedRoutes, setExpandedRoutes] = useState<string[]>([]);

  // Form state for slot
  const [slotForm, setSlotForm] = useState({
    timeWindow: '',
    capacity: 20,
    cutoffHours: 14,
    isActive: true
  });

  // Form state for route
  const [routeForm, setRouteForm] = useState({
    date: getDefaultDate(),
    timeWindow: '',
    driver: ''
  });

  function getDefaultDate() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  }

  // Get drivers from admin users
  const drivers = adminUsers.filter(u => u.role === 'driver' && u.isActive);

  // Get orders pending delivery for a specific date/slot
  const getPendingOrdersForSlot = (date: string, timeWindow: string) => {
    return mockOrders.filter(order =>
      order.deliverySlot.date === date &&
      order.deliverySlot.timeWindow === timeWindow &&
      ['new', 'confirmed', 'preparing'].includes(order.fulfillmentStatus)
    );
  };

  // Filter routes
  const filteredRoutes = useMemo(() => {
    let result = [...routes];

    if (selectedDate) {
      result = result.filter(r => r.date === selectedDate);
    }

    if (statusFilter !== 'all') {
      result = result.filter(r => r.status === statusFilter);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(r =>
        r.driver?.toLowerCase().includes(query) ||
        r.timeWindow.toLowerCase().includes(query) ||
        r.stops.some(s =>
          s.customerName.toLowerCase().includes(query) ||
          s.address.toLowerCase().includes(query)
        )
      );
    }

    return result;
  }, [routes, selectedDate, statusFilter, searchQuery]);

  // Stats
  const stats = useMemo(() => {
    const todayRoutes = routes.filter(r => r.date === selectedDate);
    const totalStops = todayRoutes.reduce((sum, r) => sum + r.stops.length, 0);
    const completedStops = todayRoutes.reduce(
      (sum, r) => sum + r.stops.filter(s => s.status === 'delivered').length,
      0
    );
    const failedStops = todayRoutes.reduce(
      (sum, r) => sum + r.stops.filter(s => s.status === 'failed').length,
      0
    );

    return {
      totalRoutes: todayRoutes.length,
      activeRoutes: todayRoutes.filter(r => r.status === 'in_progress').length,
      completedRoutes: todayRoutes.filter(r => r.status === 'completed').length,
      totalStops,
      completedStops,
      failedStops,
      pendingStops: totalStops - completedStops - failedStops
    };
  }, [routes, selectedDate]);

  // Handlers
  const toggleRouteExpand = (routeId: string) => {
    setExpandedRoutes(prev =>
      prev.includes(routeId)
        ? prev.filter(id => id !== routeId)
        : [...prev, routeId]
    );
  };

  const handleSaveSlot = () => {
    if (!slotForm.timeWindow) {
      showToast({ title: 'Please enter a time window', type: 'error' });
      return;
    }

    if (selectedSlot) {
      setSlots(prev => prev.map(s =>
        s.id === selectedSlot.id
          ? { ...s, ...slotForm }
          : s
      ));
      showToast({ title: 'Delivery slot updated', type: 'success' });
    } else {
      const newSlot: DeliverySlot = {
        id: `slot_${Date.now()}`,
        ...slotForm,
        bookedCount: 0
      };
      setSlots(prev => [...prev, newSlot]);
      showToast({ title: 'Delivery slot created', type: 'success' });
    }

    setIsSlotModalOpen(false);
    resetSlotForm();
  };

  const resetSlotForm = () => {
    setSlotForm({
      timeWindow: '',
      capacity: 20,
      cutoffHours: 14,
      isActive: true
    });
    setSelectedSlot(null);
  };

  const handleEditSlot = (slot: DeliverySlot) => {
    setSelectedSlot(slot);
    setSlotForm({
      timeWindow: slot.timeWindow,
      capacity: slot.capacity,
      cutoffHours: slot.cutoffHours,
      isActive: slot.isActive
    });
    setIsSlotModalOpen(true);
  };

  const handleToggleSlotActive = (slotId: string) => {
    setSlots(prev => prev.map(s =>
      s.id === slotId ? { ...s, isActive: !s.isActive } : s
    ));
    showToast({ title: 'Slot status updated', type: 'success' });
  };

  const handleCreateRoute = () => {
    if (!routeForm.date || !routeForm.timeWindow) {
      showToast({ title: 'Please select date and time window', type: 'error' });
      return;
    }

    // Get pending orders for this slot
    const pendingOrders = getPendingOrdersForSlot(routeForm.date, routeForm.timeWindow);

    if (pendingOrders.length === 0) {
      showToast({ title: 'No pending orders for this slot', type: 'warning' });
      return;
    }

    const newRoute: DeliveryRoute = {
      id: `route_${Date.now()}`,
      date: routeForm.date,
      timeWindow: routeForm.timeWindow,
      driver: routeForm.driver || undefined,
      stops: pendingOrders.map((order, index) => ({
        orderId: order.id,
        address: `${order.deliveryAddress.line1}${order.deliveryAddress.line2 ? ', ' + order.deliveryAddress.line2 : ''}, ${order.deliveryAddress.city} ${order.deliveryAddress.postcode}`,
        customerName: order.customer.name,
        phone: order.customer.phone,
        status: 'pending' as const,
        order: index + 1
      })),
      status: 'planned'
    };

    setRoutes(prev => [...prev, newRoute]);
    showToast({ title: `Route created with ${pendingOrders.length} stops`, type: 'success' });
    setIsRouteModalOpen(false);
    resetRouteForm();
  };

  const resetRouteForm = () => {
    setRouteForm({
      date: getDefaultDate(),
      timeWindow: '',
      driver: ''
    });
  };

  const handleUpdateRouteStatus = (routeId: string, newStatus: RouteStatus) => {
    setRoutes(prev => prev.map(r =>
      r.id === routeId ? { ...r, status: newStatus } : r
    ));
    showToast({ title: `Route ${newStatus.replace('_', ' ')}`, type: 'success' });
  };

  const handleUpdateStopStatus = (routeId: string, orderId: string, newStatus: StopStatus) => {
    setRoutes(prev => prev.map(r => {
      if (r.id === routeId) {
        const updatedStops = r.stops.map(s =>
          s.orderId === orderId ? { ...s, status: newStatus } : s
        );
        const allDelivered = updatedStops.every(s => s.status === 'delivered' || s.status === 'failed');
        return {
          ...r,
          stops: updatedStops,
          status: allDelivered ? 'completed' : r.status
        };
      }
      return r;
    }));
    showToast({ title: `Stop marked as ${newStatus}`, type: 'success' });
  };

  const handleAssignDriver = (routeId: string, driverName: string) => {
    setRoutes(prev => prev.map(r =>
      r.id === routeId ? { ...r, driver: driverName } : r
    ));
    showToast({ title: 'Driver assigned', type: 'success' });
  };

  const getStatusBadge = (status: RouteStatus) => {
    const config: Record<RouteStatus, { variant: 'success' | 'warning' | 'info' | 'default'; label: string }> = {
      planned: { variant: 'default', label: 'Planned' },
      in_progress: { variant: 'warning', label: 'In Progress' },
      completed: { variant: 'success', label: 'Completed' }
    };
    const { variant, label } = config[status];
    return <Badge variant={variant}>{label}</Badge>;
  };

  const getStopStatusBadge = (status: StopStatus) => {
    const config: Record<StopStatus, { variant: 'success' | 'warning' | 'error' | 'default'; label: string }> = {
      pending: { variant: 'warning', label: 'Pending' },
      delivered: { variant: 'success', label: 'Delivered' },
      failed: { variant: 'error', label: 'Failed' }
    };
    const { variant, label } = config[status];
    return <Badge variant={variant} size="sm">{label}</Badge>;
  };

  const statusTags = ['all', 'planned', 'in_progress', 'completed'];

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Deliveries & Logistics</h1>
          <p className={styles.subtitle}>Manage routes, drivers, and delivery slots</p>
        </div>
        <div className={styles.headerActions}>
          <Button
            variant="outline"
            leftIcon={<RefreshCw size={16} />}
            onClick={() => {
              setRoutes(mockRoutes);
              setSlots(mockSlots);
            }}
          >
            Refresh
          </Button>
          {activeTab === 'routes' ? (
            <Button leftIcon={<Plus size={16} />} onClick={() => setIsRouteModalOpen(true)}>
              Create Route
            </Button>
          ) : (
            <Button leftIcon={<Plus size={16} />} onClick={() => {
              resetSlotForm();
              setIsSlotModalOpen(true);
            }}>
              Add Slot
            </Button>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className={styles.tabNav}>
        <button
          className={`${styles.tab} ${activeTab === 'routes' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('routes')}
        >
          <Route size={18} />
          Routes & Tracking
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'slots' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('slots')}
        >
          <Clock size={18} />
          Delivery Slots
        </button>
      </div>

      {activeTab === 'routes' && (
        <>
          {/* Stats Cards */}
          <div className={styles.statsGrid}>
            <Card className={styles.statCard}>
              <div className={styles.statIcon} style={{ backgroundColor: 'var(--color-info-bg)' }}>
                <Route size={20} style={{ color: 'var(--color-info)' }} />
              </div>
              <div className={styles.statContent}>
                <span className={styles.statValue}>{stats.totalRoutes}</span>
                <span className={styles.statLabel}>Total Routes</span>
              </div>
            </Card>
            <Card className={styles.statCard}>
              <div className={styles.statIcon} style={{ backgroundColor: 'var(--color-warning-bg)' }}>
                <Truck size={20} style={{ color: 'var(--color-warning)' }} />
              </div>
              <div className={styles.statContent}>
                <span className={styles.statValue}>{stats.activeRoutes}</span>
                <span className={styles.statLabel}>In Progress</span>
              </div>
            </Card>
            <Card className={styles.statCard}>
              <div className={styles.statIcon} style={{ backgroundColor: 'var(--color-success-bg)' }}>
                <CheckCircle size={20} style={{ color: 'var(--color-success)' }} />
              </div>
              <div className={styles.statContent}>
                <span className={styles.statValue}>{stats.completedStops}/{stats.totalStops}</span>
                <span className={styles.statLabel}>Stops Completed</span>
              </div>
            </Card>
            <Card className={styles.statCard}>
              <div className={styles.statIcon} style={{ backgroundColor: 'var(--color-error-bg)' }}>
                <XCircle size={20} style={{ color: 'var(--color-error)' }} />
              </div>
              <div className={styles.statContent}>
                <span className={styles.statValue}>{stats.failedStops}</span>
                <span className={styles.statLabel}>Failed Deliveries</span>
              </div>
            </Card>
          </div>

          {/* Filters */}
          <PageToolbar>
            <ToolbarStart>
              <div className={styles.dateFilter}>
                <Calendar size={18} />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className={styles.dateInput}
                />
              </div>
              <div className={styles.searchInput}>
                <Search size={18} />
                <input
                  type="text"
                  placeholder="Search routes, drivers, addresses..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={styles.search}
                />
              </div>
            </ToolbarStart>
            <ToolbarEnd>
              <TagFilters
                tags={statusTags}
                selectedTag={statusFilter}
                onTagSelect={setStatusFilter}
              />
            </ToolbarEnd>
          </PageToolbar>

          {/* Routes List */}
          <div className={styles.routesList}>
            {filteredRoutes.length === 0 ? (
              <Card className={styles.emptyState}>
                <div className={styles.emptyContent}>
                  <Truck size={48} className={styles.emptyIcon} />
                  <h3>No routes found</h3>
                  <p>Create a new route or adjust your filters</p>
                  <Button onClick={() => setIsRouteModalOpen(true)} leftIcon={<Plus size={16} />}>
                    Create Route
                  </Button>
                </div>
              </Card>
            ) : (
              filteredRoutes.map(route => (
                <Card key={route.id} className={styles.routeCard}>
                  <div className={styles.routeHeader}>
                    <button
                      className={styles.expandBtn}
                      onClick={() => toggleRouteExpand(route.id)}
                    >
                      {expandedRoutes.includes(route.id) ? (
                        <ChevronDown size={20} />
                      ) : (
                        <ChevronRight size={20} />
                      )}
                    </button>

                    <div className={styles.routeInfo}>
                      <div className={styles.routeTitle}>
                        <Clock size={16} />
                        <span>{route.timeWindow}</span>
                        <span className={styles.routeDate}>
                          {new Date(route.date).toLocaleDateString('en-GB', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short'
                          })}
                        </span>
                      </div>
                      <div className={styles.routeMeta}>
                        <span className={styles.stopCount}>
                          <Package size={14} />
                          {route.stops.length} stops
                        </span>
                        <span className={styles.completedCount}>
                          {route.stops.filter(s => s.status === 'delivered').length} delivered
                        </span>
                      </div>
                    </div>

                    <div className={styles.driverSection}>
                      {route.driver ? (
                        <div className={styles.driverInfo}>
                          <Users size={16} />
                          <span>{route.driver}</span>
                        </div>
                      ) : (
                        <Select
                          value=""
                          onChange={(value) => handleAssignDriver(route.id, value)}
                          options={[
                            { value: '', label: 'Assign Driver' },
                            ...drivers.map(d => ({ value: d.name, label: d.name }))
                          ]}
                          className={styles.driverSelect}
                        />
                      )}
                    </div>

                    <div className={styles.routeStatus}>
                      {getStatusBadge(route.status)}
                    </div>

                    <div className={styles.routeActions}>
                      {route.status === 'planned' && (
                        <Button
                          variant="outline"
                          size="sm"
                          leftIcon={<Play size={14} />}
                          onClick={() => handleUpdateRouteStatus(route.id, 'in_progress')}
                        >
                          Start
                        </Button>
                      )}
                      {route.status === 'in_progress' && (
                        <Button
                          variant="outline"
                          size="sm"
                          leftIcon={<CheckCircle size={14} />}
                          onClick={() => handleUpdateRouteStatus(route.id, 'completed')}
                        >
                          Complete
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<Eye size={14} />}
                        onClick={() => {
                          setSelectedRoute(route);
                          setIsRouteDetailOpen(true);
                        }}
                      >
                        View
                      </Button>
                    </div>
                  </div>

                  {expandedRoutes.includes(route.id) && (
                    <div className={styles.stopsSection}>
                      <div className={styles.stopsList}>
                        {route.stops.map((stop, index) => (
                          <div key={stop.orderId} className={styles.stopItem}>
                            <div className={styles.stopOrder}>{stop.order}</div>
                            <div className={styles.stopDetails}>
                              <div className={styles.stopName}>{stop.customerName}</div>
                              <div className={styles.stopAddress}>
                                <MapPin size={14} />
                                {stop.address}
                              </div>
                              <div className={styles.stopPhone}>
                                <Phone size={14} />
                                {stop.phone}
                              </div>
                            </div>
                            <div className={styles.stopStatus}>
                              {getStopStatusBadge(stop.status)}
                            </div>
                            <div className={styles.stopActions}>
                              {stop.status === 'pending' && route.status === 'in_progress' && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleUpdateStopStatus(route.id, stop.orderId, 'delivered')}
                                  >
                                    <CheckCircle size={14} />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleUpdateStopStatus(route.id, stop.orderId, 'failed')}
                                  >
                                    <XCircle size={14} />
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              ))
            )}
          </div>
        </>
      )}

      {activeTab === 'slots' && (
        <>
          {/* Slots Grid */}
          <div className={styles.slotsGrid}>
            {slots.map(slot => (
              <Card key={slot.id} className={`${styles.slotCard} ${!slot.isActive ? styles.inactive : ''}`}>
                <div className={styles.slotHeader}>
                  <div className={styles.slotTime}>
                    <Clock size={20} />
                    <span>{slot.timeWindow}</span>
                  </div>
                  <Badge variant={slot.isActive ? 'success' : 'default'}>
                    {slot.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>

                <div className={styles.slotCapacity}>
                  <div className={styles.capacityBar}>
                    <div
                      className={styles.capacityFill}
                      style={{
                        width: `${(slot.bookedCount / slot.capacity) * 100}%`,
                        backgroundColor: slot.bookedCount >= slot.capacity
                          ? 'var(--color-error)'
                          : slot.bookedCount >= slot.capacity * 0.8
                            ? 'var(--color-warning)'
                            : 'var(--color-success)'
                      }}
                    />
                  </div>
                  <div className={styles.capacityText}>
                    <span>{slot.bookedCount} / {slot.capacity} booked</span>
                    <span className={styles.available}>
                      {slot.capacity - slot.bookedCount} available
                    </span>
                  </div>
                </div>

                <div className={styles.slotMeta}>
                  <div className={styles.cutoff}>
                    <AlertCircle size={14} />
                    <span>Cutoff: {slot.cutoffHours}h before</span>
                  </div>
                </div>

                <div className={styles.slotActions}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEditSlot(slot)}
                  >
                    <Edit size={14} />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggleSlotActive(slot.id)}
                  >
                    {slot.isActive ? <Pause size={14} /> : <Play size={14} />}
                    {slot.isActive ? 'Disable' : 'Enable'}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Create/Edit Slot Modal */}
      <Modal
        isOpen={isSlotModalOpen}
        onClose={() => {
          setIsSlotModalOpen(false);
          resetSlotForm();
        }}
        title={selectedSlot ? 'Edit Delivery Slot' : 'Create Delivery Slot'}
        size="md"
      >
        <FormGrid>
          <FormRow label="Time Window">
            <Input
              value={slotForm.timeWindow}
              onChange={(e) => setSlotForm({ ...slotForm, timeWindow: e.target.value })}
              placeholder="e.g., 9:00 AM - 12:00 PM"
            />
          </FormRow>
          <FormRow label="Capacity">
            <Input
              type="number"
              value={slotForm.capacity}
              onChange={(e) => setSlotForm({ ...slotForm, capacity: parseInt(e.target.value) || 0 })}
              min={1}
            />
          </FormRow>
          <FormRow label="Cutoff Hours">
            <Input
              type="number"
              value={slotForm.cutoffHours}
              onChange={(e) => setSlotForm({ ...slotForm, cutoffHours: parseInt(e.target.value) || 0 })}
              min={1}
            />
          </FormRow>
          <FormRow label="Status">
            <Select
              value={slotForm.isActive ? 'active' : 'inactive'}
              onChange={(value) => setSlotForm({ ...slotForm, isActive: value === 'active' })}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' }
              ]}
            />
          </FormRow>
        </FormGrid>
        <ModalFooter>
          <Button variant="outline" onClick={() => {
            setIsSlotModalOpen(false);
            resetSlotForm();
          }}>
            Cancel
          </Button>
          <Button onClick={handleSaveSlot}>
            {selectedSlot ? 'Update Slot' : 'Create Slot'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Create Route Modal */}
      <Modal
        isOpen={isRouteModalOpen}
        onClose={() => {
          setIsRouteModalOpen(false);
          resetRouteForm();
        }}
        title="Create Delivery Route"
        size="md"
      >
        <FormGrid>
          <FormRow label="Delivery Date">
            <Input
              type="date"
              value={routeForm.date}
              onChange={(e) => setRouteForm({ ...routeForm, date: e.target.value })}
            />
          </FormRow>
          <FormRow label="Time Slot">
            <Select
              value={routeForm.timeWindow}
              onChange={(value) => setRouteForm({ ...routeForm, timeWindow: value })}
              options={[
                { value: '', label: 'Select time slot' },
                ...slots.filter(s => s.isActive).map(s => ({
                  value: s.timeWindow,
                  label: `${s.timeWindow} (${getPendingOrdersForSlot(routeForm.date, s.timeWindow).length} orders)`
                }))
              ]}
            />
          </FormRow>
          <FormRow label="Assign Driver (Optional)">
            <Select
              value={routeForm.driver}
              onChange={(value) => setRouteForm({ ...routeForm, driver: value })}
              options={[
                { value: '', label: 'Assign later' },
                ...drivers.map(d => ({ value: d.name, label: d.name }))
              ]}
            />
          </FormRow>
        </FormGrid>

        {routeForm.timeWindow && (
          <div className={styles.pendingOrdersPreview}>
            <h4>Orders to include:</h4>
            <div className={styles.previewList}>
              {getPendingOrdersForSlot(routeForm.date, routeForm.timeWindow).map(order => (
                <div key={order.id} className={styles.previewItem}>
                  <span>{order.customer.name}</span>
                  <span>{order.deliveryAddress.postcode}</span>
                </div>
              ))}
              {getPendingOrdersForSlot(routeForm.date, routeForm.timeWindow).length === 0 && (
                <p className={styles.noOrders}>No pending orders for this slot</p>
              )}
            </div>
          </div>
        )}

        <ModalFooter>
          <Button variant="outline" onClick={() => {
            setIsRouteModalOpen(false);
            resetRouteForm();
          }}>
            Cancel
          </Button>
          <Button onClick={handleCreateRoute}>
            Create Route
          </Button>
        </ModalFooter>
      </Modal>

      {/* Route Detail Modal */}
      <Modal
        isOpen={isRouteDetailOpen}
        onClose={() => {
          setIsRouteDetailOpen(false);
          setSelectedRoute(null);
        }}
        title="Route Details"
        size="lg"
      >
        {selectedRoute && (
          <>
            <FormGrid>
              <FormValue
                label="Date"
                value={new Date(selectedRoute.date).toLocaleDateString('en-GB', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                })}
              />
              <FormValue
                label="Time Window"
                value={selectedRoute.timeWindow}
              />
              <FormValue
                label="Driver"
                value={selectedRoute.driver || 'Unassigned'}
              />
              <FormValue
                label="Status"
                value={getStatusBadge(selectedRoute.status)}
              />
            </FormGrid>

            <FormSection title="Stops">
              <div className={styles.detailStopsList}>
                {selectedRoute.stops.map((stop) => (
                  <div key={stop.orderId} className={styles.detailStopItem}>
                    <div className={styles.stopOrder}>{stop.order}</div>
                    <div className={styles.stopDetails}>
                      <div className={styles.stopName}>{stop.customerName}</div>
                      <div className={styles.stopAddress}>
                        <MapPin size={14} />
                        {stop.address}
                      </div>
                      <div className={styles.stopPhone}>
                        <Phone size={14} />
                        {stop.phone}
                      </div>
                    </div>
                    <div className={styles.stopStatus}>
                      {getStopStatusBadge(stop.status)}
                    </div>
                  </div>
                ))}
              </div>
            </FormSection>
          </>
        )}
        <ModalFooter>
          <Button variant="outline" onClick={() => {
            setIsRouteDetailOpen(false);
            setSelectedRoute(null);
          }}>
            Close
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
};

export default Deliveries;
