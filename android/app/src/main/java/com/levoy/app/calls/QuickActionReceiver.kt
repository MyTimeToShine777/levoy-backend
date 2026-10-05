package com.levoy.app.calls

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.provider.ContactsContract
import android.provider.Settings
import android.telephony.TelephonyManager
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import com.levoy.app.MainActivity
import com.levoy.app.data.Session

/**
 * Quick Action: while a call is on screen, a small amber bubble floats on top. Tapping it opens two choices —
 * Save Contact (when the number is not saved) and View Details (opens Levoy). Shown only when the person
 * turned Quick Action on AND granted "display over other apps"; removed when the call ends.
 */
class QuickActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext
        // an outgoing call announces its number before it starts (needs PROCESS_OUTGOING_CALLS)
        if (intent.action == Intent.ACTION_NEW_OUTGOING_CALL) { number = intent.getStringExtra(Intent.EXTRA_PHONE_NUMBER); return }
        if (intent.action != TelephonyManager.ACTION_PHONE_STATE_CHANGED) return
        when (intent.getStringExtra(TelephonyManager.EXTRA_STATE)) {
            TelephonyManager.EXTRA_STATE_RINGING -> { wasRinging = true; number = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER) ?: number; show(app) }
            TelephonyManager.EXTRA_STATE_OFFHOOK -> { wasOffhook = true; show(app) }
            TelephonyManager.EXTRA_STATE_IDLE -> {
                hide(app)
                // the call is over: ask for a note if we spoke, or for a reminder if it rang out
                if (wasOffhook || wasRinging) PostCallPrompts.show(app, number, missed = wasRinging && !wasOffhook)
                number = null; wasRinging = false; wasOffhook = false
            }
        }
    }

    companion object {
        private var number: String? = null
        private var wasRinging = false
        private var wasOffhook = false
        private var view: View? = null

        private fun dp(c: Context, v: Int) = (v * c.resources.displayMetrics.density).toInt()

        fun show(c: Context) {
            if (view != null) return
            val s = Session(c)
            if (!s.quickAction || !Settings.canDrawOverlays(c)) return
            val wm = c.getSystemService(Context.WINDOW_SERVICE) as WindowManager

            val bubble = TextView(c).apply {
                text = "C"; setTextColor(Color.parseColor("#222328")); textSize = 18f; gravity = Gravity.CENTER
                background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(Color.parseColor("#FDBC00")) }
            }
            val panel = LinearLayout(c).apply {
                orientation = LinearLayout.VERTICAL; visibility = View.GONE
                background = GradientDrawable().apply { cornerRadius = dp(c, 14).toFloat(); setColor(Color.parseColor("#2B2C31")) }
                setPadding(dp(c, 6), dp(c, 6), dp(c, 6), dp(c, 6))
            }
            fun action(label: String, run: () -> Unit) = TextView(c).apply {
                text = label; setTextColor(Color.WHITE); textSize = 15f; setPadding(dp(c, 14), dp(c, 10), dp(c, 14), dp(c, 10))
                setOnClickListener { run(); hide(c) }
            }
            val num = number
            if (!num.isNullOrBlank()) panel.addView(action("Save Contact") {
                c.startActivity(Intent(ContactsContract.Intents.Insert.ACTION).apply {
                    type = ContactsContract.RawContacts.CONTENT_TYPE; putExtra(ContactsContract.Intents.Insert.PHONE, num); addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                })
            })
            panel.addView(action("View Details") { c.startActivity(Intent(c, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) })

            val root = LinearLayout(c).apply { orientation = LinearLayout.VERTICAL; addView(bubble, LinearLayout.LayoutParams(dp(c, 44), dp(c, 44))); addView(panel) }
            bubble.setOnClickListener { panel.visibility = if (panel.visibility == View.VISIBLE) View.GONE else View.VISIBLE }

            val type = if (Build.VERSION.SDK_INT >= 26) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE
            val lp = WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT, type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS, PixelFormat.TRANSLUCENT,
            ).apply { gravity = Gravity.TOP or Gravity.START; x = dp(c, 8); y = dp(c, 120) }
            runCatching { wm.addView(root, lp); view = root }
        }

        fun hide(c: Context) {
            val v = view ?: return
            runCatching { (c.getSystemService(Context.WINDOW_SERVICE) as WindowManager).removeView(v) }
            view = null
        }
    }
}
