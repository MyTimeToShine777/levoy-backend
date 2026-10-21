package com.levoy.app.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * Colours sampled from the 50 reference screenshots (738×1600 px each). The reference app is dark
 * only; every dark value here was read off a pixel. The light palette is an extra for the "Theme"
 * setting and keeps the same roles.
 */
object CallioColors {
    // brand
    val Amber = Color(0xFFFDBC00)            // primary buttons, selection, FAB, active accents
    val AmberOrange = Color(0xFFFEA500)      // outgoing in charts and the Premium ribbons
    val OnAmber = Color(0xFF222328)

    // call kinds
    val Incoming = Color(0xFF98CC00)         // chart slice / bar for incoming (lime)
    val IncomingIcon = Color(0xFFD7F54A)     // round icon on a call card
    val IncomingText = Color(0xFFC4F03C)
    val Outgoing = Color(0xFFFEA500)
    val OutgoingIcon = Color(0xFFFFBC4A)
    val OutgoingText = Color(0xFFFFB020)
    val Missed = Color(0xFFFF4B4B)
    val MissedIcon = Color(0xFFFF5757)
    val MissedText = Color(0xFFFF6B6B)
    val Rejected = Color(0xFF8B0000)
    val RejectedText = Color(0xFFD63B3B)

    // semantic
    val Success = Color(0xFF4CBC18)          // "Verified", granted
    val Danger = Color(0xFFD6341C)           // destructive / disable-battery button
    val DangerText = Color(0xFFE5483A)
    val Link = Color(0xFF2A7DE1)             // "FIX NOW", Privacy Policy, the call icon
    val WhatsApp = Color(0xFF25D366)
    val Sms = Color(0xFF4A9EE0)
    val Peach = Color(0xFFFFE3B9)            // permission banner fill
    val PeachBorder = Color(0xFFFFC46A)
    val OnPeach = Color(0xFF4A4036)
}

/** The surfaces and text colours that change between dark and light. */
@Immutable
data class Palette(
    val background: Color,
    val card: Color,
    val cardDeep: Color,
    val strip: Color,          // the date-range strip on analytics (pure black in the reference)
    val divider: Color,
    val textPrimary: Color,
    val textSecondary: Color,
    val textMuted: Color,
    val chartGrid: Color,
    val isDark: Boolean,
)

val DarkPalette = Palette(
    background = Color(0xFF191A1E),
    card = Color(0xFF2B2C31),
    cardDeep = Color(0xFF141517),
    strip = Color(0xFF000000),
    divider = Color(0xFF787880),
    textPrimary = Color(0xFFFFFFFF),
    textSecondary = Color(0xFFA6A7AD),
    textMuted = Color(0xFF8E8F97),
    chartGrid = Color(0xFF4B4C52),
    isDark = true,
)

val LightPalette = Palette(
    background = Color(0xFFF4F4F6),
    card = Color(0xFFFFFFFF),
    cardDeep = Color(0xFFE9E9ED),
    strip = Color(0xFFE2E2E7),
    divider = Color(0xFFC9C9CF),
    textPrimary = Color(0xFF1B1C20),
    textSecondary = Color(0xFF5F6068),
    textMuted = Color(0xFF6E6F77),
    chartGrid = Color(0xFFD5D5DA),
    isDark = false,
)

val LocalPalette = staticCompositionLocalOf { DarkPalette }

/** `Pal.card` etc. — read the current palette inside any composable. */
object Pal {
    val background: Color @Composable get() = LocalPalette.current.background
    val card: Color @Composable get() = LocalPalette.current.card
    val cardDeep: Color @Composable get() = LocalPalette.current.cardDeep
    val strip: Color @Composable get() = LocalPalette.current.strip
    val divider: Color @Composable get() = LocalPalette.current.divider
    val text: Color @Composable get() = LocalPalette.current.textPrimary
    val textSecondary: Color @Composable get() = LocalPalette.current.textSecondary
    val textMuted: Color @Composable get() = LocalPalette.current.textMuted
    val chartGrid: Color @Composable get() = LocalPalette.current.chartGrid
}
