import { useEffect, useState, useCallback } from 'react';
import sb from './supabaseClient';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

const supported =
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

export function usePushNotifications(user, currentList) {
  const [permission, setPermission] = useState(
    supported ? Notification.permission : 'unsupported'
  );
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supported || !user || !currentList) return;
    setPermission(Notification.permission);
    (async () => {
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      if (!reg) return;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) { setSubscribed(false); return; }
      const { data } = await sb
        .from('push_subscriptions')
        .select('id')
        .eq('user_id', user.id)
        .eq('list_id', currentList.id)
        .maybeSingle();
      setSubscribed(!!data);
    })();
  }, [user, currentList]);

  const subscribe = useCallback(async () => {
    if (!supported || !user || !currentList || !VAPID_PUBLIC_KEY) return;
    setLoading(true);
    try {
      await navigator.serviceWorker.register('/sw.js');
      const reg = await navigator.serviceWorker.ready;

      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') { setLoading(false); return; }

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      const { error } = await sb.from('push_subscriptions').upsert(
        { user_id: user.id, list_id: currentList.id, subscription: sub.toJSON() },
        { onConflict: 'user_id,list_id' }
      );
      if (!error) setSubscribed(true);
    } catch (err) {
      console.error('Push subscribe error:', err);
    }
    setLoading(false);
  }, [user, currentList]);

  const unsubscribe = useCallback(async () => {
    if (!supported || !user || !currentList) return;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      await sb
        .from('push_subscriptions')
        .delete()
        .eq('user_id', user.id)
        .eq('list_id', currentList.id);
      setSubscribed(false);
    } catch (err) {
      console.error('Push unsubscribe error:', err);
    }
    setLoading(false);
  }, [user, currentList]);

  const sendNotification = useCallback(
    async (title, body, tag = 'expense') => {
      if (!currentList || !user) return;
      try {
        await sb.functions.invoke('send-push', {
          body: { list_id: currentList.id, sender_user_id: user.id, title, body, tag },
        });
      } catch (err) {
        console.error('sendNotification error:', err);
      }
    },
    [currentList, user]
  );

  return { supported, permission, subscribed, loading, subscribe, unsubscribe, sendNotification };
}
