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
fun LevoyTheme(mode: ThemeMode = ThemeMode.Dark, content: @Composable () -> Unit) {
    val dark = when (mode) {
        ThemeMode.Dark -> true
        ThemeMode.Light -> false
        ThemeMode.System -> isSystemInDarkTheme()
    }
    val pal = if (dark) DarkPalette else LightPalette
    val scheme = if (dark) {
        darkColorScheme(primary = LevoyColors.Amber, onPrimary = LevoyColors.OnAmber, background = pal.background, surface = pal.card, onSurface = pal.textPrimary, onBackground = pal.textPrimary)
    } else {
        lightColorScheme(primary = LevoyColors.Amber, onPrimary = LevoyColors.OnAmber, background = pal.background, surface = pal.card, onSurface = pal.textPrimary, onBackground = pal.textPrimary)
    }
    CompositionLocalProvider(LocalPalette provides pal) {
        MaterialTheme(colorScheme = scheme, typography = LevoyTypography, content = content)
    }
}
