package com.levoy.app.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * The Callio look, taken from the logo: deep navy surfaces, one action blue (a lighter blue in the dark theme,
 * a deeper one in the light theme), and green / blue / coral for incoming / outgoing / missed calls.
 * Every pair of text and background is at least 4.5:1 so it stays readable on any phone.
 * The colours that change between light and dark live in [Palette]; the ones below stay the same in both.
 */
object CallioColors {
    // the logo's own colours, for artwork and charts (not for small text)
    val BrandSky = Color(0xFF029AFD)
    val BrandBlue = Color(0xFF1574FF)
    val BrandViolet = Color(0xFF8934F3)
    val Warm = Color(0xFFFFB938)             // the "Warm" lead status

    // call kinds
    val Incoming = Color(0xFF3DDC9E)         // chart slice / bar for incoming (green)
    val IncomingIcon = Color(0xFF3DDC9E)     // icon on a call card
    val IncomingText = Color(0xFF3DDC9E)
    val Outgoing = Color(0xFF5CC0FF)         // blue, so it is told apart from incoming and missed by lightness and hue
    val OutgoingIcon = Color(0xFF5CC0FF)
    val OutgoingText = Color(0xFF5CC0FF)
    val Missed = Color(0xFFFF7F96)
    val MissedIcon = Color(0xFFFF7F96)
    val MissedText = Color(0xFFFF7F96)
    val Rejected = Color(0xFFB23A52)
    val RejectedText = Color(0xFFFF7F96)

    // semantic
    val Success = Color(0xFF3DDC9E)          // "Verified", granted
    val Danger = Color(0xFFE5392A)           // destructive / end call / disable-battery button
    val DangerText = Color(0xFFFF8A78)
    val Link = Color(0xFF4C9AFF)             // "FIX NOW", Privacy Policy, the call icon
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
    val strip: Color,          // the date-range strip on analytics
    val divider: Color,
    val textPrimary: Color,
    val textSecondary: Color,
    val textMuted: Color,
    val chartGrid: Color,
    val primary: Color,        // the main action: buttons, the open tab, the dial button
    val onPrimary: Color,      // text and icons on a primary fill
    val primarySoft: Color,    // quiet blue background: selected chip, avatar tile
    val primaryText: Color,    // blue text and links
    val isDark: Boolean,
)

val DarkPalette = Palette(
    background = Color(0xFF161F33),
    card = Color(0xFF212D48),
    cardDeep = Color(0xFF111827),
    strip = Color(0xFF111827),
    divider = Color(0xFF36456A),
    textPrimary = Color(0xFFEAF0FA),
    textSecondary = Color(0xFFC9D3E8),
    textMuted = Color(0xFFA3B1CD),
    chartGrid = Color(0xFF36456A),
    primary = Color(0xFF4C9AFF),
    onPrimary = Color(0xFF04122F),
    primarySoft = Color(0xFF2B4373),
    primaryText = Color(0xFF8DBBFF),
    isDark = true,
)

val LightPalette = Palette(
    background = Color(0xFFF5F8FF),
    card = Color(0xFFFFFFFF),
    cardDeep = Color(0xFFE9EFFC),
    strip = Color(0xFFE1E9F8),
    divider = Color(0xFFD3DDF2),
    textPrimary = Color(0xFF00123A),
    textSecondary = Color(0xFF33436B),
    textMuted = Color(0xFF4A5A82),
    chartGrid = Color(0xFFD3DDF2),
    primary = Color(0xFF0F63E6),
    onPrimary = Color(0xFFFFFFFF),
    primarySoft = Color(0xFFE1ECFF),
    primaryText = Color(0xFF0B4FC2),
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
    val primary: Color @Composable get() = LocalPalette.current.primary
    val onPrimary: Color @Composable get() = LocalPalette.current.onPrimary
    val primarySoft: Color @Composable get() = LocalPalette.current.primarySoft
    val primaryText: Color @Composable get() = LocalPalette.current.primaryText
    val isDark: Boolean @Composable get() = LocalPalette.current.isDark
}
