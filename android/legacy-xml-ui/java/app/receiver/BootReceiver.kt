
package com.levoy.app.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.levoy.app.calllog.CallLogTracker
import com.levoy.app.service.CallSyncService
import com.levoy.app.service.CallSyncWorker

/**
 * Restarts call tracking after device reboot.
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED ||
            intent.action == Intent.ACTION_LOCKED_BOOT_COMPLETED) {

            // Restart the foreground service
            CallSyncService.start(context)

            // Reschedule periodic work
            CallSyncWorker.schedule(context)

            // Re-register call log observer via the tracker
            CallLogTracker.getInstance(context).startTracking()
        }
    }
}
