package com.levoy.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider

/** The "Theme" setting: Light / Dark / System. The reference app ships dark only; light is an extra. */
enum class ThemeMode { System, Light, Dark }

@Composable
fun CallioTheme(mode: ThemeMode = ThemeMode.Dark, content: @Composable () -> Unit) {
    val dark = when (mode) {
        ThemeMode.Dark -> true
        ThemeMode.Light -> false
        ThemeMode.System -> isSystemInDarkTheme()
    }
    val pal = if (dark) DarkPalette else LightPalette
    val scheme = if (dark) {
        darkColorScheme(primary = pal.primary, onPrimary = pal.onPrimary, background = pal.background, surface = pal.card, onSurface = pal.textPrimary, onBackground = pal.textPrimary)
    } else {
        lightColorScheme(primary = pal.primary, onPrimary = pal.onPrimary, background = pal.background, surface = pal.card, onSurface = pal.textPrimary, onBackground = pal.textPrimary)
    }
    // A phone set to "Largest" text used to blow past the fixed-height buttons and cards. Allow some enlargement, not unlimited.
    val density = androidx.compose.ui.platform.LocalDensity.current
    CompositionLocalProvider(
        LocalPalette provides pal,
        androidx.compose.ui.platform.LocalDensity provides androidx.compose.ui.unit.Density(density.density, density.fontScale.coerceAtMost(1.15f)),
    ) {
        MaterialTheme(colorScheme = scheme, typography = CallioTypography, content = content)
    }
}
