package com.levoy.app.overlay

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.provider.Settings
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import android.widget.Toast
import com.levoy.app.MainActivity
import com.levoy.app.R
import com.levoy.app.settings.AppPreferences
import com.levoy.app.util.Contacts

/**
 * The in-call Quick Action overlay.
 *
 * WHY A WindowManager OVERLAY AND NOT AN ACTIVITY: from Android 10 (API 29)
 * the platform silently blocks starting an activity from a BroadcastReceiver,
 * and PHONE_STATE arrives precisely while the dialler is in the foreground —
 * i.e. our app is in the background. A TYPE_APPLICATION_OVERLAY window is the
 * supported way to surface UI at that moment, at the cost of the user having
 * to grant "Display over other apps" once. SettingsFragment explains this and
 * deep-links to the grant screen when the toggle is switched on.
 *
 * The overlay is a singleton window: a second in-call event updates the
 * existing view rather than stacking another one.
 */
object QuickActionOverlay {

    private var windowManager: WindowManager? = null
    private var overlayView: View? = null

    /** True when the user has granted "Display over other apps". */
    fun canDraw(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)

    /** Shows the overlay for [number]. No-op when the feature is off. */
    @SuppressLint("InflateParams")
    fun show(context: Context, number: String?) {
        if (!AppPreferences.getInstance(context).isQuickActionEnabled) return
        if (!canDraw(context)) {
            Toast.makeText(context, R.string.quick_action_needs_overlay, Toast.LENGTH_LONG).show()
            return
        }

        val appContext = context.applicationContext
        val manager = windowManager ?: run {
            val resolved = appContext.getSystemService(Context.WINDOW_SERVICE) as? WindowManager
            windowManager = resolved
            resolved
        } ?: return

        overlayView?.let { existing ->
            bind(appContext, existing, number)
            return
        }

        val view = LayoutInflater.from(appContext)
            .inflate(R.layout.overlay_quick_action, null)
        bind(appContext, view, number)

        val density = appContext.resources.displayMetrics.density
        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
            x = 0
            y = (24 * density).toInt()
        }

        view.findViewById<View>(R.id.btnOverlayDismiss).setOnClickListener { hide(appContext) }
        view.findViewById<View>(R.id.btnOverlaySaveContact).setOnClickListener {
            Contacts.requestSave(appContext, number)
        }
        view.findViewById<View>(R.id.btnOverlayViewDetails).setOnClickListener {
            hide(appContext)
            openCallHistory(appContext)
        }

        overlayView = view
        runCatching { manager.addView(view, params) }.onFailure {
            overlayView = null
            Toast.makeText(appContext, R.string.quick_action_needs_overlay, Toast.LENGTH_SHORT).show()
        }
    }

    fun hide(context: Context) {
        val view = overlayView ?: return
        val manager = windowManager ?: return
        overlayView = null
        runCatching { manager.removeViewImmediate(view) }
    }

    private fun bind(context: Context, view: View, number: String?) {
        val displayNumber = if (number.isNullOrBlank()) {
            context.getString(R.string.quick_action_unknown_number)
        } else number
        view.findViewById<TextView>(R.id.tvOverlayNumber).text = displayNumber

        val hint = view.findViewById<TextView>(R.id.tvOverlayHint)
        val saved = !number.isNullOrBlank() && Contacts.isSaved(context, number)
        if (saved) {
            hint.text = context.getString(R.string.quick_action_already_saved)
            hint.visibility = View.VISIBLE
        } else {
            hint.visibility = View.GONE
        }
    }

    /** Opens Levoy's own call history. */
    private fun openCallHistory(context: Context) {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        runCatching { context.startActivity(intent) }
            .onFailure {
                context.startActivity(
                    Intent(context, MainActivity::class.java).apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                )
            }
    }
}