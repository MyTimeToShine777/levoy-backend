package com.levoy.app.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.TelephonyManager
import android.util.Log
import com.levoy.app.calllog.CallLogTracker
import com.levoy.app.overlay.QuickActionOverlay
import com.levoy.app.settings.AppPreferences

/**
 * PHONE_STATE handling. Two jobs:
 *
 *  1. RINGING / OFFHOOK  — show the Quick Action overlay while the call is up.
 *  2. IDLE              — tear the overlay down and push the finished call into
 *                         the tracker.
 *
 * The overlay itself no-ops when the feature is disabled, so this receiver does
 * not need to branch on the preference itself.
 *
 * NOTE ON THE NUMBER: PHONE_STATE carries the *other* party's number for
 * incoming calls via EXTRA_INCOMING_NUMBER. For outgoing calls Android does not
 * reliably supply it, so the overlay falls back to "Unknown number" rather than
 * guessing.
 */
class CallLogReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != TelephonyManager.ACTION_PHONE_STATE_CHANGED) return

        val state = intent.getStringExtra(TelephonyManager.EXTRA_STATE)
        // Present on RINGING/OFFHOOK for incoming calls; absent for outgoing,
        // which is why the overlay tolerates a null number.
        val peerNumber = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER)

        when (state) {
            TelephonyManager.EXTRA_STATE_RINGING -> {
                Log.d(TAG, "Ringing from $peerNumber")
            }

            TelephonyManager.EXTRA_STATE_OFFHOOK -> {
                // Call is up: either an outgoing call just started (no number in
                // the intent) or an incoming call was answered (number present).
                QuickActionOverlay.show(context, peerNumber)
            }

            TelephonyManager.EXTRA_STATE_IDLE -> {
                QuickActionOverlay.hide(context)
                CallLogTracker.getInstance(context).onCallLogChanged()
            }
        }
    }

    private companion object {
        const val TAG = "CallLogReceiver"
    }
}
