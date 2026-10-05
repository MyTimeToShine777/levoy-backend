package com.levoy.app

import com.levoy.app.util.DateRange
import com.levoy.app.util.Fmt
import com.levoy.app.util.Lang
import com.levoy.app.util.Preset
import com.levoy.app.util.Strings
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

class UtilTest {
    @Test fun durationsReadLikeTheReference() {
        assertEquals("0s", Fmt.duration(0))
        assertEquals("59s", Fmt.duration(59))
        assertEquals("4m 6s", Fmt.duration(246))
        assertEquals("1h 2m 5s", Fmt.duration(3725))
        assertEquals("-", Fmt.durationOrDash(0))
    }

    @Test fun clockFormatFollowsTheSetting() {
        Fmt.zone = ZoneId.of("UTC")
        Fmt.hour24 = false
        assertEquals("01:59 PM", Fmt.time("2026-10-02T13:59:00Z"))
        Fmt.hour24 = true
        assertEquals("13:59", Fmt.time("2026-10-02T13:59:00Z"))
        Fmt.hour24 = false
    }

    @Test fun agoUsesTheSameWordsAsTheNeverAttendedList() {
        val now = Instant.parse("2026-10-02T12:00:00Z")
        assertEquals("7 hours ago", Fmt.ago("2026-10-02T05:00:00Z", now))
        assertEquals("a day ago", Fmt.ago("2026-10-01T09:00:00Z", now))
        assertEquals("2 days ago", Fmt.ago("2026-09-30T09:00:00Z", now))
    }

    @Test fun presetsCoverTheRightDays() {
        Fmt.zone = ZoneId.of("Asia/Kolkata")
        val today = LocalDate.of(2026, 10, 2)        // a Friday
        val t = DateRange.of(Preset.Today, today = today)
        assertEquals("2026-10-02T00:00+05:30[Asia/Kolkata]", t.from.toString())
        assertEquals("2026-10-02T23:59:59+05:30[Asia/Kolkata]", t.to.toString())
        assertEquals(LocalDate.of(2026, 9, 28), DateRange.of(Preset.Week, today = today).from!!.toLocalDate())   // Monday
        assertEquals(LocalDate.of(2026, 10, 1), DateRange.of(Preset.Month, today = today).from!!.toLocalDate())
        assertEquals(LocalDate.of(2026, 1, 1), DateRange.of(Preset.Year, today = today).from!!.toLocalDate())
        assertEquals(LocalDate.of(2026, 10, 1), DateRange.of(Preset.Yesterday, today = today).from!!.toLocalDate())
        assertNull(DateRange.of(Preset.AllTime).from)
        assertEquals("02-Oct 12:00 AM - 02-Oct 11:59 PM", t.label())
    }

    @Test fun translationsFallBackToEnglish() {
        Strings.lang = Lang.Fr
        assertEquals("Historique", Strings.t("nav_history"))
        assertEquals("not_a_key", Strings.t("not_a_key"))
        Strings.lang = Lang.En
        assertEquals("Call History", Strings.t("nav_history"))
        assertTrue(Lang.entries.size == 6)
    }
}
