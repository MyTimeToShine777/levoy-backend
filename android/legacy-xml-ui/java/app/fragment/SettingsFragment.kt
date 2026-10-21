package com.levoy.app.fragment

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.fragment.app.Fragment
import com.levoy.app.BuildConfig
import com.levoy.app.MainActivity
import com.levoy.app.R
import com.levoy.app.calllog.CallUploadQueue
import com.levoy.app.network.TokenStorage
import com.levoy.app.service.CallSyncService
import com.levoy.app.settings.AppPreferences
import com.google.android.material.button.MaterialButton
import com.google.android.material.switchmaterial.SwitchMaterial

/**
 * Settings, grouped the way the reference groups them: Display, Tracking,
 * Account, About.
 *
 * Every row is built from the shared view_settings_row include, so the switch /
 * chevron / control slot and the hairline divider behave identically across
 * groups. All values are device-local (SharedPreferences); the backend has no
 * settings endpoint.
 */
class SettingsFragment : Fragment() {

    private lateinit var prefs: AppPreferences

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_settings, container, false)
        prefs = AppPreferences.getInstance(requireContext())

        buildDisplayGroup(view)
        buildTrackingGroup(view)
        buildAccountGroup(view)
        buildAboutGroup(view)

        view.findViewById<MaterialButton>(R.id.btnLogout).setOnClickListener {
            (activity as? MainActivity)?.logout()
        }

        return view
    }

    // ─── Row builders ───

    /** control: null = chevron, true = switch, false = no control. */
    private fun addRow(
        parent: LinearLayout,
        iconRes: Int,
        titleRes: Int,
        descriptionRes: Int,
        onClick: (() -> Unit)? = null,
        control: RowControl = RowControl.CHEVRON
    ): View {
        val row = layoutInflater.inflate(R.layout.view_settings_row, parent, false)
        row.findViewById<ImageView>(R.id.rowIcon).setImageResource(iconRes)
        row.findViewById<TextView>(R.id.rowTitle).setText(titleRes)
        row.findViewById<TextView>(R.id.rowDescription).setText(descriptionRes)

        val holder = row.findViewById<View>(R.id.rowControl)
        when (control) {
            RowControl.SWITCH -> {
                holder.show()
                row.findViewById<View>(R.id.rowSwitch).show()
                row.findViewById<View>(R.id.rowCheck).hide()
                row.findViewById<View>(R.id.rowChevron).hide()
            }
            RowControl.CHECK -> {
                holder.show()
                row.findViewById<View>(R.id.rowCheck).show()
                row.findViewById<View>(R.id.rowSwitch).hide()
                row.findViewById<View>(R.id.rowChevron).hide()
            }
            RowControl.CHEVRON -> {
                holder.show()
                row.findViewById<View>(R.id.rowChevron).show()
                row.findViewById<View>(R.id.rowSwitch).hide()
                row.findViewById<View>(R.id.rowCheck).hide()
            }
            RowControl.NONE -> holder.hide()
        }

        if (onClick != null) {
            row.isClickable = true
            row.setOnClickListener { onClick() }
        }

        // Hide the divider on the last row of the group.
        val divider = row.findViewById<View>(R.id.rowDivider)
        divider.visibility = View.VISIBLE
        row.tag = divider
        parent.addView(row)
        return row
    }

    private fun trimLastDivider(parent: LinearLayout) {
        if (parent.childCount > 0) {
            val last = parent.getChildAt(parent.childCount - 1)
            (last.tag as? View)?.visibility = View.GONE
        }
    }

    private fun buildDisplayGroup(view: View) {
        val group = view.findViewById<LinearLayout>(R.id.settingsDisplayGroup)

        addRow(
            group, R.drawable.ic_time, R.string.settings_time_format,
            R.string.settings_time_format_sub,
            onClick = { (activity as? MainActivity)?.openTimeFormat() }
        )

        // Callio ships dark-first with no light theme, so this switch is
        // deliberately inert: it shows the current state and says why.
        val darkRow = addRow(
            group, R.drawable.ic_layers, R.string.settings_dark_theme,
            R.string.settings_dark_theme_on,
            control = RowControl.SWITCH
        )
        val darkSwitch = darkRow.findViewById<SwitchMaterial>(R.id.rowSwitch)
        darkSwitch.setOnCheckedChangeListener(null)
        darkSwitch.isChecked = true
        darkSwitch.isEnabled = false
        darkSwitch.alpha = 0.5f

        trimLastDivider(group)
    }

    private fun buildTrackingGroup(view: View) {
        val group = view.findViewById<LinearLayout>(R.id.settingsTrackingGroup)
        val host = activity as? MainActivity

        addRow(
            group, R.drawable.ic_sim, R.string.settings_sim_verification,
            if (prefs.isSimVerified) R.string.settings_sim_verified
            else R.string.settings_sim_unverified,
            onClick = { host?.openSimVerification() }
        )

        var quickActionRow: View? = null
        quickActionRow = addRow(
            group, R.drawable.ic_quickaction, R.string.settings_quick_action,
            R.string.settings_quick_action_sub,
            onClick = { quickActionRow?.let { toggleQuickAction(it) } },
            control = RowControl.SWITCH
        )
        // Seed the switch without firing the listener that would persist it.
        quickActionRow.findViewById<SwitchMaterial>(R.id.rowSwitch).apply {
            setOnCheckedChangeListener(null)
            isChecked = prefs.isQuickActionEnabled
        }

        addRow(
            group, R.drawable.ic_sync, R.string.settings_sync_now,
            R.string.settings_sync_now_sub,
            onClick = { syncNow() }
        )

        trimLastDivider(group)
    }

    private fun buildAccountGroup(view: View) {
        val group = view.findViewById<LinearLayout>(R.id.settingsAccountGroup)
        val user = TokenStorage.getInstance(requireContext()).getUser()

        if (user == null) {
            addRow(
                group, R.drawable.ic_email, R.string.settings_account,
                R.string.settings_signed_out,
                control = RowControl.NONE
            )
        } else {
            addRow(
                group, R.drawable.ic_email, R.string.settings_account,
                getString(R.string.settings_account_sub, user.email.ifBlank { user.name }),
                control = RowControl.NONE
            )
        }

        trimLastDivider(group)
    }

    private fun buildAboutGroup(view: View) {
        val group = view.findViewById<LinearLayout>(R.id.settingsAboutGroup)

        addRow(
            group, R.drawable.ic_settings, R.string.app_name,
            getString(R.string.settings_version, BuildConfig.VERSION_NAME),
            control = RowControl.NONE
        )

        trimLastDivider(group)
    }

    // ─── Actions ───

    /**
     * Quick Action needs SYSTEM_ALERT_WINDOW. Android 10+ blocks starting an
     * activity from a broadcast receiver, so the overlay is drawn through
     * WindowManager instead — which means the user has to grant it. The toggle
     * records the preference and sends them to the system screen if needed.
     */
    private fun toggleQuickAction(row: View) {
        val next = !prefs.isQuickActionEnabled
        prefs.isQuickActionEnabled = next

        val rowControl = row.findViewById<SwitchMaterial>(R.id.rowSwitch)
        rowControl.setOnCheckedChangeListener(null)
        rowControl.isChecked = next
        rowControl.setOnCheckedChangeListener { _, checked ->
            prefs.isQuickActionEnabled = checked
            if (checked) ensureOverlayPermission()
        }

        Toast.makeText(
            requireContext(),
            if (next) R.string.quick_action_enabled else R.string.quick_action_disabled,
            Toast.LENGTH_SHORT
        ).show()

        if (next) ensureOverlayPermission()
    }

    private fun ensureOverlayPermission() {
        if (!Settings.canDrawOverlays(requireContext())) {
            AlertDialog.Builder(requireContext())
                .setTitle(R.string.settings_quick_action)
                .setMessage(R.string.quick_action_needs_overlay)
                .setPositiveButton(R.string.open_settings) { _, _ ->
                    val intent = Intent(
                        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:${requireContext().packageName}")
                    )
                    runCatching { startActivity(intent) }.onFailure {
                        Toast.makeText(
                            requireContext(), R.string.open_settings, Toast.LENGTH_SHORT
                        ).show()
                    }
                }
                .setNegativeButton(android.R.string.cancel, null)
                .show()
        }
    }

    private fun syncNow() {
        val queued = CallUploadQueue.getInstance(requireContext()).size()
        CallSyncService.uploadPending(requireContext().applicationContext)
        Toast.makeText(
            requireContext(),
            if (queued > 0) getString(R.string.queued_calls, queued)
            else getString(R.string.nothing_queued),
            Toast.LENGTH_SHORT
        ).show()
    }

    private enum class RowControl { SWITCH, CHECK, CHEVRON, NONE }

    companion object {
        fun newInstance() = SettingsFragment()
    }
}