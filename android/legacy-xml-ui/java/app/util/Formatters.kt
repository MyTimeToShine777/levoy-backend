package com.levoy.app.util

import android.content.Context
import com.levoy.app.R
import com.levoy.app.settings.AppPreferences
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Every timestamp in the app goes through here so the 12/24 hr preference in
 * Settings is honoured consistently — the reference stores the choice locally
 * and applies it app-wide.
 */
object Fmt {

    private val TIMESTAMP_PATTERNS = listOf(
        "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
        "yyyy-MM-dd'T'HH:mm:ss'Z'",
        "yyyy-MM-dd'T'HH:mm:ss.SSS",
        "yyyy-MM-dd'T'HH:mm:ss",
        "yyyy-MM-dd HH:mm:ss",
        "yyyy-MM-dd"
    )

    private val DATE_ONLY = "yyyy-MM-dd"

    fun is24Hour(context: Context): Boolean = AppPreferences.getInstance(context).is24HourTime

    /**
     * Tolerant ISO-8601 parse. The backend emits several shapes (with and
     * without millis, with and without the Z suffix); a bare "yyyy-MM-dd"
     * also has to work because /api/reports/daily returns dates.
     */
    fun parseTimestamp(raw: String?): Date? {
        if (raw.isNullOrBlank()) return null
        for (pattern in TIMESTAMP_PATTERNS) {
            val parsed = runCatching { SimpleDateFormat(pattern, Locale.US).parse(raw) }.getOrNull()
            if (parsed != null) return parsed
        }
        return null
    }

    /** Time only, honouring the 12/24 hr setting. */
    fun time(context: Context, date: Date): String {
        val pattern = if (is24Hour(context)) "HH:mm" else "h:mm a"
        return SimpleDateFormat(pattern, Locale.getDefault()).format(date)
    }

    /** Date + time for list rows. */
    fun dateTime(context: Context, raw: String?): String {
        val date = parseTimestamp(raw) ?: return "—"
        return SimpleDateFormat("MMM d", Locale.getDefault()).format(date) + " · " + time(context, date)
    }

    /** Day-level label used by report rows. */
    fun dayLabel(raw: String?): String {
        val date = parseTimestamp(raw) ?: return "—"
        return SimpleDateFormat("EEE, MMM d", Locale.getDefault()).format(date)
    }

    /** 24 hr / 12 hr clock for a time-of-day only value. */
    fun clock(context: Context, raw: String?): String {
        val date = parseTimestamp(raw) ?: return "—"
        return time(context, date)
    }

    /** 0 -> "—", 45 -> "45s", 125 -> "2m 05s". */
    fun duration(seconds: Int): String {
        if (seconds <= 0) return "—"
        val mins = seconds / 60
        val secs = seconds % 60
        return if (mins > 0) String.format(Locale.US, "%dm %02ds", mins, secs)
        else "${secs}s"
    }

    /** Talk time across many calls reads better in minutes. */
    fun talkTime(seconds: Int): String {
        if (seconds <= 0) return "—"
        val hours = seconds / 3600
        val mins = (seconds % 3600) / 60
        return when {
            hours > 0 -> String.format(Locale.US, "%dh %02dm", hours, mins)
            mins > 0 -> String.format(Locale.US, "%dm", mins)
            else -> "${seconds}s"
        }
    }

    /** Average call length, which arrives in seconds as a Double. */
    fun avgDuration(seconds: Double): String =
        if (seconds > 0) talkTime(seconds.toInt()) else "—"

    /**
     * "2h ago" style relative time for last-activity columns. Anything older
     * than a week falls back to an absolute date, which is more useful.
     */
    fun relative(context: Context, raw: String?): String {
        val date = parseTimestamp(raw) ?: return context.getString(R.string.team_never_active)
        val diff = System.currentTimeMillis() - date.time
        val mins = diff / 60_000
        val hours = diff / 3_600_000
        val days = diff / 86_400_000
        return when {
            mins < 1 -> context.getString(R.string.just_now)
            mins < 60 -> context.getString(R.string.minutes_ago, mins.toInt())
            hours < 24 -> context.getString(R.string.hours_ago, hours.toInt())
            days < 7 -> context.getString(R.string.days_ago, days.toInt())
            else -> SimpleDateFormat("MMM d", Locale.getDefault()).format(date)
        }
    }

    /**
     * Percent change for the performance delta line. The backend sends null
     * when there is no previous period to compare against, and 0 when the
     * previous period was itself 0 — both read as "no data", not "no change".
     */
    fun delta(context: Context, pct: Double?): String {
        if (pct == null) return context.getString(R.string.perf_no_delta)
        val rounded = kotlin.math.abs(pct).toInt()
        return when {
            rounded == 0L -> context.getString(R.string.perf_no_delta)
            pct > 0 -> context.getString(R.string.perf_period_delta_up, rounded)
            else -> context.getString(R.string.perf_period_delta_down, rounded)
        }
    }

    /** Whole-percent or em-dash for a nullable rate column. */
    fun rate(value: Double?): String =
        if (value == null || value < 0) "—" else String.format(Locale.US, "%.0f%%", value)

    fun score(value: Double?): String =
        if (value == null) "—" else String.format(Locale.US, "%.1f", value)

    /** QA scores are out of 100; drop the decimal when it is a whole number. */
    fun scoreOutOf100(value: Double?): String = when {
        value == null -> "—"
        value % 1.0 == 0.0 -> value.toInt().toString()
        else -> String.format(Locale.US, "%.1f", value)
    }

    /** yyyy-MM-dd for date_from / date_to query params. */
    fun isoDate(date: Date): String = SimpleDateFormat(DATE_ONLY, Locale.US).format(date)

    /** yyyy-MM-dd'T'HH:mm:ss — the format PATCH /follow-ups/:id expects. */
    fun isoDateTime(date: Date): String =
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).format(date)

    /** Digits only, for comparing two numbers read from different sources. */
    fun digitsOnly(raw: String?): String = raw?.filter { it.isDigit() }.orEmpty()
}