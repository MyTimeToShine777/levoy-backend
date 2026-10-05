package com.levoy.app.data

import android.content.Context
import android.content.SharedPreferences
import com.google.gson.Gson

/** Everything stored on the phone: the sign-in token and the person's own settings. */
class Session(context: Context) {
    private val p: SharedPreferences = context.getSharedPreferences("levoy", Context.MODE_PRIVATE)
    private val gson = Gson()

    var token: String?
        get() = p.getString("token", null)
        set(v) = p.edit().putString("token", v).apply()

    var user: User?
        get() = p.getString("user", null)?.let { runCatching { gson.fromJson(it, User::class.java) }.getOrNull() }
        set(v) = p.edit().putString("user", v?.let(gson::toJson)).apply()

    var serverUrl: String
        get() = p.getString("server", null) ?: com.levoy.app.BuildConfig.API_BASE_URL
        set(v) = p.edit().putString("server", v.trim().trimEnd('/')).apply()

    var privacyAccepted: Boolean
        get() = p.getBoolean("privacy", false)
        set(v) = p.edit().putBoolean("privacy", v).apply()

    var simPrompted: Boolean
        get() = p.getBoolean("sim_prompted", false)
        set(v) = p.edit().putBoolean("sim_prompted", v).apply()

    var quickCallLinked: Boolean
        get() = p.getBoolean("quick_call", false)
        set(v) = p.edit().putBoolean("quick_call", v).apply()

    /** Set while the person is in system settings granting a permission, so the switch turns on when they return. */
    var pendingToggle: String?
        get() = p.getString("pending_toggle", null)
        set(v) = p.edit().putString("pending_toggle", v).apply()

    var pendingSimVerify: String?          // "slot:number:epochMillis" — a verify-by-call waiting for the call log
        get() = p.getString("pending_sim", null)
        set(v) = p.edit().putString("pending_sim", v).apply()

    /** After a call ends: notification to write a note / after a missed call: to write a reminder. */
    var notePrompt: Boolean
        get() = p.getBoolean("note_prompt", false)
        set(v) = p.edit().putBoolean("note_prompt", v).apply()

    var missedReminderPrompt: Boolean
        get() = p.getBoolean("missed_prompt", false)
        set(v) = p.edit().putBoolean("missed_prompt", v).apply()

    var onboardingDone: Boolean
        get() = p.getBoolean("onboarding", false)
        set(v) = p.edit().putBoolean("onboarding", v).apply()

    var is24Hour: Boolean
        get() = p.getBoolean("h24", false)
        set(v) = p.edit().putBoolean("h24", v).apply()

    var language: String
        get() = p.getString("lang", "en") ?: "en"
        set(v) = p.edit().putString("lang", v).apply()

    /** "light" | "dark" | "system" */
    var theme: String
        get() = p.getString("theme", "dark") ?: "dark"
        set(v) = p.edit().putString("theme", v).apply()

    /** "history" | "analytics" */
    var defaultScreen: String
        get() = p.getString("default_screen", "history") ?: "history"
        set(v) = p.edit().putString("default_screen", v).apply()

    var quickAction: Boolean
        get() = p.getBoolean("quick_action", false)
        set(v) = p.edit().putBoolean("quick_action", v).apply()

    var whatsappCalls: Boolean
        get() = p.getBoolean("wa_calls", false)
        set(v) = p.edit().putBoolean("wa_calls", v).apply()

    /** Millis of the newest call already uploaded, so a sync only sends what is new. */
    var lastSyncedAt: Long
        get() = p.getLong("last_synced", 0L)
        set(v) = p.edit().putLong("last_synced", v).apply()

    /** The Android 13+ notification permission is asked for once, after the first sign-in. */
    var notificationsAsked: Boolean
        get() = p.getBoolean("notifications_asked", false)
        set(v) = p.edit().putBoolean("notifications_asked", v).apply()

    fun signOut() {
        // settings (theme, language, clock) deliberately survive a sign-out
        p.edit().remove("token").remove("user").remove("last_synced").remove("quick_call").remove("pending_sim").apply()
    }
}
