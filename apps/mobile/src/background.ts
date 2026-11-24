import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { getDeviceSettings, rotateIfDue, SyncManager, type DeviceSettings } from '@wallpepper/core';
import { createStore, platform } from './platform';

export const ROTATION_TASK = 'wallpepper-rotation';

// Must be defined at import time in the global scope (see index.ts).
TaskManager.defineTask(ROTATION_TASK, async () => {
  try {
    const store = createStore();
    await store.init();
    if (store.state.local.auth) {
      // Pull changes first: another device may have changed this device's group/interval.
      try {
        await new SyncManager(store).sync();
      } catch {
        /* offline - rotate with what we have */
      }
    }
    await rotateIfDue(store, platform);
    await store.flush();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** Keep the OS scheduler in line with this device's playlist settings. Android minimum is 15 min. */
export async function syncBackgroundTask(s: DeviceSettings | undefined): Promise<void> {
  try {
    const wanted = !!s && (s.rotationEnabled || s.mode === 'folder' || s.syncEnabled);
    const registered = await TaskManager.isTaskRegisteredAsync(ROTATION_TASK);
    if (wanted && !registered) {
      await BackgroundTask.registerTaskAsync(ROTATION_TASK, { minimumInterval: Math.max(15, Math.min(s!.rotationMinutes, 60)) });
    } else if (!wanted && registered) {
      await BackgroundTask.unregisterTaskAsync(ROTATION_TASK);
    }
  } catch {
    /* background tasks unavailable (e.g. Expo Go) */
  }
}

export { getDeviceSettings };
