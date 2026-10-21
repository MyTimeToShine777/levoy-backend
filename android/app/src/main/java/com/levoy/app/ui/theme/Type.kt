package com.levoy.app.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.levoy.app.R

/**
 * One typeface for the whole app: Manrope, friendly and clear on small screens.
 * It ships as one real font file per weight. (A single "variable" font file is not used: a lot of phones ignore the
 * "pick this weight" request and show the font's thinnest default, which made the whole app look washed out.)
 */
val AppFont = FontFamily(
    Font(R.font.manrope_regular, FontWeight.Normal),
    Font(R.font.manrope_medium, FontWeight.Medium),
    Font(R.font.manrope_semibold, FontWeight.SemiBold),
    Font(R.font.manrope_bold, FontWeight.Bold),
    Font(R.font.manrope_extrabold, FontWeight.ExtraBold),
)

/** Poppins for titles and headings: its round, geometric letters match the "Callio" wordmark. */
val DisplayFont = FontFamily(
    Font(R.font.poppins_semibold, FontWeight.SemiBold),
    Font(R.font.poppins_bold, FontWeight.Bold),
)

/** Named text styles so screens read like the design: `Text(.., style = Txt.Title)`. */
object Txt {
    val Title = TextStyle(fontFamily = DisplayFont, fontWeight = FontWeight.Bold, fontSize = 26.sp, letterSpacing = (-0.3).sp)   // Call History, Analytics
    val TopBar = TextStyle(fontFamily = AppFont, fontWeight = FontWeight.Medium, fontSize = 20.sp)           // title next to the back arrow
    val Heading = TextStyle(fontFamily = DisplayFont, fontWeight = FontWeight.Bold, fontSize = 24.sp, lineHeight = 30.sp) // "Choose one of the option…"
    val Section = TextStyle(fontFamily = AppFont, fontWeight = FontWeight.Bold, fontSize = 18.sp)            // "Duration :", "SIM :"
    val Row = TextStyle(fontFamily = AppFont, fontWeight = FontWeight.Medium, fontSize = 17.sp)              // settings row labels
    val Body = TextStyle(fontFamily = AppFont, fontWeight = FontWeight.Medium, fontSize = 15.sp, lineHeight = 22.sp)
    val BodyRoboto = TextStyle(fontFamily = AppFont, fontWeight = FontWeight.Medium, fontSize = 15.sp, lineHeight = 22.sp)
    val Small = TextStyle(fontFamily = AppFont, fontWeight = FontWeight.Medium, fontSize = 13.sp, lineHeight = 18.sp)
    val Name = TextStyle(fontFamily = AppFont, fontWeight = FontWeight.Bold, fontSize = 16.sp)               // contact / caller name
    val Number = TextStyle(fontFamily = AppFont, fontWeight = FontWeight.Medium, fontSize = 14.sp)
    val DateHeading = TextStyle(fontFamily = DisplayFont, fontWeight = FontWeight.SemiBold, fontSize = 17.sp)
    val Button = TextStyle(fontFamily = AppFont, fontWeight = FontWeight.ExtraBold, fontSize = 17.sp)
    val Tab = TextStyle(fontFamily = AppFont, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
    val TabActive = TextStyle(fontFamily = AppFont, fontWeight = FontWeight.ExtraBold, fontSize = 15.sp)
    val NavLabel = TextStyle(fontFamily = AppFont, fontWeight = FontWeight.Bold, fontSize = 12.sp)
    val Stat = TextStyle(fontFamily = AppFont, fontWeight = FontWeight.ExtraBold, fontSize = 22.sp)
    val Tile = TextStyle(fontFamily = AppFont, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, lineHeight = 20.sp)
}

val CallioTypography = Typography(
    bodyLarge = Txt.Body,
    bodyMedium = Txt.Body,
    bodySmall = Txt.Small,
    titleLarge = Txt.Title,
    titleMedium = Txt.Section,
    labelLarge = Txt.Button,
)
