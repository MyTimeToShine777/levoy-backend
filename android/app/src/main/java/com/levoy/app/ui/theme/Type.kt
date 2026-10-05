package com.levoy.app.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.levoy.app.R

/**
 * The reference app mixes two faces: Montserrat for settings rows, headings and buttons, and the
 * system font (Roboto) for the big screen titles ("Call History", "Analytics") and bold names.
 * Montserrat ships as one variable font, so each weight is an instance of the same file.
 */
@OptIn(ExperimentalTextApi::class)
val Montserrat = FontFamily(
    listOf(400, 500, 600, 700, 800).map { w ->
        Font(
            resId = R.font.montserrat_vf,
            weight = FontWeight(w),
            variationSettings = FontVariation.Settings(FontVariation.weight(w)),
        )
    }
)

val Roboto = FontFamily.Default

/** Named text styles so screens read like the design: `Text(.., style = Txt.Title)`. */
object Txt {
    val Title = TextStyle(fontFamily = Roboto, fontWeight = FontWeight.Bold, fontSize = 24.sp)               // Call History, Analytics
    val TopBar = TextStyle(fontFamily = Montserrat, fontWeight = FontWeight.Normal, fontSize = 20.sp)       // title next to the back arrow
    val Heading = TextStyle(fontFamily = Montserrat, fontWeight = FontWeight.SemiBold, fontSize = 24.sp, lineHeight = 30.sp) // "Choose one of the option…"
    val Section = TextStyle(fontFamily = Montserrat, fontWeight = FontWeight.SemiBold, fontSize = 18.sp)    // "Duration :", "SIM :"
    val Row = TextStyle(fontFamily = Montserrat, fontWeight = FontWeight.Normal, fontSize = 17.sp)          // settings row labels
    val Body = TextStyle(fontFamily = Montserrat, fontWeight = FontWeight.Normal, fontSize = 15.sp, lineHeight = 22.sp)
    val BodyRoboto = TextStyle(fontFamily = Roboto, fontWeight = FontWeight.Normal, fontSize = 15.sp, lineHeight = 22.sp)
    val Small = TextStyle(fontFamily = Montserrat, fontWeight = FontWeight.Normal, fontSize = 13.sp, lineHeight = 18.sp)
    val Name = TextStyle(fontFamily = Roboto, fontWeight = FontWeight.Bold, fontSize = 16.sp)               // contact / caller name
    val Number = TextStyle(fontFamily = Montserrat, fontWeight = FontWeight.Normal, fontSize = 14.sp)
    val DateHeading = TextStyle(fontFamily = Montserrat, fontWeight = FontWeight.SemiBold, fontSize = 20.sp)
    val Button = TextStyle(fontFamily = Montserrat, fontWeight = FontWeight.Bold, fontSize = 17.sp)
    val Tab = TextStyle(fontFamily = Montserrat, fontWeight = FontWeight.Normal, fontSize = 15.sp)
    val TabActive = TextStyle(fontFamily = Montserrat, fontWeight = FontWeight.Bold, fontSize = 15.sp)
    val NavLabel = TextStyle(fontFamily = Roboto, fontWeight = FontWeight.Normal, fontSize = 12.sp)
    val Stat = TextStyle(fontFamily = Montserrat, fontWeight = FontWeight.SemiBold, fontSize = 22.sp)
    val Tile = TextStyle(fontFamily = Montserrat, fontWeight = FontWeight.Normal, fontSize = 15.sp, lineHeight = 20.sp)
}

val LevoyTypography = Typography(
    bodyLarge = Txt.Body,
    bodyMedium = Txt.Body,
    bodySmall = Txt.Small,
    titleLarge = Txt.Title,
    titleMedium = Txt.Section,
    labelLarge = Txt.Button,
)
