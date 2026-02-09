import React, { useState } from 'react';
import { Lock, Unlock, Route, Truck, RefreshCw, AlertTriangle } from 'lucide-react';
import { DeliveryRun } from '../../types';
import { Button, Modal, ModalFooter } from '@/components/common';
import styles from './RunActionsBar.module.css';

interface RunActionsBarProps {
  run: DeliveryRun;
  actionLoading: 'lock' | 'unlock' | 'optimize' | 'dispatch' | null;
  onLock: () => Promise<boolean>;
  onUnlock: () => Promise<boolean>;
  onOptimize: () => Promise<boolean>;
  onDispatch: () => Promise<boolean>;
}

type ConfirmAction = 'lock' | 'unlock' | 'optimize' | 'reoptimize' | 'dispatch' | null;

export const RunActionsBar: React.FC<RunActionsBarProps> = ({
  run,
  actionLoading,
  onLock,
  onUnlock,
  onOptimize,
  onDispatch
}) => {
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  const handleConfirm = async () => {
    let success = false;
    switch (confirmAction) {
      case 'lock':
        success = await onLock();
        break;
      case 'unlock':
        success = await onUnlock();
        break;
      case 'optimize':
      case 'reoptimize':
        success = await onOptimize();
        break;
      case 'dispatch':
        success = await onDispatch();
        break;
    }
    if (success) {
      setConfirmAction(null);
    }
  };

  const getConfirmTitle = () => {
    switch (confirmAction) {
      case 'lock': return 'Lock Delivery Run?';
      case 'unlock': return 'Unlock Delivery Run?';
      case 'optimize': return 'Optimize Routes?';
      case 'reoptimize': return 'Re-optimize Routes?';
      case 'dispatch': return 'Dispatch Delivery Run?';
      default: return '';
    }
  };

  const getConfirmMessage = () => {
    switch (confirmAction) {
      case 'lock': 
        return 'Locking will prevent automatic order additions. You can unlock later if needed.';
      case 'unlock': 
        return 'Unlocking will return this run to draft status. Routes will be preserved but may become outdated.';
      case 'optimize': 
        return 'This will generate optimized routes for all 3 vans based on current orders.';
      case 'reoptimize': 
        return 'This will regenerate all routes. Existing van assignments will be changed.';
      case 'dispatch': 
        return 'This will mark the run as dispatched. Drivers will receive their routes.';
      default: return '';
    }
  };

  const canLock = run.status === 'draft';
  const canUnlock = run.status === 'locked' || run.status === 'routed';
  const canOptimize = run.status === 'locked' || run.status === 'draft';
  const canReoptimize = run.status === 'routed';
  const canDispatch = run.status === 'routed';

  return (
    <>
      <div className={styles.bar}>
        {canLock && (
          <Button
            variant="secondary"
            leftIcon={<Lock size={16} />}
            onClick={() => setConfirmAction('lock')}
            disabled={!!actionLoading}
          >
            Lock Run
          </Button>
        )}

        {canUnlock && (
          <Button
            variant="ghost"
            leftIcon={<Unlock size={16} />}
            onClick={() => setConfirmAction('unlock')}
            disabled={!!actionLoading}
          >
            Unlock
          </Button>
        )}

        {canOptimize && (
          <>
            {run.status === 'draft' && (
              <div className={styles.warning}>
                <AlertTriangle size={16} />
                Run is not locked
              </div>
            )}
            <Button
              variant="primary"
              leftIcon={actionLoading === 'optimize' ? <RefreshCw size={16} className="animate-spin" /> : <Route size={16} />}
              onClick={() => setConfirmAction('optimize')}
              disabled={!!actionLoading}
              isLoading={actionLoading === 'optimize'}
            >
              {actionLoading === 'optimize' ? 'Optimizing...' : 'Optimize Routes'}
            </Button>
          </>
        )}

        {canReoptimize && (
          <Button
            variant="secondary"
            leftIcon={<RefreshCw size={16} />}
            onClick={() => setConfirmAction('reoptimize')}
            disabled={!!actionLoading}
            isLoading={actionLoading === 'optimize'}
          >
            {actionLoading === 'optimize' ? 'Optimizing...' : 'Re-optimize'}
          </Button>
        )}

        <div className={styles.spacer} />

        {canDispatch && (
          <Button
            variant="primary"
            leftIcon={<Truck size={16} />}
            onClick={() => setConfirmAction('dispatch')}
            disabled={!!actionLoading}
          >
            Dispatch
          </Button>
        )}
      </div>

      <Modal
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        title={getConfirmTitle()}
        size="sm"
      >
        <p style={{ marginBottom: 'var(--space-4)', color: 'var(--color-gray-600)' }}>
          {getConfirmMessage()}
        </p>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setConfirmAction(null)}>
            Cancel
          </Button>
          <Button 
            variant="primary" 
            onClick={handleConfirm}
            disabled={!!actionLoading}
          >
            {actionLoading ? 'Processing...' : 'Confirm'}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
};

export default RunActionsBar;
