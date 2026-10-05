package com.levoy.app.util

import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Clock + number formatting in the same shapes the reference app uses. */
object Fmt {
    @Volatile var hour24: Boolean = false
    @Volatile var zone: ZoneId = ZoneId.systemDefault()
    private val en = Locale.ENGLISH

    fun parse(iso: String): ZonedDateTime? = runCatching { Instant.parse(iso).atZone(zone) }.getOrNull()

    /** "01:59 PM" or "13:59" */
    fun time(iso: String): String = parse(iso)?.let { time(it) } ?: ""
    fun time(z: ZonedDateTime): String = z.format(DateTimeFormatter.ofPattern(if (hour24) "HH:mm" else "hh:mm a", en))

    /** "28 September 2026" */
    fun dateLong(z: ZonedDateTime): String = z.format(DateTimeFormatter.ofPattern("d MMMM yyyy", en))

    /** "02 Oct 2026" */
    fun dateMed(z: ZonedDateTime): String = z.format(DateTimeFormatter.ofPattern("dd MMM yyyy", en))

    /** "02-Oct 12:00 AM" — the range strip */
    fun rangeEnd(z: ZonedDateTime): String = z.format(DateTimeFormatter.ofPattern(if (hour24) "dd-MMM HH:mm" else "dd-MMM hh:mm a", en))

    /** "27 Jul" */
    fun dayMonth(z: ZonedDateTime): String = z.format(DateTimeFormatter.ofPattern("dd MMM", en))

    /** 246 → "4m 6s", 59 → "59s", 3725 → "1h 2m 5s", 0 → "0s" */
    fun duration(sec: Int): String {
        val s = sec.coerceAtLeast(0)
        val h = s / 3600; val m = (s % 3600) / 60; val r = s % 60
        return when {
            h > 0 -> "${h}h ${m}m ${r}s"
            m > 0 -> "${m}m ${r}s"
            else -> "${r}s"
        }
    }

    /** Dash for zero, as the summary table does for missed / rejected. */
    fun durationOrDash(sec: Int): String = if (sec <= 0) "-" else duration(sec)

    /** "Today" / "Yesterday" / "28 September 2026" for a section header. */
    fun dayHeading(z: ZonedDateTime, today: String = "Today", yesterday: String = "Yesterday"): String {
        val d = z.toLocalDate()
        val now = LocalDate.now(zone)
        return when (d) { now -> today; now.minusDays(1) -> yesterday; else -> dateLong(z) }
    }

    /** "7 hours ago", "2 days ago", "a day ago" for the never-attended lists. */
    fun ago(iso: String, now: Instant = Instant.now()): String {
        val t = runCatching { Instant.parse(iso) }.getOrNull() ?: return ""
        val mins = java.time.Duration.between(t, now).toMinutes().coerceAtLeast(0)
        val hours = mins / 60; val days = hours / 24
        return when {
            mins < 1 -> "just now"
            mins < 60 -> "$mins minute${if (mins == 1L) "" else "s"} ago"
            hours < 24 -> "$hours hour${if (hours == 1L) "" else "s"} ago"
            days == 1L -> "a day ago"
            else -> "$days days ago"
        }
    }

    /** "+919344281783" → "+91 93442 81783" is not what the reference does; it shows the number as stored. */
    fun phone(n: String) = n
}

enum class Preset(val label: String) {
    Today("Today"), Yesterday("Yesterday"), Week("Week"), Month("Month"), Year("Year"), Custom("Custom"), AllTime("All Time");
}

/** An inclusive date range. `from`/`to` null means unbounded (All Time). */
data class DateRange(val preset: Preset, val from: ZonedDateTime?, val to: ZonedDateTime?) {
    val fromIso: String? get() = from?.toInstant()?.toString()
    val toIso: String? get() = to?.toInstant()?.toString()

    /** "02-Oct 12:00 AM - 02-Oct 11:59 PM" */
    fun label(firstCall: ZonedDateTime? = null): String {
        val a = from ?: firstCall ?: return "All time"
        val b = to ?: ZonedDateTime.now(Fmt.zone)
        return "${Fmt.rangeEnd(a)} - ${Fmt.rangeEnd(b)}"
    }

    companion object {
        private fun startOf(d: LocalDate) = d.atStartOfDay(Fmt.zone)
        private fun endOf(d: LocalDate) = LocalDateTime.of(d, LocalTime.of(23, 59, 59)).atZone(Fmt.zone)

        fun of(p: Preset, custom: Pair<LocalDate, LocalDate>? = null, today: LocalDate = LocalDate.now(Fmt.zone)): DateRange = when (p) {
            Preset.Today -> DateRange(p, startOf(today), endOf(today))
            Preset.Yesterday -> today.minusDays(1).let { DateRange(p, startOf(it), endOf(it)) }
            Preset.Week -> DateRange(p, startOf(today.minusDays(((today.dayOfWeek.value + 6) % 7).toLong())), endOf(today))
            Preset.Month -> DateRange(p, startOf(today.withDayOfMonth(1)), endOf(today))
            Preset.Year -> DateRange(p, startOf(today.withDayOfYear(1)), endOf(today))
            Preset.Custom -> custom?.let { DateRange(p, startOf(it.first), endOf(it.second)) } ?: DateRange(Preset.AllTime, null, null)
            Preset.AllTime -> DateRange(p, null, null)
        }
    }
}
