import { useCallback, useEffect, useState } from "react";

import {
  Broadcast,
  getBroadcasts,
  createBroadcast,
  updateBroadcast,
  deleteBroadcast,
  sendBroadcast,
} from "../../context/Broadcasts/broadcastsApi";

export function useBroadcasts() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadBroadcasts = useCallback(async () => {
    try {
      setLoading(true);

      const response = await getBroadcasts();

      setBroadcasts(response.broadcasts);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBroadcasts();
  }, [loadBroadcasts]);

  const create = async (payload: Partial<Broadcast>) => {
    setSaving(true);

    try {
      const broadcast = await createBroadcast(payload);

      setBroadcasts((prev) => [broadcast, ...prev]);

      return broadcast;
    } finally {
      setSaving(false);
    }
  };

  const update = async (
    id: string,
    payload: Partial<Broadcast>,
  ) => {
    setSaving(true);

    try {
      const broadcast = await updateBroadcast(id, payload);

      setBroadcasts((prev) =>
        prev.map((item) =>
          item._id === id ? broadcast : item,
        ),
      );

      return broadcast;
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this broadcast?")) return;

    await deleteBroadcast(id);

    setBroadcasts((prev) =>
      prev.filter((item) => item._id !== id),
    );
  };

  const send = async (id: string) => {
    setSaving(true);

    try {
      await sendBroadcast(id);

      await loadBroadcasts();

    } finally {
      setSaving(false);
    }
  };

  return {
    broadcasts,
    loading,
    saving,

    create,
    update,
    remove,
    send,
    reload: loadBroadcasts,
  };
}
