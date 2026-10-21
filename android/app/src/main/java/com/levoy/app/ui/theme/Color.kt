package com.levoy.app.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * The "Warm Graphite" look: warm dark greys (never pure black), one amber accent used sparingly, and soft
 * lime / amber / coral for incoming / outgoing / missed. Every pair of text and background here is at least
 * 4.5:1 so it stays readable on any phone. The light palette keeps the same roles for the "Theme" setting.
 */
object CallioColors {
    // brand
    val Amber = Color(0xFFFFB938)            // primary buttons, selection, FAB, active accents
    val AmberOrange = Color(0xFFFF9F1C)      // outgoing in charts and the Premium ribbons
    val OnAmber = Color(0xFF231A00)

    // call kinds
    val Incoming = Color(0xFFA9D84F)         // chart slice / bar for incoming (lime)
    val IncomingIcon = Color(0xFFC4EB7A)     // icon on a call card
    val IncomingText = Color(0xFFC4EB7A)
    val Outgoing = Color(0xFFFFB938)
    val OutgoingIcon = Color(0xFFFFC95C)
    val OutgoingText = Color(0xFFFFC95C)
    val Missed = Color(0xFFFF7A5C)
    val MissedIcon = Color(0xFFFF9C80)
    val MissedText = Color(0xFFFF9C80)
    val Rejected = Color(0xFFB23A2E)
    val RejectedText = Color(0xFFE5705F)

    // semantic
    val Success = Color(0xFF6CC24A)          // "Verified", granted
    val Danger = Color(0xFFE5392A)           // destructive / end call / disable-battery button
    val DangerText = Color(0xFFFF8A78)
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
    background = Color(0xFF141311),
    card = Color(0xFF1E1C19),
    cardDeep = Color(0xFF0F0E0C),
    strip = Color(0xFF0F0E0C),
    divider = Color(0xFF3A362F),
    textPrimary = Color(0xFFF6F1E7),
    textSecondary = Color(0xFFD9D2C4),
    textMuted = Color(0xFFA8A094),
    chartGrid = Color(0xFF3A362F),
    isDark = true,
)

val LightPalette = Palette(
    background = Color(0xFFF7F3EA),
    card = Color(0xFFFFFFFF),
    cardDeep = Color(0xFFEFE9DB),
    strip = Color(0xFFE9E2D2),
    divider = Color(0xFFDDD5C4),
    textPrimary = Color(0xFF1F1B14),
    textSecondary = Color(0xFF5A5446),
    textMuted = Color(0xFF6F6859),
    chartGrid = Color(0xFFDDD5C4),
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
    val isDark: Boolean @Composable get() = LocalPalette.current.isDark
}
