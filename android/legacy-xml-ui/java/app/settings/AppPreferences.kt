package com.levoy.app.settings

import android.content.Context
import android.content.SharedPreferences

/**
 * Device-local app settings. Deliberately separate from TokenStorage: these
 * survive logout, they are never sent to the server, and no backend endpoint
 * exists for them.
 *
 * Cached values are held in memory because the formatters read them on every
 * row bind.
 */
class AppPreferences(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    companion object {
        private const val PREFS_NAME = "levoy_settings"

        private const val KEY_TIME_24H = "time_format_24h"
        private const val KEY_QUICK_ACTION = "quick_action_enabled"
        private const val KEY_SIM_VERIFIED = "sim_verified"
        private const val KEY_SIM_NUMBER = "sim_number"
        private const val KEY_SIM_METHOD = "sim_verification_method"

        @Volatile
        private var instance: AppPreferences? = null

        fun getInstance(context: Context): AppPreferences {
            return instance ?: synchronized(this) {
                instance ?: AppPreferences(context.applicationContext).also { instance = it }
            }
        }
    }

    // ─── Time format (reference: amber radio check on a two-row list) ───

    var is24HourTime: Boolean
        get() = prefs.getBoolean(KEY_TIME_24H, true)
        set(value) = prefs.edit().putBoolean(KEY_TIME_24H, value).apply()

    // ─── Quick Action overlay ───

    var isQuickActionEnabled: Boolean
        get() = prefs.getBoolean(KEY_QUICK_ACTION, false)
        set(value) = prefs.edit().putBoolean(KEY_QUICK_ACTION, value).apply()

    // ─── SIM verification (local only — no backend endpoint exists) ───

    var isSimVerified: Boolean
        get() = prefs.getBoolean(KEY_SIM_VERIFIED, false)
        set(value) = prefs.edit().putBoolean(KEY_SIM_VERIFIED, value).apply()

    /** The device number captured during verification, or null if unknown. */
    var verifiedSimNumber: String?
        get() = prefs.getString(KEY_SIM_NUMBER, null)
        set(value) = prefs.edit().putString(KEY_SIM_NUMBER, value).apply()

    /** "call_log" | "call" | "skipped" — shown as the status subtitle. */
    var simVerificationMethod: String?
        get() = prefs.getString(KEY_SIM_METHOD, null)
        set(value) = prefs.edit().putString(KEY_SIM_METHOD, value).apply()

    fun resetSimVerification() {
        prefs.edit()
            .remove(KEY_SIM_VERIFIED)
            .remove(KEY_SIM_NUMBER)
            .remove(KEY_SIM_METHOD)
            .apply()
    }
}